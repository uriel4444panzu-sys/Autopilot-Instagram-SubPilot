/**
 * Generate Week — génère automatiquement le rythme de publication PAR
 * DÉFAUT : 4 posts feed + 4 stories pour la semaine à venir, répartis de
 * sorte qu'AUCUN jour ne soit vide (un jour sans post a une story, et
 * inversement) :
 *
 *   lundi: feed · mardi: story · mercredi: feed · jeudi: story
 *   vendredi: feed · samedi: story · dimanche: feed + story
 *
 * Contrairement à generate-posts.js (lot personnalisé, date au choix),
 * ce script assigne directement une vraie "date" à chaque brouillon
 * (la semaine qui suit le dernier post déjà présent dans calendar.json).
 * Ils restent en status: "draft" — la validation humaine reste
 * obligatoire (changer le status en "approved") avant toute publication.
 *
 * Direction créative complète : voir scripts/lib/brand.js.
 *
 * Déclenchement manuel OU automatique hebdomadaire (voir
 * .github/workflows/generate-week.yml) — dans les deux cas, cette
 * automatisation ne fait que PRÉPARER des brouillons, jamais publier.
 *
 * Env requis : OPENAI_API_KEY
 * Env optionnels : IMAGE_QUALITY (low|medium|high|auto, défaut auto),
 *                   OPENAI_TEXT_MODEL (défaut "gpt-5.6")
 */

const fs = require("fs");
const path = require("path");
const { generateAndSaveImage, slugify } = require("./generate-image.js");
const { generatePostsBatch, buildHistory, checkDiversity } = require("./lib/brand.js");

const DIR = path.join(__dirname, "..");

// lundi(0) → dimanche(6). Dimanche a deux créneaux (feed + story) pour
// arriver à 4 feed + 4 stories sur 7 jours, sans aucun jour vide.
const WEEK_TEMPLATE = [
  { offset: 0, day: "lundi", type: "feed" },
  { offset: 1, day: "mardi", type: "story" },
  { offset: 2, day: "mercredi", type: "feed" },
  { offset: 3, day: "jeudi", type: "story" },
  { offset: 4, day: "vendredi", type: "feed" },
  { offset: 5, day: "samedi", type: "story" },
  { offset: 6, day: "dimanche", type: "feed" },
  { offset: 6, day: "dimanche", type: "story" },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Lundi suivant strictement fromDateStr (jamais le jour même). */
function nextMonday(fromDateStr) {
  const d = new Date(`${fromDateStr}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=dimanche ... 6=samedi
  const daysUntilNextMonday = ((8 - day) % 7) || 7;
  return addDaysISO(fromDateStr, daysUntilNextMonday);
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
  const quality = process.env.IMAGE_QUALITY || "auto";
  const model = process.env.OPENAI_TEXT_MODEL || "gpt-5.6";

  if (!apiKey) {
    console.error("❌ OPENAI_API_KEY manquant.");
    process.exit(1);
  }

  const calendar = readJson("calendar.json", []);
  const usedDates = calendar.map((p) => p.date).filter(Boolean).sort();
  const latestDate = usedDates.length ? usedDates[usedDates.length - 1] : todayISO();
  const weekStart = nextMonday(latestDate);

  const slots = WEEK_TEMPLATE.map((s) => ({ ...s, date: addDaysISO(weekStart, s.offset) }));
  const count = slots.length;

  const history = buildHistory(calendar);
  const slotsDescription = slots
    .map((s, i) => `${i + 1}. ${s.day} ${s.date} — type "${s.type}"`)
    .join("\n");

  const input = `Génère exactement ${count} posts Instagram pour SubPilot, un par créneau
ci-dessous, DANS LE MÊME ORDRE (le 1er post généré correspond au créneau
1, etc.) :

${slotsDescription}

Posts déjà publiés ou générés précédemment (hook / archétype — à ne pas répéter) :
${history.length ? history.map((h) => `- ${h}`).join("\n") : "(aucun pour l'instant)"}`;

  console.log(`Semaine du ${weekStart} — génération de ${count} contenus (4 feed + 4 stories) via ${model}...`);
  const posts = await generatePostsBatch({ apiKey, model, input, count });

  if (posts.length !== slots.length) {
    console.error(`❌ ${posts.length} post(s) reçu(s) au lieu de ${slots.length} attendus.`);
    process.exit(1);
  }

  const warnings = checkDiversity(posts, count);
  if (warnings.length) {
    console.log("\n⚠️  Avertissements diversité (pas bloquant, à vérifier toi-même) :");
    warnings.forEach((w) => console.log(`   - ${w}`));
  }

  const drafts = [];
  for (const [i, post] of posts.entries()) {
    const slot = slots[i];
    console.log(`\n[${slot.day} ${slot.date}, ${slot.type}] Archétype ${post.archetype} — ${post.hook}`);
    console.log(`  Concept : ${post.concept}`);
    console.log(`  Image prompt : ${post.image_prompt}`);
    if (post.screenshot && post.screenshot !== "NONE") console.log(`  Capture d'écran utilisée : ${post.screenshot}`);

    const imagePath = await generateAndSaveImage({
      apiKey,
      prompt: post.image_prompt,
      type: slot.type,
      quality,
      screenshot: post.screenshot,
    });
    console.log(`  ✅ Image : ${imagePath}`);

    const hashtags = (post.hashtags || []).map((h) => `#${String(h).replace(/^#/, "")}`).join(" ");
    const ctaLine = post.cta && post.cta !== "NONE" ? `\n\n${post.cta}` : "";
    const caption = `${post.caption.trim()}${ctaLine}\n\n${hashtags}`;
    const id = `draft-${slot.day}-${slugify(post.hook)}-${Date.now()}-${i}`;

    drafts.push({
      id,
      date: slot.date,
      type: slot.type,
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
  console.log(`✅ Semaine du ${weekStart} au ${slots[slots.length - 1].date} préparée (${drafts.length} brouillons).`);
  console.log("   Chaque brouillon a déjà sa date assignée. Il ne partira JAMAIS en");
  console.log('   publication tant que tu n\'auras pas retiré son "status" (ou mis "approved").');
  for (const d of drafts) console.log(`   - ${d.date} [${d.type}] ${d.id}`);
}

main().catch((e) => {
  console.error("❌ Erreur :", e.message);
  process.exit(1);
});
