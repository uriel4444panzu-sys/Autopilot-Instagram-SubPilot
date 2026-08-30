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
 *
 * Env requis : MEDIA_BASE, + les identifiants du provider choisi
 *   (PUBLISHER=buffer -> voir BUFFER_SETUP.md ; PUBLISHER=meta -> IG_USER_ID, IG_ACCESS_TOKEN)
 * Env optionnels : ONLY_ID (cibler un post), DRY_RUN=1 (simuler), PUBLISHER=buffer|meta
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
  }

  if (!DRY_RUN) fs.writeFileSync(path.join(DIR, "published.json"), JSON.stringify(log, null, 2) + "\n");
  console.log("Terminé.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
