// server.js — DeepDrop Share backend
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

const PORT = process.env.PORT || 3000;

// Serve static files (index.html, app.js, script.css)
app.use(express.static(__dirname));

// Routes
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// Socket.io logic
io.on("connection", (socket) => {
  console.log("🟢 Client connected:", socket.id);

  socket.on("create-or-join", (room) => {
    // Join room first
    socket.join(room);

    // Then get updated list
    const clients = io.sockets.adapter.rooms.get(room) || new Set();
    const members = Array.from(clients);

    // Broadcast member list to all in room
    io.to(room).emit("room-members", members);
    console.log(`📦 Room ${room}:`, members);
  });

  // Relay signaling data (offer/answer/ice)
  socket.on("signal", (data) => {
    io.to(data.to).emit("signal", data);
  });

  socket.on("disconnect", () => {
    console.log("🔴 Client disconnected:", socket.id);
  });
});

http.listen(PORT, () => {
  console.log(`🚀 DeepDrop Share running on http://localhost:${PORT}`);
});
