// ─────────────────────────────────────────────────────────────
//  crypto.js  —  Chiffrement AES-GCM 256 bits
//
//  La clé de chiffrement n'est JAMAIS stockée nulle part.
//  Elle vit uniquement en mémoire pendant la session.
//  Si la page se recharge, l'utilisateur entre à nouveau
//  sa phrase de chiffrement.
//
//  Ce qui est chiffré dans Firestore :
//    clientName, clientEmail, clientPhone, licensePlate, notes
//
//  Ce qui reste en clair (nécessaire pour les stats) :
//    nsNum, dates, nuits, électricité, prise, montants, taxe,
//    compteurs personnes, departed, createdAt
// ─────────────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 200_000;  // recommandation OWASP 2024
const PBKDF2_HASH      = 'SHA-256';
const AES_LENGTH       = 256;

// ── Helpers base64 ───────────────────────────────────────────
export function bytesToB64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}
export function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// ── Génère un sel aléatoire (stocké dans Firestore, pas secret)
export function generateSalt() {
  return bytesToB64(crypto.getRandomValues(new Uint8Array(16)));
}

// ── Dérive une clé AES-GCM depuis la phrase + sel ────────────
export async function deriveKey(passphrase, saltB64) {
  const salt = b64ToBytes(saltB64);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
    keyMaterial,
    { name: 'AES-GCM', length: AES_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── Chiffre un objet JS → { iv, data } (deux chaînes base64) ─
export async function encryptData(key, obj) {
  const iv    = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(obj));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  return {
    iv:   bytesToB64(iv),
    data: bytesToB64(cipher),
  };
}

// ── Déchiffre { iv, data } → objet JS ────────────────────────
// Lance une exception si la clé est mauvaise (GCM authentifié)
export async function decryptData(key, encrypted) {
  const iv     = b64ToBytes(encrypted.iv);
  const cipher = b64ToBytes(encrypted.data);
  const plain  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plain));
}

// ── Crée une valeur de test chiffrée (stockée à l'init) ──────
export async function createKeyTest(key) {
  return encryptData(key, { test: 'CAMPING_DE_SAGNAT_OK' });
}

// ── Vérifie que la clé déchiffre correctement la valeur test ─
export async function verifyKey(key, testEncrypted) {
  try {
    const result = await decryptData(key, testEncrypted);
    return result?.test === 'CAMPING_DE_SAGNAT_OK';
  } catch {
    return false;
  }
}
