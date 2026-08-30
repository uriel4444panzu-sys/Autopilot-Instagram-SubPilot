/**
 * Inspect Buffer Post — outil de diagnostic : interroge l'API Buffer pour
 * un post précis (par son id) et affiche ce que Buffer a réellement
 * enregistré (texte, statut, assets attachés). Utile pour vérifier si un
 * problème vient de notre intégration ou de Buffer lui-même.
 *
 * Ne publie rien, ne modifie rien. Déclenchement manuel uniquement.
 *
 * Env requis : BUFFER_API_KEY, BUFFER_INSTAGRAM_CHANNEL_ID, POST_ID
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

async function main() {
  const token = process.env.BUFFER_API_KEY;
  const channelId = process.env.BUFFER_INSTAGRAM_CHANNEL_ID;
  const postId = process.env.POST_ID;

  if (!token) throw new Error("BUFFER_API_KEY manquant.");
  if (!channelId) throw new Error("BUFFER_INSTAGRAM_CHANNEL_ID manquant.");
  if (!postId) throw new Error("POST_ID manquant.");

  const organizationId = await getOrganizationId();

  const data = await graphqlRequest(
    token,
    `
    query InspectPosts($organizationId: OrganizationId!, $channelIds: [ChannelId!]!) {
      posts(input: { organizationId: $organizationId, filter: { channelIds: $channelIds } }) {
        edges {
          node {
            id
            text
            status
            dueAt
            createdAt
            channelId
            assets { id mimeType }
          }
        }
      }
    }
  `,
    { organizationId, channelIds: [channelId] }
  );

  const nodes = (data.posts?.edges || []).map((e) => e.node);
  const match = nodes.find((n) => n.id === postId);

  console.log(`Total posts trouvés sur ce channel : ${nodes.length}`);
  if (!match) {
    console.log(`❌ Aucun post avec l'id "${postId}" trouvé.`);
    console.log("Ids disponibles :", nodes.map((n) => n.id).join(", "));
    process.exit(1);
  }

  console.log("\n✅ Post trouvé :");
  console.log(JSON.stringify(match, null, 2));
}

main().catch((e) => {
  console.error("❌ Erreur :", e.message);
  process.exit(1);
});
