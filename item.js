const mongoose = require("mongoose");

const claimSchema = new mongoose.Schema(
  {
    name: String,
    note: String,
  },
  { _id: false }
);

const itemSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["lost", "found"], required: true },
    title: { type: String, required: true },
    category: { type: String, default: "Other" },
    description: { type: String, required: true },
    location: { type: String, required: true },
    date: { type: String, required: true },
    contact: { type: String, required: true },
    status: {
      type: String,
      enum: ["active", "claimed", "returned"],
      default: "active",
    },
    claim: { type: claimSchema, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Item", itemSchema);