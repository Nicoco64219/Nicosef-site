"use strict";

/**
 * Au Palais de Joie — Nicosef
 * Serveur Express : sert le front statique + une petite API JSON
 * adossée à une base SQLite (voir db.js).
 *
 *   npm install
 *   npm start         → http://localhost:3000
 */

const path = require("path");
const express = require("express");
const { getMenu, createReservation, listReservations, getReservation, updateReservationStatus, saveMessage } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
// Adresse publique du site (pour les liens dans les e-mails). En ligne, réglez
// PUBLIC_URL sur votre adresse, ex. https://palais-de-joie.onrender.com
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;

app.use(express.json());

/* Sert le front (../frontend/index.html, css, js…) */
// Sert les pages : fonctionne que le projet soit à plat (tous les fichiers
// ensemble) ou structuré (dossier frontend/ séparé).
const fs = require("fs");
const FRONTEND_DIR = fs.existsSync(path.join(__dirname, "..", "frontend", "index.html"))
  ? path.join(__dirname, "..", "frontend")
  : fs.existsSync(path.join(__dirname, "frontend", "index.html"))
    ? path.join(__dirname, "frontend")
    : __dirname;
app.use(express.static(FRONTEND_DIR));

/* ------------------------------------------------------------------ */
/* Petits utilitaires de validation                                   */
/* ------------------------------------------------------------------ */
const isEmail = (s) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const nonEmpty = (s) => typeof s === "string" && s.trim().length > 0;

/* ------------------------------------------------------------------ */
/* Notification e-mail des réservations (via FormSubmit, sans SMTP)   */
/* Mettez NOTIFY_EMAIL="" pour désactiver l'envoi d'e-mails.          */
/* ⚠️ La 1re réservation déclenche un e-mail « Activate Form » :       */
/*    cliquez dessus une fois, puis les e-mails arrivent normalement. */
/* ------------------------------------------------------------------ */
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL || "nico64219@gmail.com";

async function notifyByEmail(r, ref) {
  if (!NOTIFY_EMAIL) return;
  // Évite que Gmail masque un e-mail qu'on s'envoie à soi-même
  let dest = NOTIFY_EMAIL;
  if (SENDER_EMAIL && NOTIFY_EMAIL.toLowerCase() === SENDER_EMAIL.toLowerCase())
    dest = SENDER_EMAIL.replace("@", "+resa@");
  const subject = `Nouvelle réservation ${ref} — ${r.name} (${r.guests} pers.)`;
  const text = `Nouvelle demande de réservation :\n\n• Réf : ${ref}\n• Nom : ${r.name}\n• Téléphone : ${r.phone}\n• E-mail : ${r.email}\n• Date : ${r.date}\n• Heure : ${r.time}\n• Couverts : ${r.guests}\n• Note : ${r.notes || "—"}\n\nÀ traiter sur ${PUBLIC_URL}/admin`;
  const ok = await sendEmail(dest, subject, text, r.email);
  if (ok) console.log(`  ✉️  alerte réservation envoyée à ${dest}`);
  else console.warn("  ⚠️  alerte réservation non envoyée (vérifiez BREVO_API_KEY).");
}

/* ------------------------------------------------------------------ */
/* E-mail AU CLIENT (confirmation / refus).                            */
/* Automatique si vous renseignez GMAIL_USER + GMAIL_APP_PASSWORD      */
/* (mot de passe d'application Gmail) ET installez nodemailer.         */
/* Sinon, l'admin enverra l'e-mail prérempli en 1 clic.                */
/* ------------------------------------------------------------------ */
const GMAIL_USER = process.env.GMAIL_USER || "";
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || "";
let mailer = null;
try {
  if (GMAIL_USER && GMAIL_APP_PASSWORD) {
    const nodemailer = require("nodemailer");
    mailer = nodemailer.createTransport({ service: "gmail", auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } });
    console.log("  ✉️  Envoi automatique des e-mails clients activé (Gmail).");
  }
} catch (e) { mailer = null; }

