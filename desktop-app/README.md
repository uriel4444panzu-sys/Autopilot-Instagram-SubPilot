# SubPilot Control Room

Application de bureau (Electron, Windows) pour piloter l'automatisation SubPilot sans passer par l'interface GitHub :

- **Générer** — lance les workflows de génération (rythme de la semaine, lot personnalisé, image seule).
- **Vidéos** — dépose une vidéo dans le dépôt pour l'utiliser dans un reel.
- **Brouillons** — relit `calendar.json`, affiche chaque brouillon (image/caption/hook) et permet de l'approuver (avec une date) ou de le supprimer.

Rien n'est publié automatiquement : l'app ne fait qu'orchestrer GitHub Actions et éditer `calendar.json` via l'API GitHub — le reste du pipeline (Buffer, publication) est inchangé.

## Connexion

L'app se connecte avec un **jeton d'accès personnel GitHub** (fine-grained), créé une seule fois via Réglages → "Ouvrir GitHub". Permissions nécessaires sur le dépôt : **Contents** (Read and write) et **Actions** (Read and write). Le jeton est stocké chiffré localement (Electron `safeStorage`, lié au compte Windows de l'utilisateur) — jamais envoyé ailleurs qu'à l'API GitHub.

## Construire l'installateur

Le plus simple : onglet **Actions** du dépôt → **"Build Desktop App (Windows)"** → Run workflow. L'installateur `.exe` est déposé en artifact du run (bouton de téléchargement en bas de la page du run).

En local (nécessite Windows, ou Linux/Mac avec wine pour la partie édition de ressources) :

```bash
cd desktop-app
npm install
npm run build:win
```

L'installateur est généré dans `desktop-app/dist/`.
