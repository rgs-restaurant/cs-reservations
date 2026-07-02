// ─────────────────────────────────────────────────────────────
//  app.js  —  Logique principale, Camping de Sagnat
// ─────────────────────────────────────────────────────────────

import { campingConfig, tarifs } from './config.js';
import { deriveKey, verifyKey, generateSalt, createKeyTest } from './crypto.js';
import {
  auth, login, logout, onAuthChange,
  getSalt, getKeyTest, initMeta,
  nextNS, saveReservation, loadReservations, anonymizeOnDeparture,
} from './db.js';
import { sendInvoiceEmail, buildInvoiceHTML } from './email.js';

// ── État global ───────────────────────────────────────────────
let cryptoKey    = null;  // jamais persisté, vit en mémoire uniquement
let reservations = [];
let selectedResa = null;
let counters     = { adults:0, teens:0, babies:0, animals:0, vehicles:0 };
let hasElec      = false;
let selectedSocket = null;

// ── Navigation ────────────────────────────────────────────────
export function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + id).classList.add('active');
  if (id === 'list')  renderList();
  if (id === 'stats') renderStats();
  if (id === 'new')   refreshSocketUI();
}

function showError(msg) {
  const el = document.getElementById('login-error');
  if (el) { el.textContent = msg; el.style.display = ''; }
}
function hideError() {
  const el = document.getElementById('login-error');
  if (el) el.style.display = 'none';
}

// ── Helpers ───────────────────────────────────────────────────
export function calcNights(a, d) {
  if (!a || !d) return 0;
  return Math.max(0, Math.round((new Date(d) - new Date(a)) / 86400000));
}
export function fmtDate(s) {
  if (!s) return '—';
  return new Date(s + 'T00:00:00').toLocaleDateString('fr-FR');
}
export function calcNightly(elec, adults, teens, vehicles) {
  const base = elec ? tarifs.baseAvec : tarifs.baseSans;
  return base + (adults||0)*tarifs.adulte + (teens||0)*tarifs.ado + (vehicles||0)*tarifs.vehicule;
}
export function calcTaxe(adults, teens, nights) {
  return (2 + (adults||0) + (teens||0)) * nights;
}
export function calcTotal(elec, adults, teens, nights, vehicles) {
  return calcNightly(elec, adults, teens, vehicles) * nights + calcTaxe(adults, teens, nights);
}
function takenSockets() {
  return reservations.filter(r => r.electricity && r.socketId && !r.departed).map(r => r.socketId);
}

// ── Auth & initialisation ─────────────────────────────────────
onAuthChange(async (user) => {
  if (!user) {
    // Pas connecté → écran de connexion complet
    showView('login');
    return;
  }
  if (!cryptoKey) {
    // Connecté Firebase mais clé pas en mémoire (refresh de page)
    showView('passphrase');
    return;
  }
  // Tout bon → application
  await refreshReservations();
  showView('list');
});

// Connexion complète (email + password + phrase)
document.getElementById('form-login')?.addEventListener('submit', async e => {
  e.preventDefault();
  hideError();
  const btn = document.getElementById('btn-login');
  btn.disabled = true; btn.textContent = 'Connexion…';

  try {
    const email      = document.getElementById('login-email').value.trim();
    const password   = document.getElementById('login-password').value;
    const passphrase = document.getElementById('login-passphrase').value;

    if (!passphrase) throw new Error('La phrase de chiffrement est obligatoire.');

    // 1. Firebase Auth
    await login(email, password);

    // 2. Sel + clé
    await initCryptoKey(passphrase);

    // 3. Charger et afficher
    await refreshReservations();
    showView('list');
  } catch (err) {
    let msg = err.message || 'Erreur inconnue';
    if (msg.includes('invalid-credential') || msg.includes('wrong-password') || msg.includes('user-not-found'))
      msg = 'Email ou mot de passe incorrect.';
    showError(msg);
    btn.disabled = false; btn.textContent = 'Se connecter';
  }
});

// Saisie phrase seule (après refresh de page si déjà connecté Firebase)
document.getElementById('form-passphrase')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn  = document.getElementById('btn-passphrase');
  const errEl = document.getElementById('passphrase-error');
  btn.disabled = true; btn.textContent = 'Vérification…';
  errEl.style.display = 'none';

  try {
    const passphrase = document.getElementById('input-passphrase').value;
    await initCryptoKey(passphrase);
    await refreshReservations();
    showView('list');
  } catch (err) {
    errEl.textContent = err.message || 'Phrase incorrecte.';
    errEl.style.display = '';
    btn.disabled = false; btn.textContent = 'Déverrouiller';
  }
});

