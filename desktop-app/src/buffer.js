/**
 * Client Buffer minimal pour l'app de bureau — lecture/suppression des
 * posts programmés uniquement (la création/programmation reste gérée par
 * le repo via le workflow "Publier sur Instagram").
 *
 * Mutation deletePost vérifiée en conditions réelles (voir
 * scripts/delete-buffer-posts.js) : DeletePostPayload est une union
 * DeletePostSuccess { id } | VoidMutationError { message }.
 */

const API_URL = "https://api.buffer.com";

async function request(token, query, variables) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(`Buffer API : réponse invalide (HTTP ${res.status}).`);
  }
  if (!res.ok || body.errors) {
    throw new Error(`Buffer API : ${body.errors ? body.errors.map((e) => e.message).join("; ") : `HTTP ${res.status}`}`);
  }
  return body.data;
}

async function getOrganizationId(token) {
  const data = await request(
    token,
    `
    query GetOrganizations {
      account { organizations { id } }
    }
  `
  );
  const org = data?.account?.organizations?.[0];
  if (!org) throw new Error("Buffer API : aucune organisation trouvée pour ce compte.");
  return org.id;
}

async function listScheduledPosts(token, organizationId, channelId) {
  const data = await request(
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
  return nodes
    .filter((n) => n.status === "scheduled" || n.status === "buffer_queue" || n.status === "sending")
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
}

async function deletePost(token, postId) {
  const data = await request(
    token,
    `
    mutation DeletePost($input: DeletePostInput!) {
      deletePost(input: $input) {
        ... on DeletePostSuccess {
          id
        }
        ... on VoidMutationError {
          message
        }
      }
    }
  `,
    { input: { id: postId } }
  );
  const result = data.deletePost;
  if (result?.message) throw new Error(`Buffer API : ${result.message}`);
  if (!result?.id) throw new Error("Buffer API : réponse inattendue (suppression non confirmée).");
  return result.id;
}

module.exports = { getOrganizationId, listScheduledPosts, deletePost };
