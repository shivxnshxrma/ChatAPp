const express = require("express");
const router = express.Router();
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const authMiddleware = require("../middleware/auth");

// Get all contacts with pagination
router.get("/", authMiddleware, async (req, res) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    
    // Get the current user with populated contacts
    const user = await User.findById(req.user.id)
      .select("-password -privateKey -publicKey")
      .populate({
        path: "contacts",
        select: "username email phoneNumber",
        match: search ? { 
          $or: [
            { username: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
            { phoneNumber: { $regex: search, $options: "i" } },
          ] 
        } : {},
      });
    
    // If no user found
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Apply pagination manually after populate
    const totalContacts = user.contacts.length;
    const paginatedContacts = user.contacts.slice(skip, skip + limit);
    
    const totalPages = Math.ceil(totalContacts / limit);
    
    res.json({
      contacts: paginatedContacts,
      pagination: {
        currentPage: page,
        totalPages,
        totalContacts,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching contacts:", error);
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

// Search users to add as contacts
router.get("/search", authMiddleware, async (req, res) => {
  try {
    const searchTerm = req.query.q || "";
    if (searchTerm.length < 3) {
      return res.status(400).json({ error: "Search term must be at least 3 characters" });
    }
    
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Find users matching search term who aren't the current user
    const users = await User.find({
      $and: [
        { _id: { $ne: req.user.id } }, // Not the current user
        {
          $or: [
            { username: { $regex: searchTerm, $options: "i" } },
            { email: { $regex: searchTerm, $options: "i" } },
            { phoneNumber: { $regex: searchTerm, $options: "i" } },
          ],
        },
      ],
    })
      .select("username email phoneNumber")
      .skip(skip)
      .limit(limit);
    
    // Get total count for pagination
    const totalUsers = await User.countDocuments({
      $and: [
        { _id: { $ne: req.user.id } },
        {
          $or: [
            { username: { $regex: searchTerm, $options: "i" } },
            { email: { $regex: searchTerm, $options: "i" } },
            { phoneNumber: { $regex: searchTerm, $options: "i" } },
          ],
        },
      ],
    });
    
    const totalPages = Math.ceil(totalUsers / limit);
    
    res.json({
      users,
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({ error: "Failed to search users" });
  }
});

// ✅ Add a new contact by username
router.post("/add", authMiddleware, async (req, res) => {
  const { username } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const contact = await User.findOne({ username });
    if (!contact) return res.status(404).json({ error: "Contact not found" });

    if (user.contacts.includes(contact._id)) {
      return res.status(400).json({ error: "Contact already exists" });
    }

    user.contacts.push(contact._id);
    await user.save();

    res.json({ message: "Contact added successfully!", contact });
  } catch (error) {
    console.error("❌ Error adding contact:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
