// ─────────────────────────────────────────────────────────────
//  crypto.js  —  Chiffrement AES-GCM 256 bits
// ─────────────────────────────────────────────────────────────
const PBKDF2_ITERATIONS = 200_000;

export function bytesToB64(buffer) { return btoa(String.fromCharCode(...new Uint8Array(buffer))); }
export function b64ToBytes(b64)    { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }
export function generateSalt()     { return bytesToB64(crypto.getRandomValues(new Uint8Array(16))); }

export async function deriveKey(passphrase, saltB64) {
  const salt = b64ToBytes(saltB64);
  const raw  = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), { name:'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations:PBKDF2_ITERATIONS, hash:'SHA-256' },
    raw, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']
  );
}

export async function encryptData(key, obj) {
  const iv     = crypto.getRandomValues(new Uint8Array(12));
  const plain  = new TextEncoder().encode(JSON.stringify(obj));
  const cipher = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, plain);
  return { iv: bytesToB64(iv), data: bytesToB64(cipher) };
}

export async function decryptData(key, encrypted) {
  const iv     = b64ToBytes(encrypted.iv);
  const cipher = b64ToBytes(encrypted.data);
  const plain  = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plain));
}

export async function createKeyTest(key) { return encryptData(key, { test:'CAMPING_DE_SAGNAT_OK' }); }

export async function verifyKey(key, testEncrypted) {
  try { return (await decryptData(key, testEncrypted))?.test === 'CAMPING_DE_SAGNAT_OK'; }
  catch { return false; }
}
