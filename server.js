require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const { apiLimiter } = require("./middleware/rateLimiter");

const authRoutes = require("./routes/auth");
const messageRoutes = require("./routes/messages");
const mediaRoutes = require("./routes/media");
const Message = require("./models/Message");
const contactRoutes = require("./routes/contacts");
const userRoutes = require("./routes/userRoutes");
const friendRoutes = require("./routes/friendRoutes");
const User = require("./models/User");

const app = express();
const server = http.createServer(app);

// Environment variables
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";
const ORIGIN = process.env.ALLOWED_ORIGIN || "*";

// Security headers with Helmet
app.use(helmet());

// Use compression for all responses
app.use(compression());

// CORS configuration
app.use(cors({
  origin: ORIGIN,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// JSON parsing with size limit
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Log all requests for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Socket.IO setup with CORS
const io = socketIo(server, {
  cors: {
    origin: ORIGIN,
    methods: ["GET", "POST"],
    credentials: true
  },
});

// Rate limiting for API routes
app.use("/api", apiLimiter);

// Static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ Connect to MongoDB with improved error handling
mongoose
  .connect(process.env.MONGO_URI, {
    // Add connection options for stability
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000, // 5 seconds timeout for server selection
    socketTimeoutMS: 45000, // 45 seconds timeout for socket operations
  })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
    // Don't exit the process - let the server run even without DB
    console.log("⚠️ Server will run in limited mode without database connection");
  });

// Handle MongoDB connection events
mongoose.connection.on('error', err => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected, attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
});

// Track online users and their last seen time
const onlineUsers = new Map(); // userId -> { socketId, lastSeen }

// Routes
app.use("/auth", authRoutes);
app.use("/messages", messageRoutes);
app.use("/media", mediaRoutes);
app.use("/contacts", contactRoutes);
app.use("/users", userRoutes);
app.use("/friends", friendRoutes);

// Add a test route at the root level
app.get("/test", (req, res) => {
  res.status(200).json({ 
    message: "API is working!",
    routes: {
      messages: "/messages/:otherUserId",
      messages_test: "/messages/test/ping",
      contacts: "/contacts",
      auth: "/auth/login and /auth/register",
    }
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "UP", environment: NODE_ENV });
});

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("❌ Server error:", err);
  const statusCode = err.statusCode || 500;
  const message = NODE_ENV === "production" ? "Internal Server Error" : err.message;
  res.status(statusCode).json({ error: message });
});

