/**
 * Generate Week — génère automatiquement le rythme de publication PAR
 * DÉFAUT : 4 posts feed + 4 stories pour la semaine à venir, répartis de
 * sorte qu'AUCUN jour ne soit vide (un jour sans post a une story, et
 * inversement).
 *
 * Avec 4+4=8 contenus sur 7 jours, un seul jour peut mathématiquement
 * cumuler les deux types. Pour que ça ne devienne pas mécanique (toujours
 * le même jour, toujours le même ordre feed/story), le jour qui cumule
 * les deux ET le type qui démarre la semaine varient d'une semaine à
 * l'autre (dérivés du numéro de semaine, donc déterministe/reproductible
 * mais pas figé).
 *
 * Reel optionnel : si REEL_DAY (0=demain..6=dans 7 jours) et REEL_VIDEO
 * (chemin du fichier vidéo déjà présent dans le repo) sont fournis, le
 * créneau de ce jour est remplacé par un reel (un reel à lui seul montre
 * déjà une forte activité, donc il remplace plutôt qu'il ne s'ajoute). Le
 * hook/caption/hashtags du reel sont générés par l'IA comme les autres ;
 * la vidéo, elle, doit être fournie (pas de génération vidéo automatique).
 *
 * Contrairement à generate-posts.js (lot personnalisé, date au choix),
 * ce script assigne directement une vraie "date" à chaque brouillon : à
 * partir de DEMAIN (jour suivant l'exécution du script), sur 7 jours —
 * jamais ancré sur un jour de semaine fixe (lundi), pour que le premier
 * contenu arrive toujours au plus tôt, quel que soit le jour où le script
 * tourne. Ils restent en status: "draft" — la validation humaine reste
 * obligatoire (changer le status en "approved", ou ajuster la date
 * proposée) avant toute publication.
 *
 * Direction créative complète : voir scripts/lib/brand.js.
 *
 * Déclenchement manuel OU automatique hebdomadaire (voir
 * .github/workflows/generate-week.yml) — dans les deux cas, cette
 * automatisation ne fait que PRÉPARER des brouillons, jamais publier.
 *
 * Env requis : OPENAI_API_KEY
 * Env optionnels : IMAGE_QUALITY (low|medium|high|auto, défaut auto),
 *                   OPENAI_TEXT_MODEL (défaut "gpt-5.6"),
 *                   REEL_DAY (0-6), REEL_VIDEO (chemin du fichier vidéo)
 */

const fs = require("fs");
const path = require("path");
const { generateAndSaveImage, slugify } = require("./generate-image.js");
const { generatePostsBatch, buildHistory, checkDiversity, checkStoryText } = require("./lib/brand.js");

const DIR = path.join(__dirname, "..");
const DAY_NAMES_BY_WEEKDAY = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Nom du jour de semaine réel (lundi..dimanche) pour une date donnée. */
function dayNameForDate(dateStr) {
  return DAY_NAMES_BY_WEEKDAY[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];
}

/** Nombre entier arbitraire mais stable dérivé d'une date, pour varier le gabarit semaine après semaine. */
function weekSeed(weekStartISO) {
  const days = Math.floor(new Date(`${weekStartISO}T00:00:00Z`).getTime() / 86400000);
  return Math.floor(days / 7);
}

/**
 * Construit les 7 jours de la semaine avec exactement 4 "feed" et 4
 * "story" au total, aucun jour vide, et un seul jour cumulant les deux —
 * ce jour et le type de départ varient selon la semaine (voir weekSeed).
 */
function buildWeekTypes(weekStartISO) {
  const seed = weekSeed(weekStartISO);
  const startWithFeed = seed % 2 === 0;

  const base = [];
  let t = startWithFeed ? "feed" : "story";
  for (let offset = 0; offset < 7; offset++) {
    base.push({ offset, type: t });
    t = t === "feed" ? "story" : "feed";
  }

  const feedDays = base.filter((d) => d.type === "feed");
  const storyDays = base.filter((d) => d.type === "story");
  const deficientType = feedDays.length < storyDays.length ? "feed" : "story";
  const candidates = deficientType === "feed" ? storyDays : feedDays;
  const chosen = candidates[seed % candidates.length];

  const days = base.map((d) => ({ offset: d.offset, types: [d.type] }));
  days.find((d) => d.offset === chosen.offset).types.push(deficientType);
  return days;
}

/** Applique un reel manuel (remplace le créneau du jour concerné). */
function applyReelOverride(days, reelDayOffset) {
  const day = days.find((d) => d.offset === reelDayOffset);
  if (!day) throw new Error(`REEL_DAY invalide : "${reelDayOffset}" (attendu : un entier de 0 à 6).`);
  day.types = ["reel"];
}

