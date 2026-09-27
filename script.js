/* =========================================================
   Campus Lost & Found — single-file version (PostgreSQL)
   Everything (server, database setup, API routes, and the
   entire frontend) lives in this one file. Only package.json,
   .gitignore and .env.example sit alongside it.
   ========================================================= */

require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

// ---------- Database ----------
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
  connectionString,
  ssl: connectionString && connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('lost','found')),
      title TEXT NOT NULL,
      category TEXT DEFAULT 'Other',
      description TEXT NOT NULL,
      location TEXT NOT NULL,
      date TEXT NOT NULL,
      contact TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','claimed','returned')),
      claim_name TEXT,
      claim_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

function mapRow(row) {
  return {
    _id: String(row.id),
    type: row.type,
    title: row.title,
    category: row.category,
    description: row.description,
    location: row.location,
    date: row.date,
    contact: row.contact,
    status: row.status,
    claim: row.claim_name ? { name: row.claim_name, note: row.claim_note } : null,
    createdAt: row.created_at,
  };
}

function requireAdmin(req, res, next) {
  const pass = req.header("x-admin-password");
  if (pass && pass === (process.env.ADMIN_PASSWORD || "admin123")) return next();
  return res.status(403).json({ error: "Admin password required" });
}

// ---------- API routes ----------
app.get("/api/items", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM items ORDER BY created_at DESC");
    res.json(result.rows.map(mapRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/items", async (req, res) => {
  try {
    const { type, title, category, description, location, date, contact } = req.body;
    if (!type || !title || !description || !location || !date || !contact) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const result = await pool.query(
      `INSERT INTO items (type, title, category, description, location, date, contact)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [type, title, category || "Other", description, location, date, contact]
    );
    res.status(201).json(mapRow(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/items/:id/claim", async (req, res) => {
  try {
    const { name, note } = req.body;
    if (!name || !note) return res.status(400).json({ error: "Name and note are required" });
    const result = await pool.query(
      `UPDATE items SET status = 'claimed', claim_name = $1, claim_note = $2 WHERE id = $3 RETURNING *`,
      [name, note, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Item not found" });
    res.json(mapRow(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/items/:id/verify", requireAdmin, async (req, res) => {
  const result = await pool.query(
    `UPDATE items SET status = 'returned' WHERE id = $1 RETURNING *`,
    [req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: "Item not found" });
  res.json(mapRow(result.rows[0]));
});

app.patch("/api/items/:id/reject", requireAdmin, async (req, res) => {
  const result = await pool.query(
    `UPDATE items SET status = 'active', claim_name = NULL, claim_note = NULL WHERE id = $1 RETURNING *`,
    [req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: "Item not found" });
  res.json(mapRow(result.rows[0]));
});

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (password && password === (process.env.ADMIN_PASSWORD || "admin123")) {
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false, error: "Incorrect password" });
});

// ---------- Frontend (single page, embedded below) ----------
const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Campus Lost &amp; Found</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%2314181c'/%3E%3Cpath d='M30 70 L30 34 Q30 26 38 26 L62 26 Q70 26 70 34 L70 70 L58 60 L50 70 L42 60 Z' fill='%23c79a3a'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #f6f5f0;
  --surface: #ffffff;
  --ink: #14181c;
  --ink-soft: #5b6470;
  --ink-faint: #8b93a0;
  --line: #e1ded4;
  --lost: #7a3348;
  --lost-bg: #f4e8ec;
  --found: #1f6f5c;
  --found-bg: #e4f1ec;
  --gold: #b98a2e;
  --gold-bg: #f7ecd3;
  --gold-ink: #14181c;
  --radius-sm: 6px;
  --radius: 10px;
  --shadow: 0 8px 24px -12px rgba(20, 24, 28, 0.18);
  --serif: "Fraunces", Georgia, serif;
  --sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
html, body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--sans);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.wrap { max-width: 1040px; margin: 0 auto; padding: 0 28px; }

/* ---------- header ---------- */
header.site {
  position: sticky; top: 0; z-index: 20;
  background: rgba(246, 245, 240, 0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--line);
}
.site-inner {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 28px; max-width: 1040px; margin: 0 auto; gap: 16px; flex-wrap: wrap;
}
.brand { display: flex; align-items: center; gap: 10px; }
.brand-mark {
  width: 30px; height: 30px; border-radius: 8px; background: var(--ink);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.brand-mark svg { width: 16px; height: 16px; }
.brand-name { font-family: var(--serif); font-size: 1.25rem; font-weight: 600; color: var(--ink); letter-spacing: -0.01em; }
nav.main { display: flex; gap: 4px; }
nav.main a {
  text-decoration: none; color: var(--ink-soft); font-size: 0.92rem; font-weight: 500;
  padding: 8px 14px; border-radius: 999px; cursor: pointer; transition: background 0.15s, color 0.15s;
}
nav.main a:hover { background: var(--surface); color: var(--ink); }
nav.main a.active { background: var(--ink); color: var(--bg); }

main { padding: 56px 0 96px; }
h1 { font-family: var(--serif); font-weight: 600; font-size: 2.5rem; line-height: 1.1; margin: 0 0 14px; letter-spacing: -0.015em; max-width: 18ch; }
h2 { font-family: var(--serif); font-weight: 600; font-size: 1.5rem; margin: 0 0 18px; letter-spacing: -0.01em; }
p.lead { color: var(--ink-soft); max-width: 56ch; font-size: 1.05rem; margin: 0 0 36px; }

/* ---------- buttons ---------- */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border: 1.5px solid var(--ink); background: var(--ink); color: var(--bg);
  padding: 11px 22px; border-radius: var(--radius-sm); font-size: 0.94rem; font-weight: 600;
  font-family: var(--sans); cursor: pointer; text-decoration: none; transition: transform 0.12s, box-shadow 0.12s;
}
.btn:hover { transform: translateY(-1px); box-shadow: var(--shadow); }
.btn:active { transform: translateY(0); }
.btn.secondary { background: transparent; color: var(--ink); border-color: var(--line); }
.btn.secondary:hover { border-color: var(--ink); }
.btn.action { background: var(--gold); border-color: var(--gold); color: var(--gold-ink); }
.btn.small { padding: 7px 14px; font-size: 0.85rem; }
.btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; box-shadow: none; }

/* ---------- forms ---------- */
form.card {
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 32px; max-width: 620px; box-shadow: var(--shadow);
}
.field-grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
@media (min-width: 620px) { .field-grid.two { grid-template-columns: 1fr 1fr; } }
.field { margin-bottom: 18px; }
.field-grid .field { margin-bottom: 0; }
.field label { display: block; font-size: 0.83rem; font-weight: 600; color: var(--ink-soft); margin-bottom: 7px; }
.field input, .field select, .field textarea {
  width: 100%; padding: 11px 13px; border: 1.5px solid var(--line); border-radius: var(--radius-sm);
  background: #fff; font-family: var(--sans); font-size: 0.95rem; color: var(--ink); transition: border-color 0.15s;
}
.field input:focus, .field select:focus, .field textarea:focus { border-color: var(--ink); outline: none; }
.field textarea { min-height: 90px; resize: vertical; }

.toggle-row { display: flex; gap: 10px; margin-bottom: 26px; max-width: 620px; }
.toggle-row button {
  flex: 1; padding: 14px; border: 1.5px solid var(--line); background: var(--surface);
  border-radius: var(--radius-sm); cursor: pointer; font-family: var(--sans); font-weight: 600; font-size: 0.92rem;
  color: var(--ink-soft); transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.toggle-row button.is-lost.on { border-color: var(--lost); background: var(--lost-bg); color: var(--lost); }
.toggle-row button.is-found.on { border-color: var(--found); background: var(--found-bg); color: var(--found); }

.msg { margin-top: 18px; padding: 12px 16px; border-radius: var(--radius-sm); font-size: 0.9rem; display: none; }
.msg.ok { display: block; background: var(--found-bg); color: var(--found); }
.msg.err { display: block; background: var(--lost-bg); color: var(--lost); }

/* ---------- search / filters ---------- */
.filters { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 30px; }
.filters input, .filters select {
  padding: 10px 14px; border: 1.5px solid var(--line); border-radius: var(--radius-sm);
  font-family: var(--sans); background: var(--surface); font-size: 0.92rem;
}
.filters input[type="text"] { flex: 1; min-width: 220px; }

/* ---------- item cards ---------- */
.item-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 18px; }
.item-card {
  background: var(--surface); border: 1px solid var(--line); border-top: 3px solid var(--line);
  border-radius: var(--radius); padding: 20px; transition: box-shadow 0.15s, transform 0.15s;
}
.item-card:hover { box-shadow: var(--shadow); transform: translateY(-2px); }
.item-card.lost { border-top-color: var(--lost); }
.item-card.found { border-top-color: var(--found); }
.item-card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.item-tag { display: inline-block; font-size: 0.72rem; font-weight: 600; padding: 3px 10px; border-radius: 999px; }
.item-tag.lost { background: var(--lost-bg); color: var(--lost); }
.item-tag.found { background: var(--found-bg); color: var(--found); }
.item-tag.claimed { background: var(--gold-bg); color: var(--gold); }
.item-tag.returned { background: #e7e5df; color: var(--ink-soft); }
.item-category { font-size: 0.78rem; color: var(--ink-faint); }
.item-card h3 { font-family: var(--serif); font-size: 1.15rem; font-weight: 600; margin: 0 0 8px; letter-spacing: -0.01em; }
.item-desc { font-size: 0.9rem; color: var(--ink-soft); margin: 0 0 14px; }
.item-meta-row { display: flex; gap: 16px; margin: 0 0 16px; }
.meta-item { position: relative; padding-left: 0; font-size: 0.83rem; color: var(--ink-faint); }
.meta-item + .meta-item { padding-left: 16px; }
.meta-item + .meta-item::before {
  content: ""; position: absolute; left: 0; top: 50%; width: 3px; height: 3px;
  border-radius: 50%; background: var(--ink-faint); transform: translateY(-50%);
}
.claim-note {
  background: var(--gold-bg); border-left: 3px solid var(--gold); border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  padding: 10px 14px; font-size: 0.85rem; margin-top: 4px; color: var(--ink);
}
.empty-state {
  grid-column: 1 / -1; border: 1.5px dashed var(--line); border-radius: var(--radius);
  padding: 48px 24px; text-align: center; color: var(--ink-soft); background: var(--surface);
}

/* ---------- workflow (home) ---------- */
.workflow { display: flex; flex-wrap: wrap; gap: 0; margin: 40px 0 48px; counter-reset: step; }
.workflow div {
  flex: 1; min-width: 150px; position: relative; padding: 24px 16px 16px; font-size: 0.85rem; color: var(--ink-soft);
}
.workflow div::before {
  counter-increment: step; content: counter(step);
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 50%; background: var(--ink); color: var(--bg);
  font-family: var(--serif); font-weight: 600; font-size: 0.85rem; margin-bottom: 10px;
}
.workflow div::after {
  content: ""; position: absolute; top: 38px; left: calc(50% + 26px); right: calc(-50% + 26px);
  height: 1px; background: var(--line);
}
.workflow div:last-child::after { display: none; }
.workflow div b { display: block; font-family: var(--sans); font-weight: 600; color: var(--ink); font-size: 0.92rem; margin-bottom: 4px; }

.stats { display: flex; gap: 16px; margin: 8px 0 44px; flex-wrap: wrap; }
.stat {
  flex: 1; min-width: 140px; background: var(--surface); border: 1px solid var(--line);
  border-top: 3px solid var(--line); border-radius: var(--radius); padding: 18px 20px;
}
.stat.active { border-top-color: var(--ink); }
.stat.pending { border-top-color: var(--gold); }
.stat.returned { border-top-color: var(--found); }
.stat b { display: block; font-family: var(--serif); font-size: 2rem; font-weight: 600; }
.stat span { font-size: 0.82rem; color: var(--ink-soft); }

/* ---------- admin table ---------- */
table.admin { width: 100%; border-collapse: collapse; font-size: 0.88rem; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
table.admin th, table.admin td { text-align: left; padding: 14px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
table.admin th { color: var(--ink-soft); font-weight: 600; font-size: 0.78rem; background: var(--bg); }
table.admin tr:last-child td { border-bottom: none; }
table.admin .item-meta { font-size: 0.8rem; color: var(--ink-faint); }

footer.site { border-top: 1px solid var(--line); padding: 32px 28px; text-align: center; color: var(--ink-faint); font-size: 0.82rem; }
</style>
</head>
<body>

<header class="site">
  <div class="site-inner">
    <div class="brand">
      <span class="brand-mark"><svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="M30 70 L30 34 Q30 26 38 26 L62 26 Q70 26 70 34 L70 70 L58 60 L50 70 L42 60 Z" fill="#b98a2e"/></svg></span>
      <span class="brand-name">Lost &amp; Found</span>
    </div>
    <nav class="main">
      <a data-view="home" class="active">Home</a>
      <a data-view="report">Report</a>
      <a data-view="browse">Browse</a>
      <a data-view="admin">Admin</a>
    </nav>
  </div>
</header>

<main class="wrap">
  <div id="global-error" class="msg err" style="display:none; margin-bottom: 20px;"></div>

  <section id="view-home" class="view">
    <h1>Everything campus loses, in one place.</h1>
    <p class="lead">Report a lost or found item in under a minute, search what other students have logged, and submit a claim once you find a match. Every claim is checked by an admin before an item is marked returned.</p>
    <div style="margin-bottom: 48px; display: flex; gap: 12px; flex-wrap: wrap;">
      <a data-view="report" class="btn action">Report an item</a>
      <a data-view="browse" class="btn secondary">Browse items</a>
    </div>

    <div class="stats" id="home-stats"></div>

    <h2>How it works</h2>
    <div class="workflow">
      <div><b>Report</b>Enter details of a lost or found item</div>
      <div><b>Listed</b>It's added to the shared database</div>
      <div><b>Search</b>Others browse and find a match</div>
      <div><b>Claim</b>The finder or owner submits a claim</div>
      <div><b>Verify</b>An admin checks the claim</div>
      <div><b>Returned</b>Item is marked returned to its owner</div>
    </div>
  </section>

  <section id="view-report" class="view" style="display:none;">
    <h1>Report an item</h1>
    <p class="lead">Choose whether you lost something or found something, then fill in what you know.</p>
    <div class="toggle-row">
      <button type="button" id="type-lost" class="is-lost">I lost something</button>
      <button type="button" id="type-found" class="is-found">I found something</button>
    </div>
    <form id="report-form" class="card">
      <div class="field-grid two" style="margin-bottom: 18px;">
        <div class="field"><label for="title">Item title</label><input type="text" id="title" name="title" placeholder="e.g. Blue water bottle" required /></div>
        <div class="field"><label for="category">Category</label>
          <select id="category" name="category">
            <option>Personal item</option><option>Electronics</option><option>ID / Documents</option>
            <option>Books &amp; stationery</option><option>Clothing</option><option>Keys</option><option>Other</option>
          </select>
        </div>
      </div>
      <div class="field"><label for="description">Description</label><textarea id="description" name="description" placeholder="Color, brand, distinguishing marks, contents..." required></textarea></div>
      <div class="field-grid two" style="margin-bottom: 18px;">
        <div class="field"><label for="location">Location</label><input type="text" id="location" name="location" placeholder="e.g. Main Library, 2nd floor" required /></div>
        <div class="field"><label for="date">Date</label><input type="date" id="date" name="date" required /></div>
      </div>
      <div class="field"><label for="contact">Your contact (email or phone)</label><input type="text" id="contact" name="contact" placeholder="you@campus.edu" required /></div>
      <button type="submit" class="btn action">Submit report</button>
    </form>
  </section>

  <section id="view-browse" class="view" style="display:none;">
    <h1>Browse reported items</h1>
    <p class="lead">Search by keyword, or filter by type and category.</p>
    <div class="filters">
      <input type="text" id="q" placeholder="Search by name, description or location..." />
      <select id="filter-type"><option value="all">All types</option><option value="lost">Lost</option><option value="found">Found</option></select>
      <select id="filter-category">
        <option value="all">All categories</option><option>Personal item</option><option>Electronics</option>
        <option>ID / Documents</option><option>Books &amp; stationery</option><option>Clothing</option><option>Keys</option><option>Other</option>
      </select>
    </div>
    <div class="item-grid" id="item-grid"></div>
  </section>

  <section id="view-admin" class="view" style="display:none;">
    <h1>Admin verification</h1>
    <p class="lead">Review pending claims and confirm ownership before marking an item as returned.</p>
    <div id="admin-gate">
      <form id="admin-login" class="card">
        <div class="field"><label for="admin-pass">Admin password</label><input type="password" id="admin-pass" placeholder="Enter admin password" /></div>
        <button type="submit" class="btn action">Log in</button>
      </form>
    </div>
    <div id="admin-panel" style="display:none;">
      <h2>Claims awaiting verification</h2>
      <table class="admin">
        <thead><tr><th>Item</th><th>Type</th><th>Claim</th><th>Contact</th><th>Action</th></tr></thead>
        <tbody id="admin-body"></tbody>
      </table>
    </div>
  </section>
</main>

<footer class="site">Campus Lost &amp; Found — data stored permanently in the database</footer>

<script>
var ADMIN_KEY = "lf_admin_pass";
var itemsCache = [];

function apiGet(url) {
  return fetch(url).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); });
}
function apiSend(url, method, body, headers) {
  var opts = { method: method, headers: headers || {} };
  if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  return fetch(url, opts).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); });
}

function refresh() {
  return apiGet("/api/items").then(function (res) {
    if (!res.ok) throw new Error("Failed to load items");
    itemsCache = res.data;
    return itemsCache;
  });
}
function addItem(item) {
  return apiSend("/api/items", "POST", item).then(function (res) {
    if (!res.ok) throw new Error(res.data.error || "Failed to save");
    return refresh();
  });
}
function claimItem(id, name, note) {
  return apiSend("/api/items/" + id + "/claim", "PATCH", { name: name, note: note }).then(function (res) {
    if (!res.ok) throw new Error(res.data.error || "Failed to submit claim");
    return refresh();
  });
}
function verifyItem(id) {
  return apiSend("/api/items/" + id + "/verify", "PATCH", null, { "x-admin-password": sessionStorage.getItem(ADMIN_KEY) || "" })
    .then(function (res) { if (!res.ok) throw new Error(res.data.error || "Failed"); return refresh(); });
}
function rejectItem(id) {
  return apiSend("/api/items/" + id + "/reject", "PATCH", null, { "x-admin-password": sessionStorage.getItem(ADMIN_KEY) || "" })
    .then(function (res) { if (!res.ok) throw new Error(res.data.error || "Failed"); return refresh(); });
}
function adminLogin(password) {
  return apiSend("/api/admin/login", "POST", { password: password }).then(function (res) { return res.ok; });
}
function searchItems(q, type, category) {
  q = (q || "").trim().toLowerCase();
  return itemsCache.filter(function (item) {
    if (type !== "all" && item.type !== type) return false;
    if (category !== "all" && item.category !== category) return false;
    if (!q) return true;
    var hay = (item.title + " " + item.description + " " + item.location).toLowerCase();
    return hay.indexOf(q) !== -1;
  });
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function statusLabel(item) {
  if (item.status === "returned") return "Returned";
  if (item.status === "claimed") return "Claim pending";
  return item.type === "lost" ? "Lost" : "Found";
}
function tagClass(item) {
  if (item.status === "returned") return "returned";
  if (item.status === "claimed") return "claimed";
  return item.type;
}
function escapeHTML(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function itemCardHTML(item) {
  var showClaimBtn = item.status === "active";
  var html = '<div class="item-card ' + item.type + '">';
  html += '<div class="item-card-top">';
  html += '<span class="item-tag ' + tagClass(item) + '">' + statusLabel(item) + "</span>";
  html += '<span class="item-category">' + escapeHTML(item.category) + "</span>";
  html += "</div>";
  html += "<h3>" + escapeHTML(item.title) + "</h3>";
  html += '<p class="item-desc">' + escapeHTML(item.description) + "</p>";
  html += '<div class="item-meta-row"><span class="meta-item">' + escapeHTML(item.location) + '</span><span class="meta-item">' + fmtDate(item.date) + "</span></div>";
  if (showClaimBtn) html += '<button class="btn action small" data-claim="' + item._id + '">Claim this item</button>';
  if (item.claim) html += '<div class="claim-note"><b>Claim:</b> ' + escapeHTML(item.claim.name) + " — " + escapeHTML(item.claim.note || "") + "</div>";
  html += "</div>";
  return html;
}
function showMsg(form, text, kind) {
  var msg = form.querySelector(".msg");
  if (!msg) { msg = document.createElement("div"); msg.className = "msg"; form.appendChild(msg); }
  msg.className = "msg " + kind;
  msg.textContent = text;
}
function showGlobalError(text) {
  var el = document.getElementById("global-error");
  el.textContent = text;
  el.style.display = "block";
}

var VIEWS = ["home", "report", "browse", "admin"];
function showView(name) {
  VIEWS.forEach(function (v) { document.getElementById("view-" + v).style.display = v === name ? "block" : "none"; });
  document.querySelectorAll("nav.main a").forEach(function (a) { a.classList.toggle("active", a.dataset.view === name); });
  renderCurrentView();
  window.scrollTo(0, 0);
}
function renderCurrentView() {
  var active = document.querySelector("nav.main a.active");
  var view = active ? active.dataset.view : "home";
  if (view === "home") renderHome();
  if (view === "browse") renderBrowse();
  if (view === "admin") renderAdmin();
}

function renderHome() {
  var el = document.getElementById("home-stats");
  var active = itemsCache.filter(function (i) { return i.status === "active"; }).length;
  var pending = itemsCache.filter(function (i) { return i.status === "claimed"; }).length;
  var returned = itemsCache.filter(function (i) { return i.status === "returned"; }).length;
  el.innerHTML =
    '<div class="stat active"><b>' + active + "</b><span>Active listings</span></div>" +
    '<div class="stat pending"><b>' + pending + "</b><span>Claims pending</span></div>" +
    '<div class="stat returned"><b>' + returned + "</b><span>Items returned</span></div>";
}

function initReportForm() {
  var form = document.getElementById("report-form");
  var currentType = "lost";
  var lostBtn = document.getElementById("type-lost");
  var foundBtn = document.getElementById("type-found");
  function setType(t) {
    currentType = t;
    lostBtn.classList.toggle("on", t === "lost");
    foundBtn.classList.toggle("on", t === "found");
  }
  lostBtn.addEventListener("click", function () { setType("lost"); });
  foundBtn.addEventListener("click", function () { setType("found"); });
  setType("lost");

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var data = Object.fromEntries(new FormData(form).entries());
    if (!data.title || !data.description || !data.location || !data.date || !data.contact) {
      showMsg(form, "Please fill in every field before submitting.", "err");
      return;
    }
    var btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    data.type = currentType;
    addItem(data).then(function () {
      form.reset();
      setType("lost");
      showMsg(form, "Reported — added to the list. You can find it on the Browse page.", "ok");
      btn.disabled = false;
    }).catch(function (err) {
      showMsg(form, "Couldn't save: " + err.message, "err");
      btn.disabled = false;
    });
  });
}

function renderBrowse() {
  var grid = document.getElementById("item-grid");
  var q = document.getElementById("q").value;
  var type = document.getElementById("filter-type").value;
  var category = document.getElementById("filter-category").value;
  var items = searchItems(q, type, category);
  grid.innerHTML = items.length ? items.map(itemCardHTML).join("") :
    '<div class="empty-state">No items match your search yet. Try a different keyword or check back later.</div>';
  grid.querySelectorAll("[data-claim]").forEach(function (btn) {
    btn.addEventListener("click", function () { openClaim(btn.dataset.claim); });
  });
}
function initBrowseFilters() {
  document.getElementById("q").addEventListener("input", renderBrowse);
  document.getElementById("filter-type").addEventListener("change", renderBrowse);
  document.getElementById("filter-category").addEventListener("change", renderBrowse);
}
function openClaim(id) {
  var name = prompt("Your name, for the claim record:");
  if (!name) return;
  var note = prompt("Briefly describe how you can verify this is yours (a detail only the owner would know):");
  if (!note) return;
  claimItem(id, name, note).then(function () {
    alert("Claim submitted. An admin will verify it before the item is marked returned.");
    renderBrowse();
  }).catch(function (err) { alert("Couldn't submit claim: " + err.message); });
}

function initAdmin() {
  var gate = document.getElementById("admin-gate");
  var panel = document.getElementById("admin-panel");
  if (sessionStorage.getItem(ADMIN_KEY)) { gate.style.display = "none"; panel.style.display = "block"; }
  document.getElementById("admin-login").addEventListener("submit", function (e) {
    e.preventDefault();
    var pass = document.getElementById("admin-pass").value;
    adminLogin(pass).then(function (ok) {
      if (ok) {
        sessionStorage.setItem(ADMIN_KEY, pass);
        gate.style.display = "none";
        panel.style.display = "block";
        renderAdmin();
      } else {
        showMsg(document.getElementById("admin-login"), "Incorrect password.", "err");
      }
    });
  });
}
function renderAdmin() {
  if (document.getElementById("admin-panel").style.display !== "block") return;
  var pending = itemsCache.filter(function (i) { return i.status === "claimed"; });
  var body = document.getElementById("admin-body");
  body.innerHTML = pending.length ? pending.map(rowHTML).join("") :
    '<tr><td colspan="5" class="empty-state">No claims waiting for verification.</td></tr>';
  body.querySelectorAll("[data-verify]").forEach(function (b) {
    b.addEventListener("click", function () { verifyItem(b.dataset.verify).then(renderAdmin); });
  });
  body.querySelectorAll("[data-reject]").forEach(function (b) {
    b.addEventListener("click", function () { rejectItem(b.dataset.reject).then(renderAdmin); });
  });
}
function rowHTML(item) {
  return "<tr><td>" + item._id.slice(-6).toUpperCase() + '<br><span class="item-meta">' + escapeHTML(item.title) + "</span></td>" +
    "<td>" + (item.type === "lost" ? "Lost" : "Found") + "</td>" +
    "<td>" + escapeHTML(item.claim.name) + '<br><span class="item-meta">' + escapeHTML(item.claim.note) + "</span></td>" +
    "<td>" + escapeHTML(item.contact) + "</td>" +
    '<td><button class="btn small action" data-verify="' + item._id + '">Mark returned</button> ' +
    '<button class="btn small secondary" data-reject="' + item._id + '">Reject claim</button></td></tr>';
}

document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll("nav.main a").forEach(function (a) {
    a.addEventListener("click", function () { showView(a.dataset.view); });
  });
  initReportForm();
  initBrowseFilters();
  initAdmin();

  refresh().then(function () { showView("home"); }).catch(function () {
    showGlobalError("Couldn't reach the server. Is it running, and is DATABASE_URL set correctly?");
    showView("home");
  });

  setInterval(function () {
    refresh().then(renderCurrentView).catch(function () {});
  }, 8000);
});
</script>
</body>
</html>`;

app.get("*", (req, res) => {
  res.type("html").send(PAGE);
});

// ---------- Start ----------
const PORT = process.env.PORT || 3000;

if (!connectionString) {
  console.error(
    "Missing DATABASE_URL. Copy .env.example to .env and fill in your Postgres connection string."
  );
  process.exit(1);
}

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("Database connection error:", err.message);
    process.exit(1);
  });
