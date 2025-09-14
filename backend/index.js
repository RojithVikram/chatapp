// backend/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const path = require("path");
require("dotenv").config(); // optional .env support

// Routes & middleware
const authRoutes = require("./routes/auth");
const authMiddleware = require("./middleware/auth");

// Models
const Message = require("./models/Message");

const app = express();
app.use(cors());
app.use(express.json());

// ---- Serve frontend from /public ----
app.use(express.static(path.join(__dirname, "public")));

// Optional: explicit root route to index.html
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ---- HTTP + Socket.IO ----
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// ---- Presence tracking ----
const onlineUsers = new Map(); // userId -> { socketId, username }

// ---- Socket auth (JWT) ----
const JWT_SECRET = process.env.JWT_SECRET || "secretkey";

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("No token provided"));
  try {
    const user = jwt.verify(token, JWT_SECRET);
    socket.user = user; // { id, username, ... }
    next();
  } catch (err) {
    console.error("Socket auth error:", err.message);
    next(new Error("Invalid token"));
  }
});

// ---- Socket events ----
io.on("connection", async (socket) => {
  const { id: userId, username } = socket.user;

  // Track presence
  onlineUsers.set(userId, { socketId: socket.id, username });
  io.emit(
    "onlineUsers",
    Array.from(onlineUsers, ([id, v]) => ({ id, username: v.username }))
  );
  console.log(`🟢 ${username} connected (${socket.id})`);

  const defaultRoom = "general";
  socket.join(defaultRoom);

  // Send last 50 messages of default room
  const generalHistory = await Message.find({ room: defaultRoom })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  socket.emit("chatHistory", generalHistory.reverse());

  // Join/switch room
  socket.on("joinRoom", async ({ room }) => {
    // leave all joined rooms except personal room (socket.id)
    for (const r of socket.rooms) {
      if (r !== socket.id) socket.leave(r);
    }
    socket.join(room);

    const history = await Message.find({ room })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    socket.emit("chatHistory", history.reverse());
  });

  // Room message
  socket.on("sendMessage", async ({ text, room }) => {
    if (!text) return;
    const doc = await Message.create({
      fromUserId: userId,
      fromUsername: username,
      room: room || defaultRoom,
      text,
    });
    io.to(room || defaultRoom).emit("receiveMessage", doc);
  });

  // Typing indicator
  socket.on("typing", ({ room, isTyping }) => {
    socket.to(room || defaultRoom).emit("typing", { username, isTyping: !!isTyping });
  });

  // Private message
  socket.on("privateMessage", async ({ toUserId, text }) => {
    if (!toUserId || !text) return;
    const to = onlineUsers.get(toUserId);
    const doc = await Message.create({
      fromUserId: userId,
      fromUsername: username,
      toUserId,
      toUsername: to ? to.username : null,
      text,
    });
    if (to?.socketId) io.to(to.socketId).emit("privateMessage", doc);
    socket.emit("privateMessage", doc);
  });

  // Typing in DM
  socket.on("typingDM", ({ toUserId, isTyping }) => {
    const to = onlineUsers.get(toUserId);
    if (to?.socketId) {
      io.to(to.socketId).emit("typingDM", {
        fromUserId: userId,
        fromUsername: username,
        isTyping: !!isTyping,
      });
    }
  });

  socket.on("disconnect", () => {
    onlineUsers.delete(userId);
    io.emit(
      "onlineUsers",
      Array.from(onlineUsers, ([id, v]) => ({ id, username: v.username }))
    );
    console.log(`🔴 ${username} disconnected`);
  });
});

// ---- REST API ----
app.use("/auth", authRoutes);

// Protected test route
app.get("/protected", authMiddleware, (req, res) => {
  res.json({ message: `Welcome ${req.user.username}! You are authorized.` });
});

// ---- MongoDB + Server ----
mongoose
  .connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/chatapp")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
