const express = require("express");
const app = express();
const http = require("http").createServer(app);
const { Server } = require("socket.io");
const io = new Server(http);

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  socket.on("join-room", (room) => {
    socket.join(room);
    console.log(`👥 ${socket.id} joined ${room}`);
    io.to(socket.id).emit("room-joined", room);
  });

  socket.on("signal", (data) => {
    socket.to(data.room).emit("signal", data);
  });

  socket.on("disconnect", () => {
    console.log("🔴 Disconnected:", socket.id);
  });
});

http.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