async function initCryptoKey(passphrase) {
  let salt = await getSalt();

  if (!salt) {
    // Première utilisation : on génère le sel ici, une seule fois
    salt = generateSalt();
    const key  = await deriveKey(passphrase, salt);
    const test = await createKeyTest(key);
    await initMeta(salt, test);
    cryptoKey = key;
    return;
  }

  // Connexions suivantes : vérifier la phrase
  const key  = await deriveKey(passphrase, salt);
  const test = await getKeyTest();
  if (test) {
    const valid = await verifyKey(key, test);
    if (!valid) throw new Error('Phrase de chiffrement incorrecte.');
  }
  cryptoKey = key;
}

async function refreshReservations() {
  reservations = await loadReservations(cryptoKey);
}

// Déconnexion
document.getElementById('btn-logout')?.addEventListener('click', async () => {
  cryptoKey    = null;
  reservations = [];
  await logout();
  showView('login');
});

// ── LISTE ─────────────────────────────────────────────────────
function renderList() {
  const q    = (document.getElementById('search-input')?.value || '').toLowerCase();
  const list = document.getElementById('resa-list');
  const data = reservations.filter(r =>
    !r.departed &&
    (!q || r.clientName.toLowerCase().includes(q) || (r.licensePlate||'').toLowerCase().includes(q))
  );

  // Badge prises
  const occ = takenSockets().length;
  const el  = document.getElementById('elec-summary');
  if (el) {
    el.textContent = `⚡ ${occ} / ${tarifs.nbPrises} prises`;
    el.className   = 'elec-summary' + (occ >= tarifs.nbPrises ? ' full' : occ >= tarifs.nbPrises - 1 ? ' warn' : '');
  }

  if (!data.length) {
    list.innerHTML = '<div class="empty">Aucun séjour en cours</div>';
    return;
  }
  list.innerHTML = data.map(r => {
    const nightly = calcNightly(r.electricity, r.adults, r.teens, r.vehicles);
    return `<div class="resa-card" onclick="app.openDetail('${r.firestoreId}')">
      <div style="flex:1;min-width:0">
        <div class="resa-name"><span class="dot"></span>${r.clientName}</div>
        <div class="resa-meta">
          ${r.electricity ? `⚡ Prise n°${r.socketId}` : 'Sans électricité'}
          · ${fmtDate(r.arrivalDate)} → ${fmtDate(r.departureDate)}
          · ${r.nights} nuit${r.nights > 1 ? 's' : ''}
        </div>
        <div style="font-size:0.7rem;color:var(--text3);font-family:monospace;margin-top:2px">
          ${r.licensePlate || '—'} · ${r.nsNum}
        </div>
      </div>
      <div class="resa-right">
        <div class="resa-price">${r.totalPrice}€</div>
        <div class="resa-sub">${nightly}€/nuit + taxe</div>
      </div>
    </div>`;
  }).join('');
}

document.getElementById('search-input')?.addEventListener('input', renderList);

