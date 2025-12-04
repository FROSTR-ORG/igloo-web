// Minimal web-crypto helpers for encrypting/decrypting the local share bundle

export type EncryptedBundle = {
  v: 1;
  salt: string; // base64
  iv: string; // base64
  data: string; // base64 ciphertext
  createdAt: string;
};

function b64encode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64decode(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function deriveKey(password: string, salt: ArrayBuffer) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100_000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptBundle(password: string, payload: unknown): Promise<EncryptedBundle> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt.buffer);
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return {
    v: 1,
    salt: b64encode(salt.buffer),
    iv: b64encode(iv.buffer),
    data: b64encode(cipher),
    createdAt: new Date().toISOString()
  };
}

export async function decryptBundle<T = unknown>(password: string, bundle: EncryptedBundle): Promise<T> {
  if (bundle.v !== 1) throw new Error('Unsupported bundle version');
  const salt = b64decode(bundle.salt);
  const iv = b64decode(bundle.iv);
  const key = await deriveKey(password, salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, b64decode(bundle.data));
  const json = new TextDecoder().decode(plain);
  return JSON.parse(json) as T;
}

