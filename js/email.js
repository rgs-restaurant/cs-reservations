// ─────────────────────────────────────────────────────────────
//  email.js  —  Envoi via EmailJS (200 emails/mois gratuit)
//
//  Template EmailJS à créer :
//    Subject : {{subject}}
//    Body    : {{{html_body}}}   ← triple accolades = HTML non échappé
//    To      : {{to_email}}
//    Reply-to: {{reply_to}}
// ─────────────────────────────────────────────────────────────

import { emailjsConfig, campingConfig } from './config.js';
import emailjs from 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/+esm';

emailjs.init({ publicKey: emailjsConfig.publicKey });

// ── Génère le HTML de la note de séjour ──────────────────────
export function buildInvoiceHTML(r, campingCfg) {
  const {
    nsNum, clientName, clientEmail, clientPhone, licensePlate,
    arrivalDate, departureDate, nights, electricity, socketId,
    adults, teens, babies, animals, vehicles, totalPrice, taxeAmt,
    tarifs,
  } = r;

  const fmtDate = s => s ? new Date(s + 'T00:00:00').toLocaleDateString('fr-FR') : '—';
  const nightly = (electricity ? tarifs.baseAvec : tarifs.baseSans)
                + (adults  || 0) * tarifs.adulte
                + (teens   || 0) * tarifs.ado
                + (vehicles|| 0) * tarifs.vehicule;
  const hebergement = nightly * nights;
  const nbTaxe = (r.baseAdults || 2) + (adults || 0) + (teens || 0);
  const sirenLine = campingCfg.siren ? `<br>SIREN ${campingCfg.siren}` : '';

  let rows = `
    <tr><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;font-size:13px;color:#7a7060">
      Forfait emplacement${electricity ? ' — avec électricité'}
    </td><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;text-align:right;font-size:13px;color:#7a7060">${nights}</td>
    <td style="padding:7px 0;border-bottom:1px solid #d0cbbf;text-align:right;font-size:13px;color:#7a7060">${electricity ? tarifs.baseAvec : tarifs.baseSans}€</td>
    <td style="padding:7px 0;border-bottom:1px solid #d0cbbf;text-align:right;font-size:13px;color:#7a7060">${(electricity ? tarifs.baseAvec : tarifs.baseSans) * nights}€</td></tr>`;
  if (adults)   rows += `<tr><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;font-size:13px;color:#7a7060">Adultes supplémentaires (×${adults})</td><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;text-align:right;font-size:13px;color:#7a7060">${nights}</td><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;text-align:right;font-size:13px;color:#7a7060">${adults*tarifs.adulte}€</td><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;text-align:right;font-size:13px;color:#7a7060">${adults*tarifs.adulte*nights}€</td></tr>`;
  if (teens)    rows += `<tr><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;font-size:13px;color:#7a7060">Adolescents (×${teens})</td><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;text-align:right;font-size:13px;color:#7a7060">${nights}</td><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;text-align:right;font-size:13px;color:#7a7060">${teens*tarifs.ado}€</td><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;text-align:right;font-size:13px;color:#7a7060">${teens*tarifs.ado*nights}€</td></tr>`;
  if (babies)   rows += `<tr><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;font-size:13px;color:#7a7060">Enfants &lt;3 ans (×${babies})</td><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;text-align:right;font-size:13px;color:#7a7060">${nights}</td><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;text-align:right;font-size:13px;color:#7a7060">—</td><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;text-align:right;font-size:13px;color:#7a7060">0€</td></tr>`;
  if (animals)  rows += `<tr><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;font-size:13px;color:#7a7060">Animaux (×${animals})</td><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;text-align:right;font-size:13px;color:#7a7060">${nights}</td><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;text-align:right;font-size:13px;color:#7a7060">—</td><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;text-align:right;font-size:13px;color:#7a7060">0€</td></tr>`;
  if (vehicles) rows += `<tr><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;font-size:13px;color:#7a7060">Véhicules supplémentaires (×${vehicles})</td><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;text-align:right;font-size:13px;color:#7a7060">${nights}</td><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;text-align:right;font-size:13px;color:#7a7060">${vehicles*tarifs.vehicule}€</td><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;text-align:right;font-size:13px;color:#7a7060">${vehicles*tarifs.vehicule*nights}€</td></tr>`;
  rows += `<tr><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;font-size:13px;color:#a09880;font-style:italic">Taxe de séjour — ${nbTaxe} pers.</td><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;text-align:right;font-size:13px;color:#a09880;font-style:italic">${nights}</td><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;text-align:right;font-size:13px;color:#a09880;font-style:italic">1€</td><td style="padding:7px 0;border-bottom:1px solid #d0cbbf;text-align:right;font-size:13px;color:#a09880;font-style:italic">${taxeAmt}€</td></tr>`;

  return `
<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#f7f3eb;font-family:Georgia,serif">
<div style="max-width:560px;margin:0 auto;background:#ede9df;border:1px solid #d0cbbf;border-radius:4px;padding:28px">

  <!-- En-tête -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
    <div>
      <div style="font-size:20px;font-weight:300;letter-spacing:0.12em;text-transform:uppercase;color:#2c2820">${campingCfg.nom}</div>
      <div style="font-size:11px;color:#a09880;margin-top:4px;line-height:1.7">
        ${campingCfg.rue}<br>${campingCfg.cp} ${campingCfg.ville}<br>Tél. ${campingCfg.tel}${sirenLine}
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#a09880;margin-bottom:3px">Note de séjour</div>
      <div style="font-size:16px;color:#2c2820">${nsNum}</div>
      <div style="font-size:11px;color:#a09880;margin-top:2px">${new Date().toLocaleDateString('fr-FR')}</div>
    </div>
  </div>

  <!-- Client -->
  <div style="border-top:1px solid #d0cbbf;border-bottom:1px solid #d0cbbf;padding:12px 0;margin-bottom:18px">
    <div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:#a09880;margin-bottom:6px">Client</div>
    <div style="font-size:16px;color:#2c2820">${clientName}</div>
    <div style="font-size:12px;color:#7a7060;line-height:1.7">
      ${clientEmail ? clientEmail + '<br>' : ''}
      ${clientPhone ? clientPhone + '<br>' : ''}
      ${licensePlate ? 'Immat. ' + licensePlate : ''}
    </div>
  </div>

  <!-- Infos séjour -->
  <div style="font-size:11px;color:#a09880;margin-bottom:14px">
    Séjour du ${fmtDate(arrivalDate)} au ${fmtDate(departureDate)} · ${nights} nuit${nights > 1 ? 's' : ''}
  </div>

  <!-- Tableau -->
  <table style="width:100%;border-collapse:collapse">
    <thead>
      <tr>
        <th style="font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:#a09880;text-align:left;padding:7px 0;border-bottom:1px solid #bcb7aa;width:46%">Désignation</th>
        <th style="font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:#a09880;text-align:right;padding:7px 0;border-bottom:1px solid #bcb7aa">Nuits</th>
        <th style="font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:#a09880;text-align:right;padding:7px 0;border-bottom:1px solid #bcb7aa">P.U.</th>
        <th style="font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:#a09880;text-align:right;padding:7px 0;border-bottom:1px solid #bcb7aa">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <!-- Total -->
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:12px">
    <span style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#7a7060">Total TTC</span>
    <span style="font-size:24px;font-weight:300;color:#4a8a5a">${totalPrice}€</span>
  </div>

  <!-- Pied de page -->
  <div style="text-align:center;margin-top:20px;padding-top:16px;border-top:1px solid #d0cbbf;font-size:10px;color:#a09880;line-height:1.8;letter-spacing:0.05em">
    Douches &amp; sanitaires inclus · 1 véhicule inclus<br>
    Taxe de séjour collectée pour la commune de Bessines-sur-Gartempe<br>
    Merci de votre séjour au Camping de Sagnat
  </div>

</div>
</body></html>`;
}

// ── Envoie la note au client + copie au camping ───────────────
export async function sendInvoiceEmail(r, campingCfg, tarifs) {
  const html = buildInvoiceHTML({ ...r, tarifs }, campingCfg);

  // 1. Email au client (si email renseigné)
  if (r.clientEmail) {
    await emailjs.send(emailjsConfig.serviceId, emailjsConfig.templateId, {
      to_email:  r.clientEmail,
      reply_to:  campingCfg.emailCopie,
      subject:   `Note de séjour ${r.nsNum} — Camping de Sagnat`,
      html_body: html,
    });
  }

  // 2. Copie au camping (archive des 10 ans)
  await emailjs.send(emailjsConfig.serviceId, emailjsConfig.templateId, {
    to_email:  campingCfg.emailCopie,
    reply_to:  r.clientEmail || campingCfg.emailCopie,
    subject:   `[Copie] Note de séjour ${r.nsNum} — ${r.clientName}`,
    html_body: html,
  });
}
