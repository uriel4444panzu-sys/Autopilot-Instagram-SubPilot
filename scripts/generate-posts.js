/**
 * Generate Posts — génère un LOT PERSONNALISÉ de posts (nombre et type au
 * choix) via l'API OpenAI, et les ajoute à calendar.json en BROUILLON
 * (status: "draft"). Pour le rythme hebdomadaire par défaut (4 feed +
 * 4 stories, dates auto-assignées), voir scripts/generate-week.js.
 *
 * Direction créative complète : voir scripts/lib/brand.js.
 *
 * Pour faire partir un brouillon, éditer calendar.json à la main :
 * fixer une vraie "date" et retirer le champ "status" (ou le passer à
 * "approved").
 *
 * Déclenchement MANUEL uniquement.
 *
 * Env requis : OPENAI_API_KEY
 * Env optionnels : COUNT (nombre de posts, défaut 7),
 *                   POST_TYPE (feed|story, défaut feed),
 *                   IMAGE_QUALITY (low|medium|high|auto, défaut auto),
 *                   OPENAI_TEXT_MODEL (défaut "gpt-5.6")
 */

const fs = require("fs");
const path = require("path");
const { generateAndSaveImage, slugify } = require("./generate-image.js");
const { generatePostsBatch, buildHistory, checkDiversity } = require("./lib/brand.js");

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
  const history = buildHistory(calendar);

  const input = `Génère exactement ${count} posts Instagram de type "${type}" pour SubPilot.

Posts déjà publiés ou générés précédemment (hook / archétype — à ne pas répéter) :
${history.length ? history.map((h) => `- ${h}`).join("\n") : "(aucun pour l'instant)"}`;

  console.log(`Génération de ${count} post(s) "${type}" via ${model}...`);
  const posts = await generatePostsBatch({ apiKey, model, input, count });

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
