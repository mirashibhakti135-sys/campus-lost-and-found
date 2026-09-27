const express = require("express");
const router = express.Router();
const Item = require("../models/Item");

function requireAdmin(req, res, next) {
  const pass = req.header("x-admin-password");
  if (pass && pass === (process.env.ADMIN_PASSWORD || "admin123")) return next();
  return res.status(403).json({ error: "Admin password required" });
}

// GET /api/items — list everything, newest first
router.get("/", async (req, res) => {
  try {
    const items = await Item.find().sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/items — report a new lost/found item
router.post("/", async (req, res) => {
  try {
    const { type, title, category, description, location, date, contact } = req.body;
    if (!type || !title || !description || !location || !date || !contact) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const item = await Item.create({ type, title, category, description, location, date, contact });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/items/:id/claim — anyone can submit a claim
router.patch("/:id/claim", async (req, res) => {
  try {
    const { name, note } = req.body;
    if (!name || !note) return res.status(400).json({ error: "Name and note are required" });
    const item = await Item.findByIdAndUpdate(
      req.params.id,
      { status: "claimed", claim: { name, note } },
      { new: true }
    );
    if (!item) return res.status(404).json({ error: "Item not found" });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/items/:id/verify — admin confirms the claim, item returned
router.patch("/:id/verify", requireAdmin, async (req, res) => {
  const item = await Item.findByIdAndUpdate(req.params.id, { status: "returned" }, { new: true });
  if (!item) return res.status(404).json({ error: "Item not found" });
  res.json(item);
});

// PATCH /api/items/:id/reject — admin rejects the claim, item goes back to active
router.patch("/:id/reject", requireAdmin, async (req, res) => {
  const item = await Item.findByIdAndUpdate(
    req.params.id,
    { status: "active", claim: null },
    { new: true }
  );
  if (!item) return res.status(404).json({ error: "Item not found" });
  res.json(item);
});

module.exports = router;