/* ------------------------------------------------------------------ */
/* Envoi d'e-mails. Priorité à Brevo (HTTPS) car le SMTP est souvent   */
/* bloqué sur les hébergeurs gratuits (Render…). Repli : Gmail SMTP.    */
/* Réglez BREVO_API_KEY sur Render (et l'expéditeur via SENDER_EMAIL).  */
/* ------------------------------------------------------------------ */
const BREVO_API_KEY = process.env.BREVO_API_KEY || "";
const SENDER_EMAIL = process.env.SENDER_EMAIL || GMAIL_USER || NOTIFY_EMAIL || "";
const SENDER_NAME = process.env.SENDER_NAME || "Au Palais de Joie";
if (BREVO_API_KEY) console.log("  ✉️  Envoi d'e-mails via Brevo (HTTPS) activé.");

async function sendEmail(to, subject, text, replyTo) {
  if (!to) return false;
  // 1) Brevo (HTTPS) — recommandé, passe partout
  if (BREVO_API_KEY) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": BREVO_API_KEY, "Content-Type": "application/json", "accept": "application/json" },
        body: JSON.stringify({
          sender: { name: SENDER_NAME, email: SENDER_EMAIL },
          to: [{ email: to }],
          replyTo: replyTo ? { email: replyTo } : undefined,
          subject, textContent: text
        }),
        signal: ctrl.signal
      });
      clearTimeout(t);
      if (resp.ok) return true;
      const body = await resp.text().catch(() => "");
      console.warn("  ⚠️  Brevo a répondu", resp.status, body.slice(0, 200));
    } catch (e) { console.warn("  ⚠️  Brevo KO :", e.message); }
  }
  // 2) Gmail SMTP — repli (peut être bloqué sur les offres gratuites)
  if (mailer) {
    try {
      await mailer.sendMail({ from: `${SENDER_NAME} <${SENDER_EMAIL}>`, to, replyTo, subject, text });
      return true;
    } catch (e) { console.warn("  ⚠️  Gmail KO :", e.message); }
  }
  return false;
}

function clientMail(r, status) {
  if (status === "accepted") return {
    subject: "Votre réservation est confirmée ✓ — Au Palais de Joie",
    text: `Bonjour ${r.name},\n\nBonne nouvelle, votre table est confirmée !\n\n• Date : ${r.date}\n• Heure : ${r.time}\n• Couverts : ${r.guests}\n• Réf. : ${r.ref}\n\nNous avons hâte de vous accueillir au 96 rue Balard (Paris 15e).\nÀ très vite,\nAu Palais de Joie — Nicosef · 01 45 54 20 19`
  };
  return {
    subject: "Votre demande de réservation — Au Palais de Joie",
    text: `Bonjour ${r.name},\n\nNous sommes navrés : nous ne pouvons malheureusement pas honorer votre réservation pour le ${r.date} à ${r.time} (${r.guests} couverts).\n\nN'hésitez pas à nous appeler au 01 45 54 20 19 pour trouver ensemble un autre créneau.\n\nAvec toutes nos excuses,\nAu Palais de Joie — Nicosef`
  };
}

async function sendClientMail(r, status) {
  const m = clientMail(r, status);
  return await sendEmail(r.email, m.subject, m.text);
}

/* ------------------------------------------------------------------ */
/* API                                                                */
/* ------------------------------------------------------------------ */

// Carte
app.get("/api/menu", (_req, res) => {
  try {
    res.json(getMenu());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Impossible de charger la carte." });
  }
});

