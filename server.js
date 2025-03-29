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
// ✅ Handle Socket.IO connections
io.on("connection", (socket) => {
  console.log("🔌 New user connected:", socket.id);

  // ✅ Extract user info from token
  try {
    const token = socket.handshake.auth.token;
    if (!token) return socket.disconnect(); // Disconnect if no token

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id; // Attach userId to socket
    socket.join(socket.userId); // Join a room for direct messages
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

  // ✅ Handle disconnection
  socket.on("disconnect", () =>
    console.log("❌ User disconnected:", socket.id)
  );
});

// ✅ Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
