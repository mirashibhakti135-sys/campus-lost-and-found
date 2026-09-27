/* =========================================================
   Campus Lost & Found — script.js
   Data layer + page logic.

   Data layer is isolated in the `Store` object below. Right now
   it reads/writes browser localStorage, so the whole app works
   with zero setup. To switch to Firebase later (per the optional
   requirement), you only need to rewrite the functions inside
   `Store` to call Firestore instead — every page calls Store.*,
   never localStorage directly, so nothing else changes.
   ========================================================= */

const STORAGE_KEY = "lf_items_v1";
const ADMIN_KEY = "lf_admin_v1";

const Store = {
  _read() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  },
  _write(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  },
  getAll() {
    return this._read().sort((a, b) => b.createdAt - a.createdAt);
  },
  getById(id) {
    return this._read().find((i) => i.id === id);
  },
  add(item) {
    const items = this._read();
    const record = {
      id: "LF-" + Date.now().toString(36).toUpperCase(),
      status: "active", // active -> claimed -> returned
      createdAt: Date.now(),
      claim: null,
      ...item,
    };
    items.push(record);
    this._write(items);
    return record;
  },
  update(id, patch) {
    const items = this._read();
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...patch };
    this._write(items);
    return items[idx];
  },
  search({ q = "", type = "all", category = "all", status = "active" } = {}) {
    q = q.trim().toLowerCase();
    return this.getAll().filter((item) => {
      if (status !== "all" && item.status !== status) return false;
      if (type !== "all" && item.type !== type) return false;
      if (category !== "all" && item.category !== category) return false;
      if (!q) return true;
      const hay = (item.title + " " + item.description + " " + item.location)
        .toLowerCase();
      return hay.includes(q);
    });
  },
};

// ---- seed a few example items on first run, so the demo isn't empty ----
(function seed() {
  if (localStorage.getItem(STORAGE_KEY)) return;
  const now = Date.now();
  Store._write([
    {
      id: "LF-SEED1",
      type: "found",
      title: "Blue water bottle",
      category: "Personal item",
      description: "Steel bottle with a dented cap, found near the library steps.",
      location: "Main Library",
      date: new Date(now - 86400000).toISOString().slice(0, 10),
      contact: "front.desk@campus.edu",
      status: "active",
      claim: null,
      createdAt: now - 86400000,
    },
    {
      id: "LF-SEED2",
      type: "lost",
      title: "Student ID card — Aditi R.",
      category: "ID / Documents",
      description: "Lost somewhere between the canteen and Block C.",
      location: "Canteen / Block C",
      date: new Date(now - 3 * 86400000).toISOString().slice(0, 10),
      contact: "aditi.r@campus.edu",
      status: "active",
      claim: null,
      createdAt: now - 3 * 86400000,
    },
    {
      id: "LF-SEED3",
      type: "found",
      title: "Black wired earphones",
      category: "Electronics",
      description: "Found on a bench outside the CS department.",
      location: "CS Department",
      date: new Date(now - 5 * 86400000).toISOString().slice(0, 10),
      contact: "security@campus.edu",
      status: "returned",
      claim: { name: "Rohan K.", note: "Confirmed by CCTV + description match." },
      createdAt: now - 5 * 86400000,
    },
  ]);
})();

// ---- helpers shared by pages ----
function fmtDate(d) {
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

function itemCardHTML(item, opts = {}) {
  const showClaimBtn = opts.showClaimBtn && item.status === "active";
  return `
    <div class="item-card ${item.type}">
      <span class="item-tag ${tagClass(item)}">${statusLabel(item)}</span>
      <h3>${escapeHTML(item.title)}</h3>
      <p class="item-meta">${escapeHTML(item.category)} · ${escapeHTML(item.location)} · ${fmtDate(item.date)}</p>
      <p class="item-desc">${escapeHTML(item.description)}</p>
      ${showClaimBtn ? `<button class="btn action small" onclick="openClaim('${item.id}')">Claim this item</button>` : ""}
      ${item.claim ? `<div class="claim-note"><b>Claim:</b> ${escapeHTML(item.claim.name)} — ${escapeHTML(item.claim.note || "")}</div>` : ""}
    </div>`;
}

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// =========================================================
// report.html — Report Lost / Found Item -> Enter Details -> Submit
// =========================================================
function initReportPage() {
  const form = document.getElementById("report-form");
  if (!form) return;

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

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());

    if (!data.title || !data.description || !data.location || !data.date || !data.contact) {
      showMsg(form, "Please fill in every field before submitting.", "err");
      return;
    }

    const record = Store.add({
      type: currentType,
      title: data.title,
      category: data.category,
      description: data.description,
      location: data.location,
      date: data.date,
      contact: data.contact,
    });

    form.reset();
    setType("lost");
    showMsg(form, `Reported — added to the list as ${record.id}. You can track it on the Browse page.`, "ok");
  });
}

