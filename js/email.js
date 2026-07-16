// ─────────────────────────────────────────────────────────────
//  email.js  —  EmailJS
// ─────────────────────────────────────────────────────────────

import { emailjsConfig, campingConfig } from './config.js';
import emailjs from 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/+esm';

emailjs.init({ publicKey: emailjsConfig.publicKey });

const fmtDate = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('fr-FR') : '—';

function headerHTML(campingCfg, invNum, today, siren) {
  const sirenLine = siren ? `<br>SIREN ${siren}` : '';
  return `
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
    <div>
      <div style="font-size:20px;font-weight:300;letter-spacing:.12em;text-transform:uppercase;color:#2c2820;font-family:Georgia,serif">${campingCfg.nom}</div>
      <div style="font-size:11px;color:#a09880;margin-top:4px;line-height:1.7">
        ${campingCfg.rue}<br>${campingCfg.cp} ${campingCfg.ville}<br>Tél. ${campingCfg.tel}${sirenLine}
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:#a09880;margin-bottom:3px" id="doc-type-label"></div>
      <div style="font-size:16px;color:#2c2820;font-family:Georgia,serif">${invNum}</div>
      <div style="font-size:11px;color:#a09880;margin-top:2px">${today}</div>
    </div>
  </div>`;
}

function clientHTML(r) {
  return `
  <div style="border-top:1px solid #d0cbbf;border-bottom:1px solid #d0cbbf;padding:12px 0;margin-bottom:16px">
    <div style="font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#a09880;margin-bottom:6px">Client</div>
    <div style="font-size:16px;color:#2c2820;font-family:Georgia,serif">${r.clientName}</div>
    <div style="font-size:12px;color:#7a7060;line-height:1.7">
      ${r.clientEmail  ? r.clientEmail  + '<br>' : ''}
      ${r.clientPhone  ? r.clientPhone  + '<br>' : ''}
      ${r.licensePlate ? 'Immat. ' + r.licensePlate + '<br>' : ''}
      ${r.nationalite  ? 'Nationalité : ' + r.nationalite : ''}
    </div>
  </div>`;
}

const rowStyle = 'padding:7px 0;font-size:13px;color:#7a7060;border-bottom:1px solid #d0cbbf';
const rowR     = 'text-align:right;font-size:12px';

