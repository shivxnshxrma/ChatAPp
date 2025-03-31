const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const router = express.Router();
const { generateKeyPairSync } = require("crypto");
const auth = require("../middleware/auth");
const { registerValidation, loginValidation } = require("../middleware/validation");
const { authLimiter, createAccountLimiter } = require("../middleware/rateLimiter");
const { v4: uuidv4 } = require('uuid');

// Store refresh tokens (in a real app, these should be in the database)
// This is just for demonstration purposes
const refreshTokens = new Map();

// Register route
router.post("/register", createAccountLimiter, registerValidation, async (req, res) => {
  try {
    const { username, password, email, phoneNumber } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [
        { username },
        { email },
        { phoneNumber }
      ]
    });

    if (existingUser) {
      return res.status(400).json({ 
        error: "Registration failed",
        message: existingUser.username === username ? "Username already taken" : 
                 existingUser.email === email ? "Email already in use" : 
                 "Phone number already in use"
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate RSA key pair for the user
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });

    // Export public key for database storage
    const publicKeyString = publicKey.export({ type: "spki", format: "pem" });
    
    // Generate a unique identifier for the key
    const keyId = require('crypto').randomUUID();
    
    // In a production app, store privateKey securely in a vault service
    // For now, we'll return it to the client for client-side storage
    const privateKeyString = privateKey.export({ type: "pkcs8", format: "pem" });

    // Create new user with public key only
    const user = new User({
      username,
      password: hashedPassword,
      email,
      phoneNumber,
      publicKey: publicKeyString,
      keyIdentifier: keyId,
    });

    await user.save();
    
    // Return private key to client for secure storage
    res.status(201).json({ 
      message: "User registered successfully", 
      keyId,
      privateKey: privateKeyString // In production, this should be handled more securely
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Login route
router.post("/login", authLimiter, loginValidation, async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    // Generate refresh token
    const refreshToken = uuidv4();
    
    // Store refresh token with user ID (in a real app, save to database)
    refreshTokens.set(refreshToken, {
      userId: user._id.toString(),
      createdAt: new Date()
    });

    res.json({ 
      token, 
      refreshToken,
      publicKey: user.publicKey 
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Refresh token endpoint
router.post("/refresh-token", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token is required" });
    }
    
    // Check if refresh token exists
    const tokenData = refreshTokens.get(refreshToken);
    if (!tokenData) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }
    
    // Check if refresh token is too old (more than 30 days)
    const tokenAge = Date.now() - tokenData.createdAt;
    if (tokenAge > 30 * 24 * 60 * 60 * 1000) { // 30 days in ms
      refreshTokens.delete(refreshToken);
      return res.status(401).json({ error: "Refresh token expired" });
    }
    
    // Get user from database
    const user = await User.findById(tokenData.userId);
    if (!user) {
      refreshTokens.delete(refreshToken);
      return res.status(401).json({ error: "User not found" });
    }
    
    // Generate new JWT token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );
    
    // Generate new refresh token
    const newRefreshToken = uuidv4();
    
    // Delete old refresh token and store new one
    refreshTokens.delete(refreshToken);
    refreshTokens.set(newRefreshToken, {
      userId: user._id.toString(),
      createdAt: new Date()
    });
    
    res.json({ 
      token, 
      refreshToken: newRefreshToken 
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Logout endpoint
router.post("/logout", auth, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    // Remove refresh token if provided
    if (refreshToken) {
      refreshTokens.delete(refreshToken);
    }
    
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
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
