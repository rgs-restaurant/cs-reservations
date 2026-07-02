// ─────────────────────────────────────────────────────────────
//  config.js  —  Camping de Sagnat
//  À remplir avec vos propres clés (voir README.md)
//  Ce fichier est SAFE dans un repo public :
//    · Les clés Firebase ne sont pas des secrets (la sécurité
//      vient des Firestore Rules, pas de cacher les clés)
//    · La clé EmailJS est publique par conception
//    · La clé de chiffrement n'est JAMAIS dans ce fichier
// ─────────────────────────────────────────────────────────────

// Firebase Console → Project Settings → Your apps → Web app
export const firebaseConfig = {
apiKey: "AIzaSyBUdWvYxkpb8YQuaA2LlJyq514LSJaRNU0",

  authDomain: "camping-reserv.firebaseapp.com",

  projectId: "camping-reserv",

  storageBucket: "camping-reserv.firebasestorage.app",

  messagingSenderId: "170861291641",

  appId: "1:170861291641:web:0620eb22245a990db14ca8",
};

// EmailJS → Account → General + Email Services + Email Templates
export const emailjsConfig = {
  publicKey:  "v_BtAl3yn_3dgHC2i",   // Account → General → Public Key
  serviceId:  "service_jh5dawu",   // Email Services → Service ID
  templateId: "template_xwjr34s",   // Email Templates → Template ID
};

// Infos du camping (affichées sur les notes de séjour)
export const campingConfig = {
  emailCopie: "camping.sagnat87@gmail.com",  // reçoit une copie de chaque note
  nom:    "Camping de Sagnat",
  rue:    "Lac de Sagnat",
  cp:     "87250",
  ville:  "Bessines-sur-Gartempe",
  tel:    "05 55 76 01 66",
  siren:  null,  // ex: "123 456 789" — laisser null si non applicable
};

// Tarifs (à modifier ici seulement)
export const tarifs = {
  baseSans:  15,   // €/nuit sans électricité
  baseAvec:  20,   // €/nuit avec électricité
  adulte:     5,   // €/nuit par adulte supplémentaire (forfait = 2 adultes)
  ado:        3,   // €/nuit par ado (<16 ans)
  bebe:       0,   // €/nuit par bébé (<3 ans) — exempté taxe aussi
  animal:     0,   // €/nuit par animal
  vehicule:   5,   // €/nuit par véhicule supplémentaire (1 inclus)
  taxeSejour: 1,   // €/pers/nuit (bébés exemptés)
  nbPrises:   8,   // nombre total de prises électriques
  // TODO: forfait distinct pour les tentes — à définir
};
