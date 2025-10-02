const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname));
app.get("/", (req, res) => res.sendFile(__dirname + "/index.html"));

// Socket.io signaling
io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  socket.on("create-or-join", (room) => {
    socket.join(room);
    io.to(room).emit("room-members", Array.from(io.sockets.adapter.rooms.get(room) || []));
  });

  socket.on("signal", (data) => {
    io.to(data.to).emit("signal", data);
  });

  socket.on("disconnect", () => console.log("🔴 Disconnected:", socket.id));
});

http.listen(PORT, () =>
  console.log(`🚀 DeepDrop running → http://localhost:${PORT}`)
);
