/**
 * Generate Posts — génère un LOT de posts complets (caption + hashtags +
 * image) via l'API OpenAI, et les ajoute à calendar.json en BROUILLON
 * (status: "draft"). Rien n'est jamais publié à partir d'un brouillon :
 * publish.js ignore tout post dont le status n'est ni absent ni "approved".
 *
 * Pour faire partir un brouillon, éditer calendar.json à la main :
 * fixer une vraie "date" et retirer le champ "status" (ou le passer à
 * "approved").
 *
 * Déclenchement MANUEL uniquement. Utilise le même compte/clé OpenAI que
 * la génération d'image (scripts/generate-image.js), réutilisée ici pour
 * éviter d'avoir un deuxième compte/clé à gérer.
 *
 * Env requis : OPENAI_API_KEY
 * Env optionnels : COUNT (nombre de posts, défaut 5),
 *                   POST_TYPE (feed|story, défaut feed),
 *                   IMAGE_QUALITY (low|medium|high|auto, défaut auto),
 *                   OPENAI_TEXT_MODEL (défaut "gpt-5.6")
 */

const fs = require("fs");
const path = require("path");
const { generateAndSaveImage, slugify } = require("./generate-image.js");

const DIR = path.join(__dirname, "..");
const RESPONSES_URL = "https://api.openai.com/v1/responses";

const BRAND_INSTRUCTIONS = `Tu rédiges du contenu Instagram pour SubPilot, une application gratuite
(iPhone, Android, Web) qui aide à suivre et gérer ses abonnements.

Fonctionnalités à mettre en avant (varie l'angle d'un post à l'autre) :
détection automatique des abonnements depuis un simple e-mail, alerte
avant chaque prélèvement, résiliation en un clic, suivi du budget mensuel
et des dépassements, ajout d'un abonnement en 10 secondes, rappels de
renouvellement, vue d'ensemble de tous les abonnements au même endroit.

Ton : direct et complice, accroche en une ligne (question ou affirmation
qui interpelle, avec emoji), puis 2 à 4 lignes de bénéfice concret, puis
un appel à l'action ("lien en bio" ou une question qui invite à
commenter). Public : jeunes actifs francophones soucieux de leur budget.

Règles strictes :
- Le champ "caption" NE CONTIENT PAS de hashtags (ils sont fournis à part
  dans "hashtags").
- "hashtags" : 8 à 12 hashtags français pertinents et variés, SANS le
  caractère #, cohérents avec l'angle du post (ex: abonnements, budget,
  financespersonnelles, economies, subpilot, applimobile, resiliation,
  rappels, argent, bonsplans, suividepenses, productivite).
- "image_prompt" : décris un visuel cohérent avec l'identité SubPilot —
  soit une scène lifestyle épurée et lumineuse en lien avec l'angle du
  post (téléphone en main, budget, café, bureau...), soit un mockup
  d'écran d'app sur téléphone. AUCUN texte incrusté dans l'image (la
  légende porte déjà le message). Style photo réaliste, cohérent avec les
  autres visuels de la marque (mêmes tons chauds/neutres, lumière douce).
- Chaque post du lot doit avoir un ANGLE clairement différent des autres
  posts du lot ET des posts déjà publiés listés ci-dessous. Ne réutilise
  jamais un angle, une accroche ou une image_prompt déjà employés.`;

function buildSchema(count) {
  return {
    type: "json_schema",
    name: "subpilot_posts_batch",
    strict: true,
    schema: {
      type: "object",
      properties: {
        posts: {
          type: "array",
          minItems: count,
          maxItems: count,
          items: {
            type: "object",
            properties: {
              angle: { type: "string", description: "Angle/thème du post, court, unique dans le lot" },
              caption: { type: "string" },
              hashtags: { type: "array", items: { type: "string" } },
              image_prompt: { type: "string" },
            },
            required: ["angle", "caption", "hashtags", "image_prompt"],
            additionalProperties: false,
          },
        },
      },
      required: ["posts"],
      additionalProperties: false,
    },
  };
}

