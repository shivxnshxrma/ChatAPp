const express = require("express");
const multer = require("multer");
const path = require("path");
const Message = require("../models/Message");
const authMiddleware = require("../middleware/auth");
const { messageValidation } = require("../middleware/validation");
const optimizeImage = require("../middleware/imageOptimization");

const router = express.Router();

// 📂 Configure Multer for Media Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Save files in the uploads folder
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max size
});

// 📩 **Send Message (Text or Media)**
router.post(
  "/send",
  authMiddleware,
  upload.single("media"),
  optimizeImage,
  messageValidation,
  async (req, res) => {
    try {
      const { receiverId, content } = req.body;
      const senderId = req.user.id; // Extract from authentication middleware

      let mediaUrl = null;
      let mediaType = null;
      let thumbnailUrl = null;

      // ✅ If media is uploaded, set media URL and type
      if (req.file) {
        mediaUrl = `/uploads/${req.file.filename}`;
        mediaType = req.file.mimetype;
        
        if (req.file.thumbnail) {
          thumbnailUrl = req.file.thumbnail.url;
        }
      }

      // ✅ Save message to database
      const message = new Message({
        sender: senderId,
        receiver: receiverId,
        content: content || "", // Allow empty content for media-only messages
        mediaUrl,
        mediaType,
        thumbnailUrl,
      });

      await message.save();
      
      // Populate sender info
      await message.populate("sender", "username");
      
      res.status(201).json({ success: true, message });
    } catch (error) {
      console.error("Message send error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  }
);

// 📩 **Get Messages Between Two Users with Pagination**
router.get("/:otherUserId", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const otherUserId = req.params.otherUserId;
    
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get messages with pagination
    const messages = await Message.find({
      $or: [
        { sender: userId, receiver: otherUserId },
        { sender: otherUserId, receiver: userId },
      ],
    })
      .sort({ createdAt: -1 }) // Sort by newest first for pagination
      .skip(skip)
      .limit(limit)
      .populate("sender", "username")
      .lean();
    
    // Get total count for pagination info
    const totalMessages = await Message.countDocuments({
      $or: [
        { sender: userId, receiver: otherUserId },
        { sender: otherUserId, receiver: userId },
      ],
    });
    
    const totalPages = Math.ceil(totalMessages / limit);
    
    res.json({
      messages: messages.reverse(), // Reverse to show oldest first in the UI
      pagination: {
        currentPage: page,
        totalPages,
        totalMessages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

module.exports = router;
