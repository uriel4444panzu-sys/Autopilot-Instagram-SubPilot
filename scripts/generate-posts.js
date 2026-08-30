/**
 * Generate Posts — génère un LOT de posts complets (archétype, concept,
 * hook, prompt image, caption, hashtags) via l'API OpenAI, et les ajoute
 * à calendar.json en BROUILLON (status: "draft"). Rien n'est jamais
 * publié à partir d'un brouillon : publish.js ignore tout post dont le
 * status n'est ni absent ni "approved".
 *
 * Direction créative : feed varié façon vraie équipe créative (mockups
 * produit, situations humoristiques, métaphores 3D, feature spotlight,
 * infographies, avant/après, lifestyle...), jamais deux fois le même
 * archétype/cadrage/décor/hook d'affilée, personnages variés, interface
 * SubPilot toujours fidèle (vraies captures d'écran, jamais inventée).
 * Voir BRAND_INSTRUCTIONS ci-dessous pour le détail complet.
 *
 * Pour faire partir un brouillon, éditer calendar.json à la main :
 * fixer une vraie "date" et retirer le champ "status" (ou le passer à
 * "approved").
 *
 * Déclenchement MANUEL uniquement. Utilise le même compte/clé OpenAI que
 * la génération d'image (scripts/generate-image.js).
 *
 * Env requis : OPENAI_API_KEY
 * Env optionnels : COUNT (nombre de posts, défaut 7),
 *                   POST_TYPE (feed|story, défaut feed),
 *                   IMAGE_QUALITY (low|medium|high|auto, défaut auto),
 *                   OPENAI_TEXT_MODEL (défaut "gpt-5.6")
 */

const fs = require("fs");
const path = require("path");
const { generateAndSaveImage, slugify, SCREENSHOTS } = require("./generate-image.js");

const DIR = path.join(__dirname, "..");
const RESPONSES_URL = "https://api.openai.com/v1/responses";

const ARCHETYPES = {
  A: "Mockup produit premium (smartphone 3D, environnement premium, interface SubPilot réelle mise en valeur)",
  B: "Situation humoristique (situation quotidienne drôle liée aux abonnements)",
  C: "Meme / réaction (concept simple, immédiatement compréhensible et partageable)",
  D: "Métaphore 3D (argent aspiré, portefeuille vidé, abonnements empilés, carte bancaire submergée, calendrier rempli...)",
  E: "Feature spotlight (une fonctionnalité précise de SubPilot mise en avant, avec la vraie interface)",
  F: "Infographie (un chiffre, une statistique ou une idée financière présentée visuellement)",
  G: "Avant / après (avant SubPilot = désorganisation, après SubPilot = visibilité et contrôle)",
  H: "Lifestyle (une personne réelle dans une situation crédible)",
  I: "Concept créatif (composition artistique ou symbolique liée aux abonnements/à l'argent/au budget)",
  J: "Product in context (téléphone ou interface SubPilot intégré dans une scène : bureau, table, setup, chambre, café...)",
};

const SCREENSHOT_KEYS = Object.keys(SCREENSHOTS);

