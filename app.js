const socket = io();
let pc, dc;
let roomId, isCreator = false;
let filesQueue = [], receiveBuffer = {};

const logBox = document.getElementById("logs");
const roomInput = document.getElementById("room");
const createBtn = document.getElementById("create");
const joinBtn = document.getElementById("join");
const fileInput = document.getElementById("fileInput");
const sendBtn = document.getElementById("sendBtn");
const filesDiv = document.getElementById("files");
const chatLog = document.getElementById("chatLog");
const chatMsg = document.getElementById("chatMsg");
const sendChat = document.getElementById("sendChat");

function log(msg) {
  logBox.textContent += msg + "\n";
  logBox.scrollTop = logBox.scrollHeight;
}

createBtn.onclick = () => {
  roomId = roomInput.value || Math.random().toString(36).substr(2, 6);
  isCreator = true;
  socket.emit("join-room", roomId);
  log("🧠 Creating room: " + roomId);
};
joinBtn.onclick = () => {
  roomId = roomInput.value.trim();
  if (!roomId) return alert("Enter a room ID!");
  socket.emit("join-room", roomId);
  log("🔗 Joining room: " + roomId);
};

socket.on("room-joined", (id) => {
  log("✅ Joined room: " + id);
  initPeer();
});

socket.on("signal", async (data) => {
  if (data.type === "offer" && !isCreator) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("signal", { room: roomId, type: "answer", answer });
  } else if (data.type === "answer" && isCreator) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
  } else if (data.type === "candidate") {
    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
});

function initPeer() {
  pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

  if (isCreator) {
    dc = pc.createDataChannel("data");
    setupDC(dc);
    pc.createOffer().then((offer) => {
      pc.setLocalDescription(offer);
      socket.emit("signal", { room: roomId, type: "offer", offer });
    });
  } else {
    pc.ondatachannel = (e) => setupDC(e.channel);
  }

  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit("signal", { room: roomId, type: "candidate", candidate: e.candidate });
  };
}

function setupDC(channel) {
  dc = channel;
  dc.onopen = () => log("📡 DataChannel open — Connection Established!");
  dc.onmessage = (e) => handleMessage(JSON.parse(e.data));
}

// File select
fileInput.onchange = (e) => {
  filesQueue = Array.from(e.target.files);
  sendBtn.disabled = filesQueue.length === 0;
  filesDiv.innerHTML = filesQueue.map(f =>
    `<div class="file-card">${f.name}<div class="progress"><div class="bar" id="bar-${f.name}"></div></div></div>`
  ).join("");
};

// Send files
sendBtn.onclick = () => {
  filesQueue.forEach(sendFile);
};

function sendFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const buffer = reader.result;
    const chunkSize = 64 * 1024;
    const total = Math.ceil(buffer.byteLength / chunkSize);
    for (let i = 0; i < total; i++) {
      const chunk = buffer.slice(i * chunkSize, (i + 1) * chunkSize);
      dc.send(JSON.stringify({
        type: "file-chunk",
        name: file.name,
        index: i,
        total,
        data: Array.from(new Uint8Array(chunk)),
      }));
      updateBar(file.name, ((i + 1) / total) * 100);
    }
    dc.send(JSON.stringify({ type: "file-complete", name: file.name }));
    log("📤 Sent: " + file.name);
  };
  reader.readAsArrayBuffer(file);
}

function updateBar(name, percent) {
  const bar = document.getElementById("bar-" + name);
  if (bar) bar.style.width = percent + "%";
}

// Receive handler
function handleMessage(msg) {
  if (msg.type === "chat") addChat("Peer", msg.text);
  if (msg.type === "file-chunk") {
    if (!receiveBuffer[msg.name]) receiveBuffer[msg.name] = [];
    receiveBuffer[msg.name][msg.index] = new Uint8Array(msg.data);
    updateBar(msg.name, ((msg.index + 1) / msg.total) * 100);
  }
  if (msg.type === "file-complete") {
    const blob = new Blob(receiveBuffer[msg.name]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = msg.name; a.textContent = "📥 Download " + msg.name;
    filesDiv.appendChild(a);
    log("✅ Received: " + msg.name);
  }
}

// Chat
sendChat.onclick = sendChatMsg;
chatMsg.onkeypress = e => { if (e.key === "Enter") sendChatMsg(); };

function sendChatMsg() {
  const text = chatMsg.value.trim();
  if (!text) return;
  dc.send(JSON.stringify({ type: "chat", text }));
  addChat("You", text);
  chatMsg.value = "";
}

function addChat(who, msg) {
  chatLog.innerHTML += `<div><strong>${who}:</strong> ${msg}</div>`;
  chatLog.scrollTop = chatLog.scrollHeight;
}
