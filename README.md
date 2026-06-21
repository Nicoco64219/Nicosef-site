# Au Palais de Joie — Nicosef · Site complet

Site officiel du restaurant **Au Palais de Joie (Nicosef)** — 96 rue Balard, 75015 Paris.
Cuisine chinoise, thaï & vietnamienne.

Stack volontairement légère et **sans aucune compilation native** :

- **Front** : HTML / CSS / JS purs, responsive, moderne (`frontend/index.html`)
- **Back** : API Express (`backend/server.js`)
- **Base de données** : SQLite **intégré à Node** (`node:sqlite`) — aucun paquet natif à compiler

---

## Lancer le site

> Prérequis : **Node.js ≥ 22.5** (le module SQLite intégré est requis). Vérifiez avec `node --version`.

```bash
cd backend
npm install      # installe Express uniquement
npm start
```

Puis ouvrez **http://localhost:3000**

Au premier démarrage, la base `backend/nicosef.db` est créée et la carte est pré-remplie automatiquement.

---

## Ce qui marche, pour de vrai

- **Carte** servie depuis la base (`GET /api/menu`), affichée avec filtres par catégorie.
- **Réservation en ligne** : le formulaire enregistre la demande en base et renvoie une référence (ex. `PJ-20260615-V9ME`). Validation côté serveur.
- **Contact** : `POST /api/contact` enregistre les messages.
- **Espace réservations** : http://localhost:3000/admin pour voir toutes les demandes.

> Le `frontend/index.html` fonctionne **aussi seul**, sans backend (il bascule sur des données locales et confirme la réservation en mode démo). Pratique pour un simple aperçu : ouvrez le fichier dans un navigateur.

---

## API

| Méthode | Route                        | Rôle                                   |
|---------|------------------------------|----------------------------------------|
| GET     | `/api/menu`                  | La carte (catégories + plats)          |
| POST    | `/api/reservations`          | Crée une réservation → `{ ref }`       |
| POST    | `/api/contact`               | Enregistre un message                  |
| GET     | `/api/admin/reservations`    | Liste (en-tête `x-admin-token` requis) |
| GET     | `/admin`                     | Page HTML de suivi des réservations    |

**Exemple — créer une réservation :**

```bash
curl -X POST http://localhost:3000/api/reservations \
  -H "Content-Type: application/json" \
  -d '{"name":"Dupont","phone":"0612345678","email":"d@ex.fr","date":"2026-06-20","time":"20:00","guests":4,"notes":"Terrasse"}'
```

---

## Structure

```
nicosef-site/
├── frontend/
│   └── index.html      # tout le front (HTML + CSS + JS), responsive
├── backend/
│   ├── server.js       # serveur Express + routes API + page /admin
│   ├── db.js           # schéma SQLite + seed de la carte + requêtes
│   ├── package.json
│   └── nicosef.db      # base SQLite (créée au 1er lancement)
└── README.md
```

---

## Recevoir les réservations

Le formulaire fonctionne de **3 façons** (dans cet ordre) :

1. **Avec le serveur Node** (`npm start`, site sur `localhost:3000`) : la réservation est
   enregistrée dans la base et visible sur **`/admin`**. Rien à configurer.
2. **Sur un hébergement simple, sans serveur** : ouvrez `frontend/index.html`, trouvez le bloc
   `const RESTO = {…}` (vers le haut du `<script>`) et le champ `formEndpoint` est déjà branché sur **FormSubmit** (service gratuit, sans compte)
   avec l'adresse **nico64219@gmail.com**. À la **1re** réservation, un e-mail « Activate Form »
   arrive sur cette boîte : cliquez pour **activer** (une seule fois). Ensuite chaque réservation
   arrive **directement dans la boîte mail**.
3. **Repli** : si vous renseignez `email` au lieu de Formspree, le formulaire ouvre un
   **e-mail prérempli** chez le visiteur. Et dans tous les cas, le **numéro de téléphone**
   reste proposé pour confirmer.

