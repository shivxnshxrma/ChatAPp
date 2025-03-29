const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  content: { type: String }, // Optional, in case it's a text message
  mediaUrl: { type: String }, // URL of uploaded media
  mediaType: { type: String, enum: ["image", "video", "audio", "document"] }, // Type of media
  timestamp: { type: Date, default: Date.now },
  isDelivered: { type: Boolean, default: false },
});

module.exports = mongoose.model("Message", messageSchema);
