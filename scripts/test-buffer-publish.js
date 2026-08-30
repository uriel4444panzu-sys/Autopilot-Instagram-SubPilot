/**
 * Publish Test Post — programme UN post de test réel sur Buffer, pour valider
 * tout le pipeline (auth -> media -> caption -> programmation -> id retourné)
 * avant d'activer l'automatisation sur les vrais contenus.
 *
 * ⚠️ Ce script publie réellement (programme) via l'API Buffer. Le post ira
 * sur le vrai compte Instagram connecté au moment programmé, SAUF si tu le
 * supprimes avant depuis la file d'attente Buffer.
 *
 * Ne touche JAMAIS calendar.json ni published.json : ce test est totalement
 * indépendant du calendrier réel et ne peut pas déclencher un vrai post.
 *
 * Env requis : BUFFER_API_KEY, BUFFER_INSTAGRAM_CHANNEL_ID, MEDIA_BASE, CONFIRM=yes
 * Env optionnels :
 *   TEST_POST_TYPE       feed | story | reel   (défaut: feed)
 *   TEST_MINUTES_FROM_NOW  minutes avant publication (défaut: 60)
 *   TEST_MEDIA_PATH       chemin média dans le repo (défaut selon le type)
 */

const { getPublisher } = require("../socialPublisher");

const MEDIA_BASE = process.env.MEDIA_BASE || "";
const TYPE = process.env.TEST_POST_TYPE || "feed";
const MINUTES_FROM_NOW = Number(process.env.TEST_MINUTES_FROM_NOW || "60");
const TIMEZONE = process.env.BUFFER_DEFAULT_TIMEZONE || "Europe/Paris";

const DEFAULT_MEDIA = {
  feed: "feed/feed-01-tableau-de-bord.jpg",
  story: "stories/story-01-tableau-de-bord.jpg",
  reel: null, // aucune vidéo d'exemple dans le repo -> doit être fournie via TEST_MEDIA_PATH
};

function publicUrl(rel) {
  return MEDIA_BASE.replace(/\/?$/, "/") + rel.replace(/^\/+/, "");
}

/** Formate un Date en { date, time } dans un fuseau IANA donné. */
function formatInTimezone(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = dtf.formatToParts(date).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

async function main() {
  if (process.env.CONFIRM !== "yes") {
    console.error('❌ Sécurité : lance ce script avec CONFIRM=yes pour confirmer que tu veux vraiment programmer un post de test sur Buffer.');
    process.exit(1);
  }
  if (!MEDIA_BASE) {
    console.error("❌ MEDIA_BASE est requis.");
    process.exit(1);
  }
  if (!["feed", "story", "reel"].includes(TYPE)) {
    console.error(`❌ TEST_POST_TYPE invalide : "${TYPE}" (attendu: feed, story ou reel).`);
    process.exit(1);
  }

  const mediaPath = process.env.TEST_MEDIA_PATH || DEFAULT_MEDIA[TYPE];
  if (!mediaPath) {
    console.error(`❌ Aucun média d'exemple pour le type "${TYPE}" — fournis TEST_MEDIA_PATH (ex: videos/exemple.mp4).`);
    process.exit(1);
  }

  const when = new Date(Date.now() + MINUTES_FROM_NOW * 60 * 1000);
  const { date, time } = formatInTimezone(when, TIMEZONE);

  const testPost = {
    id: `buffer-test-post-${Date.now()}`,
    type: TYPE,
    [TYPE === "reel" ? "video" : "image"]: mediaPath,
    caption: "🧪 Post de test SubPilot (intégration Buffer) — à supprimer, ne pas publier en vrai si tu le vois avant l'heure.",
    date,
    time,
    timezone: TIMEZONE,
  };

  console.log(`Type de test : ${TYPE}`);
  console.log(`Média : ${mediaPath}`);
  console.log(`Programmé pour : ${date} ${time} (${TIMEZONE}), soit dans ~${MINUTES_FROM_NOW} min.`);
  console.log("");

  const publisher = getPublisher("buffer");
  const mediaUrl = publicUrl(mediaPath);

  try {
    const result = await publisher.publishPost(testPost, { mediaUrl, dryRun: false });
    console.log("");
    console.log(`✅ Post de test programmé sur Buffer. id Buffer = ${result.id}`);
    console.log("   Vérifie-le dans Buffer (file d'attente) et supprime-le si tu ne veux pas qu'il parte réellement.");
    process.exit(0);
  } catch (error) {
    console.error("");
    console.error(`❌ Échec de la programmation du post de test : ${error.message}`);
    process.exit(1);
  }
}

main();
