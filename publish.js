/**
 * Publication automatique sur Instagram — orchestrateur.
 * Version autonome (repo dédié).
 *
 * - Lit calendar.json, envoie à Buffer tout post approuvé non encore envoyé
 *   (published.json), même si sa date est dans le futur : c'est Buffer qui
 *   programme (dueAt) et publie tout seul le bon jour.
 * - Types : "feed" (image), "story" (9:16), "reel" (vidéo).
 * - Les médias doivent être à une URL PUBLIQUE. MEDIA_BASE est fourni par la
 *   GitHub Action (raw.githubusercontent du repo). En local, exporte MEDIA_BASE.
 * - Le provider de publication (Buffer par défaut, Meta en fallback) est
 *   sélectionné via PUBLISHER — voir socialPublisher.js.
 * - published.json est enregistré via l'API Contents de GitHub (pas un
 *   simple "git push") juste après CHAQUE post : approuver plusieurs
 *   brouillons coup sur coup peut déclencher plusieurs exécutions qui se
 *   suivent de très près, et un "git push" classique peut échouer sous
 *   cette rafale — laissant un post déjà envoyé à Buffer non enregistré,
 *   donc renvoyé en double au run suivant (constaté en usage réel).
 *   L'API Contents gère le conflit de façon atomique (sha) : en cas de
 *   conflit on relit le fichier distant et on retente, sans jamais perdre
 *   une entrée déjà enregistrée par un autre run.
 *
 * Env requis : MEDIA_BASE, + les identifiants du provider choisi
 *   (PUBLISHER=buffer -> voir BUFFER_SETUP.md ; PUBLISHER=meta -> IG_USER_ID, IG_ACCESS_TOKEN)
 * Env optionnels : ONLY_ID (cibler un post), DRY_RUN=1 (simuler), PUBLISHER=buffer|meta
 *   GH_TOKEN, GITHUB_REPOSITORY, GITHUB_REF_NAME (fournis automatiquement
 *   par GitHub Actions — voir .github/workflows/publish.yml) : permettent
 *   d'enregistrer published.json via l'API. En local (sans ces variables),
 *   published.json est simplement écrit sur disque, comme avant.
 */

const fs = require("fs");
const path = require("path");
const { getPublisher } = require("./socialPublisher");

const DIR = __dirname;
const MEDIA_BASE = process.env.MEDIA_BASE || process.env.PAGES_BASE || "";
const ONLY_ID = process.env.ONLY_ID || "";
const DRY_RUN = process.env.DRY_RUN === "1";

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
  } catch {
    return fallback;
  }
}

/**
 * Enregistre l'entrée d'UN post dans published.json sur GitHub via l'API
 * Contents, en fusionnant avec le contenu distant le plus récent à chaque
 * tentative (jamais un simple "overwrite" du fichier local) — un conflit
 * (sha périmé) déclenche juste une relecture + nouvelle tentative, sans
 * jamais perdre une entrée déjà enregistrée par un autre run.
 */
async function commitPublishedEntry(postId, entry) {
  const token = process.env.GH_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const branch = process.env.GITHUB_REF_NAME;
  if (!token || !repository || !branch) return false; // hors GitHub Actions (ex: exécution locale) : rien à faire ici

  const api = `https://api.github.com/repos/${repository}/contents/published.json`;
  const headers = { Authorization: `Bearer ${token}`, "User-Agent": "subpilot-publish" };

  for (let attempt = 1; attempt <= 10; attempt++) {
    let sha;
    let remote = {};
    const getRes = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers });
    if (getRes.ok) {
      const data = await getRes.json();
      sha = data.sha;
      remote = JSON.parse(Buffer.from(data.content, "base64").toString("utf8"));
    } else if (getRes.status !== 404) {
      throw new Error(`GitHub Contents API (lecture published.json) : HTTP ${getRes.status}`);
    }

    remote[postId] = entry;
    const content = Buffer.from(JSON.stringify(remote, null, 2) + "\n").toString("base64");
    const putRes = await fetch(api, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ message: `chore: journal du post ${postId}`, content, sha, branch }),
    });
    if (putRes.ok) return true;
    if (putRes.status !== 409 && putRes.status !== 422) {
      const body = await putRes.text();
      throw new Error(`GitHub Contents API (écriture published.json) : HTTP ${putRes.status} ${body}`);
    }
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  throw new Error("Impossible d'enregistrer published.json après plusieurs tentatives (conflits répétés).");
}

const publicUrl = (rel) =>
  MEDIA_BASE.replace(/\/?$/, "/") +
  rel
    .replace(/^\/+/, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");

async function main() {
  if (!MEDIA_BASE) {
    console.error("❌ MEDIA_BASE est requis (fourni par la GitHub Action, ou exporté en local).");
    process.exit(1);
  }

  const publisher = getPublisher();
  console.log(`Provider actif : ${publisher.name}`);

  const calendar = readJson("calendar.json", []);
  const log = readJson("published.json", {});

  // Un post sans "status" (posts historiques) ou "status: approved" est
  // publiable. Un "draft" (généré automatiquement, pas encore validé) ne
  // part jamais tant qu'il n'a pas été explicitement approuvé à la main.
  const isApproved = (p) => !p.status || p.status === "approved";
  // Dès qu'un post est approuvé, il est envoyé à Buffer immédiatement — même
  // si sa date est dans le futur — pour que Buffer le programme lui-même
  // (dueAt) et le publie tout seul le bon jour. Aucun filtre sur la date ici :
  // c'est Buffer qui gère le "quand", pas ce script.
  // Un post déjà "scheduled"/"published" n'est jamais retenté. Un post "failed"
  // reste dans la file et sera retenté au prochain lancement (aucun échec Buffer
  // ne doit faire disparaître un post).
  let pending = calendar.filter((p) => isApproved(p) && (!log[p.id] || log[p.id].status === "failed"));
  if (ONLY_ID) pending = pending.filter((p) => p.id === ONLY_ID);

  if (!pending.length) {
    console.log(ONLY_ID ? `Aucun post « ${ONLY_ID} » à publier.` : "Aucun post approuvé en attente d'envoi à Buffer.");
    return;
  }

  const saveLog = () => fs.writeFileSync(path.join(DIR, "published.json"), JSON.stringify(log, null, 2) + "\n");

  for (const post of pending) {
    const mediaUrl = publicUrl(post.type === "reel" ? post.video : post.image);
    try {
      const result = await publisher.publishPost(post, { mediaUrl, dryRun: DRY_RUN });
      if (!DRY_RUN) {
        log[post.id] = {
          at: new Date().toISOString(),
          mediaId: result.id,
          publisher: publisher.name,
          status: result.status,
          ...(result.scheduledAt ? { scheduledAt: result.scheduledAt } : {}),
          ...(result.publishedAt ? { publishedAt: result.publishedAt } : {}),
        };
      }
    } catch (error) {
      console.error(`❌ ${post.id} : ${error.message}`);
      if (!DRY_RUN) {
        log[post.id] = {
          at: new Date().toISOString(),
          publisher: publisher.name,
          status: "failed",
          publishError: error.message,
        };
      }
    }
    // Enregistré après CHAQUE post (pas seulement à la fin) : si le job est
    // interrompu (timeout, annulation) en cours de route, les posts déjà
    // envoyés à Buffer restent enregistrés et ne seront jamais renvoyés en
    // double au prochain lancement.
    if (!DRY_RUN) {
      saveLog();
      await commitPublishedEntry(post.id, log[post.id]);
    }
  }

  console.log("Terminé.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