// ── DÉTAIL ────────────────────────────────────────────────────
export async function openDetail(firestoreId) {
  selectedResa = reservations.find(r => r.firestoreId === firestoreId);
  if (!selectedResa) return;
  const r       = selectedResa;
  const nightly = calcNightly(r.electricity, r.adults, r.teens, r.vehicles);

  document.getElementById('det-eyebrow').innerHTML =
    `<span style="font-size:0.65rem;letter-spacing:0.12em;color:var(--text3)">${r.nsNum}</span>`;
  document.getElementById('det-name').textContent = r.clientName;
  document.getElementById('depart-confirm').style.display = 'none';

  document.getElementById('det-client').innerHTML = `
    <div class="card-title">Client</div>
    <div class="info-row"><span class="info-label">Nom</span><span class="info-value">${r.clientName}</span></div>
    <div class="info-row"><span class="info-label">Email</span><span class="info-mono">${r.clientEmail || '—'}</span></div>
    <div class="info-row"><span class="info-label">Téléphone</span><span class="info-value">${r.clientPhone || '—'}</span></div>
    <div class="info-row"><span class="info-label">Immatriculation</span><span class="info-mono">${r.licensePlate || '—'}</span></div>`;

  document.getElementById('det-sejour').innerHTML = `
    <div class="card-title">Séjour</div>
    <div class="info-row"><span class="info-label">Forfait</span><span class="info-value">${r.electricity ? `⚡ Avec électricité — Prise n°${r.socketId}` : 'Sans électricité'}</span></div>
    <div class="info-row"><span class="info-label">Arrivée</span><span class="info-value">${fmtDate(r.arrivalDate)}</span></div>
    <div class="info-row"><span class="info-label">Départ</span><span class="info-value">${fmtDate(r.departureDate)}</span></div>
    <div class="info-row"><span class="info-label">Durée</span><span class="info-value">${r.nights} nuit${r.nights > 1 ? 's' : ''}</span></div>`;

  let bRows = `<div class="info-row"><span class="info-label">Forfait ${r.electricity ? 'avec élec.' : 'sans élec.'}</span><span class="info-value">${r.electricity ? tarifs.baseAvec : tarifs.baseSans}€/nuit</span></div>`;
  if (r.adults)   bRows += `<div class="info-row"><span class="info-label">Adultes suppl. (×${r.adults})</span><span class="info-value">+${r.adults*tarifs.adulte}€/nuit</span></div>`;
  if (r.teens)    bRows += `<div class="info-row"><span class="info-label">Adolescents (×${r.teens})</span><span class="info-value">+${r.teens*tarifs.ado}€/nuit</span></div>`;
  if (r.babies)   bRows += `<div class="info-row"><span class="info-label">Enfants &lt;3 ans (×${r.babies})</span><span class="info-value">Gratuit</span></div>`;
  if (r.animals)  bRows += `<div class="info-row"><span class="info-label">Animaux (×${r.animals})</span><span class="info-value">Gratuit</span></div>`;
  if (r.vehicles) bRows += `<div class="info-row"><span class="info-label">Véhicules suppl. (×${r.vehicles})</span><span class="info-value">+${r.vehicles*tarifs.vehicule}€/nuit</span></div>`;
  bRows += `
    <div class="info-row"><span class="info-label">Sous-total hébergement</span><span class="info-value">${nightly * r.nights}€</span></div>
    <div class="info-row"><span class="info-label">Taxe de séjour</span><span class="info-value">${r.taxeAmt}€</span></div>
    <div class="info-row"><span class="info-label" style="font-weight:600;color:var(--text)">Total TTC</span>
      <span class="info-value" style="font-family:var(--font-serif);font-size:1.25rem;color:var(--accent)">${r.totalPrice}€</span></div>`;
  document.getElementById('det-billing').innerHTML = `<div class="card-title">Facturation</div>${bRows}`;

  const nc = document.getElementById('det-notes');
  if (r.notes) {
    nc.style.display = '';
    nc.innerHTML = `<div class="card-title">Notes</div><p style="font-size:0.82rem;color:var(--text2);line-height:1.7">${r.notes}</p>`;
  } else nc.style.display = 'none';

  showView('detail');
}

// ── DÉPART ────────────────────────────────────────────────────
export function askDepart()    { document.getElementById('depart-confirm').style.display = ''; }
export function cancelDepart() { document.getElementById('depart-confirm').style.display = 'none'; }

export async function confirmDepart() {
  if (!selectedResa) return;
  const btn = document.getElementById('btn-confirm-depart');
  btn.disabled = true; btn.textContent = 'Traitement…';
  try {
    await anonymizeOnDeparture(selectedResa.firestoreId, cryptoKey);
    await refreshReservations();
    selectedResa = null;
    showView('list');
  } catch (err) {
    alert('Erreur : ' + err.message);
    btn.disabled = false; btn.textContent = 'Confirmer le départ';
  }
}

// ── NOTE DE SÉJOUR ────────────────────────────────────────────
export function showInvoice() {
  if (!selectedResa) return;
  const r = selectedResa;

  // Aperçu dans l'app
  document.getElementById('invoice-content').innerHTML =
    buildInvoiceHTML({ ...r, tarifs }, campingConfig);

  const btn = document.getElementById('send-btn');
  btn.textContent = r.clientEmail ? `Envoyer à ${r.clientEmail}` : 'Envoyer (copie camping)';
  btn.className   = 'btn-primary';
  btn.disabled    = false;

  showView('invoice');
}

