/**
 * Publication automatique sur Instagram — orchestrateur.
 * Version autonome (repo dédié).
 *
 * - Lit calendar.json, publie les posts « dus » non encore publiés (published.json).
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

const todayISO = () => new Date().toISOString().slice(0, 10);
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
  const today = todayISO();

  let due = calendar.filter((p) => !log[p.id]);
  due = ONLY_ID ? due.filter((p) => p.id === ONLY_ID) : due.filter((p) => p.date <= today);

  if (!due.length) {
    console.log(ONLY_ID ? `Aucun post « ${ONLY_ID} » à publier.` : "Aucun post dû aujourd'hui.");
    return;
  }

  for (const post of due) {
    const mediaUrl = publicUrl(post.type === "reel" ? post.video : post.image);
    try {
      const result = await publisher.publishPost(post, { mediaUrl, dryRun: DRY_RUN });
      if (!DRY_RUN) {
        log[post.id] = {
          at: new Date().toISOString(),
          mediaId: result.id,
          publisher: publisher.name,
          status: result.status,
        };
      }
    } catch (error) {
      console.error(`❌ ${post.id} : ${error.message}`);
    }
  }

  if (!DRY_RUN) fs.writeFileSync(path.join(DIR, "published.json"), JSON.stringify(log, null, 2) + "\n");
  console.log("Terminé.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
