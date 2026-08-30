// ── Utilitaires UI ───────────────────────────────────────────────────

function toast(message, kind = "info") {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function setStatus(id, message, kind = "") {
  const el = document.getElementById(id);
  el.textContent = message;
  el.className = `status-line ${kind}`;
}

async function withBusy(button, fn) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "…";
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

// ── Navigation ───────────────────────────────────────────────────────

function initNav() {
  const items = document.querySelectorAll(".nav-item");
  items.forEach((item) => {
    item.addEventListener("click", () => {
      items.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      document.getElementById(`tab-${item.dataset.tab}`).classList.add("active");
      if (item.dataset.tab === "drafts") loadDrafts();
      if (item.dataset.tab === "videos") loadVideos();
    });
  });
}

// ── Réglages / connexion ─────────────────────────────────────────────

async function refreshConnectionState() {
  const cfg = await window.api.getConfig();
  document.getElementById("cfg-owner").value = cfg.owner;
  document.getElementById("cfg-repo").value = cfg.repo;
  document.getElementById("cfg-branch").value = cfg.branch;

  const dot = document.getElementById("connection-dot");
  const label = document.getElementById("connection-label");

  if (!cfg.hasToken) {
    dot.classList.remove("online");
    label.textContent = "Non connecté";
    return;
  }
  try {
    const res = await window.api.testConnection();
    dot.classList.add("online");
    label.textContent = `Connecté (${res.username})`;
  } catch {
    dot.classList.remove("online");
    label.textContent = "Jeton invalide";
  }
}

function initSettings() {
  document.getElementById("btn-open-token-page").addEventListener("click", () => {
    window.api.openExternal("https://github.com/settings/personal-access-tokens/new");
  });

  document.getElementById("btn-save-config").addEventListener("click", async (e) => {
    const owner = document.getElementById("cfg-owner").value.trim();
    const repo = document.getElementById("cfg-repo").value.trim();
    const branch = document.getElementById("cfg-branch").value.trim() || "main";
    const token = document.getElementById("cfg-token").value.trim();

    if (!token) {
      setStatus("status-config", "Colle un jeton d'accès personnel.", "error");
      return;
    }
    await withBusy(e.target, async () => {
      try {
        const res = await window.api.saveConfig({ token, owner, repo, branch });
        setStatus("status-config", `Connecté en tant que ${res.username}.`, "success");
        toast(`Connecté à ${res.owner}/${res.repo}`, "success");
        document.getElementById("cfg-token").value = "";
        refreshConnectionState();
      } catch (err) {
        setStatus("status-config", err.message, "error");
      }
    });
  });
}

// ── Générer ──────────────────────────────────────────────────────────

function initGenerate() {
  document.getElementById("week-reel-toggle").addEventListener("change", (e) => {
    document.getElementById("week-reel-fields").hidden = !e.target.checked;
  });

  document.getElementById("btn-generate-week").addEventListener("click", async (e) => {
    const reelOn = document.getElementById("week-reel-toggle").checked;
    const inputs = {};
    if (reelOn) {
      const video = document.getElementById("week-reel-video").value;
      if (!video) {
        setStatus("status-week", "Choisis une vidéo (onglet Vidéos pour en déposer une).", "error");
        return;
      }
      inputs.reel_day = document.getElementById("week-reel-day").value;
      inputs.reel_video = video;
    }
    await withBusy(e.target, async () => {
      try {
        await window.api.dispatchWorkflow("week", inputs);
        setStatus("status-week", "Lancé sur GitHub Actions — ça prend quelques minutes (plusieurs images à générer).", "success");
        toast("Génération de la semaine lancée", "success");
      } catch (err) {
        setStatus("status-week", err.message, "error");
      }
    });
  });

  document.getElementById("btn-generate-posts").addEventListener("click", async (e) => {
    const count = document.getElementById("posts-count").value;
    const type = document.getElementById("posts-type").value;
    await withBusy(e.target, async () => {
      try {
        await window.api.dispatchWorkflow("posts", { COUNT: count, POST_TYPE: type });
        setStatus("status-posts", "Lancé sur GitHub Actions — ça prend quelques minutes.", "success");
        toast("Génération du lot lancée", "success");
      } catch (err) {
        setStatus("status-posts", err.message, "error");
      }
    });
  });

  document.getElementById("btn-generate-image").addEventListener("click", async (e) => {
    const prompt = document.getElementById("image-prompt").value.trim();
    if (!prompt) {
      setStatus("status-image", "Écris un prompt.", "error");
      return;
    }
    const type = document.getElementById("image-type").value;
    const quality = document.getElementById("image-quality").value;
    await withBusy(e.target, async () => {
      try {
        await window.api.dispatchWorkflow("image", { PROMPT: prompt, IMAGE_TYPE: type, QUALITY: quality });
        setStatus("status-image", "Lancé sur GitHub Actions.", "success");
        toast("Génération d'image lancée", "success");
      } catch (err) {
        setStatus("status-image", err.message, "error");
      }
    });
  });
}

// ── Vidéos ───────────────────────────────────────────────────────────

async function loadVideos() {
  const list = document.getElementById("videos-list");
  const select = document.getElementById("week-reel-video");
  try {
    const videos = await window.api.listVideos();
    list.innerHTML = "";
    select.innerHTML = "";
    if (!videos.length) {
      list.innerHTML = '<p class="empty-state">Aucune vidéo déposée pour l\'instant.</p>';
    }
    for (const v of videos) {
      const item = document.createElement("div");
      item.className = "list-item";
      item.innerHTML = `<span class="name">🎞️ ${v.name}</span><span class="meta">${(v.size / 1024 / 1024).toFixed(1)} Mo</span>`;
      list.appendChild(item);

      const opt = document.createElement("option");
      opt.value = v.path;
      opt.textContent = v.name;
      select.appendChild(opt);
    }
  } catch (err) {
    list.innerHTML = `<p class="empty-state">${err.message}</p>`;
  }
}

function initVideos() {
  const dropzone = document.getElementById("video-dropzone");

  async function handleUpload(localPath) {
    if (!localPath) return;
    setStatus("status-video-upload", `Envoi de ${localPath.split(/[\\/]/).pop()}…`);
    try {
      const res = await window.api.uploadVideo(localPath);
      setStatus("status-video-upload", `✅ ${res.name} déposée dans le dépôt.`, "success");
      toast(`Vidéo déposée : ${res.name}`, "success");
      loadVideos();
    } catch (err) {
      setStatus("status-video-upload", err.message, "error");
    }
  }

  dropzone.addEventListener("click", async () => {
    const filePath = await window.api.pickVideo();
    if (filePath) handleUpload(filePath);
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file && file.path) handleUpload(file.path);
  });
}