// ✅ Handle Socket.IO connections
io.on("connection", (socket) => {
  console.log("🔌 New user connected:", socket.id);

  // ✅ Extract user info from token
  try {
    const token = socket.handshake.auth.token;
    if (!token) return socket.disconnect(); // Disconnect if no token

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id; // Attach userId to socket
    socket.join(socket.userId); // Join a room for direct messages & updates
    
    // Track user as online with current timestamp
    onlineUsers.set(socket.userId, { 
      socketId: socket.id, 
      lastSeen: new Date().toISOString() 
    });
    
    // Broadcast to all connected users that this user is online
    socket.broadcast.emit('userStatus', { 
      userId: socket.userId, 
      isOnline: true 
    });
    
    // Send current online users status to the newly connected user
    for (const [userId, userData] of onlineUsers.entries()) {
      // Don't send user their own status
      if (userId !== socket.userId) {
        socket.emit('userStatus', {
          userId: userId,
          isOnline: true,
          lastSeen: userData.lastSeen
        });
      }
    }
    
    console.log(`✅ User ${socket.userId} joined the chat`);
  } catch (error) {
    console.error("❌ Invalid Token:", error);
    return socket.disconnect();
  }

  // ✅ Handle sending messages (text + media)
  socket.on("sendMessage", async (data) => {
    try {
      console.log(`✅ Received message from ${socket.userId} to ${data.receiverId}: "${data.content?.substring(0, 20)}${data.content?.length > 20 ? '...' : ''}"`);
      
      const { content, mediaUrl, mediaType, thumbnailUrl } = data;
      const senderId = socket.userId;
      const receiverId = data.receiverId;

      if (!senderId || !receiverId) {
        console.error(`❌ Invalid message: missing sender (${senderId}) or receiver (${receiverId})`);
        socket.emit("error", { message: "Invalid message: missing sender or receiver" });
        return;
      }
      
      // Validate that sender and receiver are different
      if (senderId == receiverId) {
        console.error(`❌ Invalid message: sender and receiver are the same (${senderId})`);
        socket.emit("error", { message: "Cannot send message to yourself" });
        return;
      }

      // Save message to DB
      const message = new Message({
        sender: senderId,
        receiver: receiverId,
        content: content || '',
        mediaUrl,
        mediaType,
        thumbnailUrl,
        isDelivered: true // Set to true since we're saving it to the database
      });

      await message.save();
      console.log(`✅ Message saved to database with ID: ${message._id}`);
      console.log(`✅ Message details: sender=${message.sender}, receiver=${message.receiver}`);
      
      try {
        await message.populate("sender", "username");
      } catch (populateError) {
        console.error(`❌ Error populating sender: ${populateError.message}`);
        // Continue anyway, the message was saved
      }

      // Emit message to receiver's socket room
      io.to(receiverId).emit("newMessage", message);
      console.log(`✅ Message emitted to receiver ${receiverId}`);
      
      // Respond to sender with confirmation
      socket.emit("messageSent", { 
        messageId: message._id.toString(), 
        isDelivered: true 
      });
      console.log(`✅ Delivery confirmation sent to sender ${senderId}`);
    } catch (error) {
      console.error("❌ Error sending message:", error);
      socket.emit("error", { message: "Failed to send message: " + error.message });
    }
  });

  // ✅ Handle marking messages as read
  socket.on("markMessagesAsRead", async ({ contactId }) => {
    try {
      const userId = socket.userId;
      
      // Update all unread messages from this contact to this user
      const result = await Message.updateMany(
        { 
          sender: contactId, 
          receiver: userId,
          isRead: { $ne: true }
        },
        { 
          isRead: true 
        }
      );
      
      console.log(`✅ Marked ${result.modifiedCount} messages as read for user ${userId} from ${contactId}`);
      
      // Notify the sender that their messages were read
      io.to(contactId).emit("messagesRead", { by: userId });
    } catch (error) {
      console.error("❌ Error marking messages as read:", error);
    }
  });

  // ✅ Handle updating unread counts
  socket.on("getUnreadCounts", async () => {
    try {
      const userId = socket.userId;
      
      console.log(`📊 Calculating unread message counts for user ${userId}`);
      
      // Find all distinct senders who sent unread messages to this user
      const unreadMessagesBySender = await Message.aggregate([
        {
          $match: {
            receiver: new mongoose.Types.ObjectId(userId),
            isRead: { $ne: true }
          }
        },
        {
          $group: {
            _id: "$sender",
            count: { $sum: 1 },
            lastMessageContent: { $last: "$content" },
            lastMessageTimestamp: { $last: "$timestamp" }
          }
        },
        {
          $sort: { lastMessageTimestamp: -1 }
        }
      ]);
      
      // Format the results with more detailed information
      const formattedCounts = await Promise.all(unreadMessagesBySender.map(async (item) => {
        // Try to get the sender username for better display
        let senderInfo = { username: "Unknown" };
        try {
          senderInfo = await User.findById(item._id, "username").lean();
        } catch (err) {
          console.error(`❌ Error getting sender info for ${item._id}:`, err.message);
        }
        
        return {
          _id: item._id,
          count: item.count,
          username: senderInfo?.username || "Unknown",
          lastMessage: item.lastMessageContent?.substring(0, 30) || "",
          timestamp: item.lastMessageTimestamp
        };
      }));
      
      console.log(`✅ Found ${unreadMessagesBySender.length} contacts with unread messages for user ${userId}`);
      if (unreadMessagesBySender.length > 0) {
        const countDetails = unreadMessagesBySender.map(c => `${c._id}: ${c.count}`).join(', ');
        console.log(`📊 Unread count details: ${countDetails}`);
      }
      
      // Send the unread counts back to the user
      socket.emit("unreadCounts", { counts: unreadMessagesBySender });
      
    } catch (error) {
      console.error("❌ Error getting unread counts:", error);
    }
  });

  // ✅ Handle sending friend requests
  socket.on("sendFriendRequest", async ({ receiverId }) => {
    try {
      const senderId = socket.userId;
      const receiver = await User.findById(receiverId);

      if (!receiver) {
        return socket.emit("error", { message: "User not found" });
      }

      // Add senderId to receiver's friendRequests if not already added
      if (!receiver.friendRequests.includes(senderId)) {
        receiver.friendRequests.push(senderId);
        await receiver.save();

        // Emit real-time update to the receiver
        io.to(receiverId).emit("newFriendRequest", { senderId });
      }
    } catch (error) {
      console.error("❌ Friend request error:", error);
      socket.emit("error", { message: "Failed to send friend request" });
    }
  });

  // ✅ Handle accepting friend requests
  socket.on("acceptFriendRequest", async ({ requestId }) => {
    try {
      const userId = socket.userId;
      const user = await User.findById(userId);
      const friend = await User.findById(requestId);

      if (!user || !friend) {
        return socket.emit("error", { message: "User not found" });
      }

      // Remove from friendRequests
      user.friendRequests = user.friendRequests.filter(
        (id) => id.toString() !== requestId
      );

      // Add to contacts if not already added
      if (!user.contacts.includes(requestId)) {
        user.contacts.push(requestId);
      }
      if (!friend.contacts.includes(userId)) {
        friend.contacts.push(userId);
      }

      await user.save();
      await friend.save();

      // Emit real-time updates to both users
      io.to(requestId).emit("friendRequestAccepted", { userId });
      io.to(userId).emit("friendRequestAccepted", { requestId });
    } catch (error) {
      console.error("❌ Accept friend request error:", error);
      socket.emit("error", { message: "Failed to accept friend request" });
    }
  });

  // ✅ Handle disconnection
  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
    
    if (socket.userId) {
      // Update lastSeen time on disconnect
      const lastSeen = new Date().toISOString();
      
      // Store lastSeen time but remove from active online users
      onlineUsers.set(socket.userId, { 
        socketId: null, 
        lastSeen: lastSeen 
      });
      
      // After short delay, check if user reconnected
      setTimeout(() => {
        const userData = onlineUsers.get(socket.userId);
        
        // If user hasn't reconnected (socketId is still null), 
        // broadcast offline status and lastSeen time
        if (userData && !userData.socketId) {
          socket.broadcast.emit('userStatus', {
            userId: socket.userId,
            isOnline: false,
            lastSeen: lastSeen
          });
          
          // Keep lastSeen info but mark as offline by setting null socketId
          onlineUsers.set(socket.userId, { socketId: null, lastSeen });
        }
      }, 5000); // Give 5 seconds to reconnect before broadcasting offline status
    }
  });
});

// ✅ Start server
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT} in ${NODE_ENV} mode`));

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  // Close server & exit process in production
  if (NODE_ENV === 'production') {
    server.close(() => process.exit(1));
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  // Close server & exit process in production
  if (NODE_ENV === 'production') {
    server.close(() => process.exit(1));
  }
});