const BRAND_INSTRUCTIONS = `Tu es le directeur créatif et community manager de SubPilot, une
application (iPhone, Android, Web) qui centralise les abonnements,
visualise leur coût mensuel, aide à suivre son budget, anticipe les
prochaines échéances et facilite leur gestion (détection automatique
depuis un e-mail, alerte avant prélèvement, résiliation en un clic,
ajout en 10 secondes, rappels de renouvellement).

Ton travail n'est PAS de produire des images marketing génériques. Tu
dois créer un feed Instagram qui donne l'impression qu'une vraie équipe
créative gère la marque : varié, moderne, drôle par moments, premium
quand nécessaire, informatif lorsque pertinent.

À éviter absolument comme style dominant du lot : une personne qui
regarde/tient/montre simplement son téléphone en souriant. Ce style
générique ne doit représenter qu'une petite partie du contenu.

ARCHÉTYPES DISPONIBLES (choisis-en UN par post) :
${Object.entries(ARCHETYPES)
  .map(([k, v]) => `${k} — ${v}`)
  .join("\n")}

RÈGLES DE DIVERSITÉ DU LOT (les proportions ci-dessous sont données pour
un lot de 7 ; adapte-les proportionnellement pour une autre taille) :
- pas plus de 2 posts sur 7 montrant une personne ;
- au moins 1 mockup produit (A) ;
- au moins 1 situation humoristique (B ou C) ;
- au moins 1 visuel 3D/conceptuel (D ou I) ;
- au moins 1 contenu centré sur une fonctionnalité SubPilot (E) ;
- au moins 1 contenu éducatif ou financier (F) ;
- ne jamais utiliser le même archétype deux fois de suite ;
- ne jamais répéter, d'un post à l'autre du lot : le cadrage, la
  composition, le décor, le hook, l'idée, la couleur dominante, le type
  de personnage.
Le feed doit sembler avoir été créé sur plusieurs jours par un vrai
community manager, pas généré en une seule fois avec un seul moule.

PERSONNAGES : quand un personnage est nécessaire, varie réellement homme
et femme, coiffures, styles vestimentaires, lieux (appartement,
extérieur, bureau, université), cadrages, expressions, situations. Ne
jamais utiliser systématiquement un jeune souriant qui regarde son
smartphone. Le personnage doit avoir une raison narrative d'être là.

STYLE VISUEL SUBPILOT : direction générale moderne, fintech, premium,
technologie, dark mode, bleu/cyan/violet, légers effets néon, éléments 3D
élégants, profondeur, éclairage premium — mais chaque image ne doit PAS
être identique aux autres : certaines très sombres, d'autres lumineuses,
certaines minimalistes, certaines humoristiques, certaines très 3D,
certaines très réalistes. Le tout doit rester dans le même univers
SubPilot malgré la variété.

INTERFACE SUBPILOT — RÈGLE STRICTE : quand un post doit montrer
l'application (archétypes A, E, J notamment), tu DOIS utiliser une vraie
capture d'écran SubPilot existante en la référençant dans le champ
"screenshot" (valeurs possibles : ${SCREENSHOT_KEYS.join(", ")}) plutôt
que d'inventer une interface. Ne jamais halluciner de fonctionnalités,
chiffres, textes ou boutons qui n'existent pas. Décris dans image_prompt
comment cette capture d'écran doit être intégrée (smartphone 3D, mockup,
écran flottant, ordinateur, composition publicitaire) ; le screenshot
sera composé automatiquement dans l'image, ne le redécris pas pixel par
pixel. Si le post ne montre pas l'app, mets "screenshot": "NONE".

TEXTE DANS LE VISUEL : privilégie des accroches extrêmement courtes
(ex: "71 € par mois. Vraiment ?", "Tu paies encore ça ?", "Tout au même
endroit.", "Où part ton argent ?", "7 apps. Ou une seule.", "Tes
abonnements sous contrôle."). Ne transforme jamais l'image en affiche
remplie de texte. Si aucun texte n'est pertinent, mets "visual_text":
"NONE".

TON : alterne humour, frustration relatable, pédagogie, premium,
démonstration produit, curiosité, comparaison, problème→solution.
SubPilot ne doit pas constamment parler comme une publicité : certains
contenus doivent d'abord divertir ou intriguer, puis faire apparaître
naturellement la marque. La caption doit sonner naturelle, pas comme un
gabarit répété (n'utilise pas la même structure hook/bénéfice/CTA à
chaque fois). Le champ "caption" ne contient JAMAIS de hashtags (fournis
à part dans "hashtags", 8 à 12, français, sans #, cohérents avec le post).

AVANT DE VALIDER UN CONCEPT, pose-toi la question : « Si cette image
apparaissait juste à côté des posts précédents sur le profil Instagram,
donnerait-elle réellement l'impression d'être une nouvelle idée ? » Si
non, change de concept. Les posts déjà publiés/générés sont listés
ci-dessous : ne répète jamais leurs hooks, angles ou archétypes.`;

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
              archetype: { type: "string", enum: Object.keys(ARCHETYPES) },
              objective: { type: "string", enum: ["notoriete", "engagement", "conversion", "education", "produit"] },
              concept: { type: "string", description: "2-3 phrases décrivant le concept" },
              hook: { type: "string" },
              image_prompt: { type: "string", description: "prompt extrêmement précis pour la génération d'image" },
              visual_text: { type: "string", description: "texte très court sur le visuel, ou 'NONE'" },
              screenshot: { type: "string", enum: [...SCREENSHOT_KEYS, "NONE"] },
              caption: { type: "string" },
              cta: { type: "string", description: "call-to-action, ou 'NONE'" },
              hashtags: { type: "array", items: { type: "string" } },
              has_person: { type: "boolean", description: "true si un personnage humain apparaît dans le visuel" },
            },
            required: [
              "archetype",
              "objective",
              "concept",
              "hook",
              "image_prompt",
              "visual_text",
              "screenshot",
              "caption",
              "cta",
              "hashtags",
              "has_person",
            ],
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

