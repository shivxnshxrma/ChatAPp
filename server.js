require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const path = require("path");

const authRoutes = require("./routes/auth");
const messageRoutes = require("./routes/messages");
const mediaRoutes = require("./routes/media");
const Message = require("./models/Message");
const contactRoutes = require("./routes/contacts");
const userRoutes = require("./routes/userRoutes");
const friendRoutes = require("./routes/friendRoutes");
const User = require("./models/User"); // Import User model

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*", // Allow frontend to connect
    methods: ["GET", "POST"],
  },
});

// ✅ Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// ✅ Middleware
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads"))); // Serve uploaded files
app.use("/auth", authRoutes);
app.use("/messages", messageRoutes);
app.use("/media", mediaRoutes);
app.use("/contacts", contactRoutes);
app.use("/users", userRoutes);
app.use("/friends", friendRoutes);
app.use("/auth", authRoutes);

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
      const { receiverId, content, mediaUrl, mediaType } = data;
      const senderId = socket.userId;

      // Save message to DB
      const message = new Message({
        sender: senderId,
        receiver: receiverId,
        content,
        mediaUrl,
        mediaType,
      });

      await message.save();

      // Emit message to receiver's socket room
      io.to(receiverId).emit("receiveMessage", {
        senderId,
        content,
        mediaUrl,
        mediaType,
      });
    } catch (error) {
      console.error("❌ Error sending message:", error);
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
    }
  });

  // ✅ Handle disconnection
  socket.on("disconnect", () =>
    console.log("❌ User disconnected:", socket.id)
  );
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
