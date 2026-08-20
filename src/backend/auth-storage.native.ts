import type { SupportedStorage } from '@supabase/auth-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const chunkSize = 1_000;
const manifestSuffix = '.manifest';
const secureStoreOptions: SecureStore.SecureStoreOptions = {
  // Shared commutes must refresh authenticated heartbeats after the screen locks.
  // Device-only storage prevents migration while remaining available after first unlock.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

type Manifest = { count: number; version: string };

export const authStorage: SupportedStorage = {
  async getItem(key) {
    const manifest = await readManifest(key);
    if (!manifest) return null;
    const chunks = await Promise.all(Array.from({ length: manifest.count }, (_, index) => (
      SecureStore.getItemAsync(chunkKey(key, manifest.version, index), secureStoreOptions)
    )));
    return chunks.every((chunk): chunk is string => chunk !== null) ? chunks.join('') : null;
  },

  async setItem(key, value) {
    const previous = await readManifest(key);
    const version = Crypto.randomUUID();
    const chunks = splitIntoChunks(value);
    await Promise.all(chunks.map((chunk, index) => (
      SecureStore.setItemAsync(chunkKey(key, version, index), chunk, secureStoreOptions)
    )));
    await SecureStore.setItemAsync(
      `${key}${manifestSuffix}`,
      JSON.stringify({ count: chunks.length, version } satisfies Manifest),
      secureStoreOptions,
    );
    if (previous) await removeChunks(key, previous);
  },

  async removeItem(key) {
    const manifest = await readManifest(key);
    await SecureStore.deleteItemAsync(`${key}${manifestSuffix}`, secureStoreOptions);
    if (manifest) await removeChunks(key, manifest);
  },
};

function splitIntoChunks(value: string): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length; offset += chunkSize) {
    chunks.push(value.slice(offset, offset + chunkSize));
  }
  return chunks.length > 0 ? chunks : [''];
}

async function readManifest(key: string): Promise<Manifest | null> {
  const raw = await SecureStore.getItemAsync(`${key}${manifestSuffix}`, secureStoreOptions);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)
      || typeof parsed.version !== 'string'
      || !/^[0-9a-f-]{36}$/i.test(parsed.version)
      || !Number.isInteger(parsed.count)
      || (parsed.count as number) < 1
      || (parsed.count as number) > 64) return null;
    return { count: parsed.count as number, version: parsed.version };
  } catch {
    return null;
  }
}

async function removeChunks(key: string, manifest: Manifest): Promise<void> {
  await Promise.all(Array.from({ length: manifest.count }, (_, index) => (
    SecureStore.deleteItemAsync(chunkKey(key, manifest.version, index), secureStoreOptions)
  )));
}

function chunkKey(key: string, version: string, index: number): string {
  return `${key}.${version}.${index}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
