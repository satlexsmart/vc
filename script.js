/**
 * SATLEX MEET ENGINE - Diagnostic Version
 */
class MeetManager {
    constructor() {
        this.localStream = null;
        this.peer = null;
        this.peersList = new Map(); 
        this.roomId = new URLSearchParams(window.location.search).get('room');
        this.localUser = { id: null, name: 'Anonymous', isHost: !this.roomId };
        this.callStartTime = null;
        
        this.init();
    }

    // --- DIAGNOSTIC LOGGER ---
    logEvent(msg) {
        console.log(msg);
        let logger = document.getElementById('debug-logger');
        if (!logger) {
            logger = document.createElement('div');
            logger.id = 'debug-logger';
            logger.style.cssText = 'position:fixed;top:70px;left:10px;background:rgba(0,0,0,0.85);color:#0f0;padding:10px;z-index:9999;font-family:monospace;font-size:11px;pointer-events:none;border-radius:8px;max-width:90%;';
            document.body.appendChild(logger);
        }
        logger.innerHTML += `<div>> ${msg}</div>`;
    }

    async init() {
        this.setupUIListeners();
        await this.setupHardware();
    }

    async setupHardware() {
        try {
            this.logEvent("Requesting camera/mic...");
            this.localStream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: { ideal: 640 }, height: { ideal: 480 } }, // Lowered res for mobile stability
                audio: true 
            });
            document.getElementById('setup-preview').srcObject = this.localStream;
            this.logEvent("Camera access GRANTED.");
        } catch (err) {
            this.logEvent("ERROR: Camera denied - " + err.message);
            this.showError('Camera/Microphone access required.');
        }
    }

    setupUIListeners() {
        document.getElementById('entry-btn').onclick = () => this.startMeeting();
        document.getElementById('toggle-mic').onclick = () => this.toggleMedia('audio');
        document.getElementById('toggle-cam').onclick = () => this.toggleMedia('video');
        document.getElementById('leave-btn').onclick = () => window.location.href = window.location.pathname;
        document.getElementById('copy-btn').onclick = () => this.copyLink();
        document.getElementById('panel-toggle').onclick = () => document.getElementById('side-panel').classList.toggle('hidden');
        document.getElementById('close-panel').onclick = () => document.getElementById('side-panel').classList.add('hidden');
    }

    async startMeeting() {
        const inputName = document.getElementById('username-field').value.trim();
        if (inputName) this.localUser.name = inputName;

        if (!this.localStream) return this.showError('Hardware not ready.');

        document.getElementById('setup-screen').classList.add('fade-out');
        this.initPeerJS();
    }

    initPeerJS() {
        this.logEvent("Connecting to PeerJS Cloud...");
        // Removed custom STUN temporarily to test if PeerJS default TURN helps
        this.peer = new Peer(); 

        this.peer.on('open', (id) => {
            this.localUser.id = id;
            this.logEvent(`Connected to Cloud! My ID: ${id}`);
            this.addVideoToGrid(this.localStream, `${this.localUser.name} (You)`, id, true);
            
            if (this.localUser.isHost) {
                const url = new URL(window.location);
                url.searchParams.set('room', id);
                window.history.pushState({}, '', url);
                this.logEvent("I am the HOST. Waiting for joiners...");
            } else {
                this.logEvent(`Attempting to join room: ${this.roomId}`);
                this.connectToPeer(this.roomId); 
            }
        });

        this.peer.on('call', (call) => {
            this.logEvent(`Incoming video call from: ${call.peer}`);
            call.answer(this.localStream);
            this.handleMediaStream(call);
        });

        this.peer.on('connection', (conn) => {
            this.logEvent(`Incoming data connection from: ${conn.peer}`);
            this.handleDataConnection(conn);
        });

        this.peer.on('error', (err) => {
            this.logEvent(`PEER ERROR: ${err.type}`);
        });
    }

    connectToPeer(targetId) {
        this.logEvent(`Calling peer: ${targetId}...`);
        
        const call = this.peer.call(targetId, this.localStream, { metadata: { name: this.localUser.name } });
        this.handleMediaStream(call);

        const conn = this.peer.connect(targetId, { metadata: { name: this.localUser.name } });
        this.handleDataConnection(conn);
    }

    handleMediaStream(call) {
        call.on('stream', (remoteStream) => {
            this.logEvent(`SUCCESS: Receiving video stream from ${call.peer}!`);
            if (!document.getElementById(`video-${call.peer}`)) {
                const name = call.metadata?.name || "User";
                this.addVideoToGrid(remoteStream, name, call.peer, false);
            }
        });
        call.on('close', () => this.removePeer(call.peer));
    }

    handleDataConnection(conn) {
        conn.on('open', () => {
            this.logEvent(`Chat channel opened with ${conn.peer}`);
            this.peersList.set(conn.peer, { conn, name: conn.metadata?.name || "User" });
        });
        conn.on('close', () => this.removePeer(conn.peer));
    }

    removePeer(peerId) {
        this.logEvent(`User disconnected: ${peerId}`);
        this.peersList.delete(peerId);
        const videoCard = document.getElementById(`video-${peerId}`);
        if (videoCard) videoCard.remove();
        this.recalculateGrid();
    }

    addVideoToGrid(stream, label, id, isLocal) {
        this.logEvent(`Rendering video element for ${label}`);
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
        nameTag.innerHTML = label;

        card.append(video, nameTag);
        grid.appendChild(card);
        this.recalculateGrid();
    }

    recalculateGrid() {
        const cards = document.querySelectorAll('.v-card');
        cards.forEach(card => {
            card.style.flexBasis = cards.length > 1 ? 'calc(50% - 1rem)' : '100%';
            card.style.maxWidth = card.style.flexBasis;
        });
    }

    toggleMedia(type) {
        const track = type === 'audio' ? this.localStream.getAudioTracks()[0] : this.localStream.getVideoTracks()[0];
        if (track) {
            track.enabled = !track.enabled;
            const btn = document.getElementById(type === 'audio' ? 'toggle-mic' : 'toggle-cam');
            btn.classList.toggle('off', !track.enabled);
        }
    }

    copyLink() {
        navigator.clipboard.writeText(window.location.href);
        this.logEvent("Link copied to clipboard.");
    }

    showError(msg) {
        const el = document.getElementById('error-message');
        el.innerText = msg;
        el.classList.remove('hidden');
    }
}

const App = new MeetManager();
            
