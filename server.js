require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");

const itemsRouter = require("./routes/items");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use("/api/items", itemsRouter);

app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (password && password === (process.env.ADMIN_PASSWORD || "admin123")) {
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false, error: "Incorrect password" });
});

// Any other route falls back to the single-page app
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error(
    "Missing MONGODB_URI. Copy .env.example to .env and fill in your MongoDB Atlas connection string."
  );
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  });