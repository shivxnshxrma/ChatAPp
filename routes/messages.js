const express = require("express");
const multer = require("multer");
const path = require("path");
const Message = require("../models/Message");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

// 📂 Configure Multer for Media Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Save files in the uploads folder
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Unique file name
  },
});

const upload = multer({ storage });

// 📩 **Send Message (Text or Media)**
router.post(
  "/send",
  authMiddleware,
  upload.single("media"),
  async (req, res) => {
    try {
      const { receiverId, content } = req.body;
      const senderId = req.user.id; // Extract from authentication middleware

      let mediaUrl = null;
      let mediaType = null;

      // ✅ If media is uploaded, set media URL and type
      if (req.file) {
        mediaUrl = `/uploads/${req.file.filename}`;
        mediaType = req.file.mimetype.split("/")[0]; // Extract 'image', 'video', etc.
      }

      // ✅ Save message to database
      const message = new Message({
        sender: senderId,
        receiver: receiverId,
        content: content || "", // Allow empty content for media-only messages
        mediaUrl,
        mediaType,
      });

      await message.save();
      res.status(201).json({ success: true, message });
    } catch (error) {
      console.error("Message send error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

// 📩 **Get Messages Between Two Users**
router.get("/:otherUserId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const otherUserId = req.params.otherUserId;

    const messages = await Message.find({
      $or: [
        { sender: userId, receiver: otherUserId },
        { sender: otherUserId, receiver: userId },
      ],
    }).sort({ timestamp: 1 }); // Sort messages by time (oldest first)

    res.json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).send("Server error");
  }
});

module.exports = router;
