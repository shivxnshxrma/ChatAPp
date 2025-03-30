const express = require("express");
const User = require("../models/User");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

// 🔍 Search for a user by username
router.get("/search", authenticateToken, async (req, res) => {
  try {
    const { username } = req.query;
    if (!username)
      return res.status(400).json({ error: "Username is required" });

    const user = await User.findOne({ username }).select("id username");
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ user });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
