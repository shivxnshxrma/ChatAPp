const express = require("express");
const multer = require("multer");
const Media = require("../models/Media");
const authMiddleware = require("../middleware/auth");
const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

router.post(
  "/upload",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
    const media = new Media({
      messageId: req.body.messageId,
      filePath: req.file.path,
      fileType: req.file.mimetype,
    });
    await media.save();
    res.status(201).json(media);
  }
);

module.exports = router;
