/**
 * Test Buffer Connection — vérifie l'authentification Buffer et affiche les
 * channels disponibles (dont l'Instagram de SubPilot), SANS rien publier.
 *
 * Usage :
 *   BUFFER_API_KEY=xxx node scripts/test-buffer-connection.js
 *   (BUFFER_INSTAGRAM_CHANNEL_ID optionnel : si absent, ce script affiche
 *   juste la liste des channels pour que tu puisses repérer celui à utiliser.)
 */

const buffer = require("../providers/bufferPublisher");

async function main() {
  const result = await buffer.testConnection();

  if (result.channels?.length) {
    console.log("Channels Buffer disponibles :");
    for (const c of result.channels) {
      const marker = c.id === process.env.BUFFER_INSTAGRAM_CHANNEL_ID ? "  <- BUFFER_INSTAGRAM_CHANNEL_ID actuel" : "";
      console.log(`  - id=${c.id}  service=${c.service}  name="${c.name}"${c.isDisconnected ? " (déconnecté)" : ""}${marker}`);
    }
    console.log("");
  }

  if (result.ok) {
    console.log(`✅ Connexion Buffer OK — channel Instagram trouvé : "${result.channel.name}" (id=${result.channel.id}).`);
    process.exit(0);
  }

  console.error(`❌ Connexion Buffer incomplète : ${result.error}`);
  if (!process.env.BUFFER_INSTAGRAM_CHANNEL_ID && result.channels?.length) {
    console.error("   -> repère le channel avec service=instagram dans la liste ci-dessus,");
    console.error("      puis renseigne son id dans le secret BUFFER_INSTAGRAM_CHANNEL_ID.");
  }
  process.exit(1);
}

main().catch((e) => {
  console.error("❌ Erreur inattendue :", e.message);
  process.exit(1);
});