export async function sendInvoice() {
  if (!selectedResa) return;
  const btn = document.getElementById('send-btn');
  btn.disabled = true; btn.textContent = 'Envoi en cours…';
  try {
    await sendInvoiceEmail(selectedResa, campingConfig, tarifs);
    btn.textContent = '✓ Note envoyée';
    btn.className   = 'btn-sent';
  } catch (err) {
    btn.disabled = false; btn.textContent = 'Réessayer';
    alert('Erreur d\'envoi : ' + err.message);
  }
}

export function printInvoice() {
  const view = document.getElementById('view-invoice');
  view.classList.add('print-me');
  window.print();
  view.classList.remove('print-me');
}

// ── FORMULAIRE NOUVELLE RÉSERVATION ──────────────────────────
export function selectElec(v) {
  if (v && takenSockets().length >= tarifs.nbPrises) return;
  hasElec = v;
  document.getElementById('elec-no').classList.toggle('selected',  !v);
  document.getElementById('elec-yes').classList.toggle('selected',  v);
  if (!v) selectedSocket = null;
  refreshSocketUI();
  updateCalc();
}

export function refreshSocketUI() {
  const taken   = takenSockets();
  const full    = taken.length >= tarifs.nbPrises;
  document.getElementById('elec-full-msg').style.display = (full && hasElec) ? '' : 'none';
  document.getElementById('elec-yes').classList.toggle('disabled-opt', full && !hasElec);

  const picker = document.getElementById('socket-picker');
  picker.style.display = hasElec ? '' : 'none';
  if (!hasElec) { selectedSocket = null; return; }

  let html = '';
  for (let i = 1; i <= tarifs.nbPrises; i++) {
    const isTaken    = taken.includes(i);
    const isSelected = selectedSocket === i;
    html += `<div class="socket-btn${isTaken ? ' taken' : ''}${isSelected ? ' selected' : ''}"
      ${isTaken ? '' : `onclick="app.pickSocket(${i})"`}
      title="${isTaken ? 'Prise occupée' : 'Prise ' + i}">${i}${isTaken ? '<br><small>🔒</small>' : ''}</div>`;
  }
  document.getElementById('socket-grid').innerHTML = html;
}

export function pickSocket(n) { selectedSocket = n; refreshSocketUI(); }

export function step(key, dir) {
  counters[key] = Math.max(0, counters[key] + dir);
  document.getElementById('count-' + key).textContent = counters[key];
  updateCalc();
}

export function updateCalc() {
  const a      = document.getElementById('f-arrival')?.value;
  const d      = document.getElementById('f-departure')?.value;
  const nights = calcNights(a, d);
  const pill   = document.getElementById('night-pill');
  if (nights > 0) { pill.style.display = ''; pill.textContent = nights + ' nuit' + (nights > 1 ? 's' : ''); }
  else               pill.style.display = 'none';
  const tp = document.getElementById('total-pill');
  if (nights > 0) {
    const total = calcTotal(hasElec, counters.adults, counters.teens, nights, counters.vehicles);
    tp.style.display = 'flex';
    document.getElementById('total-amount').textContent = total + '€';
  } else tp.style.display = 'none';
}

