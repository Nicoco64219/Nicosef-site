"use strict";

/**
 * Couche base de données — SQLite intégré à Node (module node:sqlite).
 * Aucune dépendance à installer, aucune compilation. Node.js >= 22.5
 * La carte complète est définie dans menu-data.json (source unique).
 */

const path = require("path");
const fs = require("fs");

/* Charge la carte depuis menu-data.json (ou menu-data.js si l'extension a été
   changée par erreur). Le contenu doit être du JSON dans les deux cas. */
let MENU;
(function () {
  const candidates = ["menu-data.json", "menu-data.js"];
  for (const f of candidates) {
    const fp = path.join(__dirname, f);
    if (fs.existsSync(fp)) {
      try { MENU = JSON.parse(fs.readFileSync(fp, "utf8")); return; }
      catch (e) { try { MENU = require(fp); return; } catch (_) {} }
    }
  }
  console.error("\n\u2717 Carte introuvable : placez 'menu-data.json' dans le dossier backend");
  console.error("  (à côté de db.js). Si votre fichier s'appelle 'menu-data.js', renommez-le en");
  console.error("  'menu-data.json' — ou laissez-le, cette version sait lire les deux.\n");
  process.exit(1);
})();

let DatabaseSync;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch (e) {
  console.error("\n\u2717 Node ne fournit pas le module SQLite intégré. Installez Node.js 22.5+ (https://nodejs.org).\n");
  process.exit(1);
}

const db = new DatabaseSync(path.join(__dirname, "nicosef.db"));
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

/* ------------------------------------------------------------------ */
/* Migration : si le schéma de la carte a changé, on reconstruit les   */
/* tables de la carte. Les réservations et messages sont CONSERVÉS.    */
/* ------------------------------------------------------------------ */
const SCHEMA_VERSION = "2";
db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);");
const _v = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
if (!_v || _v.value !== SCHEMA_VERSION) {
  db.exec("DROP TABLE IF EXISTS menu_items;");
  db.exec("DROP TABLE IF EXISTS menu_categories;");
  db.exec("DROP TABLE IF EXISTS formules;");
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)").run(SCHEMA_VERSION);
  if (_v) console.log("→ Mise à jour de la carte (nouveau format détecté).");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS menu_categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    group_name TEXT NOT NULL DEFAULT '',
    name       TEXT NOT NULL,
    note       TEXT,
    cols       INTEGER NOT NULL DEFAULT 0,
    position   INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS menu_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id  INTEGER NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
    code         TEXT NOT NULL DEFAULT '',
    name         TEXT NOT NULL,
    description  TEXT,
    price        TEXT NOT NULL,
    price2       TEXT,
    tag          TEXT,
    heat         INTEGER NOT NULL DEFAULT 0,
    veg          INTEGER NOT NULL DEFAULT 0,
    position     INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS formules (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,
    price     TEXT NOT NULL,
    featured  INTEGER NOT NULL DEFAULT 0,
    position  INTEGER NOT NULL DEFAULT 0,
    sections  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL,
    date TEXT NOT NULL, time TEXT NOT NULL, guests INTEGER NOT NULL,
    notes TEXT, status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
    email TEXT NOT NULL, body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

/* ------------------------------- Seed -------------------------------- */
if (db.prepare("SELECT COUNT(*) AS n FROM menu_categories").get().n === 0) {
  const insCat = db.prepare("INSERT INTO menu_categories (group_name, name, note, cols, position) VALUES (?, ?, ?, ?, ?)");
  const insItem = db.prepare(
    "INSERT INTO menu_items (category_id, code, name, description, price, price2, tag, heat, veg, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  );
  db.exec("BEGIN");
  try {
    MENU.carte.forEach((cat, ci) => {
      const catId = insCat.run(cat.group || "", cat.category, cat.note || null, cat.cols ? 1 : 0, ci).lastInsertRowid;
      cat.items.forEach((it, ii) =>
        insItem.run(catId, it.code || "", it.name, it.desc || null, it.price, it.price2 || null, it.tag || null, it.heat || 0, it.veg ? 1 : 0, ii)
      );
    });
    db.exec("COMMIT");
    console.log("→ Carte complète initialisée (" + MENU.carte.length + " sections).");
  } catch (err) { db.exec("ROLLBACK"); throw err; }
}

if (db.prepare("SELECT COUNT(*) AS n FROM formules").get().n === 0) {
  const insF = db.prepare("INSERT INTO formules (name, price, featured, position, sections) VALUES (?, ?, ?, ?, ?)");
  db.exec("BEGIN");
  try {
    MENU.formules.forEach((f, i) => insF.run(f.name, f.price, f.featured ? 1 : 0, i, JSON.stringify(f.sections)));
    db.exec("COMMIT");
    console.log("→ Formules (" + MENU.formules.length + " menus) initialisées.");
  } catch (err) { db.exec("ROLLBACK"); throw err; }
}

/* ----------------------------- Requêtes ------------------------------ */
function getCarte() {
  const cats = db.prepare("SELECT * FROM menu_categories ORDER BY position, id").all();
  const itemStmt = db.prepare(
    "SELECT code, name, description AS desc, price, price2, tag, heat, veg FROM menu_items WHERE category_id = ? ORDER BY position, id"
  );
  return cats.map((c) => ({
    group: c.group_name || c.name,
    category: c.name,
    ...(c.note ? { note: c.note } : {}),
    ...(c.cols ? { cols: true } : {}),
    items: itemStmt.all(c.id).map((it) => ({
      ...(it.code ? { code: it.code } : { code: "" }),
      name: it.name,
      ...(it.desc ? { desc: it.desc } : {}),
      price: it.price,
      ...(it.price2 ? { price2: it.price2 } : {}),
      ...(it.tag ? { tag: it.tag } : {}),
      ...(it.heat ? { heat: it.heat } : {}),
      ...(it.veg ? { veg: true } : {}),
    })),
  }));
}

function getFormules() {
  return db.prepare("SELECT * FROM formules ORDER BY position, id").all().map((f) => ({
    name: f.name, price: f.price, featured: !!f.featured, sections: JSON.parse(f.sections),
  }));
}

function getMenu() { return { formules: getFormules(), carte: getCarte() }; }

function makeRef() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `PJ-${stamp}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
function createReservation(r) {
  const ref = makeRef();
  db.prepare(`INSERT INTO reservations (ref, name, phone, email, date, time, guests, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(ref, r.name, r.phone, r.email, r.date, r.time, r.guests, r.notes || null);
  return ref;
}
function listReservations() { return db.prepare("SELECT * FROM reservations ORDER BY date, time, id").all(); }
function getReservation(ref) { return db.prepare("SELECT * FROM reservations WHERE ref = ?").get(ref); }
function updateReservationStatus(ref, status) {
  return db.prepare("UPDATE reservations SET status = ? WHERE ref = ?").run(status, ref).changes > 0;
}
function saveMessage(m) { return db.prepare("INSERT INTO messages (name, email, body) VALUES (?, ?, ?)").run(m.name, m.email, m.body).lastInsertRowid; }

module.exports = { db, getMenu, getCarte, getFormules, createReservation, listReservations, getReservation, updateReservationStatus, saveMessage };