/**
 * Generate Image — génère une image via l'API OpenAI (gpt-image-1, le
 * modèle d'image actuel derrière ChatGPT) et l'enregistre dans le repo
 * (feed/ ou stories/), prête à être référencée dans calendar.json.
 *
 * Exporte aussi generateAndSaveImage() pour être réutilisé par
 * scripts/generate-posts.js (génération en lot).
 *
 * En CLI, déclenchement MANUEL uniquement. Ne modifie JAMAIS calendar.json.
 * Ne génère pas de vidéo : un reel a besoin d'un vrai fichier vidéo,
 * à ajouter manuellement (voir README).
 *
 * Env requis (CLI) : OPENAI_API_KEY, PROMPT
 * Env optionnels : IMAGE_TYPE (feed|story, défaut feed),
 *                   QUALITY (low|medium|high|auto, défaut auto),
 *                   OUTPUT_NAME (nom de fichier sans extension)
 */

const fs = require("fs");
const path = require("path");

const API_URL = "https://api.openai.com/v1/images/generations";
const SIZES = { feed: "1024x1024", story: "1024x1536" };
const FOLDERS = { feed: "feed", story: "stories" };

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Génère une image et l'enregistre dans feed/ ou stories/.
 * @returns {Promise<string>} chemin relatif du fichier écrit (ex: "feed/xxx.png")
 */
async function generateAndSaveImage({ apiKey, prompt, type = "feed", quality = "auto", outputName }) {
  if (!apiKey) throw new Error("OPENAI_API_KEY manquant.");
  if (!prompt) throw new Error("prompt manquant.");
  if (!SIZES[type]) throw new Error(`IMAGE_TYPE invalide : "${type}" (attendu : feed ou story).`);

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: SIZES[type],
      quality,
      n: 1,
    }),
  });

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

  console.log(`Type : ${type} (${SIZES[type] || "?"}, qualité ${quality})`);
  console.log(`Prompt : ${prompt}`);

  const relPath = await generateAndSaveImage({ apiKey, prompt, type, quality, outputName: process.env.OUTPUT_NAME });

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

module.exports = { generateAndSaveImage, SIZES, FOLDERS, slugify };
