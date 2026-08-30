# 🤖 SubPilot — Autopilot Instagram

Publie automatiquement sur Instagram via l'**API Graph officielle** de Meta, depuis une **GitHub Action**.
Tu prépares le calendrier, tu cliques sur « Publier » → ça poste. (Option 100 % auto disponible.)

## Contenu
- `publish.js` — le script de publication (feed / story / reel), sans dépendance.
- `calendar.json` — le calendrier éditable (date, type, image, légende). 8 posts pré-remplis.
- `feed/` (carrés 1080×1080) et `stories/` (9:16), en JPEG.
- `published.json` — journal auto (ne publie jamais 2× le même post).
- `.github/workflows/publish.yml` — le bouton « Publier ».

---

## 🚀 Étape A — Créer le repo et y déposer ces fichiers

> ⚠️ **Le repo doit être PUBLIC** : Meta doit pouvoir télécharger les images par leur URL
> (`raw.githubusercontent.com`). Un repo privé = images inaccessibles = échec de publication.

Sur ton PC, dans le dossier `insta-autopilot` (celui-ci) :

```powershell
git init
git add .
git commit -m "Autopilot Instagram SubPilot"
git branch -M main
git remote add origin https://github.com/TON-COMPTE/NOM-DU-REPO.git
git push -u origin main
```
*(crée d'abord le repo **public** vide sur github.com, sans README, puis colle son URL ci-dessus.)*

---

## 🔧 Étape B — Configurer l'accès Instagram (une fois, ~30 min)

### 1. Compte Instagram « Pro » relié à une Page Facebook
- Instagram : **Paramètres → Type de compte → Passer en compte professionnel**.
- Relie-le à une **Page Facebook** (Page FB → Paramètres → Comptes liés → Instagram).

### 2. App Meta
- **developers.facebook.com** → Créer une app → type **Entreprise** → ajoute **Instagram Graph API**.

### 3. ID du compte + jeton longue durée (sans coder)
Via l'**Explorateur d'API Graph** (developers.facebook.com/tools/explorer), app sélectionnée :
1. **Generate Access Token** + autorise : `instagram_basic`, `instagram_content_publish`,
   `pages_show_list`, `pages_read_engagement`, `business_management`.
2. Requête GET `me/accounts?fields=instagram_business_account,name` →
   note `instagram_business_account.id` = **IG_USER_ID**.
3. Échange en jeton longue durée (60 j), requête GET :
   `oauth/access_token?grant_type=fb_exchange_token&client_id=APP_ID&client_secret=APP_SECRET&fb_exchange_token=JETON_COURT`
   → `access_token` = **IG_ACCESS_TOKEN**. *(APP_ID / APP_SECRET : Paramètres → Général de l'app.)*

### 4. Secrets GitHub (sur CE repo)
**Settings → Secrets and variables → Actions → New repository secret** :
- `IG_USER_ID`
- `IG_ACCESS_TOKEN`

---

## ▶️ Publier
Onglet **Actions → « Publier sur Instagram » → Run workflow** :
- **dry_run = true** d'abord (test sans publier). ✅
- puis **only_id** = l'`id` d'un post pour publier juste celui-là, ou vide pour tous les posts dus.

## 📅 Ajouter des posts
Édite `calendar.json`, commit + push. Exemple :
```json
{ "id": "unique", "date": "2026-09-20", "type": "feed",
  "image": "feed/mon-image.jpg", "caption": "Texte + #hashtags" }
```
Types : `feed` (carré/portrait), `story` (9:16), `reel` (ajoute `"video": "videos/x.mp4"`).
Formats **JPEG**, images **commit** dans ce repo.

## 🔁 100 % automatique
Décommente le bloc `schedule` dans `.github/workflows/publish.yml`.

## ⚠️ Limites Meta
- Jeton à régénérer **tous les 60 jours** (refais l'étape B.3, mets à jour le secret).
- **25 publications / 24 h**. Images JPEG ≤ 8 Mo ; feed entre 4:5 et 1.91:1.
- Les Stories publiées par l'API n'ont pas de sticker « lien » (mets le lien en bio).
