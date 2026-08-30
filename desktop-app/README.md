# SubPilot Control Room

Petite application (page web locale, servie par Node.js) pour piloter l'automatisation SubPilot sans passer par l'interface GitHub :

- **Générer** — lance les workflows de génération (rythme de la semaine, lot personnalisé, image seule).
- **Vidéos** — dépose une vidéo dans le dépôt pour l'utiliser dans un reel.
- **Brouillons** — relit `calendar.json`, affiche chaque brouillon (image/caption/hook) et permet de l'approuver (avec une date) ou de le supprimer.

Rien n'est publié automatiquement : l'app ne fait qu'orchestrer GitHub Actions et éditer `calendar.json` via l'API GitHub — le reste du pipeline (Buffer, publication) est inchangé.

## Pourquoi PowerShell plutôt qu'un fichier à double-cliquer

**Smart App Control** (Windows 11) évalue tout fichier qu'on exécute directement — `.exe`, mais aussi `.bat` et `.ps1` — et peut le bloquer sans possibilité de l'autoriser manuellement, quel que soit le programme réellement lancé derrière (constaté avec un `.exe` Electron, puis avec un simple `.bat`).

En tapant la commande **directement dans une fenêtre PowerShell déjà ouverte**, il n'y a plus de fichier séparé à évaluer : PowerShell lance directement `node.exe`, qui est déjà autorisé sur ta machine (Node.js s'exécute normalement dès qu'il est installé). C'est la même logique que pour l'outil d'aide à la résiliation de SubPilot.

## Lancer l'app

1. Installe [Node.js](https://nodejs.org) (version LTS) si ce n'est pas déjà fait.
2. Récupère le dossier `desktop-app/` (télécharger le dépôt en ZIP depuis GitHub, ou `git clone`).
3. Dans l'Explorateur Windows, ouvre le dossier `desktop-app`, puis **Maj + clic droit** dans un espace vide → **"Ouvrir la fenêtre PowerShell ici"** (ou "Ouvrir dans le terminal").
4. Dans la fenêtre PowerShell qui s'ouvre, tape :
   ```powershell
   node server.js
   ```
5. Ton navigateur s'ouvre automatiquement sur `http://localhost:5177`.

Pour l'arrêter : reviens sur la fenêtre PowerShell et fais **Ctrl+C**.

## Connexion

Onglet **Réglages** → **Ouvrir GitHub** crée un **jeton d'accès personnel** (fine-grained). Permissions nécessaires sur le dépôt : **Contents** (Read and write) et **Actions** (Read and write). Le jeton est chiffré et stocké localement dans `~/.subpilot-control-room/` (ton dossier utilisateur) — jamais envoyé ailleurs qu'à l'API GitHub. Ce chiffrement protège contre une lecture accidentelle du fichier ; ce n'est pas un coffre-fort au niveau OS (type Windows Credential Manager) — reste prudent avec ce dossier comme avec n'importe quel fichier contenant des identifiants.

## Développement

```bash
cd desktop-app
node server.js
```

Aucune dépendance à installer (uniquement les modules intégrés de Node.js).
