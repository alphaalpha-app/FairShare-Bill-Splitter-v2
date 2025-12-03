
/**
 * FairShare Backend Worker
 * Handles Auth (JWT) and AI Model Proxying
 */

// --- Crypto Helpers (No external deps for easy deployment) ---

async function hashPassword(password, salt = null) {
  const enc = new TextEncoder();
  if (!salt) {
    salt = crypto.getRandomValues(new Uint8Array(16));
  } else {
    // Convert hex string back to Uint8Array if provided
    salt = new Uint8Array(salt.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  }

  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const exported = await crypto.subtle.exportKey("raw", key);
  const hashHex = Array.from(new Uint8Array(exported)).map(b => b.toString(16).padStart(2, '0')).join('');
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password, storedHash) {
  const [saltHex, originalHash] = storedHash.split(':');
  const newHash = await hashPassword(password, saltHex);
  return newHash === storedHash;
}

async function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const enc = new TextEncoder();
  
  const b64 = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsignedToken = `${b64(header)}.${b64(payload)}`;
  
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(unsignedToken));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  return `${unsignedToken}.${sigB64}`;
}

async function verifyJWT(token, secret) {
  try {
    const [headerB64, payloadB64, sigB64] = token.split('.');
    const enc = new TextEncoder();
    const unsignedToken = `${headerB64}.${payloadB64}`;
    
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    
    const sigBytes = Uint8Array.from(atob(sigB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const isValid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(unsignedToken));
    
    if (!isValid) return null;
    return JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
  } catch (e) {
    return null;
  }
}

// --- Main Worker Logic ---

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // 1. Auth: Register
      if (url.pathname === '/api/auth/register' && request.method === 'POST') {
        const { username, password } = await request.json();
        if (!username || !password) throw new Error("Missing credentials");
        
        const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
        if (existing) throw new Error("Username taken");

        const hash = await hashPassword(password);
        await env.DB.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').bind(username, hash).run();
        
        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
      }

      // 2. Auth: Login
      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        const { username, password } = await request.json();
        const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
        
        if (!user || !(await verifyPassword(password, user.password_hash))) {
          return new Response(JSON.stringify({ error: "Invalid credentials" }), { status: 401, headers: corsHeaders });
        }

        const token = await signJWT({ sub: user.id, name: user.username, exp: Math.floor(Date.now()/1000) + 86400 }, env.JWT_SECRET);
        return new Response(JSON.stringify({ token }), { headers: corsHeaders });
      }

      // 3. AI: Analyze
      if (url.pathname === '/api/ai/analyze' && request.method === 'POST') {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) throw new Error("No token provided");
        
        const token = authHeader.split(' ')[1];
        const payload = await verifyJWT(token, env.JWT_SECRET);
        if (!payload) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });

        const { image, model } = await request.json(); // image is base64 without prefix
        const prompt = `Analyze this utility bill image and extract the following in JSON:
        - type (ELECTRICITY/GAS/WATER)
        - suggestedName
        - periods [{startDate, endDate, usageCost}] (YYYY-MM-DD). Sum blocks for same range.
        - supplyCost (number)
        - sewerageCost (number)
        Use 0 if field missing.`;
        
        // --- Model Proxies ---
        
        let resultJson = {};

        if (model === 'gemini') {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GEMINI_API_KEY}`;
          const res = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: prompt },
                  { inline_data: { mime_type: "image/jpeg", data: image } }
                ]
              }],
              generationConfig: { response_mime_type: "application/json" }
            })
          });
          const data = await res.json();
          resultJson = JSON.parse(data.candidates[0].content.parts[0].text);

        } else if (['chatgpt', 'deepseek', 'grok'].includes(model)) {
          // OpenAI-compatible endpoint logic
          let endpoint, apiKey, modelName;

          if (model === 'chatgpt') {
             endpoint = 'https://api.openai.com/v1/chat/completions';
             apiKey = env.OPENAI_API_KEY;
             modelName = 'gpt-4o';
          } else if (model === 'deepseek') {
             endpoint = 'https://api.deepseek.com/chat/completions';
             apiKey = env.DEEPSEEK_API_KEY;
             modelName = 'deepseek-chat';
          } else if (model === 'grok') {
             endpoint = 'https://api.x.ai/v1/chat/completions';
             apiKey = env.GROK_API_KEY;
             modelName = 'grok-beta';
          }

          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: modelName,
              messages: [
                {
                  role: "user",
                  content: [
                    { type: "text", text: prompt + " Respond with raw JSON only." },
                    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }
                  ]
                }
              ],
              response_format: { type: "json_object" }
            })
          });
          
          if (!res.ok) {
             const err = await res.text();
             throw new Error(`Provider Error: ${err}`);
          }
          const data = await res.json();
          resultJson = JSON.parse(data.choices[0].message.content);
        }

        return new Response(JSON.stringify(resultJson), { headers: corsHeaders });
      }

      return new Response("Not Found", { status: 404, headers: corsHeaders });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
    }
  }
};
