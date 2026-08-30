/**
 * Provider Buffer (nouveau provider par défaut).
 *
 * ⚠️ Squelette pour l'instant : l'implémentation réelle (auth, endpoints,
 * programmation Instagram) sera faite à l'étape 3, après vérification de la
 * documentation officielle Buffer actuelle (pour ne pas deviner des noms
 * d'endpoints/paramètres obsolètes).
 *
 * Tant que ce n'est pas fait, appeler publishPost() lève une erreur claire
 * au lieu d'échouer silencieusement ou de publier n'importe où.
 */

async function publishPost() {
  throw new Error(
    "bufferPublisher: intégration pas encore implémentée (étape 3 à venir). " +
      "Utilise PUBLISHER=meta en attendant, ou configure Buffer puis relance."
  );
}

async function testConnection() {
  return { ok: false, error: "bufferPublisher: intégration pas encore implémentée (étape 3 à venir)." };
}

module.exports = { name: "buffer", publishPost, testConnection };
