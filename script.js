class SatlexEngine {
    constructor() {
        this.localStream = null;
        this.peer = null;
        this.recorder = null;
        this.room = new URLSearchParams(window.location.search).get('room');
        this.log = document.getElementById('debug-log');
        this.init();
    }

    print(msg, color = "#888") {
        this.log.innerHTML += `<div style="color:${color}">${msg}</div>`;
        this.log.scrollTop = this.log.scrollHeight;
    }

    async init() {
        try {
            this.print("Requesting Media Access...");
            this.localStream = await navigator.mediaDevices.getUserMedia({ 
                video: true, 
                audio: { echoCancellation: true, noiseSuppression: true } 
            });
            document.getElementById('preview').srcObject = this.localStream;
            document.getElementById('hardware-status').innerText = "HARDWARE READY";
            this.print("Hardware Secured.", "#00ff00");
        } catch (e) {
            this.print(`CRITICAL ERROR: ${e.name}`, "#ff0000");
            alert("Security Block: Please use Localhost or HTTPS.");
        }
        document.getElementById('connect-btn').onclick = () => this.bootPeer();
    }

    bootPeer() {
        const name = document.getElementById('name-tag').value || "User";
        document.getElementById('lobby').style.display = 'none';

        this.peer = new Peer(undefined, {
            config: { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] }
        });

        this.peer.on('open', id => {
            this.print(`Peer ID Generated: ${id}`, "#00f2ff");
            if (!this.room) {
                window.history.replaceState({}, '', `?room=${id}`);
                this.room = id;
            } else {
                this.print(`Connecting to Room: ${this.room}`);
                const call = this.peer.call(this.room, this.localStream, { metadata: { name } });
                this.handleCall(call);
            }
            this.renderVideo(this.localStream, `${name} (You)`, true);
        });

        this.peer.on('call', call => {
            this.print("Incoming Call...");
            call.answer(this.localStream);
            this.handleCall(call);
        });
        
        this.setupButtons();
    }

    handleCall(call) {
        call.on('stream', s => this.renderVideo(s, call.metadata?.name || "Participant"));
    }

    renderVideo(stream, label, isLocal = false) {
        const grid = document.getElementById('grid');
        const box = document.createElement('div');
        box.className = 'v-box';
        const v = document.createElement('video');
        v.srcObject = stream;
        v.autoplay = true;
        v.playsInline = true;
        if (isLocal) v.muted = true;
        const span = document.createElement('span');
        span.innerText = label;
        box.append(v, span);
        grid.append(box);
    }

    async startRecording() {
        try {
            this.print("Initializing Screen Capture...");
            const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            const chunks = [];
            this.recorder = new MediaRecorder(displayStream);
            this.recorder.ondataavailable = e => chunks.push(e.data);
            this.recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `Meeting_${Date.now()}.webm`;
                a.click();
                displayStream.getTracks().forEach(t => t.stop());
                this.print("Recording Saved.");
            };
            this.recorder.start();
            document.getElementById('rec-btn').classList.add('rec-on');
        } catch (e) { this.print("Recording Denied."); }
    }

    setupButtons() {
        document.getElementById('rec-btn').onclick = () => {
            if (this.recorder?.state === "recording") this.recorder.stop();
            else this.startRecording();
        };
        document.getElementById('mic-btn').onclick = (e) => {
            const t = this.localStream.getAudioTracks()[0];
            t.enabled = !t.enabled;
            e.target.style.opacity = t.enabled ? "1" : "0.3";
        };
    }
}

new SatlexEngine();