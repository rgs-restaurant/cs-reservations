// ─────────────────────────────────────────────────────────────
//  db.js  —  Firestore (Firebase v10, région EU)
// ─────────────────────────────────────────────────────────────

import { firebaseConfig } from './config.js';
import { encryptData, decryptData, generateSalt, createKeyTest } from './crypto.js';

import { initializeApp }
  from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, browserLocalPersistence, setPersistence }
  from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, addDoc, updateDoc,
  collection, getDocs, query, orderBy, serverTimestamp,
  runTransaction, arrayUnion,
} from 'https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js';

const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
await setPersistence(auth, browserLocalPersistence);

// ── Auth ──────────────────────────────────────────────────────
export async function login(email, password) { await signInWithEmailAndPassword(auth, email, password); }
export async function logout() { await signOut(auth); }
export function onAuthChange(cb) { onAuthStateChanged(auth, cb); }

// ── Meta ──────────────────────────────────────────────────────
export async function getOrInitMeta(cryptoKey) {
  const ref  = doc(db, 'meta', 'config');
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  const salt = generateSalt();
  const test = await createKeyTest(cryptoKey);
  const meta = { salt, test };
  await setDoc(ref, meta);
  return meta;
}
export async function getSalt() {
  const snap = await getDoc(doc(db, 'meta', 'config'));
  return snap.exists() ? (snap.data().salt ?? null) : null;
}
export async function getKeyTest() {
  const snap = await getDoc(doc(db, 'meta', 'config'));
  return snap.exists() ? (snap.data().test ?? null) : null;
}
export async function initMeta(salt, test) {
  await setDoc(doc(db, 'meta', 'config'), { salt, test });
}

// ── Compteur NS (atomique) ────────────────────────────────────
export async function nextNS() {
  const year  = String(new Date().getFullYear());
  const ref   = doc(db, 'meta', 'counters');
  let   nsNum = '';
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
// Chiffré — données personnelles uniquement
const PERSONAL_FIELDS = ['clientName', 'clientEmail', 'clientPhone', 'licensePlate', 'nationalite', 'notes'];

export async function saveReservation(data, cryptoKey) {
  const personal  = {};
  PERSONAL_FIELDS.forEach(k => { personal[k] = data[k] ?? ''; });
  const encrypted = await encryptData(cryptoKey, personal);

  const docData = {
    nsNum:         data.nsNum,
    encrypted,
    arrivalDate:   data.arrivalDate,
    departureDate: data.departureDate,
    nights:        data.nights,
    electricity:   data.electricity,
    socketId:      data.socketId ?? null,
    totalPrice:    data.totalPrice,
    taxeAmt:       data.taxeAmt,
    baseAdults:    data.baseAdults ?? 2,
    adults:        data.adults,
    teens:         data.teens,
    babies:        data.babies,
    animals:       data.animals,
    vehicles:      data.vehicles,
    departed:      false,
    amendments:    [],
    createdAt:     serverTimestamp(),
  };
  const ref = await addDoc(collection(db, 'reservations'), docData);
  return ref.id;
}

export async function loadReservations(cryptoKey) {
  const q    = query(collection(db, 'reservations'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return Promise.all(snap.docs.map(async d => {
    const raw = { firestoreId: d.id, ...d.data() };
    try {
      const personal = await decryptData(cryptoKey, raw.encrypted);
      return { ...raw, ...personal };
    } catch {
      return { ...raw, clientName:'[erreur déchiffrement]', clientEmail:'', clientPhone:'', licensePlate:'', nationalite:'', notes:'' };
    }
  }));
}

// ── Modification de séjour ────────────────────────────────────
export async function updateReservation(firestoreId, updates, amendmentRecord) {
  const ref    = doc(db, 'reservations', firestoreId);
  const docUpd = {
    arrivalDate:   updates.arrivalDate,
    departureDate: updates.departureDate,
    nights:        updates.nights,
    totalPrice:    updates.totalPrice,
    taxeAmt:       updates.taxeAmt,
    lastModified:  serverTimestamp(),
  };
  if (updates.changePeople) {
    docUpd.adults     = updates.adults;
    docUpd.teens      = updates.teens;
    docUpd.babies     = updates.babies;
    docUpd.animals    = updates.animals;
    docUpd.vehicles   = updates.vehicles;
    docUpd.baseAdults = updates.baseAdults;
  }
  if (amendmentRecord) docUpd.amendments = arrayUnion(amendmentRecord);
  await updateDoc(ref, docUpd);
}

// ── Anonymisation au départ ───────────────────────────────────
export async function anonymizeOnDeparture(firestoreId, cryptoKey) {
  const anon = await encryptData(cryptoKey, {
    clientName:'Séjour anonymisé', clientEmail:'', clientPhone:'',
    licensePlate:'', nationalite:'', notes:'',
  });
  await updateDoc(doc(db, 'reservations', firestoreId), { encrypted: anon, departed: true });
}
