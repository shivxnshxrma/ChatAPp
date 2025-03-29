const express = require("express");
const router = express.Router();
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const authMiddleware = require("../middleware/auth");

// ✅ Fetch all contacts of the logged-in user
router.get("/", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate(
      "contacts",
      "username"
    );
    res.json(user.contacts);
  } catch (error) {
    console.error("❌ Error fetching contacts:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Add a new contact by username
router.post("/add", authMiddleware, async (req, res) => {
  const { username } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const contact = await User.findOne({ username });
    if (!contact) return res.status(404).json({ error: "Contact not found" });

    if (user.contacts.includes(contact._id)) {
      return res.status(400).json({ error: "Contact already exists" });
    }

    user.contacts.push(contact._id);
    await user.save();

    res.json({ message: "Contact added successfully!", contact });
  } catch (error) {
    console.error("❌ Error adding contact:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
