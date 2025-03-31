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

// ✅ Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
    process.exit(1); // Exit process with failure
  });

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
    console.log(`✅ User ${socket.userId} joined the chat`);
  } catch (error) {
    console.error("❌ Invalid Token:", error);
    return socket.disconnect();
  }

  // ✅ Handle sending messages (text + media)
  socket.on("sendMessage", async (data) => {
    try {
      const { receiverId, content, mediaUrl, mediaType, thumbnailUrl } = data;
      const senderId = socket.userId;

      // Save message to DB
      const message = new Message({
        sender: senderId,
        receiver: receiverId,
        content,
        mediaUrl,
        mediaType,
        thumbnailUrl
      });

      await message.save();
      await message.populate("sender", "username");

      // Emit message to receiver's socket room
      io.to(receiverId).emit("receiveMessage", message);
    } catch (error) {
      console.error("❌ Error sending message:", error);
      socket.emit("error", { message: "Failed to send message" });
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
  socket.on("disconnect", () =>
    console.log("❌ User disconnected:", socket.id)
  );
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
