// ─────────────────────────────────────────────────────────────
//  app.js — Camping de Sagnat
// ─────────────────────────────────────────────────────────────

import { campingConfig, tarifs } from './config.js';
import { deriveKey, verifyKey, generateSalt, createKeyTest } from './crypto.js';
import {
  auth, login, logout, onAuthChange,
  getSalt, getKeyTest, initMeta,
  nextNS, saveReservation, loadReservations,
  updateReservation, anonymizeOnDeparture,
} from './db.js';
import { sendInvoiceEmail, buildInvoiceHTML, buildAmendmentHTML, sendAmendmentEmail } from './email.js';

// ── État ──────────────────────────────────────────────────────
let cryptoKey      = null;
let reservations   = [];
let selectedResa   = null;

// Formulaire nouvelle arrivée
let counters       = { adults:0, teens:0, babies:0, animals:0, vehicles:0 };
let hasElec        = false;
let selectedSocket = null;
let baseAdults     = 2;

// Formulaire modification
let modCounters     = { adults:0, teens:0, babies:0, animals:0, vehicles:0 };
let modBaseAdults   = 2;
let modChangePeople = false;
let pendingMod      = null; // données calculées avant sauvegarde

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
  if (el) { el.textContent = msg; el.style.display = 'block'; }
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
export function calcTaxe(base, adults, teens, nights) {
  // Bébés et ados exemptés
  return ((base||2) + (adults||0)) * nights;
}
export function calcTotal(elec, base, adults, teens, nights, vehicles) {
  return calcNightly(elec, adults, teens, vehicles) * nights
       + calcTaxe(base, adults, teens, nights);
}
function takenSockets() {
  return reservations.filter(r => r.electricity && !r.departed).length;
}

// Statut dynamique d'un séjour
function stayStatus(r) {
  const today = new Date(); today.setHours(0,0,0,0);
  const dep   = new Date(r.departureDate + 'T00:00:00');
  const diff  = Math.round((dep - today) / 86400000);
  if (diff > 1)   return { type:'active',    label:`${diff} nuits restantes` };
  if (diff === 1) return { type:'active',    label:'1 nuit restante' };
  if (diff === 0) return { type:'departing', label:'Départ aujourd\'hui' };
  if (diff === -1) return { type:'overdue',  label:'Départ dépassé (1j)' };
  if (diff === -2) return { type:'overdue',  label:'Départ dépassé (2j)' };
  return               { type:'overdue',  label:'Départ dépassé (3j)' };
}

// ── Auth ──────────────────────────────────────────────────────
onAuthChange(async (user) => {
  if (!user)      { showView('login');      return; }
  if (!cryptoKey) { showView('passphrase'); return; }
  await refreshReservations();
  showView('list');
});

