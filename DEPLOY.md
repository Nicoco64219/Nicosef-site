# Mettre le site en ligne sur Render (gratuit)

Render fait tourner le serveur Node : tu gardes **tout** (le site, la page `/admin`
Accepter/Refuser et les e-mails). Tu obtiens une adresse gratuite en `…onrender.com`.

Il faut deux comptes gratuits : **GitHub** (pour déposer le code) et **Render** (pour l'héberger).

---

## Étape 1 — Déposer le code sur GitHub (sans ligne de commande)

1. Crée un compte sur **github.com**.
2. Bouton **New** (nouveau dépôt). Nom : `nicosef-site`. Laisse **Public**. Clique **Create repository**.
3. Sur la page du dépôt vide, clique le lien **« uploading an existing file »**.
4. Glisse-dépose **uniquement** ces éléments :
   - le dossier **`frontend`** (avec `index.html`),
   - les fichiers de **`backend`** : `server.js`, `db.js`, `menu-data.js` (ou `.json`),
     `package.json`, `package-lock.json`,
   - `README.md`, `DEPLOY.md`, `.gitignore`.
   
   ⚠️ **N'envoie PAS** : le dossier `node_modules`, ni les fichiers `nicosef.db`,
   `nicosef.db-shm`, `nicosef.db-wal`. (Render installe et recrée tout ça tout seul.)
   
   👉 Astuce : pour garder la structure, mets les fichiers backend dans un dossier `backend`
   lors de l'upload (tape `backend/` au début du nom si besoin), et le dossier `frontend` tel quel.
5. Clique **Commit changes**.

## Étape 2 — Déployer sur Render

1. Crée un compte sur **render.com** (le plus simple : « Sign in with GitHub »).
2. **New +** → **Web Service**.
3. Choisis ton dépôt `nicosef-site`.
4. Réglages :
   - **Name** : `palais-de-joie` → ton adresse sera `palais-de-joie.onrender.com`
   - **Root Directory** : `backend`
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : **Free**
5. Clique **Advanced** et ajoute ces variables d'environnement (pour les e-mails) :
   | Clé | Valeur |
   |-----|--------|
   | `GMAIL_USER` | `nico64219@gmail.com` |
   | `GMAIL_APP_PASSWORD` | ton mot de passe d'application Gmail (16 caractères) |
   | `NOTIFY_EMAIL` | `nico64219@gmail.com` |
   | `ADMIN_TOKEN` | un mot de passe à toi (protège `/admin`) |
   | `PUBLIC_URL` | `https://palais-de-joie.onrender.com` (ton adresse une fois connue) |
6. Clique **Create Web Service**. Patiente 2–4 minutes.
7. C'est en ligne ! Ton site : `https://palais-de-joie.onrender.com` — la gestion des
   réservations : `https://palais-de-joie.onrender.com/admin`.

---

## À savoir avec l'offre gratuite

- **Mise en veille** : après ~15 min sans visiteur, le site « s'endort ». La 1re visite
  suivante met ~30–60 s à se charger, puis tout est rapide. L'offre payante (~7 $/mois)
  supprime cette attente si besoin plus tard.
- **Historique des réservations** : la base peut se réinitialiser à chaque mise à jour du
  site. Ce n'est pas grave : **chaque réservation t'arrive aussi par e-mail**, donc rien
  d'important n'est perdu. Pour un historique permanent, on ajoutera un disque (payant) ou
  une base hébergée plus tard.

## Mettre à jour le site plus tard

Re-dépose simplement le fichier modifié sur GitHub (bouton **Add file → Upload files**) :
Render redéploie automatiquement en quelques minutes.

## Brancher ton propre nom de domaine (plus tard)

Quand tu auras un domaine (ex. `nicosef.fr`), dans Render : **Settings → Custom Domains**,
ajoute ton domaine et suis les 2 lignes à copier chez ton registrar. Gratuit, certificat HTTPS inclus.