function flattenSlots(days, weekStart) {
  const slots = [];
  for (const day of days) {
    const date = addDaysISO(weekStart, day.offset);
    for (const type of day.types) {
      slots.push({ offset: day.offset, day: dayNameForDate(date), type, date });
    }
  }
  return slots;
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
  const reelDay = process.env.REEL_DAY !== undefined && process.env.REEL_DAY !== "" ? Number(process.env.REEL_DAY) : null;
  const reelVideo = process.env.REEL_VIDEO || null;

  if (!apiKey) {
    console.error("❌ OPENAI_API_KEY manquant.");
    process.exit(1);
  }
  if (reelDay !== null && !reelVideo) {
    console.error("❌ REEL_DAY fourni sans REEL_VIDEO.");
    process.exit(1);
  }
  if (reelVideo && reelDay === null) {
    console.error("❌ REEL_VIDEO fourni sans REEL_DAY.");
    process.exit(1);
  }

  const calendar = readJson("calendar.json", []);
  const weekStart = addDaysISO(todayISO(), 1); // toujours demain, jamais ancré sur un jour fixe

  const days = buildWeekTypes(weekStart);
  if (reelDay !== null) applyReelOverride(days, reelDay);
  const slots = flattenSlots(days, weekStart);
  const count = slots.length;

  const history = buildHistory(calendar);
  const slotsDescription = slots
    .map((s, i) => `${i + 1}. ${s.day} ${s.date} — type "${s.type}"`)
    .join("\n");

  const input = `Génère exactement ${count} posts Instagram pour SubPilot, un par créneau
ci-dessous, DANS LE MÊME ORDRE (le 1er post généré correspond au créneau
1, etc.). Pour un créneau de type "reel", la vidéo est déjà fournie :
concentre-toi sur un hook/caption/hashtags cohérents avec un contenu
vidéo court et dynamique ; le champ image_prompt/screenshot sera ignoré
pour ce créneau.

${slotsDescription}

Posts déjà publiés ou générés précédemment (hook / archétype — à ne pas répéter) :
${history.length ? history.map((h) => `- ${h}`).join("\n") : "(aucun pour l'instant)"}`;

  const feedCount = slots.filter((s) => s.type === "feed").length;
  const storyCount = slots.filter((s) => s.type === "story").length;
  const reelCount = slots.filter((s) => s.type === "reel").length;
  console.log(
    `Semaine du ${weekStart} — génération de ${count} contenus (${feedCount} feed + ${storyCount} stories${
      reelCount ? ` + ${reelCount} reel` : ""
    }) via ${model}...`
  );
  const posts = await generatePostsBatch({ apiKey, model, input, count });

  if (posts.length !== slots.length) {
    console.error(`❌ ${posts.length} post(s) reçu(s) au lieu de ${slots.length} attendus.`);
    process.exit(1);
  }

  const warnings = [
    ...checkDiversity(
      posts.filter((_, i) => slots[i].type !== "reel"),
      count
    ),
    ...checkStoryText(posts.map((post, i) => ({ type: slots[i].type, visual_text: post.visual_text }))),
  ];
  if (warnings.length) {
    console.log("\n⚠️  Avertissements (pas bloquant, à vérifier toi-même) :");
    warnings.forEach((w) => console.log(`   - ${w}`));
  }

  const drafts = [];
  for (const [i, post] of posts.entries()) {
    const slot = slots[i];
    console.log(`\n[${slot.day} ${slot.date}, ${slot.type}] ${post.hook}`);

    let mediaField;
    if (slot.type === "reel") {
      console.log(`  Vidéo fournie : ${reelVideo}`);
      mediaField = { video: reelVideo };
    } else {
      console.log(`  Archétype ${post.archetype} — ${post.concept}`);
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
      mediaField = { image: imagePath };
    }

    const hashtags = (post.hashtags || []).map((h) => `#${String(h).replace(/^#/, "")}`).join(" ");
    const ctaLine = post.cta && post.cta !== "NONE" ? `\n\n${post.cta}` : "";
    const caption = `${post.caption.trim()}${ctaLine}\n\n${hashtags}`;
    const id = `draft-${slot.day}-${slugify(post.hook)}-${Date.now()}-${i}`;

    drafts.push({
      id,
      date: slot.date,
      type: slot.type,
      ...mediaField,
      caption,
      hook: post.hook,
      archetype: post.archetype || null,
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