document.getElementById('form-login')?.addEventListener('submit', async e => {
  e.preventDefault(); hideError();
  const btn = document.getElementById('btn-login');
  btn.disabled = true; btn.textContent = 'Connexion…';
  try {
    const email      = document.getElementById('login-email').value.trim();
    const password   = document.getElementById('login-password').value;
    const passphrase = document.getElementById('login-passphrase').value;
    if (!passphrase) throw new Error('La phrase de chiffrement est obligatoire.');
    await login(email, password);
    await initCryptoKey(passphrase);
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

document.getElementById('form-passphrase')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn   = document.getElementById('btn-passphrase');
  const errEl = document.getElementById('passphrase-error');
  btn.disabled = true; btn.textContent = 'Vérification…';
  errEl.style.display = 'none';
  try {
    await initCryptoKey(document.getElementById('input-passphrase').value);
    await refreshReservations();
    showView('list');
  } catch (err) {
    errEl.textContent    = err.message || 'Phrase incorrecte.';
    errEl.style.display  = 'block';
    btn.disabled         = false;
    btn.textContent      = 'Déverrouiller';
  }
});

async function initCryptoKey(passphrase) {
  let salt = await getSalt();
  if (!salt) {
    salt       = generateSalt();
    const key  = await deriveKey(passphrase, salt);
    const test = await createKeyTest(key);
    await initMeta(salt, test);
    cryptoKey  = key; return;
  }
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
  // Anonymisation automatique 3 jours après le départ
  const today   = new Date(); today.setHours(0,0,0,0);
  const cutoff  = new Date(today); cutoff.setDate(cutoff.getDate() - 3);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  const expired = reservations.filter(r => !r.departed && r.departureDate <= cutoffStr);
  if (expired.length > 0) {
    await Promise.all(expired.map(r => anonymizeOnDeparture(r.firestoreId, cryptoKey)));
    reservations = await loadReservations(cryptoKey);
  }
}

document.getElementById('btn-logout')?.addEventListener('click', async () => {
  cryptoKey = null; reservations = [];
  await logout(); showView('login');
});

// ── LISTE ─────────────────────────────────────────────────────
function renderList() {
  const q    = (document.getElementById('search-input')?.value || '').toLowerCase();
  const list = document.getElementById('resa-list');
  const data = reservations.filter(r =>
    !r.departed &&
    (!q || r.clientName.toLowerCase().includes(q) || (r.licensePlate||'').toLowerCase().includes(q))
  );

  const occ = takenSockets();
  const el  = document.getElementById('elec-summary');
  if (el) {
    el.textContent = `⚡ ${occ} / ${tarifs.nbPrises} prises`;
    el.className   = 'elec-summary'
      + (occ >= tarifs.nbPrises ? ' full' : occ >= tarifs.nbPrises - 1 ? ' warn' : '');
  }

  if (!data.length) {
    list.innerHTML = '<div class="empty">Aucun séjour en cours</div>'; return;
  }

  list.innerHTML = data.map(r => {
    const nightly = calcNightly(r.electricity, r.adults, r.teens, r.vehicles);
    const status  = stayStatus(r);
    const statusDot = status.type === 'departing' ? 'dot-departing'
                    : status.type === 'overdue'   ? 'dot-overdue'
                    : 'dot';
    const statusBadge = `<span class="status-badge status-${status.type}">${status.label}</span>`;
    return `<div class="resa-card${status.type==='overdue'?' resa-overdue':''}" onclick="app.openDetail('${r.firestoreId}')">
      <div style="flex:1;min-width:0">
        <div class="resa-name"><span class="${statusDot}"></span>${r.clientName}</div>
        <div class="resa-meta">
          ${r.electricity ? '⚡ Avec électricité' : 'Sans électricité'}
          · ${fmtDate(r.arrivalDate)} → ${fmtDate(r.departureDate)}
          · ${r.nights} nuit${r.nights>1?'s':''}
          ${r.amendments?.length ? `· <span style="color:var(--text3);font-size:0.68rem">Av.${r.amendments.length}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
          ${statusBadge}
          <span style="font-size:0.7rem;color:var(--text3);font-family:monospace">${r.licensePlate||'—'} · ${r.nsNum}</span>
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
  const r = selectedResa;
  const base    = r.baseAdults || 2;
  const nightly = calcNightly(r.electricity, r.adults, r.teens, r.vehicles);
  const status  = stayStatus(r);

  document.getElementById('det-eyebrow').innerHTML =
    `<span style="font-size:0.65rem;letter-spacing:0.12em;color:var(--text3)">${r.nsNum}</span>
     ${r.amendments?.length ? `<span style="font-size:0.65rem;color:var(--text3);margin-left:8px">· ${r.amendments.length} avenant${r.amendments.length>1?'s':''}</span>` : ''}`;
  document.getElementById('det-name').textContent = r.clientName;
  document.getElementById('depart-confirm').style.display = 'none';

  document.getElementById('det-client').innerHTML = `
    <div class="card-title">Client</div>
    <div class="info-row"><span class="info-label">Nom</span><span class="info-value">${r.clientName}</span></div>
    ${r.nationalite ? `<div class="info-row"><span class="info-label">Nationalité</span><span class="info-value">${r.nationalite}</span></div>` : ''}
    <div class="info-row"><span class="info-label">Email</span><span class="info-mono">${r.clientEmail||'—'}</span></div>
    <div class="info-row"><span class="info-label">Téléphone</span><span class="info-value">${r.clientPhone||'—'}</span></div>
    <div class="info-row"><span class="info-label">Immatriculation</span><span class="info-mono">${r.licensePlate||'—'}</span></div>`;

  document.getElementById('det-sejour').innerHTML = `
    <div class="card-title">Séjour <span class="status-badge status-${status.type}" style="margin-left:8px;font-size:0.62rem">${status.label}</span></div>
    <div class="info-row"><span class="info-label">Forfait</span><span class="info-value">${r.electricity?'⚡ Avec électricité':'Sans électricité'}</span></div>
    <div class="info-row"><span class="info-label">Arrivée</span><span class="info-value">${fmtDate(r.arrivalDate)}</span></div>
    <div class="info-row"><span class="info-label">Départ</span><span class="info-value">${fmtDate(r.departureDate)}</span></div>
    <div class="info-row"><span class="info-label">Durée</span><span class="info-value">${r.nights} nuit${r.nights>1?'s':''}</span></div>`;

  let bRows = `<div class="info-row"><span class="info-label">Forfait ${r.electricity?'avec élec.':'sans élec.'} — ${base} pers. incluse${base>1?'s':''}</span><span class="info-value">${r.electricity?tarifs.baseAvec:tarifs.baseSans}€/nuit</span></div>`;
  if (r.adults)   bRows += `<div class="info-row"><span class="info-label">Adultes suppl. (×${r.adults})</span><span class="info-value">+${r.adults*tarifs.adulte}€/nuit</span></div>`;
  if (r.teens)    bRows += `<div class="info-row"><span class="info-label">Adolescents (×${r.teens})</span><span class="info-value">+${r.teens*tarifs.ado}€/nuit</span></div>`;
  if (r.babies)   bRows += `<div class="info-row"><span class="info-label">Enfants &lt;3 ans (×${r.babies})</span><span class="info-value">Gratuit</span></div>`;
  if (r.animals)  bRows += `<div class="info-row"><span class="info-label">Animaux (×${r.animals})</span><span class="info-value">Gratuit</span></div>`;
  if (r.vehicles) bRows += `<div class="info-row"><span class="info-label">Véhicules suppl. (×${r.vehicles})</span><span class="info-value">+${r.vehicles*tarifs.vehicule}€/nuit</span></div>`;
  bRows += `
    <div class="info-row"><span class="info-label">Sous-total hébergement</span><span class="info-value">${nightly*r.nights}€</span></div>
    <div class="info-row"><span class="info-label">Taxe de séjour</span><span class="info-value">${r.taxeAmt}€</span></div>
    <div class="info-row"><span class="info-label" style="font-weight:600;color:var(--text)">Total TTC</span>
      <span class="info-value" style="font-family:var(--font-serif);font-size:1.25rem;color:var(--accent)">${r.totalPrice}€</span></div>`;
  document.getElementById('det-billing').innerHTML = `<div class="card-title">Facturation</div>${bRows}`;

  const nc = document.getElementById('det-notes');
  if (r.notes) { nc.style.display=''; nc.innerHTML=`<div class="card-title">Notes</div><p style="font-size:0.82rem;color:var(--text2);line-height:1.7">${r.notes}</p>`; }
  else nc.style.display = 'none';

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
    selectedResa = null; showView('list');
  } catch (err) {
    alert('Erreur : ' + err.message);
    btn.disabled = false; btn.textContent = 'Confirmer le départ';
  }
}

// ── NOTE DE SÉJOUR ────────────────────────────────────────────
export function showInvoice() {
  if (!selectedResa) return;
  document.getElementById('invoice-content').innerHTML =
    buildInvoiceHTML({ ...selectedResa, tarifs }, campingConfig);
  const btn = document.getElementById('send-btn');
  btn.textContent = selectedResa.clientEmail ? `Envoyer à ${selectedResa.clientEmail}` : 'Envoyer (copie camping)';
  btn.className = 'btn-primary'; btn.disabled = false;
  showView('invoice');
}
export async function sendInvoice() {
  if (!selectedResa) return;
  const btn = document.getElementById('send-btn');
  btn.disabled = true; btn.textContent = 'Envoi en cours…';
  try {
    await sendInvoiceEmail(selectedResa, campingConfig, tarifs);
    btn.textContent = '✓ Note envoyée'; btn.className = 'btn-sent';
  } catch (err) {
    btn.disabled = false; btn.textContent = 'Réessayer';
    alert('Erreur d\'envoi : ' + err.message);
  }
}
export function printInvoice() {
  document.getElementById('view-invoice').classList.add('print-me');
  window.print();
  document.getElementById('view-invoice').classList.remove('print-me');
}

// ── MODIFICATION DE SÉJOUR ────────────────────────────────────
export function openModify() {
  if (!selectedResa) return;
  const r = selectedResa;

  // Pré-remplir dates
  document.getElementById('mod-arrival').value   = r.arrivalDate;
  document.getElementById('mod-departure').value = r.departureDate;

  // Pré-remplir personnes
  modCounters     = { adults: r.adults||0, teens: r.teens||0, babies: r.babies||0, animals: r.animals||0, vehicles: r.vehicles||0 };
  modBaseAdults   = r.baseAdults || 2;
  modChangePeople = false;
  pendingMod      = null;

  document.getElementById('mod-change-people').checked = false;
  document.getElementById('mod-people-section').style.display = 'none';
  ['adults','teens','babies','animals','vehicles']
    .forEach(k => { const el = document.getElementById('mcount-'+k); if (el) el.textContent = modCounters[k]; });
  document.getElementById('mcount-base').textContent = modBaseAdults;

  // Résumé séjour actuel
  const nightly = calcNightly(r.electricity, r.adults, r.teens, r.vehicles);
  document.getElementById('mod-current').innerHTML = `
    <div class="card-title">Séjour actuel</div>
    <div class="info-row"><span class="info-label">Dates</span><span class="info-value">${fmtDate(r.arrivalDate)} → ${fmtDate(r.departureDate)}</span></div>
    <div class="info-row"><span class="info-label">Durée</span><span class="info-value">${r.nights} nuit${r.nights>1?'s':''}</span></div>
    <div class="info-row"><span class="info-label">Tarif / nuit</span><span class="info-value">${nightly}€</span></div>
    <div class="info-row"><span class="info-label">Total actuel</span><span class="info-value" style="font-family:var(--font-serif);font-size:1.1rem;color:var(--accent)">${r.totalPrice}€</span></div>`;

  document.getElementById('mod-name').textContent = r.clientName;
  document.getElementById('mod-eyebrow').innerHTML =
    `<span style="font-size:0.65rem;letter-spacing:0.12em;color:var(--text3)">${r.nsNum}</span>`;

  document.getElementById('mod-recap').style.display = 'none';
  updateModCalc();
  showView('modify');
}

export function toggleModPeople() {
  modChangePeople = document.getElementById('mod-change-people').checked;
  document.getElementById('mod-people-section').style.display = modChangePeople ? '' : 'none';
  updateModCalc();
}

export function modStep(key, dir) {
  modCounters[key] = Math.max(0, modCounters[key] + dir);
  document.getElementById('mcount-' + key).textContent = modCounters[key];
  updateModCalc();
}
export function modStepBase(dir) {
  modBaseAdults = Math.min(2, Math.max(1, modBaseAdults + dir));
  document.getElementById('mcount-base').textContent = modBaseAdults;
  updateModCalc();
}

export function updateModCalc() {
  if (!selectedResa) return;
  const r = selectedResa;
  const newArr = document.getElementById('mod-arrival').value;
  const newDep = document.getElementById('mod-departure').value;
  if (!newArr || !newDep) { document.getElementById('mod-recap').style.display = 'none'; return; }

  const newNights = calcNights(newArr, newDep);
  if (newNights <= 0) { document.getElementById('mod-recap').style.display = 'none'; return; }

  // Si on change les personnes, on utilise les nouveaux compteurs, sinon les anciens
  const a = modChangePeople ? modCounters.adults   : (r.adults   || 0);
  const t = modChangePeople ? modCounters.teens    : (r.teens    || 0);
  const b = modChangePeople ? modCounters.babies   : (r.babies   || 0);
  const an= modChangePeople ? modCounters.animals  : (r.animals  || 0);
  const v = modChangePeople ? modCounters.vehicles : (r.vehicles || 0);
  const ba= modChangePeople ? modBaseAdults        : (r.baseAdults || 2);

  const newNightly = calcNightly(r.electricity, a, t, v);
  const newTaxe    = calcTaxe(ba, a, t, newNights);
  const newTotal   = newNightly * newNights + newTaxe;
  const delta      = newTotal - r.totalPrice;
  const deltaAbs   = Math.abs(delta);

  // Stocker pour usage dans showAmendment/saveModification
  pendingMod = {
    originalArrival:   r.arrivalDate,
    originalDeparture: r.departureDate,
    originalNights:    r.nights,
    originalTotal:     r.totalPrice,
    newArrival:  newArr,
    newDeparture: newDep,
    newNights,
    newNightly,
    newTotal,
    newTaxe,
    delta,
    changePeople: modChangePeople,
    adults: a, teens: t, babies: b, animals: an, vehicles: v, baseAdults: ba,
  };

  const recap = document.getElementById('mod-recap');
  recap.style.display = '';
  const deltaColor  = delta > 0 ? 'var(--success)' : delta < 0 ? 'var(--danger)' : 'var(--text2)';
  const deltaText   = delta > 0 ? `+${deltaAbs}€ à encaisser`
                    : delta < 0 ? `−${deltaAbs}€ à rembourser`
                    : 'Pas de différence';

  const nightDiff   = newNights - r.nights;
  const nightLabel  = nightDiff > 0 ? `+${nightDiff} nuit${nightDiff>1?'s':''}`
                    : nightDiff < 0 ? `${nightDiff} nuit${Math.abs(nightDiff)>1?'s':''}`
                    : 'Mêmes dates';

  recap.innerHTML = `
    <div class="card-title">Résumé de la modification</div>
    <div class="info-row"><span class="info-label">Nouvelles dates</span><span class="info-value">${fmtDate(newArr)} → ${fmtDate(newDep)}</span></div>
    <div class="info-row"><span class="info-label">Nouvelle durée</span><span class="info-value">${newNights} nuit${newNights>1?'s':''} <span style="color:var(--text3);font-size:0.8em">(${nightLabel})</span></span></div>
    <div class="info-row"><span class="info-label">Nouveau total</span><span class="info-value">${newTotal}€</span></div>
    <div class="info-row"><span class="info-label">Différence</span><span class="info-value" style="color:${deltaColor};font-weight:600">${deltaText}</span></div>`;
}

export function showAmendment() {
  if (!pendingMod || !selectedResa) { alert('Merci de saisir les nouvelles dates.'); return; }
  document.getElementById('amendment-content').innerHTML =
    buildAmendmentHTML(selectedResa, pendingMod, campingConfig);
  const btn = document.getElementById('amend-send-btn');
  btn.textContent = selectedResa.clientEmail ? `Envoyer à ${selectedResa.clientEmail}` : 'Envoyer (copie camping)';
  btn.className = 'btn-primary'; btn.disabled = false;
  showView('amendment');
}

export async function sendAmendment() {
  if (!pendingMod || !selectedResa) return;
  const btn = document.getElementById('amend-send-btn');
  btn.disabled = true; btn.textContent = 'Envoi en cours…';
  try {
    await sendAmendmentEmail(selectedResa, pendingMod, campingConfig);
    await _applyModification(true);
    btn.textContent = '✓ Avenant envoyé'; btn.className = 'btn-sent';
  } catch (err) {
    btn.disabled = false; btn.textContent = 'Réessayer';
    alert('Erreur : ' + err.message);
  }
}

export function printAmendment() {
  document.getElementById('view-amendment').classList.add('print-me');
  window.print();
  document.getElementById('view-amendment').classList.remove('print-me');
}

export async function saveModification() {
  if (!pendingMod || !selectedResa) { alert('Merci de saisir les nouvelles dates.'); return; }
  const btn = document.getElementById('btn-save-mod');
  btn.disabled = true; btn.textContent = 'Sauvegarde…';
  try {
    await _applyModification(false);
    await refreshReservations();
    selectedResa = reservations.find(r => r.firestoreId === selectedResa?.firestoreId) || null;
    if (selectedResa) openDetail(selectedResa.firestoreId);
    else showView('list');
  } catch (err) {
    alert('Erreur : ' + err.message);
    btn.disabled = false; btn.textContent = 'Sauvegarder sans envoyer';
  }
}

async function _applyModification(withAmendmentRecord) {
  const r   = selectedResa;
  const mod = pendingMod;
  const amendmentRecord = withAmendmentRecord ? {
    date:              new Date().toISOString(),
    amendNum:          (r.amendments?.length || 0) + 1,
    originalArrival:   mod.originalArrival,
    originalDeparture: mod.originalDeparture,
    originalNights:    mod.originalNights,
    originalTotal:     mod.originalTotal,
    newArrival:        mod.newArrival,
    newDeparture:      mod.newDeparture,
    newNights:         mod.newNights,
    newTotal:          mod.newTotal,
    delta:             mod.delta,
  } : null;

  await updateReservation(r.firestoreId, {
    arrivalDate:   mod.newArrival,
    departureDate: mod.newDeparture,
    nights:        mod.newNights,
    totalPrice:    mod.newTotal,
    taxeAmt:       mod.newTaxe,
    changePeople:  mod.changePeople,
    adults:        mod.adults,
    teens:         mod.teens,
    babies:        mod.babies,
    animals:       mod.animals,
    vehicles:      mod.vehicles,
    baseAdults:    mod.baseAdults,
  }, amendmentRecord);

  pendingMod = null;
  await refreshReservations();
  // Rafraîchir selectedResa depuis les données mises à jour
  selectedResa = reservations.find(r2 => r2.firestoreId === r.firestoreId) || null;
}

// ── FORMULAIRE NOUVELLE ARRIVÉE ───────────────────────────────
export function selectElec(v) {
  if (v && takenSockets() >= tarifs.nbPrises) return;
  hasElec = v;
  document.getElementById('elec-no').classList.toggle('selected',  !v);
  document.getElementById('elec-yes').classList.toggle('selected',  v);
  refreshSocketUI(); updateCalc();
}
export function refreshSocketUI() {
  const full = takenSockets() >= tarifs.nbPrises;
  document.getElementById('elec-full-msg').style.display = (full && hasElec) ? '' : 'none';
  document.getElementById('elec-yes').classList.toggle('disabled-opt', full && !hasElec);
}
export function step(key, dir) {
  counters[key] = Math.max(0, counters[key] + dir);
  document.getElementById('count-' + key).textContent = counters[key];
  updateCalc();
}
export function stepBase(dir) {
  baseAdults = Math.min(2, Math.max(1, baseAdults + dir));
  document.getElementById('count-base').textContent = baseAdults;
  updateCalc();
}
export function updateCalc() {
  const a = document.getElementById('f-arrival')?.value;
  const d = document.getElementById('f-departure')?.value;
  const n = calcNights(a, d);
  const pill = document.getElementById('night-pill');
  if (n > 0) { pill.style.display=''; pill.textContent=n+' nuit'+(n>1?'s':''); }
  else pill.style.display = 'none';
  const tp = document.getElementById('total-pill');
  if (n > 0) {
    tp.style.display = 'flex';
    document.getElementById('total-amount').textContent =
      calcTotal(hasElec, baseAdults, counters.adults, counters.teens, n, counters.vehicles) + '€';
  } else tp.style.display = 'none';
}
function resetForm() {
  ['f-name','f-email','f-phone','f-plate','f-nationality','f-arrival','f-departure','f-notes']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  counters = { adults:0, teens:0, babies:0, animals:0, vehicles:0 };
  ['adults','teens','babies','animals','vehicles'].forEach(k => {
    const el = document.getElementById('count-'+k); if (el) el.textContent = '0';
  });
  baseAdults = 2;
  document.getElementById('count-base').textContent = '2';
  hasElec = false; selectedSocket = null;
  document.getElementById('elec-no').classList.add('selected');
  document.getElementById('elec-yes').classList.remove('selected');
  document.getElementById('night-pill').style.display  = 'none';
  document.getElementById('total-pill').style.display  = 'none';
  refreshSocketUI();
}
export async function saveNewReservation() {
  const name = document.getElementById('f-name').value.trim();
  const arr  = document.getElementById('f-arrival').value;
  const dep  = document.getElementById('f-departure').value;
  if (!name || !arr || !dep) { alert('Champs obligatoires : nom et dates.'); return; }
  const nights = calcNights(arr, dep);
  if (nights <= 0) { alert('La date de départ doit être après la date d\'arrivée.'); return; }
  const btn = document.getElementById('btn-save');
  btn.disabled = true; btn.textContent = 'Enregistrement…';
  try {
    const ns = await nextNS();
    await saveReservation({
      nsNum:       ns,
      clientName:  name,
      clientEmail: document.getElementById('f-email').value.trim(),
      clientPhone: document.getElementById('f-phone').value.trim(),
      licensePlate:document.getElementById('f-plate').value.trim().toUpperCase(),
      nationalite: document.getElementById('f-nationality').value.trim(),
      electricity: hasElec, socketId: null,
      arrivalDate: arr, departureDate: dep, nights,
      baseAdults,
      adults: counters.adults, teens: counters.teens, babies: counters.babies,
      animals: counters.animals, vehicles: counters.vehicles,
      totalPrice: calcTotal(hasElec, baseAdults, counters.adults, counters.teens, nights, counters.vehicles),
      taxeAmt:    calcTaxe(baseAdults, counters.adults, counters.teens, nights),
      notes: document.getElementById('f-notes').value.trim(),
    }, cryptoKey);
    resetForm();
    await refreshReservations();
    showView('list');
  } catch (err) { alert('Erreur : ' + err.message); }
  finally { btn.disabled = false; btn.textContent = 'Enregistrer l\'arrivée'; }
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
  const totalRev    = data.reduce((s,r)=>s+r.totalPrice,0);
  const totalTaxe   = data.reduce((s,r)=>s+r.taxeAmt,0);
  const totalHeberg = totalRev - totalTaxe;
  const avgNight    = totalNights ? Math.round(totalRev/totalNights) : 0;

  document.getElementById('kpi-grid').innerHTML = `
    <div class="kpi accent"><div class="kpi-label">Nuitées</div><div class="kpi-value">${totalNights}</div></div>
    <div class="kpi accent"><div class="kpi-label">Revenu brut</div><div class="kpi-value">${totalRev}€</div></div>
    <div class="kpi"><div class="kpi-label">Séjours</div><div class="kpi-value">${data.length}</div></div>
    <div class="kpi"><div class="kpi-label">Moy. / nuit</div><div class="kpi-value">${avgNight}€</div></div>`;

  const withElec    = data.filter(r=> r.electricity);
  const withoutElec = data.filter(r=>!r.electricity);
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
document.getElementById('stat-to')?.addEventListener('input',   renderStats);

// ── Exposition globale ────────────────────────────────────────
window.app = {
  showView, openDetail,
  askDepart, cancelDepart, confirmDepart,
  showInvoice, sendInvoice, printInvoice,
  openModify, toggleModPeople, modStep, modStepBase, updateModCalc,
  showAmendment, sendAmendment, printAmendment, saveModification,
  selectElec, step, stepBase, updateCalc,
  saveNewReservation, renderStats,
};