// ── Brouillons ───────────────────────────────────────────────────────

function typeIcon(type) {
  if (type === "reel") return "🎬";
  if (type === "story") return "📱";
  return "🖼️";
}

function renderDraftCard(post) {
  const card = document.createElement("div");
  card.className = "draft-card";

  const media = document.createElement("div");
  media.className = "draft-media";
  if (post.type === "reel") {
    media.textContent = "🎬";
  } else if (post.image) {
    media.style.backgroundImage = `url("${post.mediaBase}${post.image.split("/").map(encodeURIComponent).join("/")}")`;
  } else {
    media.textContent = "🖼️";
  }
  card.appendChild(media);

  const body = document.createElement("div");
  body.className = "draft-body";
  body.innerHTML = `
    <div class="draft-tags">
      <span class="tag type-${post.type}">${typeIcon(post.type)} ${post.type}</span>
      ${post.archetype ? `<span class="tag">Archétype ${post.archetype}</span>` : ""}
    </div>
    <p class="draft-hook">${post.hook || ""}</p>
    <div class="draft-caption">${post.caption || ""}</div>
    <div class="draft-actions">
      <input type="date" value="${post.date || ""}" />
      <button class="btn btn-primary btn-approve">Approuver</button>
      <button class="btn btn-danger btn-reject">✕</button>
    </div>
  `;
  card.appendChild(body);

  const dateInput = body.querySelector('input[type="date"]');
  const approveBtn = body.querySelector(".btn-approve");
  const rejectBtn = body.querySelector(".btn-reject");

  approveBtn.addEventListener("click", async () => {
    if (!dateInput.value) {
      toast("Choisis une date avant d'approuver.", "error");
      return;
    }
    await withBusy(approveBtn, async () => {
      try {
        await window.api.updateDraft(post.id, { date: dateInput.value, status: "approved" });
        toast(`Post approuvé pour le ${dateInput.value}`, "success");
        card.remove();
        updateDraftsBadge(-1);
      } catch (err) {
        toast(err.message, "error");
      }
    });
  });

  rejectBtn.addEventListener("click", async () => {
    if (!confirm("Supprimer définitivement ce brouillon ?")) return;
    await withBusy(rejectBtn, async () => {
      try {
        await window.api.deleteDraft(post.id);
        toast("Brouillon supprimé", "success");
        card.remove();
        updateDraftsBadge(-1);
      } catch (err) {
        toast(err.message, "error");
      }
    });
  });

  return card;
}

function updateDraftsBadge(delta, absolute) {
  const badge = document.getElementById("drafts-badge");
  const current = Number(badge.textContent || "0");
  const next = absolute !== undefined ? absolute : Math.max(0, current + delta);
  badge.textContent = String(next);
  badge.hidden = next === 0;
}

async function loadDrafts() {
  const container = document.getElementById("drafts-list");
  const empty = document.getElementById("drafts-empty");
  container.innerHTML = "";
  try {
    const posts = await window.api.listDrafts();
    const drafts = posts.filter((p) => p.status === "draft");
    updateDraftsBadge(0, drafts.length);
    empty.hidden = drafts.length > 0;
    for (const post of drafts) container.appendChild(renderDraftCard(post));
  } catch (err) {
    empty.hidden = false;
    empty.textContent = err.message;
  }
}

function initDrafts() {
  document.getElementById("btn-refresh-drafts").addEventListener("click", loadDrafts);
}

// ── Démarrage ────────────────────────────────────────────────────────

(async function init() {
  initNav();
  initSettings();
  initGenerate();
  initVideos();
  initDrafts();
  await refreshConnectionState();
  loadVideos();
  loadDrafts();
})();
