/**
 * Delete Buffer Posts — outil de nettoyage : liste (et, si demandé,
 * supprime) les posts actuellement PROGRAMMÉS sur Buffer pour le channel
 * Instagram configuré. Ne touche JAMAIS calendar.json ni published.json —
 * uniquement Buffer lui-même.
 *
 * SUPPRESSION IRRÉVERSIBLE côté Buffer. Par sécurité :
 *   - DRY_RUN=1 par défaut : liste seulement, ne supprime rien.
 *   - ONLY_ID optionnel : ne cible qu'un seul post (id Buffer) au lieu de tous.
 *
 * Déclenchement manuel uniquement.
 *
 * Env requis : BUFFER_API_KEY, BUFFER_INSTAGRAM_CHANNEL_ID
 * Env optionnels : DRY_RUN (1 par défaut, "0" pour supprimer réellement),
 *                   ONLY_ID (id d'un post précis, sinon tous les posts programmés)
 */

const { getOrganizationId } = require("../providers/bufferPublisher");

const API_URL = "https://api.buffer.com";

async function graphqlRequest(token, query, variables) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) {
    throw new Error(`Buffer API: ${body.errors ? body.errors.map((e) => e.message).join("; ") : `HTTP ${res.status}`}`);
  }
  return body.data;
}

async function listScheduledPosts(token, organizationId, channelId) {
  const data = await graphqlRequest(
    token,
    `
    query ListScheduledPosts($organizationId: OrganizationId!, $channelIds: [ChannelId!]!) {
      posts(input: { organizationId: $organizationId, filter: { channelIds: $channelIds } }) {
        edges {
          node { id text status dueAt }
        }
      }
    }
  `,
    { organizationId, channelIds: [channelId] }
  );
  const nodes = (data.posts?.edges || []).map((e) => e.node);
  return nodes.filter((n) => n.status === "scheduled" || n.status === "buffer_queue" || n.status === "sending");
}

async function deletePost(token, postId) {
  const data = await graphqlRequest(
    token,
    `
    mutation DeletePost($input: DeletePostInput!) {
      deletePost(input: $input) {
        success
      }
    }
  `,
    { input: { id: postId } }
  );
  const result = data.deletePost;
  if (!result?.success) throw new Error("Buffer API: réponse inattendue (suppression non confirmée).");
  return postId;
}

async function main() {
  const token = process.env.BUFFER_API_KEY;
  const channelId = process.env.BUFFER_INSTAGRAM_CHANNEL_ID;
  const onlyId = process.env.ONLY_ID || "";
  const dryRun = process.env.DRY_RUN !== "0";

  if (!token) throw new Error("BUFFER_API_KEY manquant.");
  if (!channelId) throw new Error("BUFFER_INSTAGRAM_CHANNEL_ID manquant.");

  if (process.env.INTROSPECT) {
    const data = await graphqlRequest(
      token,
      `
      query IntrospectType($name: String!) {
        __type(name: $name) {
          name
          kind
          fields { name type { name kind ofType { name kind } } }
          possibleTypes { name fields { name type { name kind ofType { name kind } } } }
        }
      }
    `,
      { name: process.env.INTROSPECT }
    );
    console.log(JSON.stringify(data.__type, null, 2));
    return;
  }

  const organizationId = await getOrganizationId();
  let posts = await listScheduledPosts(token, organizationId, channelId);
  if (onlyId) posts = posts.filter((p) => p.id === onlyId);

  console.log(`${posts.length} post(s) programmé(s) trouvé(s)${onlyId ? ` (filtré sur id "${onlyId}")` : ""} :`);
  for (const p of posts) console.log(`  - ${p.id} [${p.status}] dueAt=${p.dueAt} — ${p.text.slice(0, 60).replace(/\n/g, " ")}...`);

  if (!posts.length) {
    console.log("Rien à supprimer.");
    return;
  }

  if (dryRun) {
    console.log("\nDRY_RUN : rien n'a été supprimé. Relance avec DRY_RUN=0 pour supprimer réellement.");
    return;
  }

  console.log("\nSuppression en cours...");
  let ok = 0;
  let failed = 0;
  for (const p of posts) {
    try {
      await deletePost(token, p.id);
      console.log(`  ✅ supprimé : ${p.id}`);
      ok++;
    } catch (error) {
      console.error(`  ❌ ${p.id} : ${error.message}`);
      failed++;
    }
  }
  console.log(`\nTerminé : ${ok} supprimé(s), ${failed} échec(s).`);
  if (failed) process.exit(1);
}

main().catch((e) => {
  console.error("❌ Erreur :", e.message);
  process.exit(1);
});
