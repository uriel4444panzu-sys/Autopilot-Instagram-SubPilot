const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const github = require("./github");

const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");
const DEFAULT_OWNER = "uriel4444panzu-sys";
const DEFAULT_REPO = "Autopilot-Instagram-SubPilot";
const DEFAULT_BRANCH = "main";

let mainWindow;

function loadConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed.tokenEncrypted) {
      parsed.token = safeStorage.decryptString(Buffer.from(parsed.tokenEncrypted, "base64"));
    }
    return parsed;
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
  if (token) {
    next.tokenEncrypted = safeStorage.encryptString(token).toString("base64");
  } else if (current.tokenEncrypted) {
    next.tokenEncrypted = current.tokenEncrypted;
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}

function requireConfig() {
  const cfg = loadConfig();
  if (!cfg.token) throw new Error("Aucun jeton GitHub configuré. Va dans Réglages.");
  return cfg;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0b1220",
    title: "SubPilot Control Room",
    icon: path.join(__dirname, "..", "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── IPC : configuration ────────────────────────────────────────────────

ipcMain.handle("config:get", () => {
  const cfg = loadConfig();
  return { owner: cfg.owner || DEFAULT_OWNER, repo: cfg.repo || DEFAULT_REPO, branch: cfg.branch || DEFAULT_BRANCH, hasToken: Boolean(cfg.token) };
});

ipcMain.handle("config:save", async (_evt, { token, owner, repo, branch }) => {
  const cfg = saveConfig({ token, owner, repo, branch });
  const me = await github.getMe(cfg.token);
  return { ok: true, username: me.login, owner: cfg.owner, repo: cfg.repo, branch: cfg.branch };
});

ipcMain.handle("config:testConnection", async () => {
  const cfg = requireConfig();
  const me = await github.getMe(cfg.token);
  return { ok: true, username: me.login };
});

// ── IPC : générations ────────────────────────────────────────────────

const WORKFLOWS = {
  week: "generate-week.yml",
  posts: "generate-posts.yml",
  image: "generate-image.yml",
};

ipcMain.handle("workflow:dispatch", async (_evt, { kind, inputs }) => {
  const cfg = requireConfig();
  const file = WORKFLOWS[kind];
  if (!file) throw new Error(`Type de génération inconnu : ${kind}`);
  await github.dispatchWorkflow(cfg.token, cfg.owner, cfg.repo, file, cfg.branch, inputs || {});
  return { ok: true };
});

ipcMain.handle("workflow:status", async (_evt, { kind }) => {
  const cfg = requireConfig();
  const file = WORKFLOWS[kind];
  const runs = await github.listWorkflowRuns(cfg.token, cfg.owner, cfg.repo, file, 3);
  return runs.map((r) => ({
    id: r.id,
    status: r.status,
    conclusion: r.conclusion,
    createdAt: r.created_at,
    htmlUrl: r.html_url,
  }));
});

// ── IPC : brouillons (calendar.json) ────────────────────────────────

ipcMain.handle("drafts:list", async () => {
  const cfg = requireConfig();
  const { content } = await github.getFile(cfg.token, cfg.owner, cfg.repo, "calendar.json", cfg.branch);
  const calendar = JSON.parse(content);
  const mediaBase = `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/`;
  return calendar.map((p) => ({ ...p, mediaBase }));
});

ipcMain.handle("drafts:update", async (_evt, { id, changes }) => {
  const cfg = requireConfig();
  const { content, sha } = await github.getFile(cfg.token, cfg.owner, cfg.repo, "calendar.json", cfg.branch);
  const calendar = JSON.parse(content);
  const idx = calendar.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error(`Post introuvable : ${id}`);
  calendar[idx] = { ...calendar[idx], ...changes };
  const updated = JSON.stringify(calendar, null, 2) + "\n";
  await github.putFile(cfg.token, cfg.owner, cfg.repo, "calendar.json", updated, `chore: mise à jour du post ${id} (Control Room)`, sha, cfg.branch);
  return { ok: true };
});

ipcMain.handle("drafts:delete", async (_evt, { id }) => {
  const cfg = requireConfig();
  const { content, sha } = await github.getFile(cfg.token, cfg.owner, cfg.repo, "calendar.json", cfg.branch);
  const calendar = JSON.parse(content);
  const next = calendar.filter((p) => p.id !== id);
  if (next.length === calendar.length) throw new Error(`Post introuvable : ${id}`);
  const updated = JSON.stringify(next, null, 2) + "\n";
  await github.putFile(cfg.token, cfg.owner, cfg.repo, "calendar.json", updated, `chore: suppression du post ${id} (Control Room)`, sha, cfg.branch);
  return { ok: true };
});

// ── IPC : vidéos ─────────────────────────────────────────────────────

ipcMain.handle("videos:list", async () => {
  const cfg = requireConfig();
  const entries = await github.listDirectory(cfg.token, cfg.owner, cfg.repo, "videos", cfg.branch);
  return entries
    .filter((e) => e.type === "file")
    .map((e) => ({ name: e.name, path: e.path, size: e.size }));
});

ipcMain.handle("videos:pick", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choisir une vidéo",
    properties: ["openFile"],
    filters: [{ name: "Vidéos", extensions: ["mp4", "mov", "m4v"] }],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle("videos:upload", async (_evt, { localPath }) => {
  const cfg = requireConfig();
  const fileName = path.basename(localPath);
  const stat = fs.statSync(localPath);
  if (stat.size > 90 * 1024 * 1024) {
    throw new Error("Fichier trop volumineux pour un dépôt direct (limite ~90 Mo). Compresse la vidéo.");
  }
  const buffer = fs.readFileSync(localPath);
  const existingSha = await github.findFileSha(cfg.token, cfg.owner, cfg.repo, "videos", fileName, cfg.branch);
  await github.putBinaryFile(
    cfg.token,
    cfg.owner,
    cfg.repo,
    `videos/${fileName}`,
    buffer,
    `chore: ajout vidéo ${fileName} (Control Room)`,
    existingSha,
    cfg.branch
  );
  return { ok: true, name: fileName, path: `videos/${fileName}` };
});

ipcMain.handle("shell:openExternal", (_evt, url) => shell.openExternal(url));
