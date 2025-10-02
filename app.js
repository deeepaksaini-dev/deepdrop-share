// ===== GLOBALS =====
const socket = io();
let pc, dataChannel;
let roomId = null, isCreator = false;
let filesQueue = [], receiveBuffer = {};

// UI refs
const roomInput = document.getElementById("roomInput");
const roomIdBox = document.getElementById("roomId");
const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const pickFileBtn = document.getElementById("pickFile");
const sendBtn = document.getElementById("sendBtn");
const fileInput = document.getElementById("fileInput") || (() => {
  let i = document.createElement("input");
  i.type = "file"; i.multiple = true; i.style.display = "none";
  document.body.appendChild(i); return i;
})();
const filesArea = document.getElementById("filesArea");
const dropArea = document.getElementById("dropArea");
const chatInput = document.getElementById("chatInput");
const chatSend = document.getElementById("chatSend");
const chatLog = document.getElementById("chatLog");
const logList = document.getElementById("logList");
const qrPanel = document.getElementById("qrPanel");
const qrcodeBox = document.getElementById("qrcode");
const roomLink = document.getElementById("roomLink");
const themeToggle = document.getElementById("themeToggle");

// ===== ROOM JOIN =====
createBtn.onclick = () => {
  const id = roomInput.value || Math.random().toString(36).substr(2, 6);
  roomId = id;
  isCreator = true;
  joinRoom(id);
};
joinBtn.onclick = () => {
  const id = roomInput.value.trim();
  if (!id) return alert("Enter room id");
  roomId = id;
  joinRoom(id);
};

// Auto-join by link
const p = new URLSearchParams(location.search);
if (p.get("room")) {
  roomId = p.get("room");
  joinRoom(roomId);
}

// ===== SOCKET =====
function joinRoom(id) {
  socket.emit("create-or-join", id);
  roomIdBox.textContent = id;
  showRoomLink(id);
  initPeer();
}
socket.on("room-members", m => logActivity(`👥 Members: ${m.length}`));
socket.on("signal", async data => {
  if (data.offer && !isCreator) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    socket.emit("signal", { to: roomId, answer: ans });
  } else if (data.answer && isCreator) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
  } else if (data.candidate) {
    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
});

// ===== PEER =====
function initPeer() {
  pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  dataChannel = pc.createDataChannel("channel");
  setupDC(dataChannel);
  pc.ondatachannel = e => setupDC(e.channel);
  pc.onicecandidate = e => e.candidate && socket.emit("signal", { to: roomId, candidate: e.candidate });
  if (isCreator) {
    pc.createOffer().then(o => {
      pc.setLocalDescription(o);
      socket.emit("signal", { to: roomId, offer: o });
    });
  }
}

function setupDC(dc) {
  dc.onopen = () => logActivity("📡 Connected");
  dc.onmessage = e => handleMsg(JSON.parse(e.data));
}

// ===== FILE SELECT =====
pickFileBtn.onclick = () => fileInput.click();
fileInput.onchange = e => addFiles(e.target.files);

dropArea.ondragover = e => { e.preventDefault(); dropArea.classList.add("hover"); };
dropArea.ondragleave = () => dropArea.classList.remove("hover");
dropArea.ondrop = e => {
  e.preventDefault(); dropArea.classList.remove("hover");
  addFiles(e.dataTransfer.files);
};

function addFiles(list) {
  for (let f of list) {
    filesQueue.push(f);
    makeFileCard(f);
  }
  if (filesQueue.length) sendBtn.disabled = false;
}
function makeFileCard(f) {
  const c = document.createElement("div");
  c.className = "file-card";
  c.innerHTML = `
    <div class="file-left">
      <div class="file-thumb">${f.name.split('.').pop().toUpperCase()}</div>
      <div class="file-info"><div class="name">${f.name}</div><div class="small-muted">${(f.size/1048576).toFixed(2)} MB</div></div>
    </div>
    <div class="progress-track"><div class="progress-bar" id="pb-${f.name}"></div></div>`;
  filesArea.appendChild(c);
}
sendBtn.onclick = () => {
  filesQueue.forEach(f => sendFile(f));
  filesQueue = []; sendBtn.disabled = true;
};

