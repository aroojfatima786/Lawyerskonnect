const MULTI_SESSION_MODE = String(import.meta.env.VITE_MULTI_SESSION || '').toLowerCase() === 'true';

type AuthUser = object;

const storage = {
  getItem(key: string): string | null {
    return MULTI_SESSION_MODE ? sessionStorage.getItem(key) : localStorage.getItem(key);
  },
  setItem(key: string, value: string): void {
    if (MULTI_SESSION_MODE) {
      sessionStorage.setItem(key, value);
      return;
    }
    localStorage.setItem(key, value);
  },
  removeItem(key: string): void {
    if (MULTI_SESSION_MODE) {
      sessionStorage.removeItem(key);
      return;
    }
    localStorage.removeItem(key);
  },
};

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

export const authStorage = {
  isMultiSessionMode(): boolean {
    return MULTI_SESSION_MODE;
  },
  getToken(): string | null {
    return storage.getItem(TOKEN_KEY);
  },
  setToken(token: string): void {
    storage.setItem(TOKEN_KEY, token);
  },
  removeToken(): void {
    storage.removeItem(TOKEN_KEY);
  },
  getUser<T>(): T | null {
    const raw = storage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setUser(user: AuthUser): void {
    storage.setItem(USER_KEY, JSON.stringify(user));
  },
  removeUser(): void {
    storage.removeItem(USER_KEY);
  },
  clearAuth(): void {
    this.removeToken();
    this.removeUser();
  },
};
