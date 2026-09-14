/**
 * Écrit calendar.json dans le repo via l'API Contents de GitHub plutôt
 * que "git commit && git push" — un simple push classique peut entrer
 * en conflit RÉEL (pas juste "quelqu'un a poussé, retente") quand deux
 * commits ajoutent chacun une entrée en fin de tableau JSON au même
 * moment : la ligne de la précédente dernière entrée change des deux
 * côtés (ajout d'une virgule), ce que git ne peut pas fusionner tout
 * seul — constaté en usage réel (Generate Week du 14/09, "unresolved
 * conflict" sur les 10 tentatives de git pull --rebase).
 *
 * L'API Contents évite ce problème : on relit systématiquement le
 * contenu distant le plus récent avant chaque tentative et on y ajoute
 * nos nouvelles entrées, sans jamais dépendre d'une fusion ligne à ligne.
 *
 * Env requis (fournis automatiquement par GitHub Actions) : GH_TOKEN,
 * GITHUB_REPOSITORY, GITHUB_REF_NAME. Hors GitHub Actions (exécution
 * locale), les fonctions ne font rien : le script appelant doit de
 * toute façon écrire calendar.json sur disque comme avant.
 */

function apiUrl(relPath) {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) return null;
  return `https://api.github.com/repos/${repository}/contents/${relPath}`;
}

function authHeaders() {
  return { Authorization: `Bearer ${process.env.GH_TOKEN}`, "User-Agent": "subpilot-generate" };
}

/**
 * Ajoute newEntries à la fin de calendar.json sur GitHub, en relisant le
 * fichier distant à chaque tentative (jamais un overwrite du contenu
 * local qui perdrait des entrées ajoutées entre-temps par un autre run).
 * Ne fait rien (retourne false) hors GitHub Actions.
 */
async function appendToCalendar(newEntries, message) {
  const url = apiUrl("calendar.json");
  if (!url || !newEntries.length) return false;
  const branch = process.env.GITHUB_REF_NAME;

  for (let attempt = 1; attempt <= 10; attempt++) {
    const getRes = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, { headers: authHeaders() });
    if (!getRes.ok) throw new Error(`GitHub Contents API (lecture calendar.json) : HTTP ${getRes.status}`);
    const data = await getRes.json();
    const remote = JSON.parse(Buffer.from(data.content, "base64").toString("utf8"));
    const updated = [...remote, ...newEntries];
    const content = Buffer.from(JSON.stringify(updated, null, 2) + "\n").toString("base64");

    const putRes = await fetch(url, {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ message, content, sha: data.sha, branch }),
    });
    if (putRes.ok) return true;
    if (putRes.status !== 409 && putRes.status !== 422) {
      throw new Error(`GitHub Contents API (écriture calendar.json) : HTTP ${putRes.status} ${await putRes.text()}`);
    }
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  throw new Error("Impossible d'enregistrer calendar.json après plusieurs tentatives (conflits répétés).");
}

module.exports = { appendToCalendar };
