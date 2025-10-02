// ========== GLOBALS ==========
const socket = io();
let pc, dataChannel;
let roomId = null, isCreator = false;
let filesQueue = [], receiveBuffer = {};

// ========== UI ==========
const roomInput = document.getElementById("roomInput");
const roomIdBox = document.getElementById("roomId");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const pickFileBtn = document.getElementById("pickFile");
const sendBtn = document.getElementById("sendBtn");
const fileInput = document.createElement("input");
fileInput.type = "file"; fileInput.multiple = true; fileInput.style.display = "none";
document.body.appendChild(fileInput);
const filesArea = document.getElementById("filesArea");
const dropArea = document.getElementById("dropArea");
const chatInput = document.getElementById("chatInput");
const chatSend = document.getElementById("chatSend");
const chatLog = document.getElementById("chatLog");
const logList = document.getElementById("logList");
const qrPanel = document.getElementById("qrPanel");
const qrcodeBox = document.getElementById("qrcode");
const roomLink = document.getElementById("roomLink");

// ========== ROOM CREATE / JOIN ==========
createBtn.onclick = () => {
  const id = roomInput.value || Math.random().toString(36).substr(2, 6);
  roomId = id;
  isCreator = true;
  socket.emit("join-room", roomId);
};
joinBtn.onclick = () => {
  const id = roomInput.value.trim();
  if (!id) return alert("Enter a valid room ID");
  roomId = id;
  socket.emit("join-room", roomId);
};

// Auto join by link
const params = new URLSearchParams(window.location.search);
if (params.get("room")) {
  roomId = params.get("room");
  socket.emit("join-room", roomId);
}

// Room joined confirmation
socket.on("room-joined", id => {
  roomId = id;
  logActivity(`✅ Joined room: ${roomId}`);
  roomIdBox.textContent = roomId;
  showRoomLink(roomId);
  initPeer(); // Initialize Peer only after joining
});

// ========== SOCKET SIGNALING ==========
socket.on("signal", async data => {
  if (data.type === "offer" && !isCreator) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("signal", { room: roomId, type: "answer", answer });
  }
  else if (data.type === "answer" && isCreator) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
  }
  else if (data.type === "candidate") {
    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
});

// ========== PEER CONNECTION ==========
function initPeer() {
  pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

  if (isCreator) {
    dataChannel = pc.createDataChannel("data");
    setupDataChannel(dataChannel);
  } else {
    pc.ondatachannel = e => setupDataChannel(e.channel);
  }

  pc.onicecandidate = e => {
    if (e.candidate) {
      socket.emit("signal", { room: roomId, type: "candidate", candidate: e.candidate });
    }
  };

  if (isCreator) {
    pc.createOffer().then(offer => {
      pc.setLocalDescription(offer);
      socket.emit("signal", { room: roomId, type: "offer", offer });
    });
  }
}

function setupDataChannel(channel) {
  dataChannel = channel;
  dataChannel.onopen = () => logActivity("📡 DataChannel open — Connection Established!");
  dataChannel.onmessage = e => handleMessage(JSON.parse(e.data));
}

// ========== FILE HANDLING ==========
pickFileBtn.onclick = () => fileInput.click();
fileInput.onchange = e => handleFiles(e.target.files);

dropArea.ondragover = e => { e.preventDefault(); dropArea.classList.add("hover"); };
dropArea.ondragleave = () => dropArea.classList.remove("hover");
dropArea.ondrop = e => {
  e.preventDefault(); dropArea.classList.remove("hover");
  handleFiles(e.dataTransfer.files);
};

function handleFiles(fileList) {
  for (let f of fileList) {
    filesQueue.push(f);
    createFileCard(f);
  }
  if (filesQueue.length) sendBtn.disabled = false;
}

function createFileCard(f) {
  const c = document.createElement("div");
  c.className = "file-card";
  c.innerHTML = `
    <div>
      <div class="file-info"><strong>${f.name}</strong></div>
      <div class="small-muted">${(f.size/1024/1024).toFixed(2)} MB</div>
      <div class="progress-track"><div class="progress-bar" id="pb-${f.name}"></div></div>
    </div>`;
  filesArea.appendChild(c);
}

sendBtn.onclick = () => {
  filesQueue.forEach(sendFile);
  filesQueue = [];
  sendBtn.disabled = true;
};

function sendFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const buffer = reader.result;
    const CHUNK = 64 * 1024;
    const total = Math.ceil(buffer.byteLength / CHUNK);
    for (let i = 0; i < total; i++) {
      const chunk = buffer.slice(i * CHUNK, (i + 1) * CHUNK);
      dataChannel.send(JSON.stringify({
        type: "file-chunk",
        name: file.name,
        index: i,
        total,
        data: Array.from(new Uint8Array(chunk))
      }));
      updateProgress(file.name, ((i + 1) / total) * 100);
    }
    dataChannel.send(JSON.stringify({ type: "file-complete", name: file.name }));
    logActivity(`📤 Sent file: ${file.name}`);
  };
  reader.readAsArrayBuffer(file);
}

function updateProgress(name, p) {
  const bar = document.getElementById("pb-" + name);
  if (bar) bar.style.width = p + "%";
}

// ========== RECEIVE FILE ==========
function handleMessage(msg) {
  if (msg.type === "chat") addChat("Peer", msg.text);
  if (msg.type === "file-chunk") {
    if (!receiveBuffer[msg.name]) receiveBuffer[msg.name] = [];
    receiveBuffer[msg.name][msg.index] = new Uint8Array(msg.data);
    updateProgress(msg.name, ((msg.index + 1) / msg.total) * 100);
  }
  if (msg.type === "file-complete") {
    const blob = new Blob(receiveBuffer[msg.name]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = msg.name;
    a.textContent = `📥 Download ${msg.name}`;
    filesArea.appendChild(a);
    logActivity(`✅ Received file: ${msg.name}`);
  }
}

// ========== CHAT ==========
chatSend.onclick = sendChat;
chatInput.onkeypress = e => { if (e.key === "Enter") sendChat(); };

function sendChat() {
  const msg = chatInput.value.trim();
  if (!msg) return;
  dataChannel.send(JSON.stringify({ type: "chat", text: msg }));
  addChat("You", msg);
  chatInput.value = "";
}
function addChat(who, txt) {
  const p = document.createElement("p");
  p.innerHTML = `<strong>${who}:</strong> ${txt}`;
  chatLog.appendChild(p);
}

// ========== UTIL ==========
function logActivity(msg) {
  const p = document.createElement("p");
  p.textContent = msg;
  logList.appendChild(p);
  logList.scrollTop = logList.scrollHeight;
}
function showRoomLink(id) {
  const url = `${location.origin}?room=${id}`;
  roomLink.textContent = url;
  qrPanel.style.display = "block";
  new QRCode(qrcodeBox, { text: url, width: 120, height: 120 });
}
