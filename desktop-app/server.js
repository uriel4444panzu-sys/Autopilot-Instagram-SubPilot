/**
 * SubPilot Control Room — serveur local (sans dépendance externe).
 *
 * Remplace la version Electron initiale : Windows "Smart App Control"
 * bloque tout exécutable non signé (y compris electron.exe reconditionné),
 * sans possibilité de l'autoriser manuellement. En servant une simple
 * page web locale, le seul programme exécuté est node.exe (déjà installé
 * et utilisé) — l'interface s'ouvre dans le navigateur habituel.
 *
 * Lancement : node server.js (voir "Lancer SubPilot Control Room.bat").
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { exec } = require("child_process");
const github = require("./src/github");

const PORT = process.env.PORT || 5177;
const PUBLIC_DIR = path.join(__dirname, "public");
const CONFIG_DIR = path.join(os.homedir(), ".subpilot-control-room");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const KEY_PATH = path.join(CONFIG_DIR, "key.bin");
const MAX_BODY = 130 * 1024 * 1024; // ~90 Mo de vidéo en base64
const DEFAULT_OWNER = "uriel4444panzu-sys";
const DEFAULT_REPO = "Autopilot-Instagram-SubPilot";
const DEFAULT_BRANCH = "main";

const WORKFLOWS = {
  week: "generate-week.yml",
  posts: "generate-posts.yml",
  image: "generate-image.yml",
};

// ── Stockage local (chiffrement léger, voir README : protection contre
// une lecture accidentelle du fichier, pas un vrai coffre-fort) ────────

function getOrCreateKey() {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  if (fs.existsSync(KEY_PATH)) return fs.readFileSync(KEY_PATH);
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_PATH, key, { mode: 0o600 });
  return key;
}

function encrypt(text) {
  const key = getOrCreateKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

function decrypt(b64) {
  const key = getOrCreateKey();
  const buf = Buffer.from(b64, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    if (raw.tokenEncrypted) raw.token = decrypt(raw.tokenEncrypted);
    return raw;
  } catch {
    return { owner: DEFAULT_OWNER, repo: DEFAULT_REPO, branch: DEFAULT_BRANCH };
  }
}

function saveConfig({ token, owner, repo, branch }) {
  const current = loadConfig();
  const next = {
    owner: owner || current.owner || DEFAULT_OWNER,
    repo: repo || current.repo || DEFAULT_REPO,
    branch: branch || current.branch || DEFAULT_BRANCH,
  };
  if (token) next.tokenEncrypted = encrypt(token);
  else if (current.tokenEncrypted) next.tokenEncrypted = current.tokenEncrypted;
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}

function requireConfig() {
  const cfg = loadConfig();
  if (!cfg.token) throw new Error("Aucun jeton GitHub configuré. Va dans Réglages.");
  return cfg;
}

// ── Utilitaires HTTP ─────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("Fichier trop volumineux."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  return JSON.parse(buf.toString("utf8"));
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

function serveStatic(req, res, pathname) {
  const rel = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404).end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

// ── Routes API ───────────────────────────────────────────────────────

const routes = [];
function route(method, pattern, handler) {
  routes.push({ method, pattern, handler });
}
function matchRoute(method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const parts = r.pattern.split("/").filter(Boolean);
    const actual = pathname.split("/").filter(Boolean);
    if (parts.length !== actual.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(":")) params[parts[i].slice(1)] = decodeURIComponent(actual[i]);
      else if (parts[i] !== actual[i]) ok = false;
    }
    if (ok) return { handler: r.handler, params };
  }
  return null;
}

route("GET", "/api/config", async () => {
  const cfg = loadConfig();
  return { owner: cfg.owner || DEFAULT_OWNER, repo: cfg.repo || DEFAULT_REPO, branch: cfg.branch || DEFAULT_BRANCH, hasToken: Boolean(cfg.token) };
});

route("POST", "/api/config", async (_p, req) => {
  const body = await readJsonBody(req);
  const cfg = saveConfig(body);
  const me = await github.getMe(cfg.token);
  return { ok: true, username: me.login, owner: cfg.owner, repo: cfg.repo, branch: cfg.branch };
});

route("GET", "/api/config/test", async () => {
  const cfg = requireConfig();
  const me = await github.getMe(cfg.token);
  return { ok: true, username: me.login };
});

route("POST", "/api/workflow/:kind/dispatch", async (params, req) => {
  const cfg = requireConfig();
  const file = WORKFLOWS[params.kind];
  if (!file) throw new Error(`Type de génération inconnu : ${params.kind}`);
  const { inputs } = await readJsonBody(req);
  await github.dispatchWorkflow(cfg.token, cfg.owner, cfg.repo, file, cfg.branch, inputs || {});
  return { ok: true };
});

route("GET", "/api/workflow/:kind/status", async (params) => {
  const cfg = requireConfig();
  const file = WORKFLOWS[params.kind];
  const runs = await github.listWorkflowRuns(cfg.token, cfg.owner, cfg.repo, file, 3);
  return runs.map((r) => ({ id: r.id, status: r.status, conclusion: r.conclusion, createdAt: r.created_at, htmlUrl: r.html_url }));
});

route("GET", "/api/drafts", async () => {
  const cfg = requireConfig();
  const { content } = await github.getFile(cfg.token, cfg.owner, cfg.repo, "calendar.json", cfg.branch);
  const calendar = JSON.parse(content);
  const mediaBase = `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/`;
  return calendar.map((p) => ({ ...p, mediaBase }));
});

route("PATCH", "/api/drafts/:id", async (params, req) => {
  const cfg = requireConfig();
  const { changes } = await readJsonBody(req);
  const { content, sha } = await github.getFile(cfg.token, cfg.owner, cfg.repo, "calendar.json", cfg.branch);
  const calendar = JSON.parse(content);
  const idx = calendar.findIndex((p) => p.id === params.id);
  if (idx === -1) throw new Error(`Post introuvable : ${params.id}`);
  calendar[idx] = { ...calendar[idx], ...changes };
  const updated = JSON.stringify(calendar, null, 2) + "\n";
  await github.putFile(cfg.token, cfg.owner, cfg.repo, "calendar.json", updated, `chore: mise à jour du post ${params.id} (Control Room)`, sha, cfg.branch);
  return { ok: true };
});

route("DELETE", "/api/drafts/:id", async (params) => {
  const cfg = requireConfig();
  const { content, sha } = await github.getFile(cfg.token, cfg.owner, cfg.repo, "calendar.json", cfg.branch);
  const calendar = JSON.parse(content);
  const next = calendar.filter((p) => p.id !== params.id);
  if (next.length === calendar.length) throw new Error(`Post introuvable : ${params.id}`);
  const updated = JSON.stringify(next, null, 2) + "\n";
  await github.putFile(cfg.token, cfg.owner, cfg.repo, "calendar.json", updated, `chore: suppression du post ${params.id} (Control Room)`, sha, cfg.branch);
  return { ok: true };
});

route("GET", "/api/videos", async () => {
  const cfg = requireConfig();
  const entries = await github.listDirectory(cfg.token, cfg.owner, cfg.repo, "videos", cfg.branch);
  return entries.filter((e) => e.type === "file").map((e) => ({ name: e.name, path: e.path, size: e.size }));
});

route("POST", "/api/videos", async (_p, req) => {
  const cfg = requireConfig();
  const { name, base64 } = await readJsonBody(req);
  if (!name || !base64) throw new Error("Nom ou contenu de fichier manquant.");
  const safeName = path.basename(name);
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > 90 * 1024 * 1024) throw new Error("Fichier trop volumineux (limite ~90 Mo). Compresse la vidéo.");
  const existingSha = await github.findFileSha(cfg.token, cfg.owner, cfg.repo, "videos", safeName, cfg.branch);
  await github.putBinaryFile(cfg.token, cfg.owner, cfg.repo, `videos/${safeName}`, buffer, `chore: ajout vidéo ${safeName} (Control Room)`, existingSha, cfg.branch);
  return { ok: true, name: safeName, path: `videos/${safeName}` };
});

// ── Serveur ──────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const match = matchRoute(req.method, url.pathname);

  if (!match) {
    if (req.method === "GET") return serveStatic(req, res, url.pathname);
    return sendJson(res, 404, { error: "Route inconnue." });
  }

  try {
    const result = await match.handler(match.params, req);
    sendJson(res, 200, result);
  } catch (err) {
    sendJson(res, 400, { error: err.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}`;
  console.log(`SubPilot Control Room : ${url}`);
  const opener = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
  exec(opener, () => {});
});
