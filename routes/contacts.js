const express = require("express");
const router = express.Router();
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const authMiddleware = require("../middleware/auth");

// Debug endpoint - doesn't require auth
router.get("/debug", (req, res) => {
  res.status(200).json({ 
    message: "Contacts API is working!", 
    timestamp: new Date().toISOString() 
  });
});

// Debug endpoint to check contacts without populating - doesn't require auth
router.get("/debug/raw", authMiddleware, async (req, res) => {
  try {
    // Find the user without populating contacts
    const user = await User.findById(req.user.id)
      .select("username email contacts");
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Return raw contacts data for debugging
    return res.json({
      userId: user._id,
      username: user.username,
      contactIds: user.contacts,
      contactCount: user.contacts ? user.contacts.length : 0,
      message: "Raw contacts debug info",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error in contacts debug endpoint:", error);
    return res.status(500).json({ error: "Failed to get contacts debug info" });
  }
});

// Get friend requests - this needs to come BEFORE the /:contactId route
router.get("/requests", authMiddleware, async (req, res) => {
  try {
    console.log("Fetching friend requests");
    const user = await User.findById(req.user.id)
      .populate({
        path: "friendRequests", 
        select: "username email"
      });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({
      friendRequests: user.friendRequests || [],
    });
  } catch (error) {
    console.error("Error fetching friend requests:", error);
    return res.status(500).json({ error: "Failed to fetch friend requests" });
  }
});

// Get all contacts with pagination
router.get("/", authMiddleware, async (req, res) => {
  try {
    console.log("Fetching contacts for user ID:", req.user.id);
    
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
        select: "username email phoneNumber _id",
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
      console.log("User not found for contacts retrieval");
      return res.status(404).json({ error: "User not found" });
    }
    
    console.log(`Found user with ${user.contacts ? user.contacts.length : 0} contacts`);
    
    // Check if contacts is defined and is an array
    if (!user.contacts || !Array.isArray(user.contacts)) {
      console.log("Contacts missing or not an array");
      return res.json([]);
    }
    
    // Add online status and unread count to each contact
    const contactsWithStatus = user.contacts.map(contact => {
      // Only do this if contact is a full document (not just an ID)
      if (contact._id) {
        return {
          ...contact.toObject(),
          unreadCount: 0, // This would be calculated from messages
          isOnline: false, // This would come from socket connections
          lastSeen: new Date().toISOString() // Placeholder
        };
      } else {
        // If we only have the ID, return a minimal object
        return {
          _id: contact,
          username: "Unknown",
          email: "",
          unreadCount: 0,
          isOnline: false,
          lastSeen: new Date().toISOString()
        };
      }
    });
    
    // Apply pagination manually after populate
    const totalContacts = contactsWithStatus.length;
    const paginatedContacts = contactsWithStatus.slice(skip, skip + limit);
    
    const totalPages = Math.ceil(totalContacts / limit);
    
    console.log(`Returning ${paginatedContacts.length} contacts`);
    
    // Simply return the array of contacts
    return res.json(paginatedContacts);
  } catch (error) {
    console.error("Error fetching contacts:", error);
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

// Search users to add as contacts
router.get("/search", authMiddleware, async (req, res) => {
  try {
    // Support both q and username parameters for compatibility
    const searchTerm = req.query.q || req.query.username || "";
    
    console.log(`Searching users with term: ${searchTerm}`);
    
    if (searchTerm.length < 2) {
      return res.status(400).json({ error: "Search term must be at least 2 characters" });
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
    
    console.log(`Found ${users.length} users matching search term: ${searchTerm}`);
    
    // If only one user is found, return it directly for the mobile app
    if (users.length === 1) {
      return res.json(users[0]);
    }
    
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

// Custom endpoint for sending friend requests
router.post("/request", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const currentUser = await User.findById(req.user.id);
    const targetUser = await User.findById(userId);

    if (!currentUser || !targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if request already sent
    if (targetUser.friendRequests.includes(currentUser._id)) {
      return res.status(400).json({ error: "Friend request already sent" });
    }

    // Check if already friends
    if (currentUser.contacts.includes(targetUser._id)) {
      return res.status(400).json({ error: "Users are already friends" });
    }

    targetUser.friendRequests.push(currentUser._id);
    await targetUser.save();

    res.json({ message: "Friend request sent" });
  } catch (error) {
    console.error("Error sending friend request:", error);
    res.status(500).json({ error: "Failed to send friend request" });
  }
});

// Accept friend request
router.post("/request/:requestId/accept", authMiddleware, async (req, res) => {
  try {
    const { requestId } = req.params;
    const currentUser = await User.findById(req.user.id);
    const requestingUser = await User.findById(requestId);

    if (!currentUser || !requestingUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if request exists
    if (!currentUser.friendRequests.includes(requestId)) {
      return res.status(400).json({ error: "Friend request not found" });
    }

    // Add to contacts
    currentUser.contacts.push(requestId);
    requestingUser.contacts.push(currentUser._id);

    // Remove from requests
    currentUser.friendRequests = currentUser.friendRequests.filter(
      id => id.toString() !== requestId
    );

    await Promise.all([currentUser.save(), requestingUser.save()]);

    res.json({ message: "Friend request accepted" });
  } catch (error) {
    console.error("Error accepting friend request:", error);
    res.status(500).json({ error: "Failed to accept friend request" });
  }
});

// Get a single contact by ID - this should be LAST since it uses a dynamic parameter
router.get("/:contactId", authMiddleware, async (req, res) => {
  try {
    const contactId = req.params.contactId;
    console.log(`Fetching contact with ID: ${contactId}`);
    
    // Validate contact ID format
    if (!contactId || contactId.length < 12) {
      console.log('Invalid contact ID format');
      return res.status(400).json({ 
        error: "Invalid contact ID format",
        contact: {
          _id: contactId,
          username: "Unknown",
          email: "",
          unreadCount: 0,
          isOnline: false,
          lastSeen: new Date().toISOString()
        }
      });
    }
    
    // Look up the user directly by ID - don't require them to be in contacts
    try {
      // Get the contact details
      const contact = await User.findById(contactId)
        .select("username email phoneNumber _id");
      
      if (!contact) {
        console.log(`Contact not found with ID: ${contactId}`);
        return res.json({
          _id: contactId,
          username: "Unknown",
          email: "",
          unreadCount: 0,
          isOnline: false,
          lastSeen: new Date().toISOString()
        });
      }
      
      console.log(`Found contact: ${contact.username}`);
      
      // Add unread count and online status properties for the frontend
      const contactWithStatus = {
        ...contact.toObject(),
        unreadCount: 0,  // This would be calculated from messages
        isOnline: false, // This would come from socket connections
        lastSeen: new Date().toISOString() // Placeholder
      };
      
      res.json(contactWithStatus);
    } catch (contactError) {
      console.error("Error finding contact:", contactError);
      // Return a placeholder contact rather than an error
      return res.json({
        _id: contactId,
        username: "Unknown User",
        email: "",
        unreadCount: 0,
        isOnline: false,
        lastSeen: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error("Error in contact route:", error);
    // Return a valid response even if there's an error
    res.json({
      _id: req.params.contactId,
      username: "Error Loading User",
      email: "",
      unreadCount: 0,
      isOnline: false,
      lastSeen: new Date().toISOString()
    });
  }
});

module.exports = router;