// Création d'une réservation
app.post("/api/reservations", (req, res) => {
  const { name, phone, email, date, time, guests, notes } = req.body || {};

  const errors = [];
  if (!nonEmpty(name)) errors.push("Le nom est requis.");
  if (!nonEmpty(phone)) errors.push("Le téléphone est requis.");
  if (!isEmail(email)) errors.push("L'e-mail n'est pas valide.");
  if (!nonEmpty(date)) errors.push("La date est requise.");
  if (!nonEmpty(time)) errors.push("L'heure est requise.");
  const g = Number(guests);
  if (!Number.isInteger(g) || g < 1 || g > 12) errors.push("Le nombre de couverts doit être entre 1 et 12.");

  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  try {
    const data = {
      name: name.trim(), phone: phone.trim(), email: email.trim(),
      date, time, guests: g, notes: notes ? String(notes).trim() : null,
    };
    const ref = createReservation(data);
    console.log(`✓ Réservation ${ref} — ${name} · ${g} couverts · ${date} ${time}`);
    notifyByEmail(data, ref); // envoi e-mail en arrière-plan (ne bloque pas la réponse)
    res.status(201).json({ ok: true, ref });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Enregistrement impossible, réessayez." });
  }
});

// Message de contact
app.post("/api/contact", (req, res) => {
  const { name, email, body } = req.body || {};
  if (!nonEmpty(name) || !isEmail(email) || !nonEmpty(body))
    return res.status(400).json({ error: "Nom, e-mail valide et message requis." });
  try {
    const id = saveMessage({ name: name.trim(), email: email.trim(), body: body.trim() });
    res.status(201).json({ ok: true, id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Envoi impossible." });
  }
});

/* ------------------------------------------------------------------ */
/* Admin (lecture des réservations)                                   */
/* Protégé par un jeton simple via en-tête  x-admin-token             */
/* ------------------------------------------------------------------ */
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "nico-secret";

/* ------------------------------------------------------------------ */
/* Protection de la page d'admin par identifiant + mot de passe.       */
/* Réglez ADMIN_USER et ADMIN_PASSWORD (sur Render) pour activer.       */
/* Si ADMIN_PASSWORD est vide (par défaut), l'accès reste libre — utile */
/* en local. En ligne, DÉFINISSEZ ADMIN_PASSWORD pour fermer l'accès.   */
/* ------------------------------------------------------------------ */
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
function adminAuth(req, res, next) {
  if (!ADMIN_PASSWORD) return next(); // pas de mot de passe défini → accès libre
  const h = req.get("authorization") || "";
  const [type, creds] = h.split(" ");
  if (type === "Basic" && creds) {
    const [u, p] = Buffer.from(creds, "base64").toString().split(":");
    if (u === ADMIN_USER && p === ADMIN_PASSWORD) return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="Admin"');
  return res.status(401).send("Acces reserve au restaurant.");
}

app.get("/api/admin/reservations", adminAuth, (req, res) => {
  if (req.get("x-admin-token") !== ADMIN_TOKEN)
    return res.status(401).json({ error: "Accès refusé." });
  res.json(listReservations());
});

// Accepter / refuser une réservation → met à jour le statut + e-mail au client
app.post("/api/admin/reservations/status", adminAuth, async (req, res) => {
  if (req.get("x-admin-token") !== ADMIN_TOKEN)
    return res.status(401).json({ error: "Accès refusé." });
  const { ref, status } = req.body || {};
  if (!ref || !["accepted", "refused"].includes(status))
    return res.status(400).json({ error: "Paramètres invalides." });
  const r = getReservation(ref);
  if (!r) return res.status(404).json({ error: "Réservation introuvable." });

  updateReservationStatus(ref, status);
  const emailed = await sendClientMail(r, status);          // auto si Gmail configuré
  const m = clientMail(r, status);
  const mailto = `mailto:${r.email}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.text)}`;
  console.log(`  • ${ref} → ${status}${emailed ? " (client prévenu par e-mail)" : ""}`);
  res.json({ ok: true, status, emailed, mailto });
});

/* Page d'admin : voir les réservations, accepter / refuser, prévenir le client */
app.get("/admin", adminAuth, (_req, res) => {
  const rows = listReservations();
  const norm = (s) => s === "accepted" ? "accepted" : s === "refused" ? "refused" : "pending";
  const badge = (s) => s === "accepted" ? '<span class="badge ok">Acceptée</span>'
    : s === "refused" ? '<span class="badge no">Refusée</span>'
    : '<span class="badge wait">En attente</span>';
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Réservations — Palais de Joie</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#f6efe2;color:#19110f;margin:0;padding:32px}
    h1{font-size:1.4rem;margin:0 0 6px}p.sub{color:#3b302c;margin:0 0 18px}
    .filters{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:0 0 14px}
    .fgroup{display:flex;gap:6px;flex-wrap:wrap}
    .pill{background:#fff;border:1.5px solid #e4d8c4;border-radius:999px;padding:6px 12px;font:inherit;font-size:.75rem;font-weight:600;color:#3b302c;cursor:pointer}
    .pill.active{background:#19110f;color:#f6efe2;border-color:#19110f}
    .search{flex:1;min-width:200px;padding:8px 14px;border:1.5px solid #e4d8c4;border-radius:999px;font:inherit;font-size:.82rem;background:#fff}
    .count{font-size:.76rem;color:#7a6a4e;margin:0 0 10px}
    table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 10px 30px -18px rgba(0,0,0,.3)}
    th,td{padding:11px 14px;text-align:left;font-size:.86rem;border-bottom:1px solid #eee;vertical-align:middle}
    th{background:#19110f;color:#f6efe2;font-size:.68rem;letter-spacing:.1em;text-transform:uppercase}
    tr:last-child td{border-bottom:none}
    tr.today td{background:#fff7e8}
    tr.hide{display:none}
    .ref{font-family:ui-monospace,monospace;color:#b21f29;font-weight:700}
    .empty{padding:40px;text-align:center;color:#3b302c}
    .badge{display:inline-block;padding:3px 9px;border-radius:999px;font-size:.68rem;font-weight:700;letter-spacing:.02em;white-space:nowrap}
    .badge.ok{background:#dcefe6;color:#2f6b57}.badge.no{background:#f6dcdc;color:#b21f29}.badge.wait{background:#efe5d3;color:#7a6a4e}
    .act{display:flex;gap:6px}
    button.acc,button.ref-btn{font:inherit;font-size:.78rem;font-weight:600;border:none;border-radius:8px;padding:7px 11px;cursor:pointer;color:#fff}
    .acc{background:#2f6b57}.ref-btn{background:#b21f29}
    button:disabled{opacity:.4;cursor:default}
    .hint{font-size:.78rem;color:#7a6a4e;margin-top:16px}
  </style></head><body>
  <h1>Réservations · Au Palais de Joie</h1>
  <p class="sub">${rows.length} demande(s) au total. Cliquez sur Accepter ou Refuser : le client reçoit un e-mail.</p>
  ${rows.length ? `<div class="filters">
    <div class="fgroup" id="fStatus">
      <button class="pill active" data-v="all">Toutes</button>
      <button class="pill" data-v="pending">En attente</button>
      <button class="pill" data-v="accepted">Acceptées</button>
      <button class="pill" data-v="refused">Refusées</button>
    </div>
    <div class="fgroup" id="fDate">
      <button class="pill active" data-v="all">Toutes dates</button>
      <button class="pill" data-v="today">Aujourd'hui</button>
      <button class="pill" data-v="upcoming">À venir</button>
      <button class="pill" data-v="past">Passées</button>
    </div>
    <input class="search" id="fSearch" type="search" placeholder="Rechercher nom, téléphone, réf…">
  </div>
  <p class="count" id="count"></p>
  <table><thead><tr>
    <th>Réf</th><th>Statut</th><th>Date</th><th>Heure</th><th>Couv.</th><th>Nom</th><th>Téléphone</th><th>E-mail</th><th>Note</th><th>Décision</th>
  </tr></thead><tbody>
  ${rows.map(r => `<tr data-ref="${r.ref}" data-status="${norm(r.status)}" data-date="${r.date}">
    <td class="ref">${r.ref}</td>
    <td class="st">${badge(r.status)}</td>
    <td>${r.date}</td><td>${r.time}</td><td>${r.guests}</td>
    <td>${esc(r.name)}</td><td>${esc(r.phone)}</td><td>${esc(r.email)}</td><td>${esc(r.notes || "")}</td>
    <td><div class="act">
      <button class="acc" onclick="decide('${r.ref}','accepted',this)">Accepter</button>
      <button class="ref-btn" onclick="decide('${r.ref}','refused',this)">Refuser</button>
    </div></td>
  </tr>`).join("")}
  </tbody></table>` : `<div class="empty">Aucune réservation pour le moment.</div>`}
  <p class="hint">Astuce : si l'envoi automatique n'est pas configuré, un e-mail prérempli s'ouvre — il ne reste qu'à l'envoyer.</p>
  <script>
    const TOKEN = ${JSON.stringify(ADMIN_TOKEN)};
    const today = new Date().toLocaleDateString("en-CA"); // AAAA-MM-JJ (heure locale)
    let fStatus = "all", fDate = "all", fSearch = "";
    function applyFilters(){
      let shown = 0;
      document.querySelectorAll("tbody tr").forEach(tr => {
        const st = tr.dataset.status, d = tr.dataset.date;
        const txt = (tr.textContent || "").toLowerCase();
        let ok = true;
        if (fStatus !== "all" && st !== fStatus) ok = false;
        if (fDate === "today" && d !== today) ok = false;
        if (fDate === "upcoming" && !(d >= today)) ok = false;
        if (fDate === "past" && !(d < today)) ok = false;
        if (fSearch && !txt.includes(fSearch)) ok = false;
        tr.classList.toggle("hide", !ok);
        tr.classList.toggle("today", d === today);
        if (ok) shown++;
      });
      const c = document.getElementById("count");
      if (c) c.textContent = shown + " réservation(s) affichée(s)";
    }
    function wire(groupId, set){
      document.querySelectorAll("#" + groupId + " .pill").forEach(b => b.addEventListener("click", () => {
        document.querySelectorAll("#" + groupId + " .pill").forEach(x => x.classList.remove("active"));
        b.classList.add("active"); set(b.dataset.v); applyFilters();
      }));
    }
    if (document.getElementById("fStatus")) {
      wire("fStatus", v => fStatus = v);
      wire("fDate", v => fDate = v);
      document.getElementById("fSearch").addEventListener("input", e => { fSearch = e.target.value.toLowerCase().trim(); applyFilters(); });
      applyFilters();
    }
    async function decide(ref, status, btn){
      const row = btn.closest("tr");
      row.querySelectorAll("button").forEach(b=>b.disabled=true);
      try{
        const r = await fetch("/api/admin/reservations/status", {
          method:"POST", headers:{"Content-Type":"application/json","x-admin-token":TOKEN},
          body: JSON.stringify({ ref, status })
        });
        const d = await r.json();
        if(!r.ok) throw new Error(d.error||"Erreur");
        row.querySelector(".st").innerHTML = status==="accepted"
          ? '<span class="badge ok">Acceptée</span>' : '<span class="badge no">Refusée</span>';
        row.dataset.status = status;
        if(!d.emailed && d.mailto){ window.location.href = d.mailto; } // e-mail prérempli à envoyer
        applyFilters();
      }catch(e){
        alert("Échec : "+e.message);
        row.querySelectorAll("button").forEach(b=>b.disabled=false);
      }
    }
  </script>
  </body></html>`;
  res.send(html);
});

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ------------------------------------------------------------------ */
app.listen(PORT, () => {
  console.log(`\n🥢  Au Palais de Joie — serveur prêt`);
  console.log(`    Site   : http://localhost:${PORT}`);
  console.log(`    Admin  : http://localhost:${PORT}/admin\n`);
});