function sendFile(file) {
  const r = new FileReader();
  r.onload = () => {
    const buf = r.result, chunk = 64*1024, total = Math.ceil(buf.byteLength/chunk);
    for (let i = 0; i < total; i++) {
      const slice = buf.slice(i*chunk, (i+1)*chunk);
      dataChannel.send(JSON.stringify({type:"file",name:file.name,idx:i,total,data:Array.from(new Uint8Array(slice))}));
      upd(file.name, ((i+1)/total)*100);
    }
    dataChannel.send(JSON.stringify({type:"done",name:file.name}));
    logActivity(`📤 Sent ${file.name}`);
    confetti();
  };
  r.readAsArrayBuffer(file);
}
function upd(name, p) {
  const el = document.getElementById("pb-"+name);
  if (el) el.style.width = p+"%";
}

// ===== RECEIVE =====
function handleMsg(m) {
  if (m.type==="chat") addChat("Peer", m.text);
  if (m.type==="file") {
    if (!receiveBuffer[m.name]) receiveBuffer[m.name] = [];
    receiveBuffer[m.name][m.idx] = new Uint8Array(m.data);
    upd(m.name, ((m.idx+1)/m.total)*100);
  }
  if (m.type==="done") {
    const blob = new Blob(receiveBuffer[m.name]);
    const url = URL.createObjectURL(blob);
    showRecv(m.name, url);
    logActivity(`📥 Got ${m.name}`);
    confetti();
  }
}
function showRecv(name,url){
  const c=document.createElement("div");
  c.className="file-card";
  let prev="";
  if(/\.(jpg|png|gif|jpeg|webp)$/i.test(name)) prev=`<img src="${url}" width="60">`;
  else if(/\.pdf$/i.test(name)) prev=`<iframe src="${url}" width="80" height="60"></iframe>`;
  else prev=`<div class="file-thumb">${name.split('.').pop()}</div>`;
  c.innerHTML=`<div class="file-left">${prev}<div class="file-info"><div class="name">${name}</div></div></div>
  <a href="${url}" download="${name}" class="btn">Download</a>`;
  document.getElementById("receiveList").appendChild(c);
}

// ===== CHAT =====
chatSend.onclick = sendChat;
chatInput.onkeypress = e => {
  if(e.key==="Enter") sendChat();
  else dataChannel?.send(JSON.stringify({type:"typing"}));
};
function sendChat(){
  const msg=chatInput.value.trim(); if(!msg) return;
  dataChannel.send(JSON.stringify({type:"chat",text:msg}));
  addChat("You",msg); chatInput.value="";
}
function addChat(who,txt){
  const p=document.createElement("p");
  p.innerHTML=`<strong>${who}:</strong> ${txt}`;
  chatLog.appendChild(p);
  chatLog.scrollTop=chatLog.scrollHeight;
}

// ===== THEME & CONFETTI =====
themeToggle.onclick = ()=>document.body.classList.toggle("light");
function confetti(){
  for(let i=0;i<15;i++){
    const s=document.createElement("span");
    s.textContent="🎉";
    s.style.position="fixed";
    s.style.left=Math.random()*100+"vw";
    s.style.top="-10px";
    s.style.fontSize="22px";
    s.style.transition="top 2s";
    document.body.appendChild(s);
    setTimeout(()=>s.style.top="100vh",10);
    setTimeout(()=>s.remove(),2000);
  }
}

// ===== HELPERS =====
function logActivity(m){
  const p=document.createElement("p");
  p.textContent=m;
  logList.appendChild(p);
  logList.scrollTop=logList.scrollHeight;
}
function showRoomLink(id){
  const url=`${location.origin}?room=${id}`;
  roomLink.textContent=url;
  qrPanel.style.display="block";
  new QRCode(qrcodeBox,{text:url,width:120,height:120});
}
