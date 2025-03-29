const mongoose = require("mongoose");
const mediaSchema = new mongoose.Schema({
  messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
  filePath: { type: String, required: true },
  fileType: { type: String, required: true },
});
module.exports = mongoose.model("Media", mediaSchema);
