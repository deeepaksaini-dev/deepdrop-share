// app.js — DeepDrop Share
// ✨ Professional P2P File Transfer via WebRTC + Socket.io + Auto Connect
// 👨‍💻 Built by Deepak Kumar Saini

/* ========== GLOBAL SETUP ========== */
const socket = io();
let pc = null;
let dataChannel = null;
let currentRoom = null;

const config = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

/* ========== UI ELEMENTS ========== */
const roomInput = document.getElementById("roomInput");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const roomIdEl = document.getElementById("roomId");
const copyBtn = document.getElementById("copyBtn");
const qrBtn = document.getElementById("qrBtn");
const qrPanel = document.getElementById("qrPanel");
const roomLinkEl = document.getElementById("roomLink");

const fileInput = document.getElementById("fileInput");
const pickFile = document.getElementById("pickFile");
const sendBtn = document.getElementById("sendBtn");
const dropArea = document.getElementById("dropArea");

const receiveList = document.getElementById("receiveList");
const logList = document.getElementById("logList");

/* ========== LOG FUNCTION ========== */
function log(msg) {
  const item = document.createElement("div");
  item.className = "item";
  item.textContent = msg;
  logList.appendChild(item);
  logList.scrollTop = logList.scrollHeight;
  console.log(msg);
}

/* ========== ROOM CREATION / JOIN ========== */
createBtn.onclick = () => {
  const id = Math.random().toString(36).substring(2, 9);
  roomInput.value = id;
  joinRoom(id);
};

joinBtn.onclick = () => {
  const id = roomInput.value.trim();
  if (!id) return alert("Please enter a room ID");
  joinRoom(id);
};

function joinRoom(id) {
  currentRoom = id;
  socket.emit("create-or-join", id);
  roomIdEl.textContent = id;
  log(`🧠 Joined room: ${id}`);
  generateQR(id);
}

/* ========== COPY ROOM ID ========== */
copyBtn.onclick = async () => {
  if (!currentRoom) return;
  await navigator.clipboard.writeText(currentRoom);
  log("📋 Room ID copied!");
};

/* ========== GENERATE QR ========== */
function generateQR(room) {
  const link = `${window.location.origin}?room=${room}&auto=1`;
  roomLinkEl.textContent = link;
  qrPanel.classList.remove("hidden");
  document.getElementById("qrcode").innerHTML = "";
  new QRCode(document.getElementById("qrcode"), {
    text: link,
    width: 150,
    height: 150,
    colorDark: "#000000",
    colorLight: "#ffffff",
  });
  log("📱 QR ready — scan to auto-join!");
}

qrBtn.onclick = () => {
  if (!currentRoom) return alert("Create or join a room first!");
  generateQR(currentRoom);
};

/* ========== AUTO JOIN FROM URL ========== */
window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room");
  const auto = params.get("auto");
  if (room) {
    roomInput.value = room;
    joinRoom(room);
    if (auto) log("🤝 Auto joining room via QR...");
  }
});

/* ========== SOCKET SIGNALING ========== */
socket.on("room-members", (members) => {
  log(`👥 Room members: ${members.length}`);
  if (members.length > 0) startAsCaller(members[0]);
  else startAsReceiver();
});

socket.on("signal", async (data) => {
  const { from, signal } = data;
  if (!pc) startAsReceiver(from);

  if (signal.type === "offer") {
    await pc.setRemoteDescription(new RTCSessionDescription(signal));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("signal", { to: from, from: socket.id, signal: pc.localDescription });
  } else if (signal.type === "answer") {
    await pc.setRemoteDescription(new RTCSessionDescription(signal));
  } else if (signal.candidate) {
    try {
      await pc.addIceCandidate(signal);
    } catch (e) {
      console.warn("ICE error:", e);
    }
  }
});

/* ========== PEER CONNECTION ========== */
function startAsCaller(target) {
  setupPeer(target, true);
}
function startAsReceiver(target) {
  setupPeer(target, false);
}

function setupPeer(targetId, isCaller) {
  pc = new RTCPeerConnection(config);

  pc.onicecandidate = (e) => {
    if (e.candidate && targetId) {
      socket.emit("signal", { to: targetId, from: socket.id, signal: e.candidate });
    }
  };

  pc.ondatachannel = (e) => setupDataChannel(e.channel);

  if (isCaller) {
    dataChannel = pc.createDataChannel("file");
    setupDataChannel(dataChannel);
    createOffer(targetId);
  }
}

async function createOffer(targetId) {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("signal", { to: targetId, from: socket.id, signal: pc.localDescription });
}

/* ========== DATA CHANNEL ========== */
function setupDataChannel(dc) {
  dataChannel = dc;
  dataChannel.binaryType = "arraybuffer";

  dataChannel.onopen = () => {
    log("✅ Connection established! Ready to transfer.");
    sendBtn.disabled = false;
  };

  dataChannel.onclose = () => {
    log("❌ Connection closed");
    sendBtn.disabled = true;
  };

  let fileMeta = null;
  let buffer = [];
  let received = 0;

  dataChannel.onmessage = (e) => {
    if (typeof e.data === "string") {
      const msg = JSON.parse(e.data);
      if (msg.type === "meta") {
        fileMeta = msg.meta;
        buffer = [];
        received = 0;
        log(`⬇️ Receiving: ${fileMeta.name} (${(fileMeta.size / 1024 / 1024).toFixed(2)} MB)`);
      } else if (msg.type === "done") {
        const blob = new Blob(buffer);
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = fileMeta.name;
        link.textContent = `⬇️ Download ${fileMeta.name}`;
        link.className = "btn accent";
        receiveList.appendChild(link);
        log("✅ File received successfully!");
      }
    } else {
      buffer.push(e.data);
      received += e.data.byteLength;
      const pct = ((received / fileMeta.size) * 100).toFixed(1);
      log(`📥 Receiving... ${pct}%`);
    }
  };
}

/* ========== SEND FILE ========== */
sendBtn.onclick = async () => {
  const file = fileInput.files[0];
  if (!file) return alert("Select a file first");
  if (!dataChannel || dataChannel.readyState !== "open") return alert("Connection not ready");

  log(`📤 Sending: ${file.name}`);
  dataChannel.send(JSON.stringify({ type: "meta", meta: { name: file.name, size: file.size } }));

  const stream = file.stream();
  const reader = stream.getReader();
  let sent = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    dataChannel.send(value);
    sent += value.byteLength;
    const pct = ((sent / file.size) * 100).toFixed(1);
    log(`📤 Uploading... ${pct}%`);
    while (dataChannel.bufferedAmount > 256 * 1024) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  dataChannel.send(JSON.stringify({ type: "done" }));
  log("✅ File sent!");
};

/* ========== FILE PICKER & DRAG-DROP ========== */
pickFile.onclick = () => fileInput.click();

fileInput.onchange = () => {
  if (fileInput.files.length) {
    log(`📁 Selected: ${fileInput.files[0].name}`);
    sendBtn.disabled = false;
  }
};

["dragenter", "dragover"].forEach((event) =>
  dropArea.addEventListener(event, (e) => {
    e.preventDefault();
    dropArea.classList.add("dragover");
  })
);

["dragleave", "drop"].forEach((event) =>
  dropArea.addEventListener(event, (e) => {
    e.preventDefault();
    dropArea.classList.remove("dragover");
  })
);

dropArea.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (!file) return;
  fileInput.files = e.dataTransfer.files;
  log(`📁 Dropped: ${file.name}`);
  sendBtn.disabled = false;
});
