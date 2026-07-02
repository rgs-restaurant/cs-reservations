// ─────────────────────────────────────────────────────────────
//  db.js  —  Firestore (Firebase v10, région EU)
//
//  Structure Firestore :
//    reservations/{id}  → données financières + blob chiffré
//    meta/config        → sel PBKDF2 + valeur de test chiffrée
//    meta/counters      → { "2026": 3, "2027": 0, ... }
// ─────────────────────────────────────────────────────────────

import { firebaseConfig } from './config.js';
import { encryptData, decryptData, generateSalt, createKeyTest } from './crypto.js';

import { initializeApp }          from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, browserLocalPersistence, setPersistence }
  from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, addDoc, updateDoc,
  collection, getDocs, query, orderBy, serverTimestamp,
  runTransaction, deleteField,
} from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js';

// ── Init Firebase ─────────────────────────────────────────────
const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

await setPersistence(auth, browserLocalPersistence);

// ── Auth ──────────────────────────────────────────────────────
export async function login(email, password) {
  await signInWithEmailAndPassword(auth, email, password);
}
export async function logout() {
  await signOut(auth);
}
export function onAuthChange(callback) {
  onAuthStateChanged(auth, callback);
}

// ── Meta / Config ─────────────────────────────────────────────

// Lit le document meta/config.
// S'il n'existe pas (première utilisation), génère le sel et
// la valeur de test, les stocke, et retourne le tout.
export async function getOrInitMeta(cryptoKey) {
  const ref  = doc(db, 'meta', 'config');
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return snap.data(); // { salt, test }
  }

  // Première utilisation : initialisation
  const salt = generateSalt();
  const test = await createKeyTest(cryptoKey);
  const meta = { salt, test };
  await setDoc(ref, meta);
  return meta;
}

// Lit seulement le sel (avant de dériver la clé)
export async function getSalt() {
  const snap = await getDoc(doc(db, 'meta', 'config'));
  if (!snap.exists()) return null;
  return snap.data().salt ?? null;
}

// Lit la valeur de test (pour vérifier la phrase de chiffrement)
export async function getKeyTest() {
  const snap = await getDoc(doc(db, 'meta', 'config'));
  if (!snap.exists()) return null;
  return snap.data().test ?? null;
}

export async function initMeta(salt, test) {
  await setDoc(doc(db, 'meta', 'config'), { salt, test });
}

// ── Numérotation NS (atomique) ────────────────────────────────
export async function nextNS() {
  const year    = String(new Date().getFullYear());
  const ref     = doc(db, 'meta', 'counters');
  let   nsNum   = '';

  await runTransaction(db, async (tx) => {
    const snap     = await tx.get(ref);
    const counters = snap.exists() ? snap.data() : {};
    const next     = (counters[year] ?? 0) + 1;
    tx.set(ref, { ...counters, [year]: next }, { merge: true });
    nsNum = `NS-${year}-${String(next).padStart(4, '0')}`;
  });

  return nsNum;
}

// ── Réservations ──────────────────────────────────────────────

// Données personnelles → chiffrées dans Firestore
const PERSONAL_FIELDS = ['clientName', 'clientEmail', 'clientPhone', 'licensePlate', 'notes'];

// Données financières → stockées en clair (nécessaires pour les stats)
const PUBLIC_FIELDS = [
  'nsNum', 'arrivalDate', 'departureDate', 'nights',
  'electricity', 'socketId', 'totalPrice', 'taxeAmt',
  'adults', 'teens', 'babies', 'animals', 'vehicles',
  'departed', 'createdAt',
];

export async function saveReservation(data, cryptoKey) {
  // Sépare données perso et financières
  const personal = {};
  PERSONAL_FIELDS.forEach(k => { personal[k] = data[k] ?? ''; });

  const encrypted = await encryptData(cryptoKey, personal);

  const docData = {
    nsNum:         data.nsNum,
    encrypted,                    // { iv, data } — blob opaque pour quiconque sans la clé
    arrivalDate:   data.arrivalDate,
    departureDate: data.departureDate,
    nights:        data.nights,
    electricity:   data.electricity,
    socketId:      data.socketId ?? null,
    totalPrice:    data.totalPrice,
    taxeAmt:       data.taxeAmt,
    adults:        data.adults,
    teens:         data.teens,
    babies:        data.babies,
    animals:       data.animals,
    vehicles:      data.vehicles,
    departed:      false,
    createdAt:     serverTimestamp(),
  };

  const ref = await addDoc(collection(db, 'reservations'), docData);
  return ref.id;
}

// Charge toutes les réservations et déchiffre les données perso
export async function loadReservations(cryptoKey) {
  const q    = query(collection(db, 'reservations'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);

  const results = await Promise.all(snap.docs.map(async d => {
    const raw = { firestoreId: d.id, ...d.data() };
    try {
      const personal = await decryptData(cryptoKey, raw.encrypted);
      return { ...raw, ...personal };
    } catch {
      // Ne devrait pas arriver si la clé est correcte
      return { ...raw, clientName: '[erreur déchiffrement]', clientEmail: '', clientPhone: '', licensePlate: '', notes: '' };
    }
  }));

  return results;
}

// Anonymise les données perso lors du départ (RGPD)
export async function anonymizeOnDeparture(firestoreId, cryptoKey) {
  const anonymous = await encryptData(cryptoKey, {
    clientName: 'Séjour anonymisé', clientEmail: '', clientPhone: '',
    licensePlate: '', notes: '',
  });
  await updateDoc(doc(db, 'reservations', firestoreId), {
    encrypted: anonymous,
    departed:  true,
  });
}
