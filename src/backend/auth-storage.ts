import type { SupportedStorage } from '@supabase/auth-js';

const memory = new Map<string, string>();

// Web sessions intentionally remain in memory. A future guardian web portal
// should use server-managed, HttpOnly cookies instead of browser token storage.
export const authStorage: SupportedStorage = {
  getItem: async (key) => memory.get(key) ?? null,
  setItem: async (key, value) => {
    memory.set(key, value);
  },
  removeItem: async (key) => {
    memory.delete(key);
  },
};
