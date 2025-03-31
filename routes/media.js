const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const auth = require("../middleware/auth");
const optimizeImage = require("../middleware/imageOptimization");
const Media = require("../models/Media");

// Configure storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

// Configure upload middleware
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max size
  fileFilter: (req, file, cb) => {
    // Allow only certain file types
    const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|mp3|ogg|wav/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error("Only images and media files are allowed"));
    }
  },
});

// Upload a file
router.post("/upload", auth, upload.single("media"), optimizeImage, (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    
    // Prepare response based on whether image optimization was applied
    const response = {
      mediaUrl: `/uploads/${req.file.filename}`,
      mediaType: req.file.mimetype,
    };
    
    // Add thumbnail info if available (for images)
    if (req.file.thumbnail) {
      response.thumbnailUrl = req.file.thumbnail.url;
    }
    
    res.json(response);
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ error: "Error uploading file" });
  }
});

module.exports = router;
