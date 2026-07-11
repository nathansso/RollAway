// Thin client for DigitalOcean Gradient (GenAI) Knowledge Bases.
// Used by ingest.mjs (create + ingest the vendor menu) and query.mjs (verify + retrieve).
//
// Auth: DIGITALOCEAN_ACCESS_TOKEN (read/write DO API token). Read from env ONLY — never printed.
// Base: https://api.digitalocean.com/v2/gen-ai
//
// KB creation and inference are known to work on the team account (RUNBOOK §0b); managed AGENT
// creation is 403. Every call returns its real { ok, status, data } — nothing is faked. Callers
// degrade gracefully (the deterministic overlap core still runs) if a specific endpoint varies.

const API = "https://api.digitalocean.com/v2/gen-ai";
const DO = "https://api.digitalocean.com/v2";

export function haveToken() {
  return !!(process.env.DIGITALOCEAN_ACCESS_TOKEN || process.env.DO_KEY);
}

function headers() {
  const key = process.env.DIGITALOCEAN_ACCESS_TOKEN || process.env.DO_KEY;
  if (!key) throw new Error("DIGITALOCEAN_ACCESS_TOKEN not set");
  return { authorization: `Bearer ${key}`, "content-type": "application/json" };
}

async function call(method, url, body) {
  const res = await fetch(url, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

// --- discovery ---------------------------------------------------------------------------
export async function defaultProject() {
  const r = await call("GET", `${DO}/projects/default`);
  return r.ok ? r.data.project : null;
}

export async function listModels() {
  const r = await call("GET", `${API}/models?per_page=100`);
  return r.ok ? (r.data.models || []) : [];
}

// Pick an embedding model for the KB (KB creation needs one). Falls back to any model whose
// name/usage marks it as an embedding model.
export async function pickEmbeddingModel() {
  const models = await listModels();
  const emb = models.find((m) => /embed/i.test(m.name || "")) ||
    models.find((m) => (m.usecases || []).some?.((u) => /EMBED/i.test(u)));
  return emb || null;
}

// --- knowledge bases ---------------------------------------------------------------------
export async function listKnowledgeBases() {
  const r = await call("GET", `${API}/knowledge_bases?per_page=100`);
  return r.ok ? (r.data.knowledge_bases || []) : [];
}

export async function getKnowledgeBase(uuid) {
  const r = await call("GET", `${API}/knowledge_bases/${uuid}`);
  return r.ok ? (r.data.knowledge_base || r.data) : null;
}

export async function findKnowledgeBaseByName(name) {
  const kbs = await listKnowledgeBases();
  return kbs.find((k) => k.name === name) || null;
}

// Create a KB. `datasources` is optional; some accounts require creating the KB first and adding
// data sources afterward. Returns { ok, status, data }.
export async function createKnowledgeBase({ name, project_id, region = "tor1", embedding_model_uuid, database_id, datasources }) {
  const body = { name, project_id, region };
  if (embedding_model_uuid) body.embedding_model_uuid = embedding_model_uuid;
  if (database_id) body.database_id = database_id;
  if (datasources) body.datasources = datasources;
  return call("POST", `${API}/knowledge_bases`, body);
}

export async function deleteKnowledgeBase(uuid) {
  return call("DELETE", `${API}/knowledge_bases/${uuid}`);
}

// Attach a data source to an existing KB. Data-source shape varies by type (spaces / file / web);
// we try the file/inline shape. Returns { ok, status, data } — caller degrades if unsupported.
export async function addDataSource(kbUuid, datasource) {
  return call("POST", `${API}/knowledge_bases/${kbUuid}/data_sources`, datasource);
}

export async function listDataSources(kbUuid) {
  const r = await call("GET", `${API}/knowledge_bases/${kbUuid}/data_sources`);
  return r.ok ? (r.data.knowledge_base_data_sources || r.data.data_sources || []) : [];
}

// Kick an indexing job (some flows require it after adding data sources).
export async function startIndexingJob(kbUuid) {
  return call("POST", `${API}/indexing_jobs`, { knowledge_base_uuid: kbUuid });
}

// Best-effort semantic retrieval against a KB. The standalone KB retrieval surface varies across
// account tiers; we try the documented shape and return null (not throw) if it isn't available,
// so query.mjs can fall back to the deterministic overlap core over the mirrored menu.
export async function kbSemanticSearch(kbUuid, query, top_k = 5) {
  const attempts = [
    ["POST", `${API}/knowledge_bases/${kbUuid}/query`, { query, k: top_k }],
    ["POST", `${API}/knowledge_bases/${kbUuid}/search`, { query, top_k }],
    ["POST", `${API}/knowledge_bases/${kbUuid}/retrieve`, { query, top_k }]
  ];
  for (const [m, u, b] of attempts) {
    try {
      const r = await call(m, u, b);
      if (r.ok) return { ok: true, endpoint: u, results: r.data.results || r.data.chunks || r.data.matches || [] };
    } catch { /* try next */ }
  }
  return null;
}