async function generatePostsDraft({ apiKey, count, type, model, history }) {
  const userInput = `Génère exactement ${count} posts Instagram de type "${type}" pour SubPilot.

Posts déjà publiés ou générés précédemment (hook / archétype — à ne pas répéter) :
${history.length ? history.map((h) => `- ${h}`).join("\n") : "(aucun pour l'instant)"}`;

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

/** Validation "best effort" des règles de diversité — avertit sans bloquer. */
function checkDiversity(posts, count) {
  const warnings = [];
  for (let i = 1; i < posts.length; i++) {
    if (posts[i].archetype === posts[i - 1].archetype) {
      warnings.push(`Posts ${i} et ${i + 1} utilisent le même archétype (${posts[i].archetype}) à la suite.`);
    }
  }
  const maxPersons = Math.max(1, Math.round((count * 2) / 7));
  const personCount = posts.filter((p) => p.has_person).length;
  if (personCount > maxPersons) {
    warnings.push(`${personCount} posts montrent une personne (recommandé : ${maxPersons} max pour un lot de ${count}).`);
  }
  return warnings;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  const count = Number(process.env.COUNT || "7");
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
  const history = calendar
    .map((p) => {
      const hook = p.hook || (p.caption || "").split("\n")[0];
      return p.archetype ? `${hook} [archétype ${p.archetype}]` : hook;
    })
    .filter(Boolean)
    .slice(-60);

  console.log(`Génération de ${count} post(s) "${type}" via ${model}...`);
  const posts = await generatePostsDraft({ apiKey, count, type, model, history });

  const warnings = checkDiversity(posts, count);
  if (warnings.length) {
    console.log("\n⚠️  Avertissements diversité (pas bloquant, à vérifier toi-même) :");
    warnings.forEach((w) => console.log(`   - ${w}`));
  }

  const drafts = [];
  for (const [i, post] of posts.entries()) {
    console.log(`\n[${i + 1}/${posts.length}] Archétype ${post.archetype} — ${post.hook}`);
    console.log(`  Concept : ${post.concept}`);
    console.log(`  Image prompt : ${post.image_prompt}`);
    if (post.screenshot && post.screenshot !== "NONE") console.log(`  Capture d'écran utilisée : ${post.screenshot}`);

    const imagePath = await generateAndSaveImage({
      apiKey,
      prompt: post.image_prompt,
      type,
      quality,
      screenshot: post.screenshot,
    });
    console.log(`  ✅ Image : ${imagePath}`);

    const hashtags = (post.hashtags || []).map((h) => `#${String(h).replace(/^#/, "")}`).join(" ");
    const ctaLine = post.cta && post.cta !== "NONE" ? `\n\n${post.cta}` : "";
    const caption = `${post.caption.trim()}${ctaLine}\n\n${hashtags}`;
    const id = `draft-${slugify(post.hook)}-${Date.now()}-${i}`;

    drafts.push({
      id,
      date: null,
      type,
      image: imagePath,
      caption,
      hook: post.hook,
      archetype: post.archetype,
      concept: post.concept,
      status: "draft",
    });
  }

  fs.writeFileSync(path.join(DIR, "calendar.json"), JSON.stringify([...calendar, ...drafts], null, 2) + "\n");

  console.log("\n──────────────────────────────────────────");
  console.log(`✅ ${drafts.length} brouillon(s) ajouté(s) à calendar.json (status: "draft").`);
  console.log("   Ils ne partiront JAMAIS en publication tant que tu n'auras pas, pour chacun :");
  console.log('   - fixé une vraie "date" ;');
  console.log('   - retiré le champ "status" (ou mis "approved").');
  for (const d of drafts) console.log(`   - ${d.id} [${d.archetype}] (${d.image})`);
}

main().catch((e) => {
  console.error("❌ Erreur :", e.message);
  process.exit(1);
});
