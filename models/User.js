const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  publicKey: { type: String, required: true },
  privateKey: { type: String, required: true }, // Store securely (or remove if storing elsewhere)
});

module.exports = mongoose.model("User", UserSchema);