// ── Note de séjour ────────────────────────────────────────────
export function buildInvoiceHTML(r, campingCfg) {
  const { adults, teens, babies, animals, vehicles, nights, electricity, taxeAmt, totalPrice, tarifs } = r;
  const base    = r.baseAdults || 2;
  const nightly = (electricity ? tarifs.baseAvec : tarifs.baseSans)
                + (adults  || 0) * tarifs.adulte
                + (teens   || 0) * tarifs.ado
                + (vehicles|| 0) * tarifs.vehicule;
  const nbTaxe  = base + (adults || 0);
  const invNum  = r.nsNum;
  const today   = new Date().toLocaleDateString('fr-FR');
  const sirenLine = campingCfg.siren ? `<br>SIREN ${campingCfg.siren}` : '';

  let rows = `<tr><td style="${rowStyle}">Forfait emplacement${electricity ? ' — avec électricité' : ''}</td>
    <td style="${rowStyle}${rowR}">${nights}</td><td style="${rowStyle}${rowR}">${electricity?tarifs.baseAvec:tarifs.baseSans}€</td>
    <td style="${rowStyle}${rowR}">${(electricity?tarifs.baseAvec:tarifs.baseSans)*nights}€</td></tr>`;
  if (adults)   rows += `<tr><td style="${rowStyle}">Adultes suppl. (×${adults})</td><td style="${rowStyle}${rowR}">${nights}</td><td style="${rowStyle}${rowR}">${adults*tarifs.adulte}€</td><td style="${rowStyle}${rowR}">${adults*tarifs.adulte*nights}€</td></tr>`;
  if (teens)    rows += `<tr><td style="${rowStyle}">Adolescents (×${teens})</td><td style="${rowStyle}${rowR}">${nights}</td><td style="${rowStyle}${rowR}">${teens*tarifs.ado}€</td><td style="${rowStyle}${rowR}">${teens*tarifs.ado*nights}€</td></tr>`;
  if (babies)   rows += `<tr><td style="${rowStyle}">Enfants &lt;3 ans (×${babies})</td><td style="${rowStyle}${rowR}">${nights}</td><td style="${rowStyle}${rowR}">—</td><td style="${rowStyle}${rowR}">0€</td></tr>`;
  if (animals)  rows += `<tr><td style="${rowStyle}">Animaux (×${animals})</td><td style="${rowStyle}${rowR}">${nights}</td><td style="${rowStyle}${rowR}">—</td><td style="${rowStyle}${rowR}">0€</td></tr>`;
  if (vehicles) rows += `<tr><td style="${rowStyle}">Véhicules suppl. (×${vehicles})</td><td style="${rowStyle}${rowR}">${nights}</td><td style="${rowStyle}${rowR}">${vehicles*tarifs.vehicule}€</td><td style="${rowStyle}${rowR}">${vehicles*tarifs.vehicule*nights}€</td></tr>`;
  rows += `<tr><td style="${rowStyle};color:#a09880;font-style:italic">Taxe de séjour (${nbTaxe} pers.)</td><td style="${rowStyle}${rowR};color:#a09880;font-style:italic">${nights}</td><td style="${rowStyle}${rowR};color:#a09880;font-style:italic">1€</td><td style="${rowStyle}${rowR};color:#a09880;font-style:italic">${taxeAmt}€</td></tr>`;

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#f7f3eb;font-family:Georgia,serif">
<div style="max-width:560px;margin:0 auto;background:#ede9df;border:1px solid #d0cbbf;border-radius:4px;padding:28px">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
    <div>
      <div style="font-size:20px;font-weight:300;letter-spacing:.12em;text-transform:uppercase;color:#2c2820">${campingCfg.nom}</div>
      <div style="font-size:11px;color:#a09880;margin-top:4px;line-height:1.7">${campingCfg.rue}<br>${campingCfg.cp} ${campingCfg.ville}<br>Tél. ${campingCfg.tel}${sirenLine}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:#a09880;margin-bottom:3px">Note de séjour</div>
      <div style="font-size:16px;color:#2c2820">${invNum}</div>
      <div style="font-size:11px;color:#a09880;margin-top:2px">${today}</div>
    </div>
  </div>
  ${clientHTML(r)}
  <div style="margin-bottom:12px;font-size:11px;color:#a09880">
    Séjour du ${fmtDate(r.arrivalDate)} au ${fmtDate(r.departureDate)} · ${nights} nuit${nights>1?'s':''}
    ${electricity ? ` · Prise n°${r.socketId}` : ''}
  </div>
  <table style="width:100%;border-collapse:collapse">
    <thead><tr>
      <th style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#a09880;text-align:left;padding:7px 0;border-bottom:1px solid #bcb7aa;width:46%">Désignation</th>
      <th style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#a09880;text-align:right;padding:7px 0;border-bottom:1px solid #bcb7aa">Nuits</th>
      <th style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#a09880;text-align:right;padding:7px 0;border-bottom:1px solid #bcb7aa">P.U.</th>
      <th style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#a09880;text-align:right;padding:7px 0;border-bottom:1px solid #bcb7aa">Total</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:12px">
    <span style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7a7060">Total TTC</span>
    <span style="font-size:24px;font-weight:300;color:#4a8a5a;font-family:Georgia,serif">${totalPrice}€</span>
  </div>
  <div style="text-align:center;margin-top:18px;padding-top:14px;border-top:1px solid #d0cbbf;font-size:10px;color:#a09880;line-height:1.8">
    Douches & sanitaires inclus · 1 véhicule inclus<br>
    Taxe de séjour collectée pour la commune de Bessines-sur-Gartempe<br>
    Merci de votre séjour au Camping de Sagnat
  </div>
</div></body></html>`;
}

export async function sendInvoiceEmail(r, campingCfg, tarifs) {
  const html = buildInvoiceHTML({ ...r, tarifs }, campingCfg);
  if (r.clientEmail) {
    await emailjs.send(emailjsConfig.serviceId, emailjsConfig.templateId, {
      to_email: r.clientEmail, reply_to: campingCfg.emailCopie,
      subject:  `Note de séjour ${r.nsNum} — Camping de Sagnat`, html_body: html,
    });
  }
  await emailjs.send(emailjsConfig.serviceId, emailjsConfig.templateId, {
    to_email: campingCfg.emailCopie, reply_to: r.clientEmail || campingCfg.emailCopie,
    subject:  `[Copie] Note de séjour ${r.nsNum} — ${r.clientName}`, html_body: html,
  });
}

// ── Avenant de séjour ─────────────────────────────────────────
export function buildAmendmentHTML(r, mod, campingCfg) {
  const sirenLine  = campingCfg.siren ? `<br>SIREN ${campingCfg.siren}` : '';
  const amendNum   = (r.amendments?.length || 0) + 1;
  const docNum     = `${r.nsNum} — Av.${amendNum}`;
  const today      = new Date().toLocaleDateString('fr-FR');
  const deltaAbs   = Math.abs(mod.delta);
  const deltaLabel = mod.delta > 0
    ? `<span style="color:#4a8a5a">+${deltaAbs}€ à encaisser</span>`
    : mod.delta < 0
      ? `<span style="color:#c05a48">−${deltaAbs}€ à rembourser</span>`
      : `<span style="color:#a09880">Aucune différence</span>`;

  const colStyle = 'width:50%;padding:14px 16px;vertical-align:top;background:#f7f3eb;border:1px solid #d0cbbf';

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#f7f3eb;font-family:Georgia,serif">
<div style="max-width:560px;margin:0 auto;background:#ede9df;border:1px solid #d0cbbf;border-radius:4px;padding:28px">

  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
    <div>
      <div style="font-size:20px;font-weight:300;letter-spacing:.12em;text-transform:uppercase;color:#2c2820">${campingCfg.nom}</div>
      <div style="font-size:11px;color:#a09880;margin-top:4px;line-height:1.7">${campingCfg.rue}<br>${campingCfg.cp} ${campingCfg.ville}<br>Tél. ${campingCfg.tel}${sirenLine}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:#a09880;margin-bottom:3px">Avenant de séjour</div>
      <div style="font-size:16px;color:#2c2820">${docNum}</div>
      <div style="font-size:11px;color:#a09880;margin-top:2px">${today}</div>
    </div>
  </div>

  ${clientHTML(r)}

  <!-- Tableau avant / après -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
    <thead>
      <tr>
        <th style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#a09880;text-align:left;padding:7px 8px;border-bottom:1px solid #bcb7aa;width:50%">Séjour initial</th>
        <th style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:#a09880;text-align:left;padding:7px 8px;border-bottom:1px solid #bcb7aa">Séjour modifié</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="${colStyle}">
          <div style="font-size:12px;color:#a09880;margin-bottom:6px">${fmtDate(mod.originalArrival)} → ${fmtDate(mod.originalDeparture)}</div>
          <div style="font-size:14px;color:#2c2820">${mod.originalNights} nuit${mod.originalNights>1?'s':''}</div>
          <div style="font-size:18px;font-weight:300;color:#7a7060;margin-top:4px">${mod.originalTotal}€</div>
        </td>
        <td style="${colStyle}">
          <div style="font-size:12px;color:#a09880;margin-bottom:6px">${fmtDate(mod.newArrival)} → ${fmtDate(mod.newDeparture)}</div>
          <div style="font-size:14px;color:#2c2820">${mod.newNights} nuit${mod.newNights>1?'s':''}</div>
          <div style="font-size:18px;font-weight:300;color:#2c2820;margin-top:4px">${mod.newTotal}€</div>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- Différence -->
  <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:white;border:1px solid #d0cbbf">
    <span style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7a7060">Différence</span>
    <span style="font-size:22px;font-weight:300">${deltaLabel}</span>
  </div>

  <div style="text-align:center;margin-top:18px;padding-top:14px;border-top:1px solid #d0cbbf;font-size:10px;color:#a09880;line-height:1.8">
    Avenant au séjour ${r.nsNum} · ${r.clientName}<br>
    Camping de Sagnat · ${campingCfg.tel}
  </div>
</div></body></html>`;
}

export async function sendAmendmentEmail(r, mod, campingCfg) {
  const amendNum = (r.amendments?.length || 0) + 1;
  const html     = buildAmendmentHTML(r, mod, campingCfg);
  const subject  = `Avenant de séjour ${r.nsNum} Av.${amendNum} — Camping de Sagnat`;
  if (r.clientEmail) {
    await emailjs.send(emailjsConfig.serviceId, emailjsConfig.templateId, {
      to_email: r.clientEmail, reply_to: campingCfg.emailCopie,
      subject, html_body: html,
    });
  }
  await emailjs.send(emailjsConfig.serviceId, emailjsConfig.templateId, {
    to_email: campingCfg.emailCopie, reply_to: r.clientEmail || campingCfg.emailCopie,
    subject:  `[Copie] ${subject}`, html_body: html,
  });
}
