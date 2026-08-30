/**
 * Generate Image — génère une image via l'API OpenAI (gpt-image-1, le
 * modèle d'image actuel derrière ChatGPT) et l'enregistre dans le repo
 * (feed/ ou stories/), prête à être référencée dans calendar.json.
 *
 * Deux modes :
 * - Génération pure (texte -> image) via /v1/images/generations.
 * - Édition/composition (screenshot réel de SubPilot -> image) via
 *   /v1/images/edits, quand on veut montrer l'interface réelle de l'app
 *   (mockup, feature spotlight...) sans jamais halluciner une fausse UI.
 *
 * Exporte generateAndSaveImage() pour être réutilisé par
 * scripts/generate-posts.js (génération en lot).
 *
 * En CLI, déclenchement MANUEL uniquement. Ne modifie JAMAIS calendar.json.
 * Ne génère pas de vidéo : un reel a besoin d'un vrai fichier vidéo,
 * à ajouter manuellement (voir README).
 *
 * Env requis (CLI) : OPENAI_API_KEY, PROMPT
 * Env optionnels : IMAGE_TYPE (feed|story, défaut feed),
 *                   QUALITY (low|medium|high|auto, défaut auto),
 *                   OUTPUT_NAME (nom de fichier sans extension),
 *                   SCREENSHOT (voir SCREENSHOTS ci-dessous, pour composer
 *                   une vraie capture d'écran SubPilot dans le visuel)
 */

const fs = require("fs");
const path = require("path");

const GENERATIONS_URL = "https://api.openai.com/v1/images/generations";
const EDITS_URL = "https://api.openai.com/v1/images/edits";
const SIZES = { feed: "1024x1024", story: "1024x1536" };
const FOLDERS = { feed: "feed", story: "stories" };

// Vraies captures d'écran SubPilot disponibles, pour composer des visuels
// (mockup, feature spotlight...) sans jamais inventer d'interface.
const SCREENSHOTS = {
  "tableau-de-bord": "stories/story-01-tableau-de-bord.jpg",
  abonnements: "stories/story-02-abonnements.jpg",
  ajouter: "stories/story-03-ajouter.jpg",
  budget: "stories/story-04-budget.jpg",
  compte: "stories/story-05-compte.jpg",
};

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function parseImageResponse(res) {
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Réponse invalide (HTTP ${res.status}).`);
  }
  if (!res.ok || data.error) {
    throw new Error(`Échec de la génération d'image : ${JSON.stringify(data.error || data)}`);
  }
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("Réponse inattendue : aucune image renvoyée.");
  return b64;
}

async function callGenerations({ apiKey, prompt, size, quality }) {
  const res = await fetch(GENERATIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size, quality, n: 1 }),
  });
  return parseImageResponse(res);
}

async function callEdits({ apiKey, prompt, size, referenceRelPath }) {
  const fileBuffer = fs.readFileSync(path.join(__dirname, "..", referenceRelPath));
  const ext = path.extname(referenceRelPath).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : "image/jpeg";

  const form = new FormData();
  form.append("model", "gpt-image-1");
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("image[]", new Blob([fileBuffer], { type: mimeType }), path.basename(referenceRelPath));

  const res = await fetch(EDITS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  return parseImageResponse(res);
}

/**
 * Génère une image et l'enregistre dans feed/ ou stories/.
 * @param {object} opts
 * @param {string} opts.screenshot - clé de SCREENSHOTS pour composer une
 *   vraie capture d'écran SubPilot dans le visuel (édition), ou absent/"NONE"
 *   pour une génération pure à partir du prompt.
 * @returns {Promise<string>} chemin relatif du fichier écrit (ex: "feed/xxx.png")
 */
async function generateAndSaveImage({ apiKey, prompt, type = "feed", quality = "auto", outputName, screenshot }) {
  if (!apiKey) throw new Error("OPENAI_API_KEY manquant.");
  if (!prompt) throw new Error("prompt manquant.");
  if (!SIZES[type]) throw new Error(`IMAGE_TYPE invalide : "${type}" (attendu : feed ou story).`);

  const size = SIZES[type];
  const referenceRelPath = screenshot && screenshot !== "NONE" ? SCREENSHOTS[screenshot] : null;
  if (screenshot && screenshot !== "NONE" && !referenceRelPath) {
    throw new Error(`SCREENSHOT invalide : "${screenshot}" (attendu : ${Object.keys(SCREENSHOTS).join(", ")} ou NONE).`);
  }

  const b64 = referenceRelPath
    ? await callEdits({ apiKey, prompt, size, referenceRelPath })
    : await callGenerations({ apiKey, prompt, size, quality });

  const folder = FOLDERS[type];
  const baseName = outputName ? slugify(outputName) : `${type}-${slugify(prompt)}-${Date.now()}`;
  const relPath = path.join(folder, `${baseName}.png`);
  fs.writeFileSync(path.join(__dirname, "..", relPath), Buffer.from(b64, "base64"));
  return relPath;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  const prompt = process.env.PROMPT;
  const type = process.env.IMAGE_TYPE || "feed";
  const quality = process.env.QUALITY || "auto";
  const screenshot = process.env.SCREENSHOT || "NONE";

  console.log(`Type : ${type} (${SIZES[type] || "?"}, qualité ${quality})`);
  console.log(`Prompt : ${prompt}`);
  if (screenshot !== "NONE") console.log(`Capture d'écran réutilisée : ${screenshot}`);

  const relPath = await generateAndSaveImage({
    apiKey,
    prompt,
    type,
    quality,
    outputName: process.env.OUTPUT_NAME,
    screenshot,
  });

  console.log("");
  console.log(`✅ Image générée : ${relPath}`);
  console.log(`   Renseigne ce chemin dans le champ "image" d'un post de calendar.json pour l'utiliser.`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error("❌ Erreur :", e.message);
    process.exit(1);
  });
}

module.exports = { generateAndSaveImage, SIZES, FOLDERS, SCREENSHOTS, slugify };
