/**
 * Cliente HTTP para a API Fabroku.
 */

import { getApiUrl, getToken } from "./config.js";

export class APIError extends Error {
  constructor(statusCode, detail) {
    super(`[${statusCode}] ${detail}`);
    this.statusCode = statusCode;
    this.detail = detail;
  }
}

export class FabrokuAPI {
  constructor() {
    this.baseUrl = getApiUrl();
    this.token = getToken();
  }

  get headers() {
    const h = { Accept: "application/json" };
    if (this.token) h.Authorization = `CLI ${this.token}`;
    return h;
  }

  async request(method, path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const resp = await fetch(url, {
      method,
      headers: { ...this.headers, ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      let detail;
      try {
        const data = await resp.json();
        detail = data.detail || JSON.stringify(data);
      } catch {
        detail = await resp.text();
      }
      throw new APIError(resp.status, detail);
    }
    return resp.json();
  }

  async get(path) {
    return this.request("GET", path);
  }
  async post(path, body) {
    return this.request("POST", path, { body });
  }

  // --- Endpoints ---

  async checkAuth() {
    return this.get("/api/auth/check/");
  }
  async listApps() {
    return this.get("/api/apps/apps/");
  }
  async listProjects() {
    return this.get("/api/projects/projects/");
  }
  async getUserMe() {
    return this.get("/api/auth/users/me/");
  }
  async redeployApp(appId) {
    return this.post(`/api/apps/apps/${appId}/redeploy/`);
  }
  async getAppStatus(appId) {
    return this.get(`/api/apps/apps/${appId}/get_app_status/`);
  }
  async diagnoseWebhook(appId) {
    return this.get(`/api/apps/apps/${appId}/diagnose_webhook/`);
  }
  async setupWebhook(appId) {
    return this.post(`/api/apps/apps/${appId}/setup_webhook/`);
  }
}
