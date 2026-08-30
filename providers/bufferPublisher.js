/**
 * Provider Buffer — API GraphQL officielle (https://api.buffer.com).
 *
 * Sources vérifiées (documentation officielle developers.buffer.com, via
 * recherches croisées le 30/08/2026 — l'accès direct à developers.buffer.com
 * est bloqué depuis cet environnement) :
 *   - guides/authentication.html      -> clé API personnelle, header Bearer
 *   - guides/getting-started.html     -> endpoint unique https://api.buffer.com
 *   - guides/data-model.html          -> requête "channels"
 *   - guides/posts-and-scheduling.html + examples/create-*-post.html
 *                                     -> mutation "createPost"
 *   - guides/hosting-media.html       -> assets = URL publique obligatoire
 *   - guides/error-handling.html      -> union PostActionSuccess / MutationError
 *
 * ⚠️ Point non totalement confirmé : le nom exact du champ `metadata` pour
 * distinguer post / story / reel Instagram (le concept existe, cf.
 * developers.buffer.com/types/PostInputMetaData.html, mais la forme précise
 * n'a pas pu être récupérée). L'API GraphQL étant fortement typée, un nom de
 * champ incorrect fait échouer la mutation avec un message d'erreur clair
 * (aucune publication au mauvais format) — à vérifier lors du test manuel
 * de publication (étape 8) avant d'automatiser les stories/reels.
 *
 * Env requis : BUFFER_API_KEY, BUFFER_INSTAGRAM_CHANNEL_ID
 * Env optionnels : BUFFER_DEFAULT_TIMEZONE (défaut "Europe/Paris"),
 *                  BUFFER_DEFAULT_TIME (défaut "10:00")
 */

const API_URL = "https://api.buffer.com";

function getToken() {
  const token = process.env.BUFFER_API_KEY;
  if (!token) throw new Error("BUFFER_API_KEY manquant (clé API personnelle Buffer).");
  return token;
}

async function graphqlRequest(query, variables) {
  const token = getToken();
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(`Buffer API: réponse invalide (HTTP ${res.status}).`);
  }

  if (!res.ok || body.errors) {
    const msg = body.errors ? body.errors.map((e) => e.message).join("; ") : `HTTP ${res.status}`;
    throw new Error(`Buffer API: ${msg}`);
  }
  return body.data;
}

async function getOrganizationId() {
  const data = await graphqlRequest(`
    query GetOrganizations {
      account { organizations { id } }
    }
  `);
  const org = data?.account?.organizations?.[0];
  if (!org) throw new Error("Buffer API: aucune organisation trouvée pour ce compte.");
  return org.id;
}

async function listChannels(organizationId) {
  const data = await graphqlRequest(
    `
    query GetChannels($organizationId: OrganizationId!) {
      channels(input: { organizationId: $organizationId }) {
        id
        name
        service
        avatar
        isDisconnected
      }
    }
  `,
    { organizationId }
  );
  return data.channels || [];
}

/**
 * Convertit une date/heure locale (ex: "2026-09-02", "18:00", "Europe/Paris")
 * en instant UTC ISO 8601, sans dépendance externe (le projet reste
 * "sans dépendance" comme le script Meta d'origine).
 */
function zonedTimeToUtcISO(dateStr, timeStr, timeZone) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, hh, mm);

  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcGuess)).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const asUtcOfLocal = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  const offset = asUtcOfLocal - utcGuess;
  return new Date(utcGuess - offset).toISOString();
}

function computeDueAt(post) {
  const date = post.date;
  const time = post.time || process.env.BUFFER_DEFAULT_TIME || "10:00";
  const timezone = post.timezone || process.env.BUFFER_DEFAULT_TIMEZONE || "Europe/Paris";
  return zonedTimeToUtcISO(date, time, timezone);
}

function buildAssets(post, mediaUrl) {
  if (post.type === "reel") return [{ video: { url: mediaUrl } }];
  return [{ image: { url: mediaUrl } }];
}

/**
 * Métadonnée Instagram (post / story / reel). Champ non totalement confirmé
 * (voir en-tête du fichier) — si Buffer le rejette, l'erreur GraphQL exacte
 * remonte via publishPost() et rien n'est publié au mauvais format.
 */
function buildMetadata(post) {
  if (post.type === "story") return { instagram: { type: "STORY" } };
  if (post.type === "reel") return { instagram: { type: "REEL" } };
  return undefined;
}

/**
 * Programme un post Instagram via Buffer.
 * @param {object} post - entrée de calendar.json ({ id, type, image|video, caption, date, time?, timezone? }).
 * @param {object} ctx - { mediaUrl, dryRun }.
 * @returns {Promise<{ id: string, status: "scheduled" | "dry-run" }>}
 */
async function publishPost(post, ctx) {
  const channelId = process.env.BUFFER_INSTAGRAM_CHANNEL_ID;
  if (!channelId) throw new Error("BUFFER_INSTAGRAM_CHANNEL_ID manquant.");

  const dueAt = computeDueAt(post);
  const metadata = buildMetadata(post);

  console.log(`→ [buffer] ${post.id} (${post.type}) programmé pour ${dueAt} : ${ctx.mediaUrl}`);
  if (ctx.dryRun) {
    console.log("  DRY_RUN : rien n'est envoyé à Buffer.");
    return { id: null, status: "dry-run" };
  }

  const input = {
    text: post.caption || "",
    channelId,
    schedulingType: "automatic",
    mode: "customScheduled",
    dueAt,
    assets: buildAssets(post, ctx.mediaUrl),
    ...(metadata ? { metadata } : {}),
  };

  const data = await graphqlRequest(
    `
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess {
          post { id dueAt }
        }
        ... on MutationError {
          message
        }
      }
    }
  `,
    { input }
  );

  const result = data.createPost;
  if (result?.message) throw new Error(`Buffer API: ${result.message}`);
  if (!result?.post?.id) throw new Error("Buffer API: réponse inattendue (aucun post créé).");

  console.log(`  ✅ programmé sur Buffer (post id ${result.post.id})`);
  return { id: result.post.id, status: "scheduled" };
}

/**
 * Vérifie l'authentification et le channel Instagram configuré, sans rien publier.
 */
async function testConnection() {
  try {
    getToken();
  } catch (error) {
    return { ok: false, error: error.message };
  }

  try {
    const organizationId = await getOrganizationId();
    const channels = await listChannels(organizationId);
    const configuredId = process.env.BUFFER_INSTAGRAM_CHANNEL_ID;

    if (!configuredId) {
      return {
        ok: false,
        error: "BUFFER_INSTAGRAM_CHANNEL_ID manquant.",
        channels,
      };
    }

    const channel = channels.find((c) => c.id === configuredId);
    if (!channel) {
      return {
        ok: false,
        error: `Aucun channel Buffer avec l'id "${configuredId}".`,
        channels,
      };
    }
    if (channel.service !== "instagram") {
      return {
        ok: false,
        error: `Le channel "${configuredId}" n'est pas un channel Instagram (service: ${channel.service}).`,
        channels,
      };
    }
    if (channel.isDisconnected) {
      return {
        ok: false,
        error: `Le channel Instagram "${channel.name}" est déconnecté côté Buffer.`,
        channels,
      };
    }

    return { ok: true, channel, channels };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

module.exports = { name: "buffer", publishPost, testConnection, listChannels, getOrganizationId };
