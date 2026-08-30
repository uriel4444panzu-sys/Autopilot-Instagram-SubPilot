# SubPilot Control Room

Petite application (page web locale, servie par Node.js) pour piloter l'automatisation SubPilot sans passer par l'interface GitHub :

- **Générer** — lance les workflows de génération (rythme de la semaine, lot personnalisé, image seule).
- **Vidéos** — dépose une vidéo dans le dépôt pour l'utiliser dans un reel.
- **Brouillons** — relit `calendar.json`, affiche chaque brouillon (image/caption/hook) et permet de l'approuver (avec une date) ou de le supprimer.

Rien n'est publié automatiquement : l'app ne fait qu'orchestrer GitHub Actions et éditer `calendar.json` via l'API GitHub — le reste du pipeline (Buffer, publication) est inchangé.

## Pourquoi une page web plutôt qu'un exécutable

Un premier essai en application de bureau (Electron) s'est heurté à **Smart App Control** (Windows 11), qui bloque tout exécutable sans certificat de signature reconnu — sans possibilité de l'autoriser manuellement. Une page web locale évite complètement le problème : le seul programme lancé est `node.exe` (déjà installé sur ta machine), et l'interface s'ouvre dans ton navigateur habituel.

## Lancer l'app

1. Installe [Node.js](https://nodejs.org) (version LTS) si ce n'est pas déjà fait.
2. Récupère le dossier `desktop-app/` (télécharger le dépôt en ZIP depuis GitHub, ou `git clone`).
3. Double-clique **`Lancer SubPilot Control Room.bat`**. Ton navigateur s'ouvre automatiquement sur `http://localhost:5177`.

Pour l'arrêter : ferme simplement la fenêtre noire (invite de commandes) qui s'est ouverte.

## Connexion

Onglet **Réglages** → **Ouvrir GitHub** crée un **jeton d'accès personnel** (fine-grained). Permissions nécessaires sur le dépôt : **Contents** (Read and write) et **Actions** (Read and write). Le jeton est chiffré et stocké localement dans `~/.subpilot-control-room/` (ton dossier utilisateur) — jamais envoyé ailleurs qu'à l'API GitHub. Ce chiffrement protège contre une lecture accidentelle du fichier ; ce n'est pas un coffre-fort au niveau OS (type Windows Credential Manager) — reste prudent avec ce dossier comme avec n'importe quel fichier contenant des identifiants.

## Développement

```bash
cd desktop-app
node server.js
```

Aucune dépendance à installer (uniquement les modules intégrés de Node.js).
