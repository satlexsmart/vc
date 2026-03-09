/**
 * SATLEX MEET ENGINE v4.0 - Chat Fix, Screen Share & Recording
 */
class MeetManager {
    constructor() {
        this.localStream = null;
        this.peer = null;
        this.peersList = new Map(); 
        this.roomId = new URLSearchParams(window.location.search).get('room');
        this.localUser = { id: null, name: 'Anonymous', isHost: !this.roomId };
        this.callStartTime = null;
        
        // Recording & Screen Share State
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.isScreenSharing = false;
        
        this.init();
    }

    async init() {
        this.setupUIListeners();
        await this.setupHardware();
    }

    async setupHardware() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: { ideal: 1280 }, height: { ideal: 720 } }, 
                audio: true 
            });
            document.getElementById('setup-preview').srcObject = this.localStream;
        } catch (err) {
            this.showError('Camera/Microphone access required.');
            console.error(err);
        }
    }

    setupUIListeners() {
        document.getElementById('entry-btn').onclick = () => this.startMeeting();
        document.getElementById('toggle-mic').onclick = () => this.toggleMedia('audio');
        document.getElementById('toggle-cam').onclick = () => this.toggleMedia('video');
        document.getElementById('leave-btn').onclick = () => this.leaveCall();
        document.getElementById('copy-btn').onclick = () => this.copyLink();
        document.getElementById('panel-toggle').onclick = () => this.togglePanel();
        document.getElementById('close-panel').onclick = () => this.togglePanel(false);
        
        // New Features
        document.getElementById('share-screen').onclick = () => this.toggleScreenShare();
        document.getElementById('record-btn').onclick = () => this.toggleRecording();

        // Chat Bug Fix: Catch both Button Click and Enter Key on the new DIV setup
        document.getElementById('send-msg-btn').onclick = () => this.sendChat();
        document.getElementById('msg-input').onkeydown = (e) => {
            if (e.key === 'Enter') this.sendChat();
        };

        // Sidebar Tabs
        document.querySelectorAll('.tab').forEach(tab => {
            tab.onclick = (e) => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.panel-body').forEach(b => b.classList.add('hidden'));
                e.target.classList.add('active');
                document.getElementById(e.target.dataset.target).classList.remove('hidden');
            };
        });
    }

    async startMeeting() {
        const inputName = document.getElementById('username-field').value.trim();
        if (inputName) this.localUser.name = inputName;

        if (!this.localStream) return this.showError('Hardware not ready.');

        document.getElementById('setup-screen').classList.add('fade-out');
        this.initPeerJS();
    }

    initPeerJS() {
        this.peer = new Peer(undefined, {
            config: { 
                'iceServers': [
                    { 'urls': 'stun:stun.l.google.com:19302' }, 
                    { 'urls': 'stun:stun1.l.google.com:19302' },
                    { 'urls': 'stun:stun2.l.google.com:19302' },
                    { 'urls': 'stun:stun.services.mozilla.com' }
                ] 
            }
        });

        this.peer.on('open', (id) => {
            this.localUser.id = id;
            this.addVideoToGrid(this.localStream, `${this.localUser.name} (You)`, id, true);
            this.updateParticipantList();
            this.startTimer();

            if (this.localUser.isHost) {
                const url = new URL(window.location);
                url.searchParams.set('room', id);
                window.history.pushState({}, '', url);
                this.showToast("Meeting started. Waiting for others...");
            } else {
                this.connectToPeer(this.roomId);
            }
        });

        this.peer.on('call', call => { 
            call.answer(this.localStream); 
            this.handleMediaStream(call); 
        });
        
        this.peer.on('connection', conn => this.handleDataConnection(conn));
    }

    connectToPeer(targetId) {
        if (targetId === this.localUser.id || this.peersList.has(targetId)) return;
        
        const call = this.peer.call(targetId, this.localStream, { metadata: { name: this.localUser.name } });
        this.handleMediaStream(call);
        
        const conn = this.peer.connect(targetId, { metadata: { name: this.localUser.name } });
        this.handleDataConnection(conn);
    }

    handleMediaStream(call) {
        call.on('stream', (remoteStream) => {
            if (!document.getElementById(`video-${call.peer}`)) {
                this.addVideoToGrid(remoteStream, call.metadata?.name || "User", call.peer, false);
            }
        });
        call.on('close', () => this.removePeer(call.peer));
    }

    handleDataConnection(conn) {
        conn.on('open', () => {
            this.peersList.set(conn.peer, { conn, name: conn.metadata?.name || "User" });
            this.updateParticipantList();
            this.showToast(`${conn.metadata?.name || "A user"} joined`);
            
            if (this.localUser.isHost) {
                const existingPeers = Array.from(this.peersList.keys()).filter(id => id !== conn.peer);
                conn.send({ type: 'mesh-sync', peers: existingPeers });
            }
        });

        conn.on('data', data => {
            if (data.type === 'chat') {
                this.renderMessage(data.sender, data.text, false);
            } else if (data.type === 'mesh-sync') {
                data.peers.forEach(p => this.connectToPeer(p));
            }
        });

        conn.on('close', () => this.removePeer(conn.peer));
    }

    removePeer(peerId) {
        const peerData = this.peersList.get(peerId);
        if (peerData) { 
            this.showToast(`${peerData.name} left`); 
            this.peersList.delete(peerId); 
        }
        const videoCard = document.getElementById(`video-${peerId}`);
        if (videoCard) videoCard.remove();
        
        this.updateParticipantList();
        this.recalculateGrid();
    }

    addVideoToGrid(stream, label, id, isLocal) {
        const grid = document.getElementById('video-grid');
        const card = document.createElement('div');
        card.className = `v-card ${isLocal ? 'local-video' : ''}`;
        card.id = `video-${id}`;
        
        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true; 
        video.playsInline = true;
        if (isLocal) video.muted = true;
        
        const nameTag = document.createElement('div');
        nameTag.className = 'name-tag';
        nameTag.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px">person</span> ${label}`;
        
        card.append(video, nameTag);
        grid.appendChild(card);
        this.recalculateGrid();
    }

    recalculateGrid() {
        const cards = document.querySelectorAll('.v-card');
        const count = cards.length;
        cards.forEach(card => {
            if (count === 1) card.style.flexBasis = '100%';
            else if (count <= 4) card.style.flexBasis = 'calc(50% - 1rem)';
            else if (count <= 6) card.style.flexBasis = 'calc(33.33% - 1rem)';
            else card.style.flexBasis = 'calc(25% - 1rem)';
            card.style.maxWidth = card.style.flexBasis;
        });
    }

    updateParticipantList() {
        const list = document.getElementById('participants-list');
        if (!list) return;
        document.getElementById('people-count').innerText = this.peersList.size + 1;
        list.innerHTML = `<div class="participant-item"><span>${this.localUser.name} (You)</span></div>`;
        this.peersList.forEach((data) => list.innerHTML += `<div class="participant-item"><span>${data.name}</span></div>`);
    }

    toggleMedia(type) {
        const track = type === 'audio' ? this.localStream.getAudioTracks()[0] : this.localStream.getVideoTracks()[0];
        if (track) {
            track.enabled = !track.enabled;
            const btn = document.getElementById(type === 'audio' ? 'toggle-mic' : 'toggle-cam');
            btn.classList.toggle('off', !track.enabled);
            btn.innerHTML = `<span class="material-symbols-outlined">${type === 'audio' ? (track.enabled ? 'mic' : 'mic_off') : (track.enabled ? 'videocam' : 'videocam_off')}</span>`;
        }
    }

    // --- SCREEN SHARE ---
    async toggleScreenShare() {
        const btn = document.getElementById('share-screen');
        if (this.isScreenSharing) {
            this.showToast("Stop screen sharing using your browser's native controls.");
            return;
        }

        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            const screenTrack = screenStream.getVideoTracks()[0];
            this.isScreenSharing = true;
            btn.classList.add('active-share');
            this.showToast("Screen sharing started");
            
            const callKeys = Object.keys(this.peer.connections);
            callKeys.forEach(key => {
                const calls = this.peer.connections[key];
                calls.forEach(conn => {
                    if (conn.peerConnection) {
                        const sender = conn.peerConnection.getSenders().find(s => s.track?.kind === 'video');
                        if (sender) sender.replaceTrack(screenTrack);
                    }
                });
            });

            screenTrack.onended = () => {
                this.isScreenSharing = false;
                btn.classList.remove('active-share');
                this.showToast("Screen sharing stopped");
                const localCamTrack = this.localStream.getVideoTracks()[0];
                callKeys.forEach(key => {
                    this.peer.connections[key].forEach(conn => {
                        if (conn.peerConnection) {
                            const sender = conn.peerConnection.getSenders().find(s => s.track?.kind === 'video');
                            if (sender) sender.replaceTrack(localCamTrack);
                        }
                    });
                });
            };
        } catch (err) { 
            console.error("Screen share canceled", err); 
        }
    }

    // --- MEETING RECORDING ---
    async toggleRecording() {
        const btn = document.getElementById('record-btn');
        
        if (this.isRecording) {
            this.mediaRecorder.stop();
            return;
        }

        try {
            this.showToast("Please select 'This Tab' and 'Share Audio' to record the meeting.");
            const recordStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            
            this.recordedChunks = [];
            this.mediaRecorder = new MediaRecorder(recordStream, { mimeType: 'video/webm' });

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) this.recordedChunks.push(e.data);
            };

            this.mediaRecorder.onstop = () => {
                const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `Satlex-Meet-${new Date().toISOString().slice(0,10)}.webm`;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 100);
                
                this.isRecording = false;
                btn.classList.remove('recording');
                this.showToast("Recording downloaded successfully.");
                recordStream.getTracks().forEach(track => track.stop());
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            btn.classList.add('recording');
            this.showToast("Recording started! Do not close this tab.");

        } catch (err) {
            console.error("Recording failed", err);
            this.showToast("Recording canceled.");
        }
    }

    // --- CHAT SYSTEM ---
    sendChat() {
        const input = document.getElementById('msg-input');
        const text = input.value.trim();
        if (!text) return;

        this.renderMessage(this.localUser.name, text, true);
        
        this.peersList.forEach(peer => {
            if (peer.conn && peer.conn.open) {
                peer.conn.send({ type: 'chat', text, sender: this.localUser.name });
            }
        });
        input.value = '';
    }

    renderMessage(sender, text, isLocal) {
        const flow = document.getElementById('chat-flow');
        if (!flow) return;
        flow.innerHTML += `<div class="message ${isLocal ? 'local' : 'remote'}">${isLocal ? '' : `<span class="sender">${sender}</span>`}${text.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}</div>`;
        flow.scrollTop = flow.scrollHeight;
    }

    togglePanel(forceState) {
        const panel = document.getElementById('side-panel');
        if (panel) panel.classList.toggle('hidden', forceState !== undefined ? !forceState : undefined);
    }

    copyLink() {
        navigator.clipboard.writeText(window.location.href);
        this.showToast("Invite link copied!");
    }

    showToast(msg) {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast'; toast.innerText = msg;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    startTimer() {
        this.callStartTime = Date.now();
        setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
            const timerEl = document.getElementById('call-timer');
            if (timerEl) timerEl.innerText = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
        }, 1000);
    }

    showError(msg) {
        const el = document.getElementById('error-message');
        if (el) { el.innerText = msg; el.classList.remove('hidden'); }
    }

    leaveCall() {
        this.localStream?.getTracks().forEach(t => t.stop());
        this.peer?.destroy();
        window.location.href = window.location.pathname; 
    }
}

const App = new MeetManager();
        
