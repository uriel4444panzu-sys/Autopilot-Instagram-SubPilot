# SubPilot Control Room

Application de bureau (Electron, Windows) pour piloter l'automatisation SubPilot sans passer par l'interface GitHub :

- **Générer** — lance les workflows de génération (rythme de la semaine, lot personnalisé, image seule).
- **Vidéos** — dépose une vidéo dans le dépôt pour l'utiliser dans un reel.
- **Brouillons** — relit `calendar.json`, affiche chaque brouillon (image/caption/hook) et permet de l'approuver (avec une date) ou de le supprimer.

Rien n'est publié automatiquement : l'app ne fait qu'orchestrer GitHub Actions et éditer `calendar.json` via l'API GitHub — le reste du pipeline (Buffer, publication) est inchangé.

## Connexion

L'app se connecte avec un **jeton d'accès personnel GitHub** (fine-grained), créé une seule fois via Réglages → "Ouvrir GitHub". Permissions nécessaires sur le dépôt : **Contents** (Read and write) et **Actions** (Read and write). Le jeton est stocké chiffré localement (Electron `safeStorage`, lié au compte Windows de l'utilisateur) — jamais envoyé ailleurs qu'à l'API GitHub.

## Lancer l'app (recommandé — sans installateur)

L'installateur `.exe` packagé (voir plus bas) n'est pas signé par un éditeur reconnu : **Smart App Control** (Windows 11) le bloque purement et simplement, sans possibilité de l'autoriser manuellement. Pour éviter ça, lance l'app directement via Node.js — le binaire réellement exécuté est alors `electron.exe`, un exécutable officiel signé par le projet Electron, pas un binaire inconnu.

1. Installe [Node.js](https://nodejs.org) (version LTS) si ce n'est pas déjà fait — installateur signé Microsoft/OpenJS, jamais bloqué.
2. Récupère le dossier `desktop-app/` (télécharger le dépôt en ZIP depuis GitHub, ou `git clone`).
3. Double-clique **`Lancer SubPilot Control Room.bat`** — il installe les dépendances au premier lancement (une minute environ), puis démarre l'app à chaque fois.

## Construire l'installateur (optionnel)

Utile seulement si tu obtiens un jour un certificat de signature de code, ou pour tester le packaging. Sans certificat, l'installateur généré se fera bloquer par Smart App Control comme n'importe quel exécutable non signé — préfère la méthode ci-dessus.

Onglet **Actions** du dépôt → **"Build Desktop App (Windows)"** → Run workflow. L'installateur `.exe` est déposé en artifact du run.

En local (nécessite Windows, ou Linux/Mac avec wine pour la partie édition de ressources) :

```bash
cd desktop-app
npm install
npm run build:win
```

L'installateur est généré dans `desktop-app/dist/`.
