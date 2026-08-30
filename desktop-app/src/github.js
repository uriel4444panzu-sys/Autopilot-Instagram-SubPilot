/**
 * Client GitHub minimal (API REST), sans dépendance externe (fetch natif
 * de Node/Electron). Utilisé uniquement dans le process principal
 * (main.js) : le token n'est jamais exposé au renderer.
 */

const API = "https://api.github.com";

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function request(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { ...headers(token), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data.message || `HTTP ${res.status}`;
    throw new Error(`GitHub API (${method} ${path}) : ${msg}`);
  }
  return data;
}

async function getMe(token) {
  return request(token, "GET", "/user");
}

async function dispatchWorkflow(token, owner, repo, workflowFile, ref, inputs = {}) {
  await request(token, "POST", `/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`, {
    ref,
    inputs,
  });
}

async function listWorkflowRuns(token, owner, repo, workflowFile, perPage = 5) {
  const data = await request(
    token,
    "GET",
    `/repos/${owner}/${repo}/actions/workflows/${workflowFile}/runs?per_page=${perPage}`
  );
  return data.workflow_runs || [];
}

async function getFile(token, owner, repo, filePath, ref) {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const data = await request(token, "GET", `/repos/${owner}/${repo}/contents/${filePath}${q}`);
  const content = Buffer.from(data.content, "base64").toString("utf8");
  return { content, sha: data.sha };
}

async function putFile(token, owner, repo, filePath, contentUtf8, message, sha, branch) {
  const body = {
    message,
    content: Buffer.from(contentUtf8, "utf8").toString("base64"),
    branch,
  };
  if (sha) body.sha = sha;
  return request(token, "PUT", `/repos/${owner}/${repo}/contents/${filePath}`, body);
}

async function putBinaryFile(token, owner, repo, filePath, contentBuffer, message, sha, branch) {
  const body = {
    message,
    content: contentBuffer.toString("base64"),
    branch,
  };
  if (sha) body.sha = sha;
  return request(token, "PUT", `/repos/${owner}/${repo}/contents/${filePath}`, body);
}

async function listDirectory(token, owner, repo, dirPath, ref) {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  try {
    const data = await request(token, "GET", `/repos/${owner}/${repo}/contents/${dirPath}${q}`);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    if (e.message.includes("Not Found")) return [];
    throw e;
  }
}

/** Cherche un fichier existant par nom dans un dossier, pour récupérer son sha avant écrasement. */
async function findFileSha(token, owner, repo, dirPath, fileName, ref) {
  const entries = await listDirectory(token, owner, repo, dirPath, ref);
  const match = entries.find((e) => e.name === fileName);
  return match ? match.sha : null;
}

module.exports = {
  getMe,
  dispatchWorkflow,
  listWorkflowRuns,
  getFile,
  putFile,
  putBinaryFile,
  listDirectory,
  findFileSha,
};
