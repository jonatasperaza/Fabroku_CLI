/**
 * Gerenciamento de configuração da CLI (~/.fabroku/config.json).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".fabroku");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG = {
  api_url: "https://fabroku-api.fabricadesoftware.ifc.edu.br",
  token: null,
  user: null,
};

function ensureDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig() {
  ensureDir();
  if (!existsSync(CONFIG_FILE)) {
    saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }
  return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
}

export function saveConfig(config) {
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getToken() {
  return loadConfig().token;
}

export function getApiUrl() {
  return loadConfig().api_url || DEFAULT_CONFIG.api_url;
}

export function setCredentials(token, user, apiUrl) {
  const config = loadConfig();
  config.token = token;
  config.user = user;
  if (apiUrl) config.api_url = apiUrl;
  saveConfig(config);
}

export function clearCredentials() {
  const config = loadConfig();
  config.token = null;
  config.user = null;
  config.api_url = DEFAULT_CONFIG.api_url;
  saveConfig(config);
}

export function isAuthenticated() {
  return getToken() !== null;
}