function extractOutputText(response) {
  const texts = [];
  for (const item of response.output || []) {
    if (item.type !== "message") continue;
    for (const c of item.content || []) {
      if (c.type === "output_text") texts.push(c.text);
    }
  }
  return texts.join("");
}

async function generatePostsDraft({ apiKey, count, type, model, existingAngles }) {
  const userInput = `Génère exactement ${count} posts Instagram de type "${type}" pour SubPilot.

Angles/accroches déjà utilisés dans les posts existants (ne pas répéter) :
${existingAngles.length ? existingAngles.map((a) => `- ${a}`).join("\n") : "(aucun pour l'instant)"}`;

  const res = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions: BRAND_INSTRUCTIONS,
      input: userInput,
      text: { format: buildSchema(count) },
    }),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Réponse invalide (HTTP ${res.status}).`);
  }
  if (!res.ok || data.error) {
    throw new Error(`Échec de la génération de texte : ${JSON.stringify(data.error || data)}`);
  }

  const raw = extractOutputText(data);
  if (!raw) throw new Error("Réponse inattendue : aucun texte renvoyé.");

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Réponse non-JSON reçue : ${raw.slice(0, 200)}`);
  }
  if (!Array.isArray(parsed.posts)) throw new Error("Réponse inattendue : champ 'posts' manquant.");
  return parsed.posts;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
  } catch {
    return fallback;
  }
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  const count = Number(process.env.COUNT || "5");
  const type = process.env.POST_TYPE || "feed";
  const quality = process.env.IMAGE_QUALITY || "auto";
  const model = process.env.OPENAI_TEXT_MODEL || "gpt-5.6";

  if (!apiKey) {
    console.error("❌ OPENAI_API_KEY manquant.");
    process.exit(1);
  }
  if (!["feed", "story"].includes(type)) {
    console.error(`❌ POST_TYPE invalide : "${type}" (attendu : feed ou story).`);
    process.exit(1);
  }
  if (!Number.isInteger(count) || count < 1 || count > 20) {
    console.error(`❌ COUNT invalide : "${process.env.COUNT}" (attendu : un entier entre 1 et 20).`);
    process.exit(1);
  }

  const calendar = readJson("calendar.json", []);
  const existingAngles = calendar
    .map((p) => p.angle || (p.caption || "").split("\n")[0])
    .filter(Boolean)
    .slice(-40);

  console.log(`Génération de ${count} post(s) "${type}" via ${model}...`);
  const posts = await generatePostsDraft({ apiKey, count, type, model, existingAngles });

  const drafts = [];
  for (const [i, post] of posts.entries()) {
    console.log(`\n[${i + 1}/${posts.length}] Angle : ${post.angle}`);
    console.log(`  Image prompt : ${post.image_prompt}`);

    const imagePath = await generateAndSaveImage({
      apiKey,
      prompt: post.image_prompt,
      type,
      quality,
    });
    console.log(`  ✅ Image : ${imagePath}`);

    const hashtags = (post.hashtags || []).map((h) => `#${String(h).replace(/^#/, "")}`).join(" ");
    const caption = `${post.caption.trim()}\n\n${hashtags}`;
    const id = `draft-${slugify(post.angle)}-${Date.now()}-${i}`;

    drafts.push({
      id,
      date: null,
      type,
      image: imagePath,
      caption,
      angle: post.angle,
      status: "draft",
    });
  }

  fs.writeFileSync(path.join(DIR, "calendar.json"), JSON.stringify([...calendar, ...drafts], null, 2) + "\n");

  console.log("\n──────────────────────────────────────────");
  console.log(`✅ ${drafts.length} brouillon(s) ajouté(s) à calendar.json (status: "draft").`);
  console.log("   Ils ne partiront JAMAIS en publication tant que tu n'auras pas, pour chacun :");
  console.log('   - fixé une vraie "date" ;');
  console.log('   - retiré le champ "status" (ou mis "approved").');
  for (const d of drafts) console.log(`   - ${d.id} (${d.image})`);
}

main().catch((e) => {
  console.error("❌ Erreur :", e.message);
  process.exit(1);
});
