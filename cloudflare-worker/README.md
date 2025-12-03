
# FairShare Backend (Cloudflare Workers + D1)

This worker handles user authentication (JWT) and proxies requests to various AI providers (Gemini, ChatGPT, Grok, DeepSeek), keeping API keys secure.

## Setup

1.  **Install Wrangler** (Cloudflare CLI):
    ```bash
    npm install -g wrangler
    ```

2.  **Login**:
    ```bash
    wrangler login
    ```

3.  **Create D1 Database**:
    ```bash
    wrangler d1 create fairshare-db
    ```
    *Copy the `database_id` from the output and update `wrangler.toml`.*

4.  **Initialize Schema**:
    ```bash
    wrangler d1 execute fairshare-db --local --file=./schema.sql
    # For production:
    wrangler d1 execute fairshare-db --remote --file=./schema.sql
    ```

5.  **Set Secrets** (API Keys):
    ```bash
    wrangler secret put JWT_SECRET
    wrangler secret put GEMINI_API_KEY
    wrangler secret put OPENAI_API_KEY
    wrangler secret put DEEPSEEK_API_KEY
    wrangler secret put GROK_API_KEY
    ```

6.  **Deploy**:
    ```bash
    wrangler deploy
    ```

7.  **Connect Frontend**:
    Copy your worker URL (e.g., `https://fairshare-backend.yourname.workers.dev`) and paste it into the **Backend API URL** field in the app Settings.

## Architecture

*   **Auth**: Custom JWT implementation using Web Crypto API (HMAC-SHA256). Password hashing using PBKDF2.
*   **Database**: Cloudflare D1 (SQLite) for storing users.
*   **Proxy**: Forwards requests to AI providers, reshaping the payload as needed.
