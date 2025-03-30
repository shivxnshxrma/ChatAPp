const express = require("express");
const User = require("../models/User");
const authenticateToken = require("../middleware/auth");

const router = express.Router();

// ✉️ Send friend request
router.post("/request", authenticateToken, async (req, res) => {
  try {
    const senderId = req.user.id;
    const { receiverId } = req.body;

    if (!receiverId) {
      return res.status(400).json({ error: "Receiver ID is required" });
    }

    const sender = await User.findById(senderId);
    const receiver = await User.findById(receiverId);

    if (!receiver) return res.status(404).json({ error: "User not found" });
    if (receiver.friendRequests.includes(senderId)) {
      return res.status(400).json({ error: "Friend request already sent" });
    }

    // Add sender to receiver's friendRequests
    receiver.friendRequests.push(senderId);
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

    // Find the user and populate friendRequests with username and id
    const user = await User.findById(userId).populate(
      "friendRequests",
      "username"
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Format the response to match frontend expectations
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
    const { requestId } = req.body;

    if (!requestId) {
      return res.status(400).json({ error: "Request ID is required" });
    }

    const user = await User.findById(userId);
    const friend = await User.findById(requestId);

    if (!user || !friend) {
      return res.status(404).json({ error: "User not found" });
    }

    // Remove from friendRequests
    user.friendRequests = user.friendRequests.filter(
      (id) => id.toString() !== requestId
    );

    // Add to contacts if not already added
    if (!user.contacts.includes(requestId)) {
      user.contacts.push(requestId);
    }
    if (!friend.contacts.includes(userId)) {
      friend.contacts.push(userId);
    }

    await user.save();
    await friend.save();

    res.json({ message: "Friend request accepted!" });
  } catch (error) {
    console.error("Accept friend request error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
