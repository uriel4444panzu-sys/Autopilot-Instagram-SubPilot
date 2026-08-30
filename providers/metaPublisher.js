/**
 * Provider Meta / Instagram Graph API (legacy).
 * Code repris tel quel depuis l'ancien publish.js — comportement inchangé.
 *
 * Env requis : IG_USER_ID, IG_ACCESS_TOKEN
 */

const GRAPH = "https://graph.facebook.com/v21.0";

async function api(pathPart, params, token) {
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH}/${pathPart}`, { method: "POST", body });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Graph API: ${JSON.stringify(data.error || data)}`);
  return data;
}

async function waitReady(creationId, token) {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${GRAPH}/${creationId}?fields=status_code&access_token=${token}`);
    const data = await res.json();
    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR") throw new Error("Traitement média en erreur.");
    await new Promise((r) => setTimeout(r, 6000));
  }
  throw new Error("Média toujours pas prêt après ~2 min.");
}

/**
 * Publie immédiatement un post sur Instagram via l'API Graph.
 * @param {object} post - entrée de calendar.json ({ id, type, image|video, caption }).
 * @param {object} ctx - { mediaUrl, dryRun }.
 * @returns {Promise<{ id: string, status: "published" | "dry-run" }>}
 */
async function publishPost(post, ctx) {
  const IG_USER_ID = process.env.IG_USER_ID;
  const TOKEN = process.env.IG_ACCESS_TOKEN;
  if (!IG_USER_ID || !TOKEN) {
    throw new Error("IG_USER_ID et IG_ACCESS_TOKEN sont requis (secrets GitHub) pour le provider meta.");
  }

  const container = { caption: post.caption || "" };
  if (post.type === "story") {
    container.media_type = "STORIES";
    container.image_url = ctx.mediaUrl;
  } else if (post.type === "reel") {
    container.media_type = "REELS";
    container.video_url = ctx.mediaUrl;
  } else {
    container.image_url = ctx.mediaUrl;
  }

  console.log(`→ [meta] ${post.id} (${post.type}) : ${container.image_url || container.video_url}`);
  if (ctx.dryRun) {
    console.log("  DRY_RUN : rien n'est publié.");
    return { id: null, status: "dry-run" };
  }

  const created = await api(`${IG_USER_ID}/media`, container, TOKEN);
  if (post.type === "reel") await waitReady(created.id, TOKEN);
  const published = await api(`${IG_USER_ID}/media_publish`, { creation_id: created.id }, TOKEN);
  console.log(`  ✅ publié (media id ${published.id})`);
  return { id: published.id, status: "published" };
}

async function testConnection() {
  const IG_USER_ID = process.env.IG_USER_ID;
  const TOKEN = process.env.IG_ACCESS_TOKEN;
  if (!IG_USER_ID || !TOKEN) {
    return { ok: false, error: "IG_USER_ID et/ou IG_ACCESS_TOKEN manquants." };
  }
  try {
    const res = await fetch(`${GRAPH}/${IG_USER_ID}?fields=username&access_token=${TOKEN}`);
    const data = await res.json();
    if (!res.ok || data.error) return { ok: false, error: JSON.stringify(data.error || data) };
    return { ok: true, account: data.username || IG_USER_ID };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

module.exports = { name: "meta", publishPost, testConnection };
