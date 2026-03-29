import * as fs from 'node:fs';
import { TOKENS_PATH, ensureConfigDir } from '../config.js';

export interface TokenData {
    refresh_token: string;
    scope: string;
    token_type: string;
}

export type TokenStore = Record<string, TokenData>;

export function loadTokens(): TokenStore {
    if (!fs.existsSync(TOKENS_PATH)) {
        return {};
    }
    const raw: string = fs.readFileSync(TOKENS_PATH, 'utf-8');
    return JSON.parse(raw) as TokenStore;
}

export function saveTokens(store: TokenStore): void {
    ensureConfigDir();
    fs.writeFileSync(TOKENS_PATH, JSON.stringify(store, null, 2), { mode: 0o600 });
}

export function getToken(email: string): TokenData | undefined {
    const store: TokenStore = loadTokens();
    return store[email];
}

export function setToken(email: string, data: TokenData): void {
    const store: TokenStore = loadTokens();
    store[email] = data;
    saveTokens(store);
}

export function removeToken(email: string): boolean {
    const store: TokenStore = loadTokens();
    if (!(email in store)) {
        return false;
    }
    delete store[email];
    saveTokens(store);
    return true;
}

export function listAccounts(): string[] {
    const store: TokenStore = loadTokens();
    return Object.keys(store);
}
