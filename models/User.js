const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phoneNumber: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  publicKey: { type: String, required: true },
  privateKey: { type: String, required: true }, // Store securely (or remove if storing elsewhere)
  contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Add this field
  friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
});

module.exports = mongoose.model("User", UserSchema);
