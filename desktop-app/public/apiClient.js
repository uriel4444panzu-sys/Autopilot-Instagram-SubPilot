/**
 * Client fetch vers le serveur local (server.js) — même interface que
 * l'ancienne version Electron (window.api.*) pour garder app.js quasi
 * identique.
 */

async function request(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Erreur HTTP ${res.status}`);
  return data;
}

window.api = {
  getConfig: () => request("GET", "/api/config"),
  saveConfig: (payload) => request("POST", "/api/config", payload),
  testConnection: () => request("GET", "/api/config/test"),

  dispatchWorkflow: (kind, inputs) => request("POST", `/api/workflow/${kind}/dispatch`, { inputs }),
  workflowStatus: (kind) => request("GET", `/api/workflow/${kind}/status`),

  listDrafts: () => request("GET", "/api/drafts"),
  updateDraft: (id, changes) => request("PATCH", `/api/drafts/${encodeURIComponent(id)}`, { changes }),
  deleteDraft: (id) => request("DELETE", `/api/drafts/${encodeURIComponent(id)}`),

  listVideos: () => request("GET", "/api/videos"),
  uploadVideoFile: (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
      reader.onload = async () => {
        try {
          const base64 = reader.result.split(",")[1];
          const res = await request("POST", "/api/videos", { name: file.name, base64 });
          resolve(res);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsDataURL(file);
    }),
};