export async function saveNewReservation() {
  const name = document.getElementById('f-name').value.trim();
  const arr  = document.getElementById('f-arrival').value;
  const dep  = document.getElementById('f-departure').value;
  if (!name || !arr || !dep) { alert('Champs obligatoires : nom et dates.'); return; }
  if (hasElec && !selectedSocket) { alert('Merci de sélectionner un numéro de prise.'); return; }
  const nights = calcNights(arr, dep);
  if (nights <= 0) { alert('La date de départ doit être après la date d\'arrivée.'); return; }

  const btn = document.getElementById('btn-save');
  btn.disabled = true; btn.textContent = 'Enregistrement…';

  try {
    const ns = await nextNS();
    await saveReservation({
      nsNum:         ns,
      clientName:    name,
      clientEmail:   document.getElementById('f-email').value.trim(),
      clientPhone:   document.getElementById('f-phone').value.trim(),
      licensePlate:  document.getElementById('f-plate').value.trim().toUpperCase(),
      electricity:   hasElec,
      socketId:      hasElec ? selectedSocket : null,
      arrivalDate:   arr,
      departureDate: dep,
      nights,
      adults:   counters.adults,
      teens:    counters.teens,
      babies:   counters.babies,
      animals:  counters.animals,
      vehicles: counters.vehicles,
      totalPrice: calcTotal(hasElec, counters.adults, counters.teens, nights, counters.vehicles),
      taxeAmt:    calcTaxe(counters.adults, counters.teens, nights),
      notes:    document.getElementById('f-notes').value.trim(),
    }, cryptoKey);

    resetForm();
    await refreshReservations();
    showView('list');
  } catch (err) {
    alert('Erreur : ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Enregistrer';
  }
}

function resetForm() {
  ['f-name','f-email','f-phone','f-plate','f-arrival','f-departure','f-notes']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  counters = { adults:0, teens:0, babies:0, animals:0, vehicles:0 };
  ['adults','teens','babies','animals','vehicles']
    .forEach(k => { const el = document.getElementById('count-' + k); if (el) el.textContent = '0'; });
  hasElec = false; selectedSocket = null;
  document.getElementById('elec-no').classList.add('selected');
  document.getElementById('elec-yes').classList.remove('selected');
  document.getElementById('night-pill').style.display  = 'none';
  document.getElementById('total-pill').style.display  = 'none';
  refreshSocketUI();
}

// ── STATISTIQUES ──────────────────────────────────────────────
export function renderStats() {
  const from = document.getElementById('stat-from')?.value;
  const to   = document.getElementById('stat-to')?.value;
  if (!from || !to) return;

  const data = reservations.filter(r => r.departureDate >= from && r.arrivalDate <= to);
  let totalNights = 0;
  data.forEach(r => {
    const s = r.arrivalDate   > from ? r.arrivalDate   : from;
    const e = r.departureDate < to   ? r.departureDate : to;
    totalNights += calcNights(s, e);
  });
  const totalRev    = data.reduce((s,r) => s + r.totalPrice, 0);
  const totalTaxe   = data.reduce((s,r) => s + r.taxeAmt,    0);
  const totalHeberg = totalRev - totalTaxe;
  const avgNight    = totalNights ? Math.round(totalRev / totalNights) : 0;

  document.getElementById('kpi-grid').innerHTML = `
    <div class="kpi accent"><div class="kpi-label">Nuitées</div><div class="kpi-value">${totalNights}</div></div>
    <div class="kpi accent"><div class="kpi-label">Revenu brut</div><div class="kpi-value">${totalRev}€</div></div>
    <div class="kpi"><div class="kpi-label">Séjours</div><div class="kpi-value">${data.length}</div></div>
    <div class="kpi"><div class="kpi-label">Moy. / nuit</div><div class="kpi-value">${avgNight}€</div></div>`;

  const withElec    = data.filter(r =>  r.electricity);
  const withoutElec = data.filter(r => !r.electricity);
  document.getElementById('stat-details').innerHTML = `
    <div class="card-title">Détail</div>
    <div class="type-row"><div class="type-left">⚡ Avec électricité</div>
      <div class="type-right"><div class="type-rev">${withElec.reduce((s,r)=>s+r.totalPrice,0)}€</div><div class="type-count">${withElec.length} séjour${withElec.length!==1?'s':''}</div></div></div>
    <div class="type-row"><div class="type-left">☀️ Sans électricité</div>
      <div class="type-right"><div class="type-rev">${withoutElec.reduce((s,r)=>s+r.totalPrice,0)}€</div><div class="type-count">${withoutElec.length} séjour${withoutElec.length!==1?'s':''}</div></div></div>
    <div class="type-row"><div class="type-left" style="color:var(--text3)">dont hébergement</div>
      <div class="type-right"><div class="type-rev" style="color:var(--text3)">${totalHeberg}€</div></div></div>
    <div class="type-row"><div class="type-left" style="color:var(--text3)">dont taxe de séjour</div>
      <div class="type-right"><div class="type-rev" style="color:var(--text3)">${totalTaxe}€</div></div></div>`;
}

document.getElementById('stat-from')?.addEventListener('input', renderStats);
document.getElementById('stat-to')?.addEventListener('input', renderStats);

// ── Exposition globale (onclick dans le HTML) ─────────────────
window.app = {
  showView, openDetail,
  askDepart, cancelDepart, confirmDepart,
  showInvoice, sendInvoice, printInvoice,
  selectElec, pickSocket, step, updateCalc,
  saveNewReservation, renderStats,
};
