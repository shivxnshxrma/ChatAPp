const express = require("express");
const User = require("../models/User");
const mongoose = require("mongoose");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

// ✉️ Send friend request
router.post("/request", authenticateToken, async (req, res) => {
  try {
    const senderId = req.user.id;
    const { receiverId } = req.body;

    if (!receiverId)
      return res.status(400).json({ error: "Receiver ID is required" });

    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({ error: "Invalid Receiver ID" });
    }

    const sender = await User.findById(senderId);
    const receiver = await User.findById(receiverId);

    if (!receiver) return res.status(404).json({ error: "User not found" });

    if (receiver.friendRequests.includes(senderId)) {
      return res.status(400).json({ error: "Friend request already sent" });
    }

    receiver.friendRequests.push(new mongoose.Types.ObjectId(senderId));
    await receiver.save();

    res.json({ message: "Friend request sent!" });
  } catch (error) {
    console.error("Friend request error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 📬 Get received friend requests
router.get("/requests", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).populate(
      "friendRequests",
      "username"
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const friendRequests = user.friendRequests.map((request) => ({
      id: request._id.toString(),
      username: request.username,
    }));

    res.json({ friendRequests });
  } catch (error) {
    console.error("Get friend requests error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ Accept friend request & Add to Contacts
router.post("/accept", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { senderId } = req.body; // Fixed variable name

    if (!senderId) {
      return res.status(400).json({ error: "Sender ID is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(senderId)) {
      return res.status(400).json({ error: "Invalid Sender ID" });
    }

    const user = await User.findById(userId);
    const sender = await User.findById(senderId);

    if (!user || !sender) {
      return res.status(404).json({ error: "User not found" });
    }

    // ✅ Remove from friendRequests
    user.friendRequests = user.friendRequests.filter(
      (id) => id.toString() !== senderId
    );

    // ✅ Add to contacts
    if (!user.contacts.includes(senderId)) {
      user.contacts.push(new mongoose.Types.ObjectId(senderId));
    }
    if (!sender.contacts.includes(userId)) {
      sender.contacts.push(new mongoose.Types.ObjectId(userId));
    }

    await user.save(); // ✅ Fixed bug (uncommented this line)
    await sender.save();

    res.json({ message: "Friend request accepted!" });
  } catch (error) {
    console.error("Accept friend request error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