function showMsg(form, text, kind) {
  let msg = form.querySelector(".msg");
  if (!msg) {
    msg = document.createElement("div");
    msg.className = "msg";
    form.appendChild(msg);
  }
  msg.className = `msg ${kind}`;
  msg.textContent = text;
}

// =========================================================
// browse.html — Search / View Item -> Claim Item
// =========================================================
function initBrowsePage() {
  const grid = document.getElementById("item-grid");
  if (!grid) return;

  const qInput = document.getElementById("q");
  const typeSelect = document.getElementById("filter-type");
  const catSelect = document.getElementById("filter-category");

  function render() {
    const items = Store.search({
      q: qInput.value,
      type: typeSelect.value,
      category: catSelect.value,
      status: "all",
    });
    grid.innerHTML = items.length
      ? items.map((i) => itemCardHTML(i, { showClaimBtn: true })).join("")
      : `<div class="empty-state">No items match your search yet. Try a different keyword or check back later.</div>`;
  }

  qInput.addEventListener("input", render);
  typeSelect.addEventListener("change", render);
  catSelect.addEventListener("change", render);
  render();
}

// Claim flow — simple prompt-based modal-free claim for a small project
function openClaim(id) {
  const item = Store.getById(id);
  if (!item) return;
  const name = prompt("Your name, for the claim record:");
  if (!name) return;
  const note = prompt("Briefly describe how you can verify this is yours (a detail only the owner would know):");
  if (!note) return;

  Store.update(id, { status: "claimed", claim: { name, note } });
  alert("Claim submitted. An admin will verify it before the item is marked returned.");
  initBrowsePage();
}

// =========================================================
// admin.html — Admin Verification -> Item Returned
// =========================================================
function initAdminPage() {
  const gate = document.getElementById("admin-gate");
  const panel = document.getElementById("admin-panel");
  if (!gate || !panel) return;

  const loggedIn = sessionStorage.getItem(ADMIN_KEY) === "1";
  if (loggedIn) showAdminPanel();

  document.getElementById("admin-login").addEventListener("submit", (e) => {
    e.preventDefault();
    const pass = document.getElementById("admin-pass").value;
    // Demo-only password check. Replace with real auth (e.g. Firebase Auth)
    // before using this beyond a class project.
    if (pass === "admin123") {
      sessionStorage.setItem(ADMIN_KEY, "1");
      showAdminPanel();
    } else {
      showMsg(document.getElementById("admin-login"), "Incorrect password.", "err");
    }
  });

  function showAdminPanel() {
    gate.style.display = "none";
    panel.style.display = "block";
    renderTable();
  }

  function renderTable() {
    const pending = Store.getAll().filter((i) => i.status === "claimed");
    const body = document.getElementById("admin-body");
    body.innerHTML = pending.length
      ? pending.map(rowHTML).join("")
      : `<tr><td colspan="5" class="empty-state">No claims waiting for verification.</td></tr>`;
  }

  function rowHTML(item) {
    return `
      <tr>
        <td>${item.id}<br><span class="item-meta">${escapeHTML(item.title)}</span></td>
        <td>${item.type === "lost" ? "Lost" : "Found"}</td>
        <td>${escapeHTML(item.claim.name)}<br><span class="item-meta">${escapeHTML(item.claim.note)}</span></td>
        <td>${escapeHTML(item.contact)}</td>
        <td>
          <button class="btn small action" onclick="verifyItem('${item.id}')">Mark returned</button>
          <button class="btn small secondary" onclick="rejectClaim('${item.id}')">Reject claim</button>
        </td>
      </tr>`;
  }

  window.verifyItem = (id) => {
    Store.update(id, { status: "returned" });
    renderTable();
  };
  window.rejectClaim = (id) => {
    Store.update(id, { status: "active", claim: null });
    renderTable();
  };
}

// =========================================================
// index.html — stats strip
// =========================================================
function initHomeStats() {
  const el = document.getElementById("home-stats");
  if (!el) return;
  const items = Store.getAll();
  const active = items.filter((i) => i.status === "active").length;
  const pending = items.filter((i) => i.status === "claimed").length;
  const returned = items.filter((i) => i.status === "returned").length;
  el.innerHTML = `
    <div class="stat"><b>${active}</b><span>Active listings</span></div>
    <div class="stat"><b>${pending}</b><span>Claims pending</span></div>
    <div class="stat"><b>${returned}</b><span>Items returned</span></div>`;
}

document.addEventListener("DOMContentLoaded", () => {
  initReportPage();
  initBrowsePage();
  initAdminPage();
  initHomeStats();
});