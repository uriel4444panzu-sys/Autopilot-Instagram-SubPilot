/**
 * Direction créative SubPilot — partagée entre generate-posts.js (lot
 * personnalisé) et generate-week.js (rythme hebdomadaire par défaut).
 *
 * Modifier ce fichier change le style de TOUTE génération de contenu.
 */

const { SCREENSHOTS } = require("../generate-image.js");

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

À éviter absolument comme style dominant : une personne qui
regarde/tient/montre simplement son téléphone en souriant. Ce style
générique ne doit représenter qu'une petite partie du contenu.

ARCHÉTYPES DISPONIBLES (choisis-en UN par post) :
${Object.entries(ARCHETYPES)
  .map(([k, v]) => `${k} — ${v}`)
  .join("\n")}

RÈGLES DE DIVERSITÉ (les proportions ci-dessous sont données pour 7
posts ; adapte-les proportionnellement pour un autre volume) :
- pas plus de 2 posts sur 7 montrant une personne ;
- au moins 1 mockup produit (A) ;
- au moins 1 situation humoristique (B ou C) ;
- au moins 1 visuel 3D/conceptuel (D ou I) ;
- au moins 1 contenu centré sur une fonctionnalité SubPilot (E) ;
- au moins 1 contenu éducatif ou financier (F) ;
- ne jamais utiliser le même archétype deux fois de suite ;
- ne jamais répéter, d'un post à l'autre : le cadrage, la composition,
  le décor, le hook, l'idée, la couleur dominante, le type de personnage.
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
remplie de texte.

Dès que "visual_text" n'est pas "NONE", tu DOIS le décrire explicitement
dans "image_prompt" comme du texte à afficher sur l'image (police, taille,
position, couleur/contraste) — sans cette description précise, le
générateur d'image ne saura pas qu'il faut écrire quoi que ce soit et
produira un visuel sans texte.

RÈGLE SELON LE TYPE DE CRÉNEAU : Instagram n'affiche JAMAIS la caption
sur une story (contrairement au feed, où elle apparaît juste en dessous
de l'image). Pour un créneau de type "story", "visual_text" est donc
OBLIGATOIRE (jamais "NONE") : le visuel doit se suffire à lui-même et
faire passer le message sans caption visible. Pour un créneau de type
"feed", "visual_text" reste optionnel — mets "NONE" si aucun texte n'est
pertinent, la caption étant de toute façon visible en dessous.

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
non, change de concept. Les posts déjà publiés/générés sont listés dans
l'historique fourni : ne répète jamais leurs hooks, angles ou archétypes.`;

function postItemSchema() {
  return {
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

/** Appelle l'API Responses OpenAI avec une sortie structurée { posts: [...] }. */
async function generatePostsBatch({ apiKey, model, input, count }) {
  const schema = {
    type: "json_schema",
    name: "subpilot_posts_batch",
    strict: true,
    schema: {
      type: "object",
      properties: {
        posts: { type: "array", minItems: count, maxItems: count, items: postItemSchema() },
      },
      required: ["posts"],
      additionalProperties: false,
    },
  };

  const res = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, instructions: BRAND_INSTRUCTIONS, input, text: { format: schema } }),
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

/** Historique des hooks/archétypes déjà utilisés, à donner au modèle pour éviter les répétitions. */
function buildHistory(calendar, limit = 60) {
  return calendar
    .map((p) => {
      const hook = p.hook || (p.caption || "").split("\n")[0];
      return p.archetype ? `${hook} [archétype ${p.archetype}]` : hook;
    })
    .filter(Boolean)
    .slice(-limit);
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

/**
 * Avertit (sans bloquer) si un créneau "story" se retrouve sans texte
 * visuel — Instagram n'affiche jamais la caption sur une story, donc un
 * tel post arriverait totalement muet, sans message.
 * @param {{ type: string, visual_text: string }[]} entries
 */
function checkStoryText(entries) {
  const warnings = [];
  entries.forEach((entry, i) => {
    if (entry.type === "story" && (!entry.visual_text || entry.visual_text === "NONE")) {
      warnings.push(`Créneau ${i + 1} (story) sans texte visuel : la story n'affichera aucun message (la caption n'est pas visible sur une story).`);
    }
  });
  return warnings;
}

module.exports = {
  ARCHETYPES,
  SCREENSHOT_KEYS,
  BRAND_INSTRUCTIONS,
  generatePostsBatch,
  buildHistory,
  checkDiversity,
  checkStoryText,
};
