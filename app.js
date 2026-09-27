// =========================================================
// Campus Lost & Found — public/app.js
//
// This is the only file that knows about the network. Every view
// calls one of the `Store` functions below, which hit the Express
// API (/api/items/...) that server.js exposes. The API is the only
// thing that talks to MongoDB, so data survives refreshes, browser
// changes, and even redeploys.
// =========================================================

const ADMIN_KEY = "lf_admin_pass";
let itemsCache = [];

const Store = {
  async refresh() {
    const res = await fetch("/api/items");
    if (!res.ok) throw new Error("Failed to load items");
    itemsCache = await res.json();
    return itemsCache;
  },
  getAll() {
    return itemsCache;
  },
  getById(id) {
    return itemsCache.find((i) => i._id === id);
  },
  async add(item) {
    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to save");
    await Store.refresh();
    return data;
  },
  async claim(id, name, note) {
    const res = await fetch(`/api/items/${id}/claim`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, note }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to submit claim");
    await Store.refresh();
    return data;
  },
  async verify(id) {
    const res = await fetch(`/api/items/${id}/verify`, {
      method: "PATCH",
      headers: { "x-admin-password": sessionStorage.getItem(ADMIN_KEY) || "" },
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed to verify");
    await Store.refresh();
  },
  async reject(id) {
    const res = await fetch(`/api/items/${id}/reject`, {
      method: "PATCH",
      headers: { "x-admin-password": sessionStorage.getItem(ADMIN_KEY) || "" },
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed to reject");
    await Store.refresh();
  },
  async adminLogin(password) {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    return res.ok;
  },
  search({ q = "", type = "all", category = "all" } = {}) {
    q = q.trim().toLowerCase();
    return [...itemsCache].filter((item) => {
      if (type !== "all" && item.type !== type) return false;
      if (category !== "all" && item.category !== category) return false;
      if (!q) return true;
      const hay = (item.title + " " + item.description + " " + item.location).toLowerCase();
      return hay.includes(q);
    });
  },
};

// ---------- helpers ----------
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
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function itemCardHTML(item) {
  const showClaimBtn = item.status === "active";
  return `
    <div class="item-card ${item.type}">
      <span class="item-tag ${tagClass(item)}">${statusLabel(item)}</span>
      <h3>${escapeHTML(item.title)}</h3>
      <p class="item-meta">${escapeHTML(item.category)} · ${escapeHTML(item.location)} · ${fmtDate(item.date)}</p>
      <p class="item-desc">${escapeHTML(item.description)}</p>
      ${showClaimBtn ? `<button class="btn action small" data-claim="${item._id}">Claim this item</button>` : ""}
      ${item.claim ? `<div class="claim-note"><b>Claim:</b> ${escapeHTML(item.claim.name)} — ${escapeHTML(item.claim.note || "")}</div>` : ""}
    </div>`;
}
function showMsg(form, text, kind) {
  let msg = form.querySelector(".msg");
  if (!msg) { msg = document.createElement("div"); msg.className = "msg"; form.appendChild(msg); }
  msg.className = `msg ${kind}`;
  msg.textContent = text;
}
function showGlobalError(text) {
  const el = document.getElementById("global-error");
  el.textContent = text;
  el.style.display = "block";
}

// ---------- view switching ----------
const views = ["home", "report", "browse", "admin"];
function showView(name) {
  views.forEach((v) => {
    document.getElementById("view-" + v).style.display = v === name ? "block" : "none";
  });
  document.querySelectorAll("nav.main a").forEach((a) => {
    a.classList.toggle("active", a.dataset.view === name);
  });
  renderCurrentView();
  window.scrollTo(0, 0);
}
function renderCurrentView() {
  const active = document.querySelector("nav.main a.active");
  const view = active ? active.dataset.view : "home";
  if (view === "home") renderHome();
  if (view === "browse") renderBrowse();
  if (view === "admin") renderAdmin();
}

// ---------- home ----------
function renderHome() {
  const el = document.getElementById("home-stats");
  const items = Store.getAll();
  const active = items.filter((i) => i.status === "active").length;
  const pending = items.filter((i) => i.status === "claimed").length;
  const returned = items.filter((i) => i.status === "returned").length;
  el.innerHTML = `
    <div class="stat"><b>${active}</b><span>Active listings</span></div>
    <div class="stat"><b>${pending}</b><span>Claims pending</span></div>
    <div class="stat"><b>${returned}</b><span>Items returned</span></div>`;
}

// ---------- report ----------
function initReportForm() {
  const form = document.getElementById("report-form");
  let currentType = "lost";
  const lostBtn = document.getElementById("type-lost");
  const foundBtn = document.getElementById("type-found");

  function setType(t) {
    currentType = t;
    lostBtn.classList.toggle("on", t === "lost");
    foundBtn.classList.toggle("on", t === "found");
  }
  lostBtn.addEventListener("click", () => setType("lost"));
  foundBtn.addEventListener("click", () => setType("found"));
  setType("lost");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (!data.title || !data.description || !data.location || !data.date || !data.contact) {
      showMsg(form, "Please fill in every field before submitting.", "err");
      return;
    }
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      await Store.add({ type: currentType, ...data });
      form.reset();
      setType("lost");
      showMsg(form, "Reported — added to the list. You can find it on the Browse page.", "ok");
    } catch (err) {
      showMsg(form, "Couldn't save: " + err.message, "err");
    }
    btn.disabled = false;
  });
}

// ---------- browse ----------
function renderBrowse() {
  const grid = document.getElementById("item-grid");
  const q = document.getElementById("q").value;
  const type = document.getElementById("filter-type").value;
  const category = document.getElementById("filter-category").value;
  const items = Store.search({ q, type, category });
  grid.innerHTML = items.length
    ? items.map(itemCardHTML).join("")
    : `<div class="empty-state">No items match your search yet. Try a different keyword or check back later.</div>`;

  grid.querySelectorAll("[data-claim]").forEach((btn) => {
    btn.addEventListener("click", () => openClaim(btn.dataset.claim));
  });
}
function initBrowseFilters() {
  document.getElementById("q").addEventListener("input", renderBrowse);
  document.getElementById("filter-type").addEventListener("change", renderBrowse);
  document.getElementById("filter-category").addEventListener("change", renderBrowse);
}
async function openClaim(id) {
  const name = prompt("Your name, for the claim record:");
  if (!name) return;
  const note = prompt("Briefly describe how you can verify this is yours (a detail only the owner would know):");
  if (!note) return;
  try {
    await Store.claim(id, name, note);
    alert("Claim submitted. An admin will verify it before the item is marked returned.");
    renderBrowse();
  } catch (err) {
    alert("Couldn't submit claim: " + err.message);
  }
}

// ---------- admin ----------
function initAdmin() {
  const gate = document.getElementById("admin-gate");
  const panel = document.getElementById("admin-panel");
  if (sessionStorage.getItem(ADMIN_KEY)) {
    gate.style.display = "none";
    panel.style.display = "block";
  }
  document.getElementById("admin-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pass = document.getElementById("admin-pass").value;
    const ok = await Store.adminLogin(pass);
    if (ok) {
      sessionStorage.setItem(ADMIN_KEY, pass);
      gate.style.display = "none";
      panel.style.display = "block";
      renderAdmin();
    } else {
      showMsg(document.getElementById("admin-login"), "Incorrect password.", "err");
    }
  });
}
function renderAdmin() {
  if (document.getElementById("admin-panel").style.display !== "block") return;
  const pending = Store.getAll().filter((i) => i.status === "claimed");
  const body = document.getElementById("admin-body");
  body.innerHTML = pending.length
    ? pending.map(rowHTML).join("")
    : `<tr><td colspan="5" class="empty-state">No claims waiting for verification.</td></tr>`;

  body.querySelectorAll("[data-verify]").forEach((b) =>
    b.addEventListener("click", async () => { await Store.verify(b.dataset.verify); renderAdmin(); })
  );
  body.querySelectorAll("[data-reject]").forEach((b) =>
    b.addEventListener("click", async () => { await Store.reject(b.dataset.reject); renderAdmin(); })
  );
}
function rowHTML(item) {
  return `
    <tr>
      <td>${item._id.slice(-6).toUpperCase()}<br><span class="item-meta">${escapeHTML(item.title)}</span></td>
      <td>${item.type === "lost" ? "Lost" : "Found"}</td>
      <td>${escapeHTML(item.claim.name)}<br><span class="item-meta">${escapeHTML(item.claim.note)}</span></td>
      <td>${escapeHTML(item.contact)}</td>
      <td>
        <button class="btn small action" data-verify="${item._id}">Mark returned</button>
        <button class="btn small secondary" data-reject="${item._id}">Reject claim</button>
      </td>
    </tr>`;
}

// ---------- boot ----------
document.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll("nav.main a").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      showView(a.dataset.view);
    });
  });

  initReportForm();
  initBrowseFilters();
  initAdmin();

  try {
    await Store.refresh();
  } catch (err) {
    showGlobalError("Couldn't reach the server. Is it running, and is MONGODB_URI set correctly?");
  }
  showView("home");

  // Light polling so other users' changes show up without a manual refresh
  setInterval(async () => {
    try {
      await Store.refresh();
      renderCurrentView();
    } catch (_) { /* silent — next tick will retry */ }
  }, 8000);
});