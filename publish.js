/**
 * Publication automatique sur Instagram via l'API Graph officielle (Meta).
 * Version autonome (repo dédié).
 *
 * - Lit calendar.json, publie les posts « dus » non encore publiés (published.json).
 * - Types : "feed" (image), "story" (9:16), "reel" (vidéo).
 * - Les médias doivent être à une URL PUBLIQUE. MEDIA_BASE est fourni par la
 *   GitHub Action (raw.githubusercontent du repo). En local, exporte MEDIA_BASE.
 *
 * Env requis : IG_USER_ID, IG_ACCESS_TOKEN, MEDIA_BASE
 * Env optionnels : ONLY_ID (cibler un post), DRY_RUN=1 (simuler)
 */

const fs = require("fs");
const path = require("path");

const GRAPH = "https://graph.facebook.com/v21.0";
const DIR = __dirname;
const MEDIA_BASE = process.env.MEDIA_BASE || process.env.PAGES_BASE || "";
const IG_USER_ID = process.env.IG_USER_ID;
const TOKEN = process.env.IG_ACCESS_TOKEN;
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
const publicUrl = (rel) => MEDIA_BASE.replace(/\/?$/, "/") + rel.replace(/^\/+/, "");

async function api(pathPart, params) {
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  const res = await fetch(`${GRAPH}/${pathPart}`, { method: "POST", body });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Graph API: ${JSON.stringify(data.error || data)}`);
  return data;
}

async function waitReady(creationId) {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${GRAPH}/${creationId}?fields=status_code&access_token=${TOKEN}`);
    const data = await res.json();
    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR") throw new Error("Traitement média en erreur.");
    await new Promise((r) => setTimeout(r, 6000));
  }
  throw new Error("Média toujours pas prêt après ~2 min.");
}

async function publishOne(post) {
  const container = { caption: post.caption || "" };
  if (post.type === "story") {
    container.media_type = "STORIES";
    container.image_url = publicUrl(post.image);
  } else if (post.type === "reel") {
    container.media_type = "REELS";
    container.video_url = publicUrl(post.video);
  } else {
    container.image_url = publicUrl(post.image);
  }

  console.log(`→ ${post.id} (${post.type}) : ${container.image_url || container.video_url}`);
  if (DRY_RUN) {
    console.log("  DRY_RUN : rien n'est publié.");
    return "dry-run";
  }

  const created = await api(`${IG_USER_ID}/media`, container);
  if (post.type === "reel") await waitReady(created.id);
  const published = await api(`${IG_USER_ID}/media_publish`, { creation_id: created.id });
  console.log(`  ✅ publié (media id ${published.id})`);
  return published.id;
}

async function main() {
  if (!IG_USER_ID || !TOKEN) {
    console.error("❌ IG_USER_ID et IG_ACCESS_TOKEN sont requis (secrets GitHub).");
    process.exit(1);
  }
  if (!MEDIA_BASE) {
    console.error("❌ MEDIA_BASE est requis (fourni par la GitHub Action, ou exporté en local).");
    process.exit(1);
  }

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
    try {
      const mediaId = await publishOne(post);
      if (!DRY_RUN) log[post.id] = { at: new Date().toISOString(), mediaId };
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
