const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const router = express.Router();
const { generateKeyPairSync } = require("crypto");
const auth = require("../middleware/auth");

// Register route
router.post("/register", async (req, res) => {
  try {
    const { username, password, email, phoneNumber } = req.body;

    // Check if user already exists
    // console.log(username);
    // console.log(password);
    // console.log(email);

    const existingUser = await User.findOne({
      $or: [{ username }, { email }, { phoneNumber }],
    });

    if (existingUser) {
      return res.status(400).json({ error: "Username or Email already taken" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate RSA key pair for the user
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });

    // Store keys securely
    const user = new User({
      username,
      password: hashedPassword,
      email: email,
      phoneNumber: phoneNumber,
      publicKey: publicKey.export({ type: "spki", format: "pem" }),
      privateKey: privateKey.export({ type: "pkcs8", format: "pem" }), // Store securely
    });

    await user.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Login route
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id },
      "48c2d6be0cc9336269ead671a308fab990769445c1026ccdce6506f5bdb1ef5b",
      {
        expiresIn: "1h",
      }
    );

    res.json({ token, publicKey: user.publicKey });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password"); // Exclude password

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
