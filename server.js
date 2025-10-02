const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname));

// Routes
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// Socket.io logic
io.on("connection", (socket) => {
  console.log("🟢 Client connected:", socket.id);

  socket.on("create-or-join", (room) => {
    const clients = io.sockets.adapter.rooms.get(room) || new Set();
    socket.join(room);
    const members = Array.from(clients);
    io.to(room).emit("room-members", members);
    console.log(`📦 Room ${room}:`, members);
  });

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
