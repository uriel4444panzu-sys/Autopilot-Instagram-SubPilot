/**
 * Generate Image — génère une image via l'API OpenAI (gpt-image-1, le
 * modèle d'image actuel derrière ChatGPT) et l'enregistre dans le repo
 * (feed/ ou stories/), prête à être référencée dans calendar.json.
 *
 * Déclenchement MANUEL uniquement. Ne modifie JAMAIS calendar.json :
 * à toi d'assigner ensuite le fichier généré au champ "image" d'un post.
 *
 * Ne génère pas de vidéo : un reel a besoin d'un vrai fichier vidéo,
 * à ajouter manuellement (voir README).
 *
 * Env requis : OPENAI_API_KEY, PROMPT
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

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  const prompt = process.env.PROMPT;
  const type = process.env.IMAGE_TYPE || "feed";
  const quality = process.env.QUALITY || "auto";

  if (!apiKey) {
    console.error("❌ OPENAI_API_KEY manquant.");
    process.exit(1);
  }
  if (!prompt) {
    console.error("❌ PROMPT manquant.");
    process.exit(1);
  }
  if (!SIZES[type]) {
    console.error(`❌ IMAGE_TYPE invalide : "${type}" (attendu : feed ou story).`);
    process.exit(1);
  }

  console.log(`Type : ${type} (${SIZES[type]}, qualité ${quality})`);
  console.log(`Prompt : ${prompt}`);

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
    console.error(`❌ Réponse invalide (HTTP ${res.status}).`);
    process.exit(1);
  }

  if (!res.ok || data.error) {
    console.error(`❌ Échec de la génération : ${JSON.stringify(data.error || data)}`);
    process.exit(1);
  }

  const b64 = data.data?.[0]?.b64_json;
  if (!b64) {
    console.error("❌ Réponse inattendue : aucune image renvoyée.");
    process.exit(1);
  }

  const folder = FOLDERS[type];
  const baseName = process.env.OUTPUT_NAME ? slugify(process.env.OUTPUT_NAME) : `${type}-${slugify(prompt)}-${Date.now()}`;
  const relPath = path.join(folder, `${baseName}.png`);
  fs.writeFileSync(path.join(__dirname, "..", relPath), Buffer.from(b64, "base64"));

  console.log("");
  console.log(`✅ Image générée : ${relPath}`);
  console.log(`   Renseigne ce chemin dans le champ "image" d'un post de calendar.json pour l'utiliser.`);
}

main().catch((e) => {
  console.error("❌ Erreur inattendue :", e.message);
  process.exit(1);
});