Tant que ni le serveur ni `formEndpoint`/`email` ne sont configurés, le formulaire invite
simplement à appeler — c'est voulu, pour ne jamais « perdre » une demande.

## Commander en ligne

Le lien **Uber Eats** du restaurant est présent dans le hero, la section « Nous trouver » et le
pied de page. Pour le changer, cherchez `ubereats.com` dans `frontend/index.html`.

## Modifier la carte

Toute la carte (les 4 menus **et** les plats à la carte) vit dans un seul fichier :
**`backend/menu-data.json`**. Pour changer un prix, un plat, ajouter/retirer une ligne :
modifiez ce fichier, supprimez `backend/nicosef.db`, puis relancez `npm start` (la base se recharge).

Champs utiles par plat : `code`, `name`, `price`, `desc` (facultatif), `heat` (1 ou 2 piments),
`veg` (true = végétarien), `price2` (2ᵉ prix, pour les vins). Les onglets de la carte sont définis
par le champ `group` de chaque catégorie.

## Personnaliser

- **La carte** : modifiez le tableau `SEED` dans `backend/db.js`, supprimez `backend/nicosef.db`, relancez.
- **Le jeton admin** : variable d'environnement `ADMIN_TOKEN` (défaut `nico-secret`). Ex. `ADMIN_TOKEN=monsecret npm start`.
- **Le port** : variable `PORT` (défaut `3000`).
- **Textes, couleurs, sections** : tout est dans `frontend/index.html` (palette dans `:root` en haut du `<style>`).

---

### Notes

- Infos (adresse, téléphone, horaires, plats, prix) collectées sur des sources publiques en ligne ; **à vérifier et ajuster** avec le restaurant avant mise en ligne réelle.
- Pour une mise en production : ajoutez l'envoi d'e-mails de confirmation, une vraie authentification admin, et un nom de domaine + HTTPS (par ex. derrière un reverse-proxy).


## Accepter / refuser une réservation (page /admin)

Sur **http://localhost:3000/admin**, chaque réservation a un statut (« En attente ») et deux
boutons **Accepter** / **Refuser**. À votre clic :

- le statut est mis à jour dans la base,
- **le client reçoit un e-mail** (« réservation confirmée » ou « impossible cette fois »).

**Deux modes pour l'e-mail au client :**
- **Automatique (recommandé)** : installez l'outil d'envoi puis renseignez vos identifiants Gmail.
  1. `npm install nodemailer` (dans le dossier backend)
  2. créez un **mot de passe d'application** Gmail (Compte Google → Sécurité → Validation en 2 étapes → Mots de passe des applications)
  3. lancez le serveur avec ces variables, ex. sous Windows PowerShell :
     `$env:GMAIL_USER="nico64219@gmail.com"; $env:GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"; npm start`
  → l'e-mail part tout seul à chaque décision.
- **Sans rien configurer** : au clic, un **e-mail prérempli** s'ouvre dans votre messagerie — il
  ne reste qu'à cliquer sur « Envoyer ». Aucune installation requise.

Le message vu par le client après sa demande est désormais : « Demande bien reçue, vous recevrez
un e-mail de confirmation dès validation ».


## Site multilingue (FR / EN / 中文 / ES / DE / AR)

Un sélecteur de langue est en haut à droite (à côté du thème clair/sombre). Toute l'interface
(navigation, accueil, sections, formulaire, pied de page) est traduite en **6 langues**, avec
passage automatique en **lecture droite-à-gauche pour l'arabe**. Le choix est mémorisé sur
l'appareil du visiteur.

Pour l'instant, **les noms des plats restent en français** (les traduire tous dans 5 langues est
un gros chantier à part). On pourra les traduire ensuite, langue par langue.

Ajouter / corriger une traduction : cherchez `const I18N =` dans `frontend/index.html`.
