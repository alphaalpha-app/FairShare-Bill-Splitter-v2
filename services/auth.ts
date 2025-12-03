
import { db } from './db';
import { UserSession } from '../types';

// Replace this with your deployed Worker URL
const API_URL = 'https://fairshare-backend.your-subdomain.workers.dev'; 

export const AuthService = {
  async register(username: string, password: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      const error = await res.json() as any;
      throw new Error(error.error || 'Registration failed');
    }
  },

  async login(username: string, password: string): Promise<UserSession> {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      const error = await res.json() as any;
      throw new Error(error.error || 'Login failed');
    }

    const data = await res.json();
    const session: UserSession = {
      token: data.token,
      username: username,
      expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    };

    await db.setSession(session);
    return session;
  },

  async logout(): Promise<void> {
    await db.clearSession();
  },

  async getSession(): Promise<UserSession | undefined> {
    const session = await db.getSession();
    if (session && Date.now() > session.expiresAt) {
      await db.clearSession();
      return undefined;
    }
    return session;
  },

  async getToken(): Promise<string | undefined> {
    const session = await this.getSession();
    return session?.token;
  },
  
  // Helper to set the Worker URL dynamically if needed
  getApiUrl() {
    return localStorage.getItem('fairshare_api_url') || API_URL;
  },
  
  setApiUrl(url: string) {
    localStorage.setItem('fairshare_api_url', url.replace(/\/$/, ''));
  }
};
