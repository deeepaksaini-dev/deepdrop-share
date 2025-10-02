// =========================
// DeepDrop Share Server
// =========================
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const { Server } = require("socket.io");
const io = new Server(http);
const PORT = process.env.PORT || 3000;

// Serve static files (index.html, app.js, etc)
app.use(express.static(__dirname));

// Default route
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// =============== SOCKET.IO HANDLING ===============
io.on("connection", (socket) => {
  console.log("🟢 New client connected:", socket.id);

  // Join room
  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    console.log(`👥 ${socket.id} joined room: ${roomId}`);
    io.to(socket.id).emit("room-joined", roomId);

    // Notify others
    const members = Array.from(io.sockets.adapter.rooms.get(roomId) || []);
    io.to(roomId).emit("room-members", members);
  });

  // Signal exchange (offer, answer, candidate)
  socket.on("signal", (data) => {
    const { room, type } = data;
    console.log(`📡 Signal: ${type} in room: ${room}`);
    socket.to(room).emit("signal", data);
  });

  socket.on("disconnect", () => {
    console.log("🔴 Client disconnected:", socket.id);
  });
});

// Start server
http.listen(PORT, () => {
  console.log(`🚀 DeepDrop server running on: http://localhost:${PORT}`);
});
