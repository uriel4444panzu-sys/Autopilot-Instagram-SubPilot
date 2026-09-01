/**
 * Generate Single — génère UN SEUL post (caption + hashtags + image) pour
 * une date et un type précis, et l'ajoute à calendar.json en BROUILLON
 * (status: "draft"). Utile pour remplacer un post supprimé/rejeté sans
 * regénérer tout un lot.
 *
 * Direction créative complète : voir scripts/lib/brand.js.
 *
 * Déclenchement MANUEL uniquement.
 *
 * Env requis : OPENAI_API_KEY, DATE (YYYY-MM-DD), TYPE (feed|story|reel)
 * Env optionnels : REEL_VIDEO (requis si TYPE=reel, chemin du fichier
 *                   vidéo déjà présent dans le repo),
 *                   IMAGE_QUALITY (low|medium|high|auto, défaut auto),
 *                   OPENAI_TEXT_MODEL (défaut "gpt-5.6")
 */

const fs = require("fs");
const path = require("path");
const { generateAndSaveImage, slugify } = require("./generate-image.js");
const { generatePostsBatch, buildHistory, checkStoryText } = require("./lib/brand.js");

const DIR = path.join(__dirname, "..");

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
  } catch {
    return fallback;
  }
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  const date = process.env.DATE;
  const type = process.env.TYPE || "feed";
  const reelVideo = process.env.REEL_VIDEO || null;
  const quality = process.env.IMAGE_QUALITY || "auto";
  const model = process.env.OPENAI_TEXT_MODEL || "gpt-5.6";

  if (!apiKey) {
    console.error("❌ OPENAI_API_KEY manquant.");
    process.exit(1);
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error(`❌ DATE invalide : "${date}" (attendu : YYYY-MM-DD).`);
    process.exit(1);
  }
  if (!["feed", "story", "reel"].includes(type)) {
    console.error(`❌ TYPE invalide : "${type}" (attendu : feed, story ou reel).`);
    process.exit(1);
  }
  if (type === "reel" && !reelVideo) {
    console.error("❌ REEL_VIDEO manquant pour un post de type reel.");
    process.exit(1);
  }

  const calendar = readJson("calendar.json", []);
  const history = buildHistory(calendar);

  const input = `Génère exactement 1 post Instagram de type "${type}" pour SubPilot, prévu pour le ${date}.
${type === "reel" ? "La vidéo est déjà fournie : concentre-toi sur un hook/caption/hashtags cohérents avec un contenu vidéo court et dynamique ; le champ image_prompt/screenshot sera ignoré." : ""}

Posts déjà publiés ou générés précédemment (hook / archétype — à ne pas répéter) :
${history.length ? history.map((h) => `- ${h}`).join("\n") : "(aucun pour l'instant)"}`;

  console.log(`Génération d'un post "${type}" pour le ${date} via ${model}...`);
  const [post] = await generatePostsBatch({ apiKey, model, input, count: 1 });

  console.log(`Hook : ${post.hook}`);

  const warnings = checkStoryText([{ type, visual_text: post.visual_text }]);
  if (warnings.length) {
    console.log("\n⚠️  Avertissement (pas bloquant, à vérifier toi-même) :");
    warnings.forEach((w) => console.log(`   - ${w}`));
  }

  let mediaField;
  if (type === "reel") {
    console.log(`Vidéo fournie : ${reelVideo}`);
    mediaField = { video: reelVideo };
  } else {
    console.log(`Image prompt : ${post.image_prompt}`);
    if (post.screenshot && post.screenshot !== "NONE") console.log(`Capture d'écran utilisée : ${post.screenshot}`);
    const imagePath = await generateAndSaveImage({
      apiKey,
      prompt: post.image_prompt,
      type,
      quality,
      screenshot: post.screenshot,
    });
    console.log(`✅ Image : ${imagePath}`);
    mediaField = { image: imagePath };
  }

  const hashtags = (post.hashtags || []).map((h) => `#${String(h).replace(/^#/, "")}`).join(" ");
  const ctaLine = post.cta && post.cta !== "NONE" ? `\n\n${post.cta}` : "";
  const caption = `${post.caption.trim()}${ctaLine}\n\n${hashtags}`;
  const id = `draft-${slugify(post.hook)}-${Date.now()}`;

  const draft = {
    id,
    date,
    type,
    ...mediaField,
    caption,
    hook: post.hook,
    archetype: post.archetype || null,
    status: "draft",
  };

  fs.writeFileSync(path.join(DIR, "calendar.json"), JSON.stringify([...calendar, draft], null, 2) + "\n");

  console.log("\n──────────────────────────────────────────");
  console.log(`✅ Brouillon ajouté pour le ${date} : ${id}`);
}

main().catch((e) => {
  console.error("❌ Erreur :", e.message);
  process.exit(1);
});
