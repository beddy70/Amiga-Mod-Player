/**
 * SampleViewer - Visualiseur de sample (oscilloscope)
 * Affiche la forme d'onde d'un sample sélectionné
 * avec les contrôles play, stop et loop
 */
class SampleViewer {
    constructor() {
        this.canvas = document.getElementById('sample-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.playBtn = document.getElementById('sample-play-btn');
        this.stopBtn = document.getElementById('sample-stop-btn');
        this.loopBtn = document.getElementById('sample-loop-btn');
        this.nameDisplay = document.getElementById('sample-name-display');

        // Éléments du popup d'agrandissement
        this.popup = document.getElementById('sample-popup');
        this.popupCanvas = document.getElementById('sample-popup-canvas');
        this.popupCtx = this.popupCanvas.getContext('2d');
        this.popupPlayBtn = document.getElementById('sample-popup-play-btn');
        this.popupStopBtn = document.getElementById('sample-popup-stop-btn');
        this.popupLoopBtn = document.getElementById('sample-popup-loop-btn');
        this.popupInfo = document.getElementById('sample-popup-info');
        this.popupTitle = document.getElementById('sample-popup-title');
        this.popupClose = document.getElementById('sample-popup-close');

        // Éléments du zoom (popup)
        this.zoomInBtn = document.getElementById('sample-popup-zoom-in-btn');
        this.zoomOutBtn = document.getElementById('sample-popup-zoom-out-btn');
        this.zoomResetBtn = document.getElementById('sample-popup-zoom-reset-btn');
        this.zoomDisplay = document.getElementById('sample-popup-zoom-display');

        // Éléments du clavier de notes (popup)
        this.octaveSelect = document.getElementById('sample-popup-octave-select');
        this.keysContainer = document.getElementById('sample-popup-keyboard-canvas');
        this.keysCtx = this.keysContainer ? this.keysContainer.getContext('2d') : null;
        this.pressedKey = -1; // index de la touche enfoncée (-1 = aucune)

        // État
        this.player = null;
        this.sample = null;
        this.sampleNum = 0;
        this.loopEnabled = true;
        this.isPlaying = false;
        this.popupVisible = false;

        // État du zoom/défilement du popup
        this.zoomFactor = 1;          // 1 = 100% (tout le sample visible)
        this.zoomOffset = 0;          // décalage en samples pour le défilement
        this.zoomStartX = null;       // position X du départ du glisser

        // Notes du clavier (noms), C-4 = période 428 en finetune 0 (base C-3 = 214)
        this.KEY_NOTES = ["C-","C#","D-","D#","E-","F-","F#","G-","G#","A-","A#","B-"];
        this.keyboardKeys = [];

        // Mapping des touches du clavier physique -> index de note (0-11)
        // q=C  z=C#  s=D  e=D#  d=E  f=F  t=F#  g=G  y=G#  h=A  u=A#  j=B
        this.KEY_MAP = {
            'q': 0, 'z': 1, 's': 2, 'e': 3, 'd': 4, 'f': 5,
            't': 6, 'g': 7, 'y': 8, 'h': 9, 'u': 10, 'j': 11
        };
        // Touche clavier physique actuellement enfoncée (pour l'affichage)
        this.pressedPhysicalKey = null;

        // Résolution du rendu (nombre de points par pixel de largeur)
        this.drawWidth = 0;
        this.drawHeight = 0;

        // Bind des événements
        this.bindEvents();
    }

    bindEvents() {
        this.playBtn.addEventListener('click', () => this.play());
        this.stopBtn.addEventListener('click', () => this.stop());
        this.loopBtn.addEventListener('click', () => this.toggleLoop());

        // Clic sur le canvas pour ouvrir le popup d'agrandissement
        this.canvas.addEventListener('click', () => this.openPopup());

        // Contrôles du popup
        this.popupClose.addEventListener('click', () => this.closePopup());
        this.popupPlayBtn.addEventListener('click', () => this.play());
        this.popupStopBtn.addEventListener('click', () => this.stop());
        this.popupLoopBtn.addEventListener('click', () => this.toggleLoop());

        // Fermer le popup si clic en dehors
        document.addEventListener('click', (e) => {
            if (this.popupVisible && !this.popup.contains(e.target) && e.target !== this.canvas) {
                this.closePopup();
            }
        });

        // Zoom : boutons
        this.zoomInBtn.addEventListener('click', () => this.zoomBy(1.5));
        this.zoomOutBtn.addEventListener('click', () => this.zoomBy(1 / 1.5));
        this.zoomResetBtn.addEventListener('click', () => this.resetZoom());

        // Zoom : molette sur le canvas du popup
        this.popupCanvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 1 / 1.2 : 1.2;
            // Zoomer centré sur la position de la souris
            this.zoomAt(e.offsetX, delta);
        }, { passive: false });

        // Défilement : clic-glisser sur le canvas du popup (quand on est zoomé)
        this.popupCanvas.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            this.zoomStartX = e.offsetX;
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (this.zoomStartX === null) return;
            const rect = this.popupCanvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const dx = mx - this.zoomStartX;
            if (dx !== 0) {
                this.scrollByPixels(dx);
                this.zoomStartX = mx;
            }
        });
        document.addEventListener('mouseup', () => {
            this.zoomStartX = null;
        });

        // Clavier de notes : sélecteur d'octave + construction
        this.octaveSelect.addEventListener('change', () => this.buildKeyboard());
        this.buildKeyboard();

        // Clavier piano : clic pour jouer une note
        this.keysContainer.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const rect = this.keysContainer.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const noteIdx = this.noteIndexAtPos(mx, my);
            if (noteIdx >= 0 && this.keyboardKeys[noteIdx]) {
                this.pressedKey = noteIdx;
                this.playNote(this.keyboardKeys[noteIdx].period);
                this.drawKeyboard();
            }
        });
        this.keysContainer.addEventListener('mouseup', () => {
            this.pressedKey = -1;
            this.drawKeyboard();
        });
        this.keysContainer.addEventListener('mouseleave', () => {
            this.pressedKey = -1;
            this.drawKeyboard();
        });

        // Clavier physique : jouer les notes q/z/s/e/d/f/t/g/y/h/u/j
        // quand le popup sample est ouvert. La touche reste enfoncée visuellement
        // tant que la touche physique est maintenue (indépendamment du clic souris).
        document.addEventListener('keydown', (e) => {
            if (!this.popupVisible) return;
            const key = e.key.toLowerCase();
            if (!(key in this.KEY_MAP)) return;
            // Ignorer si un champ de saisie/select a le focus (sélecteur d'octave)
            const tag = (e.target.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

            e.preventDefault(); // éviter l'auto-répétition des caractères
            const noteIdx = this.KEY_MAP[key];
            if (this.pressedPhysicalKey !== key) {
                this.pressedPhysicalKey = key;
                this.pressedKey = noteIdx;
                if (this.keyboardKeys[noteIdx]) {
                    this.playNote(this.keyboardKeys[noteIdx].period);
                }
                this.drawKeyboard();
            }
        });
        document.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            if (this.pressedPhysicalKey === key) {
                this.pressedPhysicalKey = null;
                this.pressedKey = -1;
                this.drawKeyboard();
                // Arrêter la lecture du sample quand la touche est relâchée
                this.stop();
            }
        });
        // Relâcher la touche affichée si le popup se ferme
        document.addEventListener('click', (e) => {
            if (!this.popupVisible && this.pressedPhysicalKey) {
                this.pressedPhysicalKey = null;
                this.pressedKey = -1;
                this.drawKeyboard();
            }
        });
    }

    setPlayer(player) {
        this.player = player;
        this.setSample(0);
    }

    setSample(sampleNum) {
        if (!this.player) return;
        this.sampleNum = sampleNum;
        this.sample = this.player.getSampleData(sampleNum);

        // Réinitialiser le zoom/défilement pour afficher le sample en entier
        this.zoomFactor = 1;
        this.zoomOffset = 0;
        if (this.zoomDisplay) {
            this.zoomDisplay.textContent = '100%';
        }

        if (this.sample) {
            const label = `${String(sampleNum).padStart(2, '0')} - ${this.sample.name || '(unnamed)'}`;
            this.nameDisplay.textContent = label;
            this.popupTitle.textContent = `SAMPLE VIEWER - ${label}`;
            this.popupInfo.textContent = this.sampleInfoString();
        } else {
            this.nameDisplay.textContent = 'No sample selected';
            this.popupTitle.textContent = 'SAMPLE VIEWER';
            this.popupInfo.textContent = 'No sample selected';
        }
        this.draw();
        this.drawPopup();
    }

    play() {
        if (!this.player || !this.sample) return;
        this.player.stopPreview();
        this.player.previewSample(this.sampleNum, this.loopEnabled);
        this.isPlaying = true;
        this.playBtn.classList.add('playing');
        this.popupPlayBtn.classList.add('playing');
        this.draw();
        this.drawPopup();
    }

    stop() {
        if (!this.player) return;
        this.player.stopPreview();
        this.isPlaying = false;
        this.playBtn.classList.remove('playing');
        this.popupPlayBtn.classList.remove('playing');
        this.draw();
        this.drawPopup();
    }

    toggleLoop() {
        this.loopEnabled = !this.loopEnabled;
        this.loopBtn.classList.toggle('active', this.loopEnabled);
        this.popupLoopBtn.classList.toggle('active', this.loopEnabled);

        // Si le sample est en lecture, on relance avec le nouveau mode
        if (this.isPlaying) {
            this.play();
        }
    }

    /**
     * Chaîne d'information du sample pour l'affichage du popup
     */
    sampleInfoString() {
        if (!this.sample) return 'No sample selected';
        const parts = [];
        const name = this.sample.name || '(unnamed)';
        const len = this.sample.length;
        if (len > 0) parts.push(`Len: ${len}`);
        if (this.sample.repeatLength > 2) {
            parts.push(`Loop: ${this.sample.repeatStart}-${this.sample.repeatStart + this.sample.repeatLength}`);
        }
        return `${String(this.sampleNum).padStart(2, '0')} ${name}${parts.length ? ' | ' + parts.join(' | ') : ''}`;
    }

    /**
     * Ouvre le popup d'agrandissement du sample
     */
    openPopup() {
        if (!this.sample) return;
        this.popupVisible = true;
        this.popup.classList.add('visible');
        this.popupInfo.textContent = this.sampleInfoString();
        this.drawPopup();
        // Le canvas du clavier n'a pas de largeur tant que le popup est masqué :
        // redessiner une fois le popup visible
        this.drawKeyboard();
    }

    /**
     * Ferme le popup d'agrandissement du sample
     */
    closePopup() {
        this.popupVisible = false;
        this.popup.classList.remove('visible');
    }

    // =========================================================================
    // Zoom / défilement du popup
    // =========================================================================

    /**
     * Zoom par facteur (1.5 = avant, 1/1.5 = arrière), centré à gauche.
     * Le bouton "+" zoom simple : on garde le même offset de départ.
     */
    zoomBy(factor) {
        this.zoomAt(0, factor);
    }

    /**
     * Zoom en gardant la position de souris (offsetX) fixe à l'écran.
     */
    zoomAt(offsetX, factor) {
        if (!this.sample) return;
        const len = this.sample.length;
        const width = this.popupCanvas.width;
        if (width <= 0) return;

        // Position en samples sous la souris AVANT zoom
        const visibleLen = len / this.zoomFactor;
        const anchorSample = this.zoomOffset + (offsetX / width) * visibleLen;

        // Nouveau facteur de zoom borné (1..100)
        const newFactor = Math.max(1, Math.min(100, this.zoomFactor * factor));
        if (newFactor === this.zoomFactor) return;
        this.zoomFactor = newFactor;

        // Nouvelle fenêtre visible (en samples)
        const newVisibleLen = len / this.zoomFactor;

        // Ajuster l'offset pour que l'anchor reste à la même position écran
        let newOffset = anchorSample - (offsetX / width) * newVisibleLen;
        newOffset = this.clampOffset(newOffset, newVisibleLen);

        this.zoomOffset = newOffset;
        this.zoomDisplay.textContent = Math.round(this.zoomFactor * 100) + '%';
        this.drawPopup();
    }

    /**
     * Réinitialise le zoom (vue complète du sample)
     */
    resetZoom() {
        this.zoomFactor = 1;
        this.zoomOffset = 0;
        this.zoomDisplay.textContent = '100%';
        this.drawPopup();
    }

    /**
     * Ramène l'offset dans les bornes valides : 0 <= offset <= len - visibleLen
     */
    clampOffset(offset, visibleLen) {
        if (!this.sample) return 0;
        const len = this.sample.length;
        const maxOffset = Math.max(0, len - visibleLen);
        return Math.max(0, Math.min(maxOffset, offset));
    }

    /**
     * Défilement horizontal en pixels (drag gauche/droite)
     */
    scrollByPixels(dxPixels) {
        if (!this.sample || this.zoomFactor <= 1) return;
        const width = this.popupCanvas.width;
        if (width <= 0) return;

        // Conversion pixels -> samples
        const visibleLen = this.sample.length / this.zoomFactor;
        const samplesPerPixel = visibleLen / width;
        const deltaSamples = -dxPixels * samplesPerPixel;

        this.zoomOffset = this.clampOffset(this.zoomOffset + deltaSamples, visibleLen);
        this.drawPopup();
    }

    // =========================================================================
    // Clavier de notes pour jouer le sample
    // =========================================================================

    /**
     * Construit le clavier de piano (1 octave) dans le popup sur le canvas.
     * 12 notes par octave, touches blanches + noires réalistes.
     * Le sample est joué à sa hauteur native à C-3 (période 214) ;
     * chaque octave multiplie la période par 2, chaque demi-ton par 2^(1/12).
     */
    buildKeyboard() {
        if (!this.keysContainer) return;
        const octave = parseInt(this.octaveSelect.value) || 2;

        // Calculer la période de chaque note de l'octave choisie
        this.keyboardKeys = this.KEY_NOTES.map((_, n) => {
            const basePeriod = 214 * Math.pow(2, octave - 3);
            const period = basePeriod * Math.pow(2, n / 12);
            return { period, octave, note: this.KEY_NOTES[n] + octave };
        });

        this.drawKeyboard();
    }

    /**
     * Redimensionne le canvas du clavier piano (1 octave)
     */
    resizeKeyboard() {
        if (!this.keysContainer) return;
        const w = this.keysContainer.clientWidth;
        const h = this.keysContainer.clientHeight;
        if (this.keysContainer.width !== w) this.keysContainer.width = w;
        if (this.keysContainer.height !== h) this.keysContainer.height = h;
    }

    /**
     * Dessine un vrai clavier de piano 1 octave (touches blanches + noires)
     */
    drawKeyboard() {
        if (!this.keysCtx) return;
        this.resizeKeyboard();
        const ctx = this.keysCtx;
        const w = this.keysContainer.width;
        const h = this.keysContainer.height;
        if (w === 0 || h === 0) return;

        // Fond
        const bgColor = getComputedStyle(document.body).getPropertyValue('--canvas-bg-deep').trim() || '#0a0a14';
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, w, h);

        // Les 7 touches blanches d'une octave : C D E F G A B (index 0,2,4,5,7,9,11)
        const whiteNotes = [0, 2, 4, 5, 7, 9, 11];
        const whiteW = w / whiteNotes.length;

        // Dessiner les touches blanches
        for (let i = 0; i < whiteNotes.length; i++) {
            const n = whiteNotes[i];
            const x = i * whiteW;
            const pressed = this.pressedKey === n;

            // Touche blanche (ou accent si pressée)
            ctx.fillStyle = pressed ? '#ffc864' : '#f0f0f0';
            ctx.fillRect(x + 0.5, 0.5, whiteW - 1, h - 1);

            // Contour
            ctx.strokeStyle = '#3c3c50';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, 0.5, whiteW - 1, h - 1);

            // Ombre de la touche (haut légèrement plus sombre)
            if (!pressed) {
                ctx.fillStyle = 'rgba(0,0,0,0.08)';
                ctx.fillRect(x + 1, 0, whiteW - 2, 3);
            }

            // Touche clavier physique associée
            const keyLetter = Object.keys(this.KEY_MAP).find(k => this.KEY_MAP[k] === n) || '';

            // Nom de la note
            ctx.fillStyle = pressed ? '#000' : '#444';
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${this.KEY_NOTES[n]}${this.keyboardKeys[n] ? this.keyboardKeys[n].octave : ''}`, x + whiteW / 2, h - 6);

            // Lettre du clavier physique (q, s, d, ...)
            if (keyLetter) {
                ctx.fillStyle = pressed ? '#000' : '#c07a00';
                ctx.font = 'bold 10px monospace';
                ctx.fillText(keyLetter.toUpperCase(), x + whiteW / 2, h - 18);
            }
        }

        // Touches noires (C#, D#, F#, G#, A# = index 1,3,6,8,10)
        const blackNotes = [1, 3, 6, 8, 10];
        const blackW = whiteW * 0.6;
        const blackH = h * 0.6;

        // Position de chaque touche noire par rapport aux touches blanches
        // C# entre C et D, D# entre D et E, F# entre F et G, etc.
        const blackPos = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 }; // index de la touche blanche avant

        for (const n of blackNotes) {
            const whiteIdx = blackPos[n];
            const x = (whiteIdx + 1) * whiteW - blackW / 2;
            const pressed = this.pressedKey === n;

            ctx.fillStyle = pressed ? '#ffc864' : '#1a1a1a';
            ctx.fillRect(x, 0, blackW, blackH);

            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, 0.5, blackW - 1, blackH - 0.5);

            // Nom de la note noire
            ctx.fillStyle = pressed ? '#000' : '#aaa';
            ctx.font = 'bold 7px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(this.KEY_NOTES[n], x + blackW / 2, blackH - 4);
        }

        // Reset textAlign
        ctx.textAlign = 'left';
    }

    /**
     * Retourne l'index de la note (0-11) sur laquelle se trouve la souris
     */
    noteIndexAtPos(mx, my) {
        if (!this.keysContainer) return -1;
        const w = this.keysContainer.width;
        const h = this.keysContainer.height;
        if (w === 0 || h === 0) return -1;

        const whiteNotes = [0, 2, 4, 5, 7, 9, 11];
        const whiteW = w / whiteNotes.length;
        const blackNotes = [1, 3, 6, 8, 10];
        const blackW = whiteW * 0.6;
        const blackH = h * 0.6;
        const blackPos = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };

        // Tester d'abord les touches noires (elles passent au-dessus des blanches)
        for (const n of blackNotes) {
            const x = (blackPos[n] + 1) * whiteW - blackW / 2;
            if (mx >= x && mx <= x + blackW && my >= 0 && my <= blackH) {
                return n;
            }
        }

        // Ensuite les touches blanches
        for (let i = 0; i < whiteNotes.length; i++) {
            const x = i * whiteW;
            if (mx >= x && mx < x + whiteW) {
                return whiteNotes[i];
            }
        }
        return -1;
    }

    /**
     * Joue le sample à la période donnée
     */
    playNote(period) {
        if (!this.player || !this.sample) return;
        this.player.stopPreview();
        this.player.previewSample(this.sampleNum, this.loopEnabled, period);
        this.isPlaying = true;
        this.playBtn.classList.add('playing');
        this.popupPlayBtn.classList.add('playing');
        this.draw();
        this.drawPopup();
    }

    /**
     * Redimensionne le canvas du popup (remplit la zone)
     */
    resizePopup() {
        const w = this.popupCanvas.clientWidth;
        const h = this.popupCanvas.clientHeight;
        if (this.popupCanvas.width !== w) {
            this.popupCanvas.width = w;
        }
        if (this.popupCanvas.height !== h) {
            this.popupCanvas.height = h;
        }
    }

    /**
     * Dessine le sample dans le popup (grand format)
     */
    drawPopup() {
        if (!this.popupVisible) return;
        this.resizePopup();

        const ctx = this.popupCtx;
        const width = this.popupCanvas.width;
        const height = this.popupCanvas.height;

        // Fond (couleur du thème)
        const cs = getComputedStyle(document.body);
        const bgColor = cs.getPropertyValue('--sample-canvas-bg').trim() || '#0a0a14';
        const textMuted = cs.getPropertyValue('--text-muted').trim() || '#404050';

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);

        if (!this.sample || !this.sample.data || this.sample.length === 0) {
            ctx.fillStyle = textMuted;
            ctx.font = '14px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('NO SAMPLE', width / 2, height / 2);
            ctx.textAlign = 'left';
            return;
        }

        const data = this.sample.data;
        const len = data.length;
        const centerY = height / 2;
        const amplitude = height / 2 - 14;

        // Ligne centrale
        ctx.strokeStyle = 'rgba(80, 80, 120, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();

        // Fenêtre visible (en samples) en fonction du zoom
        const visibleLen = len / this.zoomFactor;
        const offset = this.clampOffset(this.zoomOffset, visibleLen);
        const startSample = offset;
        const endSample = startSample + visibleLen;

        // Conversion sample -> pixel X
        const sampleToX = (s) => ((Math.max(startSample, Math.min(endSample, s)) - startSample) / visibleLen) * width;

        // Zone de boucle (si le sample a une boucle)
        if (this.sample.repeatLength > 2) {
            const loopStart = this.sample.repeatStart;
            const loopEnd = this.sample.repeatStart + this.sample.repeatLength;

            // Le chevauchement avec la fenêtre visible
            const visStart = Math.max(startSample, loopStart);
            const visEnd = Math.min(endSample, loopEnd);
            if (visStart < visEnd) {
                const loopStartX = sampleToX(loopStart);
                const loopEndX = sampleToX(loopEnd);

                ctx.fillStyle = 'rgba(100, 150, 255, 0.15)';
                ctx.fillRect(loopStartX, 0, loopEndX - loopStartX, height);

                ctx.strokeStyle = 'rgba(100, 150, 255, 0.5)';
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(loopStartX, 0);
                ctx.lineTo(loopStartX, height);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(loopEndX, 0);
                ctx.lineTo(loopEndX, height);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        // Dessiner la forme d'onde (même logique que le petit viewer, agrandie)
        ctx.strokeStyle = '#64c864';
        ctx.lineWidth = 1.2;
        ctx.beginPath();

        for (let x = 0; x < width; x++) {
            // Index de sample à ce pixel (borné à la fenêtre visible)
            const s0 = startSample + (x / width) * visibleLen;
            const s1 = startSample + ((x + 1) / width) * visibleLen;

            const startIdx = Math.max(0, Math.floor(s0));
            const endIdx = Math.min(len, Math.ceil(s1));
            if (startIdx >= len) break;

            let minVal = 1;
            let maxVal = -1;
            for (let i = startIdx; i < endIdx; i++) {
                const v = data[i];
                if (v < minVal) minVal = v;
                if (v > maxVal) maxVal = v;
            }

            const y1 = centerY - maxVal * amplitude;
            const y2 = centerY - minVal * amplitude;

            ctx.moveTo(x, y1);
            ctx.lineTo(x, y2);
        }
        ctx.stroke();

        // Curseur de lecture vertical si le sample est en lecture
        if (this.isPlaying && this.player) {
            const playPos = this.player.getPreviewPosition();
            if (playPos !== null) {
                const cursorX = sampleToX(playPos);

                ctx.strokeStyle = '#ffc864';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(cursorX, 0);
                ctx.lineTo(cursorX, height);
                ctx.stroke();

                ctx.fillStyle = '#ffc864';
                ctx.beginPath();
                ctx.arc(cursorX, 3, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(cursorX, height - 3, 3, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // La lecture one-shot est terminée
                this.isPlaying = false;
                this.playBtn.classList.remove('playing');
                this.popupPlayBtn.classList.remove('playing');
            }
        }
    }

    resize() {
        const w = this.canvas.parentElement.clientWidth - 14;
        const h = 100;
        if (this.canvas.width !== w) {
            this.canvas.width = w;
        }
        if (this.canvas.height !== h) {
            this.canvas.height = h;
        }
    }

    draw() {
        this.resize();

        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Fond (couleur du thème)
        const cs = getComputedStyle(document.body);
        const bgColor = cs.getPropertyValue('--sample-canvas-bg').trim() || '#0a0a14';
        const textMuted = cs.getPropertyValue('--text-muted').trim() || '#404050';

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);

        if (!this.sample || !this.sample.data || this.sample.length === 0) {
            ctx.fillStyle = textMuted;
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('NO SAMPLE', width / 2, height / 2);
            ctx.textAlign = 'left';
            return;
        }

        const data = this.sample.data;
        const len = data.length;
        const centerY = height / 2;
        const amplitude = height / 2 - 8;

        // Ligne centrale
        ctx.strokeStyle = 'rgba(80, 80, 120, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();

        // Zone de boucle (si le sample a une boucle)
        if (this.sample.repeatLength > 2) {
            const loopStartX = (this.sample.repeatStart / len) * width;
            const loopEndX = ((this.sample.repeatStart + this.sample.repeatLength) / len) * width;

            ctx.fillStyle = 'rgba(100, 150, 255, 0.15)';
            ctx.fillRect(loopStartX, 0, loopEndX - loopStartX, height);

            // Lignes verticales de la zone de boucle
            ctx.strokeStyle = 'rgba(100, 150, 255, 0.5)';
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(loopStartX, 0);
            ctx.lineTo(loopStartX, height);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(loopEndX, 0);
            ctx.lineTo(loopEndX, height);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Dessiner la forme d'onde (oscilloscope)
        // On étire TOUJOURS le sample sur toute la largeur du canvas,
        // quel que soit sa taille réelle. Si le sample est plus court que
        // la largeur, chaque échantillon occupe plusieurs pixels ; s'il est
        // plus long, on regroupe plusieurs échantillons par pixel (min/max).
        const samplesPerPixel = Math.max(1, Math.ceil(len / width));
        const numPoints = Math.min(width, len);

        ctx.strokeStyle = '#64c864';
        ctx.lineWidth = 1;
        ctx.beginPath();

        for (let x = 0; x < numPoints; x++) {
            const startIdx = Math.floor(x * len / width);
            const endIdx = Math.max(startIdx + 1, Math.floor((x + 1) * len / width));
            const clampedEnd = Math.min(endIdx, len);

            // Trouver min et max sur cette fenêtre
            let minVal = 1;
            let maxVal = -1;
            for (let i = startIdx; i < clampedEnd; i++) {
                const v = data[i];
                if (v < minVal) minVal = v;
                if (v > maxVal) maxVal = v;
            }

            // Dessiner la colonne verticale
            const y1 = centerY - maxVal * amplitude;
            const y2 = centerY - minVal * amplitude;

            if (x === 0) {
                ctx.moveTo(x, y1);
            }
            ctx.lineTo(x, y1);
            ctx.lineTo(x, y2);
        }

        ctx.stroke();

        // Curseur de lecture vertical si le sample est en lecture
        if (this.isPlaying && this.player) {
            const playPos = this.player.getPreviewPosition();
            if (playPos !== null) {
                const cursorX = (playPos / len) * width;

                // Ligne verticale du curseur
                ctx.strokeStyle = '#ffc864';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(cursorX, 0);
                ctx.lineTo(cursorX, height);
                ctx.stroke();

                // Point lumineux en haut et en bas
                ctx.fillStyle = '#ffc864';
                ctx.beginPath();
                ctx.arc(cursorX, 3, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(cursorX, height - 3, 3, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // La lecture one-shot est terminée (le sample a fini)
                this.isPlaying = false;
                this.playBtn.classList.remove('playing');
            }
        }
    }
}

/**
 * SynthKeyboard - Clavier de synthé visuel
 * Affiche les notes jouées par chaque canal sur un clavier de piano
 * Chaque pression est un point dans la couleur du canal
 */
 class SynthKeyboard {
    constructor() {
        this.canvas = document.getElementById('keyboard-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.popup = document.getElementById('synth-popup');
        this.toggleBtn = document.getElementById('keyboard-toggle');
        this.closeBtn = document.getElementById('synth-popup-close');
        this.octavesSelect = document.getElementById('synth-octaves-select');
        this.modeBtn = document.getElementById('synth-mode-toggle');
        this.player = null;
        this.visible = false;

        // Mode d'affichage : 'keys' (clavier) ou 'score' (partition)
        this.mode = 'keys';
        this.modeNames = { keys: 'KEYS', score: 'SCORE' };

        // Layout du mode partition (portées musicales)
        // Contrôle l'espacement vertical : l'air entre portées est généreux,
        // la hauteur du canvas/popup s'adapte en conséquence (tant qu'elle tient à l'écran)
        this.scoreLayout = {
            staffTop: 40,      // Air au-dessus de la première portée
            staffSpacing: 110, // Air entre deux portées (très aéré)
            lineSpacing: 10,   // Écart entre les 5 lignes d'une portée
            bottomAir: 40,     // Air en dessous de la dernière portée
            headMargin: 12     // Marge verticale des têtes de notes hors portée
        };

        // Notes et fréquences (MIDI note numbers)
        // Plage complète : C-1 (MIDI 24) à B-7 (MIDI 95) ≈ 6 octaves
        // L'Amiga peut monter plus haut/lower avec les périodes extrêmes,
        // on couvre donc 9 octaves de navigation : C-1 (MIDI 24) à B-8 (MIDI 119)
        this.baseNote = 36; // C-2 (position initiale)
        this.octaves = 3;   // Nombre d'octaves visibles (défaut : 3)
        this.numNotes = this.octaves * 12;

        // Bornes de navigation (9 octaves : C-1 à B-8)
        this.minBaseNote = 24;  // C-1
        this.maxBaseNote = 24 + 9 * 12 - this.numNotes; // pour que la fin tienne dans la plage

        // Noms des notes
        this.NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

        // Couleurs des canaux (correspond aux couleurs du pattern)
        this.channelColors = ['#ff6464', '#64ff64', '#6464ff', '#ffff64'];

        // État du drag & drop
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartBaseNote = 0;
        this.dragMoved = false;

        // Marqueurs d'instrument (lignes verticales) pour le tooltip au survol
        // Chaque entrée : { x, y, w, num, name }
        this.instrumentMarkers = [];
        this.hoveredMarker = null;

        // Créer l'élément tooltip (affiché au survol d'une ligne d'instrument)
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'synth-tooltip';
        this.tooltip.style.display = 'none';
        this.popup.appendChild(this.tooltip);

        // Bind du bouton toggle
        this.toggleBtn.addEventListener('click', () => this.toggle());

        // Bind du bouton fermer
        this.closeBtn.addEventListener('click', () => this.close());

        // Bind du sélecteur d'octaves
        this.octavesSelect.addEventListener('change', (e) => {
            this.setOctaves(parseInt(e.target.value));
        });

        // Bind du bouton mode (clavier / partition)
        this.modeBtn.addEventListener('click', () => this.toggleMode());

        // Bind du drag & drop sur le canvas
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('mouseup', () => this.onMouseUp());
    }

    setOctaves(numOctaves) {
        this.octaves = numOctaves;
        this.numNotes = this.octaves * 12;
        // Plage complète de 9 octaves : C-1 (MIDI 24) à B-8 (MIDI 119)
        this.maxBaseNote = 24 + 9 * 12 - this.numNotes;
        // Si la base courante dépasse la nouvelle borne, ajuster
        if (this.baseNote > this.maxBaseNote) {
            this.baseNote = this.maxBaseNote;
        }
        if (this.baseNote < this.minBaseNote) {
            this.baseNote = this.minBaseNote;
        }

        // En mode clavier : adapter la largeur du popup selon le nombre d'octaves
        // En mode score : ne pas toucher à la taille (la partition a son propre layout)
        if (this.mode === 'keys') {
            const popupWidth = Math.max(480, this.octaves * 120);
            const maxWidth = window.innerWidth * 0.95;
            this.popup.style.width = `${Math.min(popupWidth, maxWidth)}px`;
        }

        // La hauteur du canvas reste adaptée (120px suffit pour le rendu)
        this.resize();
    }

    onMouseDown(e) {
        if (e.button !== 0) return; // Bouton gauche uniquement
        if (this.mode === 'score') return; // Pas de drag en mode partition
        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartBaseNote = this.baseNote;
        this.dragMoved = false;
        e.preventDefault();
    }

    onMouseMove(e) {
        // En mode partition, gérer le tooltip au survol des marqueurs d'instrument
        if (this.mode === 'score' && this.visible) {
            this.updateTooltipHover(e);
            return;
        }

        if (!this.isDragging) return;

        const dx = e.clientX - this.dragStartX;
        if (Math.abs(dx) > 5) this.dragMoved = true;

        // Convertir le déplacement horizontal en décalage de notes
        // Une touche blanche ≈ largeur_canvas / nb_touches_blanches
        // On utilise octave complète (12 demi-tons) par déplacement de ~1/6 de la largeur
        if (this.canvas.width > 0) {
            const octavePixelWidth = this.canvas.width / this.octaves;
            const deltaNotes = Math.round((dx / octavePixelWidth) * 12);

            let newBase = this.dragStartBaseNote + deltaNotes;
            // Clamper à la plage de navigation
            newBase = Math.max(this.minBaseNote, Math.min(this.maxBaseNote, newBase));
            this.baseNote = newBase;

            // Redessiner immédiatement pour que les marqueurs suivent le drag
            this.draw();
        }
    }

    /**
     * Au survol de la souris en mode score, détecte si le curseur est sur une
     * ligne verticale d'instrument et affiche le tooltip (numéro + nom).
     */
    updateTooltipHover(e) {
        // Coordonnées relatives du canvas dans la popup
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // Chercher un marqueur survolé (zone généreuse autour de x)
        let found = null;
        for (const m of this.instrumentMarkers) {
            if (Math.abs(mx - m.x) <= 6 && my >= m.top && my <= m.bottom) {
                found = m;
                break;
            }
        }

        if (found) {
            if (this.hoveredMarker !== found) {
                this.hoveredMarker = found;
                // Afficher le tooltip avec numéro + nom de l'instrument
                const color = this.channelColors[found.channel];
                this.tooltip.innerHTML = `
                    <span style="color:${color};font-weight:bold;">INST ${String(found.num).padStart(2, '0')}</span>
                    <span style="color:#fff;">${found.name || '(unnamed)'}</span>
                `;
                this.tooltip.style.display = 'block';

                // Positionner le tooltip au-dessus du marqueur (coordonnées popup)
                const popupRect = this.popup.getBoundingClientRect();
                const tooltipLeft = rect.left - popupRect.left + found.x;
                const tooltipTop = rect.top - popupRect.top + found.top - 26;
                this.tooltip.style.left = `${tooltipLeft}px`;
                this.tooltip.style.top = `${tooltipTop}px`;
            }
        } else if (this.hoveredMarker !== null) {
            this.hoveredMarker = null;
            this.tooltip.style.display = 'none';
        }
    }

    onMouseUp() {
        if (this.isDragging) {
            this.isDragging = false;
            if (!this.dragMoved) {
                // C'est un clic simple, pas un drag
                // On pourrait éventuellement jouer une note ici
            }
        }
    }

    setPlayer(player) {
        this.player = player;
    }

    toggle() {
        this.visible = !this.visible;
        this.popup.classList.toggle('visible', this.visible);
        this.toggleBtn.classList.toggle('active', this.visible);
        if (this.visible) {
            // Appliquer la largeur du popup selon le nombre d'octaves actuel
            this.setOctaves(this.octaves);
            // Attendre que le popup soit rendu avant de redimensionner le canvas
            requestAnimationFrame(() => this.resize());
        }
    }

    close() {
        this.visible = false;
        this.popup.classList.remove('visible');
        this.toggleBtn.classList.remove('active');
    }

    /**
     * Calcule la hauteur nécessaire au canvas en mode partition,
     * en fonction du nombre de canaux et de l'air vertical configuré.
     */
    getScoreHeight() {
        const L = this.scoreLayout;
        // Hauteur = air haut + 5 lignes de la 1re portée + (n-1)*air entre portées + 5 lignes dernière + air bas
        const staffHeight = 4 * L.lineSpacing; // distance entre la 1re et la 5e ligne
        const numChans = 4; // 4 canaux pour le calcul de hauteur
        return L.staffTop + staffHeight + (numChans - 1) * L.staffSpacing + staffHeight + L.bottomAir;
    }

    resize() {
        const w = this.canvas.clientWidth;
        let h;
        if (this.mode === 'score') {
            h = this.getScoreHeight();
            // Ne pas dépasser la hauteur disponible à l'écran (90vh du popup)
            const maxH = Math.floor(window.innerHeight * 0.9);
            h = Math.min(h, maxH);
        } else {
            h = 120; // Hauteur fixe du clavier
        }
        if (this.canvas.width !== w) {
            this.canvas.width = w;
        }
        if (this.canvas.height !== h) {
            this.canvas.height = h;
        }
        // Mettre à jour la hauteur CSS pour que le canvas remplisse son espace
        if (this.canvas.style.height !== `${h}px`) {
            this.canvas.style.height = `${h}px`;
        }
    }

    /**
     * Convertit une période ProTracker en note MIDI
     * Formule logarithmique étendue sur toute la plage Amiga (9 octaves) :
     *   C-1 (période 1712) = MIDI 24
     *   C-2 (période 856)  = MIDI 36
     *   C-3 (période 428)  = MIDI 48
     *   ... chaque octave duplique/demi la période
     */
    periodToMidi(period) {
        if (period <= 0) return null;

        // Relation période → note MIDI (notation ProTracker étendue)
        // Référence : C-2 (MIDI 36) a une période de 856
        const midiFloat = 36 + 12 * Math.log2(856 / period);
        const midi = Math.round(midiFloat);

        // Bornes : MIDI 24 (C-1) à MIDI 119 (B-8) = 9 octaves
        if (midi < 24 || midi > 119) return null;

        return midi;
    }

    /**
     * Convertit une note MIDI en position x sur le clavier
     */
    midiToX(midi) {
        if (midi < this.baseNote || midi >= this.baseNote + this.numNotes) return null;
        const idx = midi - this.baseNote;
        const whiteKeys = this.getWhiteKeyIndexes();
        const whiteIndex = whiteKeys.indexOf(idx);

        // Note blanche
        if (whiteIndex >= 0) {
            const whiteKeyWidth = this.canvas.width / whiteKeys.length;
            const x = whiteIndex * whiteKeyWidth + whiteKeyWidth / 2;
            return { x, isBlack: false, whiteKeyWidth };
        }

        // Note noire
        // La note noire se trouve entre 2 touches blanches
        // On trouve la touche blanche avant
        const blackPositions = {
            1: 1, 3: 2, 6: 4, 8: 5, 10: 6
        };
        const whitePosInOctave = blackPositions[idx % 12];
        if (whitePosInOctave === undefined) return null;

        const whiteKeyWidth = this.canvas.width / whiteKeys.length;
        const x = (whitePosInOctave - 0.5) * whiteKeyWidth;

        return { x, isBlack: true, whiteKeyWidth };
    }

    getWhiteKeyIndexes() {
        const whiteKeys = [];
        for (let i = 0; i < this.numNotes; i++) {
            const noteInOctave = i % 12;
            if ([0, 2, 4, 5, 7, 9, 11].includes(noteInOctave)) {
                whiteKeys.push(i);
            }
        }
        return whiteKeys;
    }

    draw() {
        if (!this.visible) return;

        this.resize();

        // Rediriger vers le rendu de partition si le mode score est actif
        if (this.mode === 'score') {
            this.drawScore();
            return;
        }

        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Fond
        const bgColor = getComputedStyle(document.body).getPropertyValue('--canvas-bg-deep').trim() || '#0a0a14';
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, w, h);

        // Dessiner les touches blanches
        const whiteKeys = this.getWhiteKeyIndexes();
        const whiteKeyWidth = w / whiteKeys.length;

        ctx.strokeStyle = '#3c3c50';
        ctx.lineWidth = 1;

        // Touches blanches
        for (let i = 0; i < whiteKeys.length; i++) {
            const x = i * whiteKeyWidth;
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(x, 0, whiteKeyWidth - 1, h);

            // Contour
            ctx.strokeRect(x + 0.5, 0.5, whiteKeyWidth - 1, h - 1);

            // Label C (toutes les octaves)
            const midiNote = this.baseNote + whiteKeys[i];
            const noteName = this.NOTE_NAMES[midiNote % 12];
            if (noteName === 'C') {
                const octave = Math.floor(midiNote / 12) - 1; // MIDI 60 = C4 dans notre convention
                // ProTracker: C-2 = MIDI 36, donc octave = (midiNote - 36) / 12
                const ptOctave = Math.floor((midiNote - 36) / 12) + 2;
                ctx.fillStyle = '#888';
                ctx.font = '8px monospace';
                ctx.fillText(`C${ptOctave}`, x + 2, h - 4);
            }
        }

        // Touches noires
        const blackNotesInOctave = [1, 3, 6, 8, 10];
        const blackKeyWidth = whiteKeyWidth * 0.6;
        const blackKeyHeight = h * 0.6;

        for (let i = 0; i < this.numNotes; i++) {
            const noteInOctave = i % 12;
            if (!blackNotesInOctave.includes(noteInOctave)) continue;

            // Position : la touche noire est à 60% de la touche blanche précédente
            const whiteIndexBefore = this.getWhiteKeyBefore(i);
            if (whiteIndexBefore < 0) continue;

            const x = (whiteIndexBefore + 0.7) * whiteKeyWidth - blackKeyWidth / 2;
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(x, 0, blackKeyWidth, blackKeyHeight);
            ctx.strokeStyle = '#3c3c50';
            ctx.strokeRect(x + 0.5, 0.5, blackKeyWidth, blackKeyHeight - 0.5);

            // Petit label pour les notes noires (optionnel)
            const midiNote = this.baseNote + i;
            const noteName = this.NOTE_NAMES[midiNote % 12];
            if (noteName.includes('#')) {
                ctx.fillStyle = '#888';
                ctx.font = '6px monospace';
                ctx.fillText(noteName.replace('#', '#'), x + 2, 10);
            }
        }

        // Si pas de player ou pas de données, s'arrêter
        if (!this.player) {
            ctx.fillStyle = '#666';
            ctx.font = '10px monospace';
            ctx.fillText('No module loaded', w / 2 - 50, h / 2);
            return;
        }

        // Dessiner les points des canaux
        const periods = this.player.getChannelPeriods();
        if (!periods) return;

        // Couleur du thème pour les labels
        const themeColor = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#ffc864';

        for (let ch = 0; ch < Math.min(4, periods.length); ch++) {
            const midi = this.periodToMidi(periods[ch]);
            if (midi === null) continue;

            const pos = this.midiToX(midi);
            if (!pos) continue;

            const color = this.channelColors[ch];

            // Décalage vertical : chaque canal est décalé de 4px vers le haut
            // pour éviter la superposition quand plusieurs canaux jouent la même note
            const channelOffset = ch * 4;
            const pointY = h - 14 - channelOffset;

            // Point lumineux sur la touche (gros point)
            const radius = pos.isBlack ? 5 : 6;
            const glowRadius = radius * 2.2;

            // Halo lumineux
            const grad = ctx.createRadialGradient(pos.x, pointY, 0, pos.x, pointY, glowRadius);
            grad.addColorStop(0, color);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(pos.x, pointY, glowRadius, 0, Math.PI * 2);
            ctx.fill();

            // Point principal
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(pos.x, pointY, radius, 0, Math.PI * 2);
            ctx.fill();

            // Bordure noire pour le contraste
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Petit label du canal au-dessus du point
            ctx.fillStyle = color;
            ctx.font = 'bold 8px monospace';
            ctx.fillText(`CH${ch + 1}`, pos.x - 10, pointY - 8);
        }

        // Note: dessine une petite ligne de séparation pour chaque canal si plusieurs jouent
        // Labels de canal dans le coin
        ctx.font = 'bold 8px monospace';
        ctx.fillStyle = themeColor;
        ctx.fillText('KEYS', 3, 9);
    }

    getWhiteKeyBefore(idx) {
        const whiteKeys = this.getWhiteKeyIndexes();
        let before = -1;
        for (let i = 0; i < whiteKeys.length; i++) {
            if (whiteKeys[i] < idx) {
                before = i;
            } else {
                break;
            }
        }
        return before;
    }

    // =========================================================================
    // Mode partition (portées musicales)
    // =========================================================================

    toggleMode() {
        this.mode = (this.mode === 'keys') ? 'score' : 'keys';
        this.modeBtn.textContent = `MODE: ${this.modeNames[this.mode]}`;
        this.modeBtn.classList.toggle('active', this.mode === 'score');

        // Gérer la taille du popup et le sélecteur d'octaves selon le mode :
        // - Mode clavier : largeur = nombre d'octaves × 120px (via setOctaves),
        //   sélecteur d'octaves visible et fonctionnel
        // - Mode partition : largeur pleine (95vw) pour laisser de la place aux portées,
        //   sélecteur d'octaves masqué (le pattern remplit toute la largeur)
        if (this.mode === 'keys') {
            this.octavesSelect.style.display = '';
            this.setOctaves(this.octaves);
        } else {
            this.octavesSelect.style.display = 'none';
            const maxWidth = window.innerWidth * 0.95;
            this.popup.style.width = `${maxWidth}px`;
        }

        this.draw();
    }

    /**
     * Dessine le pattern courant en portées musicales :
     *  - Une portée par canal (4 canaux empilés)
     *  - Les notes du pattern sont dessinées avec leur durée réelle
     *    (croche=1 ligne, noire=2 lignes, blanche=4 lignes, ronde=8 lignes)
     *  - Un curseur vertical indique la position de lecture
     */
    drawScore() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Fond
        const bgColor = getComputedStyle(document.body).getPropertyValue('--canvas-bg-deep').trim() || '#0a0a14';
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, w, h);

        if (!this.player) {
            ctx.fillStyle = '#666';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('NO MODULE', w / 2, h / 2);
            ctx.textAlign = 'left';
            return;
        }

        // Récupérer le pattern courant
        const patternNum = this.player.getCurrentPattern();
        const patternData = this.player.getPatternData(patternNum);
        if (!patternData || !patternData.length) return;

        const numChans = Math.min(4, patternData[0].length);
        const rows = patternData.length; // 64 lignes

        // --- Configuration des portées (depuis le layout centralisé) ---
        const L = this.scoreLayout;
        const marginLeft = 45;
        const marginRight = 15;
        const lineSpacing = L.lineSpacing;      // Écart entre les lignes d'une portée
        const staffTop = L.staffTop;            // Air au-dessus de la 1ère portée
        const staffSpacing = L.staffSpacing;    // Air entre les portées
        const bottomAir = L.bottomAir;          // Air en bas du score

        const staffYs = [];
        for (let ch = 0; ch < numChans; ch++) {
            staffYs.push(staffTop + ch * staffSpacing);
        }

        // Espace horizontal pour afficher le pattern
        const noteAreaX = marginLeft + 15;
        const noteAreaW = w - noteAreaX - marginRight;

        // --- Dessiner les portées ---
        const themeText = getComputedStyle(document.body).getPropertyValue('--text-dim').trim() || '#8888a0';
        const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#ffc864';

        for (let ch = 0; ch < numChans; ch++) {
            const top = staffYs[ch];

            // 5 lignes de la portée
            ctx.strokeStyle = themeText;
            ctx.lineWidth = 1;
            for (let i = 0; i < 5; i++) {
                const y = top + i * lineSpacing;
                ctx.globalAlpha = 0.7;
                ctx.beginPath();
                ctx.moveTo(marginLeft, y);
                ctx.lineTo(w - marginRight, y);
                ctx.stroke();
                ctx.globalAlpha = 1.0;
            }

            // Clé de sol
            ctx.fillStyle = themeText;
            ctx.font = 'bold 14px serif';
            ctx.fillText('𝄞', 12, top + 16);

            // Label du canal
            const [r, g, b] = this.hexToRgb(this.channelColors[ch]);
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.font = 'bold 8px monospace';
            ctx.fillText(`CH${ch+1}`, 16, top + 34);
        }

        // --- Regrouper les notes du pattern en notes musicales ---
        // Chaque canal : on parcourt les lignes, on regroupe les lignes consécutives
        // qui ont la même période (même note maintenue). La durée = nombre de lignes.
        // Note : un period=0 (silence) coupe la note précédente.
        const midiLines = (midi) => {
            // C-4 (MIDI 60) = la ligne du milieu de la portée
            // E4 (MIDI 64) = la ligne du bas (5 lignes)
            return (midi - 64) * (lineSpacing / 2);
        };

        const colWidth = noteAreaW / rows;
        const noteGroups = []; // noteGroups[ch] = liste de {midi, startRow, len, silent}

        for (let ch = 0; ch < numChans; ch++) {
            const groups = [];
            let currentMidi = null;
            let startRow = 0;
            let len = 0;
            let hasNote = false;

            for (let row = 0; row < rows; row++) {
                const cell = patternData[row][ch];
                const period = cell ? cell.period : 0;
                const midi = this.periodToMidi(period);

                if (midi !== null && !hasNote) {
                    // Début d'une nouvelle note
                    currentMidi = midi;
                    startRow = row;
                    len = 1;
                    hasNote = true;
                } else if (hasNote && midi === currentMidi) {
                    // Même note maintenue → étend la durée
                    len++;
                } else {
                    // Note terminée (silence ou changement de note)
                    if (hasNote) {
                        groups.push({ midi: currentMidi, startRow, len, silent: false });
                    }
                    if (midi !== null) {
                        currentMidi = midi;
                        startRow = row;
                        len = 1;
                        hasNote = true;
                    } else {
                        currentMidi = null;
                        hasNote = false;
                    }
                }
            }
            // Flush
            if (hasNote) {
                groups.push({ midi: currentMidi, startRow, len, silent: false });
            }
            noteGroups.push(groups);
        }

        // --- Dessiner les notes ---
        // La durée s'indique par la FORME, pas par la taille :
        //  - 1 ligne = croche (pleine + hampe + crochet)
        //  - 2 lignes = noire (pleine + hampe)
        //  - 4 lignes = blanche (creuse + hampe)
        //  - 8+ lignes = ronde (creuse, pas de hampe)
        // Toutes les têtes ont la même taille pour une lecture uniforme.
        //
        // Gestion des octaves extrêmes : chaque note est bornée dans la ZONE
        // verticale de son canal (entre la moitié de l'espace vers le canal
        // précédent et la moitié de l'espace vers le canal suivant). Cela évite
        // qu'une note très aiguë/grave chevauche la portée d'un autre canal.
        // Des lignes supplémentaires (ledger lines) indiquent les notes qui
        // sortent de la portée, comme en vraie notation musicale.
        for (let ch = 0; ch < numChans; ch++) {
            const top = staffYs[ch];
            const color = this.channelColors[ch];

            // Zone verticale allouée au canal ch (bornes anti-chevauchement)
            const zoneTop = (ch === 0)
                ? staffTop - 18
                : staffYs[ch] - (staffSpacing / 2) + 6;
            const zoneBottom = (ch === numChans - 1)
                ? staffYs[ch] + 4 * lineSpacing + 18
                : staffYs[ch] + (staffSpacing / 2) - 6;

            // Bornes de la portée elle-même (5 lignes)
            const staffTopY = top;
            const staffBottomY = top + 4 * lineSpacing;

            for (const grp of noteGroups[ch]) {
                const x = noteAreaX + (grp.startRow + grp.len / 2) * colWidth;
                let noteY = top + lineSpacing * 2 - midiLines(grp.midi);

                // Clamper la note dans la zone du canal (anti-chevauchement)
                noteY = Math.max(zoneTop, Math.min(zoneBottom, noteY));

                // Durée → type de note
                let headType, stem = true, filled = true;
                if (grp.len <= 1) {
                    headType = 'eighth';   // croche
                    filled = true;
                    stem = true;
                } else if (grp.len <= 2) {
                    headType = 'quarter';  // noire
                    filled = true;
                    stem = true;
                } else if (grp.len <= 4) {
                    headType = 'half';     // blanche
                    filled = false;
                    stem = true;
                } else {
                    headType = 'whole';    // ronde
                    filled = false;
                    stem = false;
                }

                // Tête de note fixe (même taille pour toutes les durées)
                const headW = 8;
                const headH = 6;

                // Lignes supplémentaires (ledger lines) pour les notes au-dessus
                // ou en dessous de la portée du canal
                const midiNorm = 64; // E4 = ligne de référence (0 demi-ton)
                const midiOffset = grp.midi - midiNorm; // positif = aigu, négatif = grave
                const noteLines = Math.floor(Math.abs(midiOffset) / 2);
                const noteAbove = midiOffset > 0;
                const noteInStaff = Math.abs(midiOffset) <= 4; // dans les 5 lignes (±2 dièses)

                if (noteLines >= 1 && !noteInStaff) {
                    ctx.strokeStyle = themeText;
                    ctx.lineWidth = 1;
                    ctx.globalAlpha = 0.7;

                    // Position de la ligne supplémentaire : chaque figure de
                    // ligne correspond à 2 demi-tons (une ligne de portée)
                    for (let li = 1; li <= noteLines; li++) {
                        let lineY;
                        if (noteAbove) {
                            // Au-dessus : au niveau de la 5e ligne + 2 demi-tons par figure
                            lineY = staffTopY + 4 * lineSpacing + (li * (lineSpacing / 2)) * 1;
                        } else {
                            // En dessous : au niveau de la 1re ligne - 2 demi-tons par figure
                            lineY = staffTopY - (li * (lineSpacing / 2)) * 1;
                        }
                        // La ligne doit être dans la zone du canal pour ne pas
                        // empiéter sur la portée voisine
                        if (lineY >= zoneTop && lineY <= zoneBottom) {
                            ctx.beginPath();
                            ctx.moveTo(x - 10, lineY);
                            ctx.lineTo(x + 14, lineY);
                            ctx.stroke();
                        }
                    }
                    ctx.globalAlpha = 1.0;
                }

                // Tête de note (ellipse inclinée)
                ctx.fillStyle = filled ? color : bgColor;
                ctx.beginPath();
                ctx.ellipse(x, noteY, headW, headH, -0.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.2;
                ctx.stroke();

                // Hampe
                if (stem) {
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(x + headW, noteY);
                    ctx.lineTo(x + headW, noteY - 24);
                    ctx.stroke();

                    // Crochet pour les croches
                    if (headType === 'eighth') {
                        ctx.beginPath();
                        ctx.moveTo(x + headW, noteY - 24);
                        ctx.quadraticCurveTo(x + headW + 6, noteY - 24, x + headW + 12, noteY - 18);
                        ctx.lineTo(x + headW + 12, noteY - 24);
                        ctx.stroke();
                    }
                }

                // Nom de la note
                const noteName = this.midiToName(grp.midi);
                ctx.fillStyle = color;
                ctx.font = 'bold 7px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(noteName, x, noteY + headH + 12);
                ctx.textAlign = 'left';
            }
        }

        // --- Lignes verticales des changements d'instrument ---
        // Pour chaque canal, on détecte les changements de sample (instrument)
        // et on dessine une ligne verticale sur la portée de ce canal avec
        // le numéro d'instrument affiché à côté.
        // Les coordonnées de chaque marqueur sont stockées pour permettre
        // l'affichage d'un tooltip au survol de la souris (numéro + nom).
        this.instrumentMarkers = [];
        for (let ch = 0; ch < numChans; ch++) {
            const top = staffYs[ch];
            const color = this.channelColors[ch];
            let lastSample = 0;

            for (let row = 0; row < rows; row++) {
                const cell = patternData[row][ch];
                const sample = cell ? cell.sample : 0;

                if (sample > 0 && sample !== lastSample) {
                    // Changement d'instrument détecté à cette ligne
                    const x = noteAreaX + row * colWidth;
                    const markerTop = top - 14;   // zone du numéro

                    // Stocker le marqueur pour le tooltip au survol
                    const sampleInfo = this.player.getSampleData(sample - 1);
                    const sampleName = sampleInfo ? (sampleInfo.name || '') : '';
                    this.instrumentMarkers.push({
                        x: x,
                        top: top - 14,
                        bottom: top + 4 * lineSpacing + 4,
                        num: sample,
                        name: sampleName,
                        channel: ch
                    });

                    // Ligne verticale sur la portée du canal (bornée à la portée)
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1;
                    ctx.globalAlpha = 0.55;
                    ctx.beginPath();
                    ctx.moveTo(x, top - 4);
                    ctx.lineTo(x, top + 4 * lineSpacing + 4);
                    ctx.stroke();
                    ctx.globalAlpha = 1.0;

                    // Petit triangle indicateur sur la ligne
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.moveTo(x, top - 4);
                    ctx.lineTo(x - 4, top - 10);
                    ctx.lineTo(x + 4, top - 10);
                    ctx.closePath();
                    ctx.fill();

                    // Numéro de l'instrument au-dessus de la ligne
                    ctx.fillStyle = color;
                    ctx.font = 'bold 7px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(String(sample).padStart(2, '0'), x, markerTop);
                    ctx.textAlign = 'left';

                    lastSample = sample;
                }
            }
        }

        // --- Curseur de lecture vertical ---
        const currentRow = this.player.getCurrentRow();
        if (currentRow >= 0 && currentRow < rows) {
            const cursorX = noteAreaX + currentRow * colWidth;

            // Ligne verticale du curseur
            ctx.strokeStyle = accent;
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.8;
            ctx.beginPath();
            ctx.moveTo(cursorX, staffTop - 5);
            ctx.lineTo(cursorX, staffYs[numChans - 1] + 4 * lineSpacing + 5);
            ctx.stroke();
            ctx.globalAlpha = 1.0;

            // Triangle indicateur en haut
            ctx.fillStyle = accent;
            ctx.beginPath();
            ctx.moveTo(cursorX, staffTop - 8);
            ctx.lineTo(cursorX - 5, staffTop - 16);
            ctx.lineTo(cursorX + 5, staffTop - 16);
            ctx.closePath();
            ctx.fill();
        }

        // Indication du pattern courant
        ctx.fillStyle = themeText;
        ctx.font = 'bold 9px monospace';
        ctx.fillText(`PAT ${String(patternNum).padStart(2, '0')}`, w - 90, staffTop - 5);
    }

    /**
     * Convertit une note MIDI en nom de note (C-2, A#-3, etc.)
     */
    midiToName(midi) {
        const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const name = names[midi % 12];
        // ProTracker convention: C-2 = MIDI 36, donc octave = 2 + (midi - 36) / 12
        const octave = 2 + Math.floor((midi - 36) / 12);
        return `${name}-${octave}`;
    }

    hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return [r, g, b];
    }
}

/**
 * Visualizer - VU Meters, Oscilloscope et Spectrum Analyzer
 * Style Winamp / Amiga copper bars
 */
class Visualizer {
    constructor() {
        this.vuMetersContainer = document.getElementById('vu-meters');
        this.visCanvas = document.getElementById('visualization-canvas');
        this.visLabel = document.getElementById('vis-mode-label');
        this.visCtx = this.visCanvas.getContext('2d');

        // Visualization mode: 0=spectrum, 1=oscilloscope, 2=both
        this.visMode = 0;
        this.visModeNames = ['SPECTRUM', 'SCOPE', 'BOTH'];

        // Audio data buffers
        this.leftBuffer = null;
        this.rightBuffer = null;
        this.channelBuffers = null;
        this.spectrum = new Float32Array(64);
        this.prevSpectrum = new Float32Array(64);

        // Per-channel spectrum data (4 spectres, un par voix)
        this.channelSpectrums = [
            new Float32Array(64),
            new Float32Array(64),
            new Float32Array(64),
            new Float32Array(64)
        ];
        this.prevChannelSpectrums = [
            new Float32Array(64),
            new Float32Array(64),
            new Float32Array(64),
            new Float32Array(64)
        ];

        // Couleurs des 4 canaux (style Amiga)
        this.channelColors = [
            [255, 100, 100], // Rouge
            [100, 255, 100], // Vert
            [100, 100, 255], // Bleu
            [255, 255, 100]  // Jaune
        ];

        // VU meter data
        this.vuLevels = [0, 0, 0, 0];
        this.vuPeaks = [0, 0, 0, 0];
        this.vuPeakTimes = [0, 0, 0, 0];
        this.vuTargets = [0, 0, 0, 0];  // Niveaux cibles réels des canaux

        // Spectrum colors (rainbow)
        this.spectrumColors = [];
        for (let i = 0; i < 64; i++) {
            const hue = (i / 64) * 0.8; // Purple to red
            this.spectrumColors.push(this.hslToRgb(hue, 1.0, 0.5));
        }

        // Click to change visualization mode
        this.visCanvas.addEventListener('click', () => {
            this.visMode = (this.visMode + 1) % 3;
            this.visLabel.textContent = this.visModeNames[this.visMode];
        });

        // Build VU meters
        this.buildVUMeters();

        // Charger les balances sauvegardées au prochain tick, pour laisser
        // main.js définir onPanChange avant d'appliquer les valeurs au player.
        requestAnimationFrame(() => this.loadPans());
    }

    // =========================================================================
    // Sauvegarde / restauration des balances (localStorage + fallback cookie)
    // =========================================================================

    loadPans() {
        let saved = null;

        // Lire d'abord le cookie (source principale comme demandé)
        const match = document.cookie.match(new RegExp('(?:^|; )modplayer_pans=([^;]*)'));
        if (match) saved = decodeURIComponent(match[1]);

        // Fallback : lire depuis localStorage si pas de cookie
        if (!saved) {
            try {
                saved = localStorage.getItem('modplayer_pans');
            } catch (e) {
                saved = null;
            }
        }

        if (saved) {
            try {
                const pans = JSON.parse(saved);
                if (Array.isArray(pans) && pans.length === 4) {
                    this.setPanValues(pans);
                    for (let i = 0; i < 4; i++) {
                        if (this.onPanChange) this.onPanChange(i, pans[i]);
                    }
                }
            } catch (e) {
                // Ignorer une sauvegarde invalide
            }
        }
    }

    savePans() {
        const pans = this.getPanValues();
        const data = JSON.stringify(pans);

        // Écrire dans un cookie (durée de vie : 1 an)
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 365);
        document.cookie = `modplayer_pans=${encodeURIComponent(data)}; expires=${expiry.toUTCString()}; path=/`;

        // Fallback : synchroniser aussi dans localStorage pour la robustesse
        try {
            localStorage.setItem('modplayer_pans', data);
        } catch (e) {
            // localStorage indisponible : le cookie suffit
        }
    }

    getPanValues() {
        if (!this.vuPanSliders) return [0, 1, 1, 0];
        return this.vuPanSliders.map(s => s.value / 100);
    }

    setPanValues(pans) {
        if (!this.vuPanSliders) return;
        const defaults = [0, 100, 100, 0];
        for (let i = 0; i < 4; i++) {
            let val;
            if (pans && typeof pans[i] === 'number') {
                val = pans[i] * 100;
            } else {
                val = defaults[i];
            }
            this.vuPanSliders[i].value = Math.max(0, Math.min(100, Math.round(val)));
            if (this.vuPanLabels[i]) {
                const pan = this.vuPanSliders[i].value / 100;
                this.vuPanLabels[i].textContent =
                    pan < 0.45 ? 'L' :
                    pan > 0.55 ? 'R' : 'C';
            }
        }
    }

    // Remet les balances aux valeurs par défaut Amiga
    // (CH1/G, CH2/D, CH3/D, CH4/G) et les sauvegarde.
    resetPans() {
        this.setPanValues(null);
        for (let i = 0; i < 4; i++) {
            if (this.onPanChange) this.onPanChange(i, this.vuPanSliders[i].value / 100);
        }
        this.savePans();
        if (this.onPansReset) this.onPansReset();
    }

    hslToRgb(h, s, l) {
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    buildVUMeters() {
        this.vuMetersContainer.innerHTML = '';
        this.vuCanvases = [];   // Canvas pour les aiguilles
        this.vuPeakEls = [];    // Points de peak (LED)
        this.vuPanSliders = []; // Potentiomètres de balance
        this.vuPanLabels = [];  // Labels de valeur balance
        const labels = ['CH1', 'CH2', 'CH3', 'CH4'];

        for (let i = 0; i < 4; i++) {
            const meter = document.createElement('div');
            meter.className = 'vu-meter';

            // Canvas pour l'aiguille analogique
            const needleCanvas = document.createElement('canvas');
            needleCanvas.className = 'vu-needle-canvas';
            needleCanvas.width = 80;
            needleCanvas.height = 46;

            // LED de peak (petit point au-dessus de l'aiguille)
            const peak = document.createElement('div');
            peak.className = 'vu-peak';
            peak.style.display = 'none';

            meter.appendChild(needleCanvas);
            meter.appendChild(peak);

            const label = document.createElement('div');
            label.className = `vu-label ch-${i}`;
            label.textContent = labels[i];
            meter.appendChild(label);

            // Potentiomètre de balance stéréo (L ----- C ----- R)
            const panRow = document.createElement('div');
            panRow.className = 'vu-pan-row';

            const panSlider = document.createElement('input');
            panSlider.type = 'range';
            panSlider.className = `vu-pan ch-${i}`;
            panSlider.min = 0;
            panSlider.max = 100;
            panSlider.step = 1;
            panSlider.value = 50;
            panSlider.title = 'Balance stéréo du canal';

            // Valeurs par défaut style Amiga : CH1/G, CH2/D, CH3/D, CH4/G
            // (slider 0 = gauche, 100 = droite, 50 = centre)
            const defaultPan = [0, 100, 100, 0];
            panSlider.value = defaultPan[i];

            const panLabel = document.createElement('span');
            panLabel.className = 'vu-pan-label';
            // Libellé initial reflétant la valeur par défaut
            const defPan = panSlider.value / 100;
            panLabel.textContent =
                defPan < 0.45 ? 'L' :
                defPan > 0.55 ? 'R' : 'C';

            const updatePanLabel = () => {
                const pan = panSlider.value / 100;
                panLabel.textContent =
                    pan < 0.45 ? 'L' :
                    pan > 0.55 ? 'R' : 'C';
                if (this.onPanChange) {
                    this.onPanChange(i, pan);
                }
                // Sauvegarder les balances à chaque changement
                this.savePans();
            };

            panSlider.addEventListener('input', updatePanLabel);

            panRow.appendChild(panSlider);
            panRow.appendChild(panLabel);
            meter.appendChild(panRow);

            this.vuMetersContainer.appendChild(meter);
            this.vuCanvases.push(needleCanvas);
            this.vuPeakEls.push(peak);
            this.vuPanSliders.push(panSlider);
            this.vuPanLabels.push(panLabel);
        }

        // Étirer les canvas à la largeur réelle
        this.resizeVUCanvases();
    }

    /**
     * Redimensionne les canvas des VU meters à la largeur réelle du conteneur.
     * La hauteur est fixée à 46px pour correspondre au CSS (aiguille analogique
     * sur la grille 2×2 des 4 canaux, au-dessus du potentiomètre de balance).
     */
    resizeVUCanvases() {
        if (!this.vuCanvases) return;
        for (let i = 0; i < this.vuCanvases.length; i++) {
            const canvas = this.vuCanvases[i];
            const containerWidth = canvas.parentElement.clientWidth;
            if (canvas.width !== containerWidth) {
                canvas.width = containerWidth;
            }
            if (canvas.height !== 46) {
                canvas.height = 46;
            }
            // Redessiner immédiatement
            this.drawNeedle(i);
        }
    }

    /**
     * Dessine un VU meter analogique avec aiguille pour le canal donné.
     * Style rétro : fond sombre, échelle en arc, graduation, zones
     * vert/jaune/rouge, aiguille pivotante selon le niveau.
     */
    drawNeedle(chIndex) {
        const canvas = this.vuCanvases[chIndex];
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;

        // Coordonnées du pivot de l'aiguille (bas centre)
        const pivotX = w / 2;
        const pivotY = h - 4;
        const needleLen = Math.min(w / 2 - 3, h - 8);

        // Angle de l'aiguille : un VU meter analogique classique pivote
        // de gauche à droite en passant par le HAUT du cadran :
        //   -135° (gauche, niveau 0)
        //    -90° (haut, niveau 0.5)
        //    -45° (droite, niveau 1)
        // En canvas, y va vers le bas, donc ces angles négatifs pointent
        // correctement vers le haut (-90° = haut, -135° = haut-gauche, -45° = haut-droite)
        const angleMin = -135 * Math.PI / 180;
        const angleMax = -45 * Math.PI / 180;
        const level = Math.min(1, Math.max(0, this.vuLevels[chIndex] || 0));
        const angle = angleMin + (angleMax - angleMin) * level;

        // --- Fond (cadran) ---
        const bgColor = getComputedStyle(document.body).getPropertyValue('--canvas-bg-deep').trim() || '#0a0a14';
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, w, h);

        // Cadran arrondi (fond légèrement plus clair)
        ctx.fillStyle = 'rgba(30, 30, 50, 0.8)';
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, needleLen + 2, Math.PI, 2 * Math.PI);
        ctx.closePath();
        ctx.fill();

        // --- Échelle (arc) ---
        const gradRadius = needleLen - 4;
        const numTicks = 11; // 0..10 graduations

        for (let t = 0; t <= numTicks; t++) {
            const tickLevel = t / numTicks;
            const tickAngle = angleMin + (angleMax - angleMin) * tickLevel;
            const x1 = pivotX + Math.cos(tickAngle) * (gradRadius - 3);
            const y1 = pivotY + Math.sin(tickAngle) * (gradRadius - 3);
            const x2 = pivotX + Math.cos(tickAngle) * (gradRadius + 2);
            const y2 = pivotY + Math.sin(tickAngle) * (gradRadius + 2);

            // Couleur des graduations selon la zone
            let tickColor = '#64ff64';          // vert
            if (tickLevel > 0.6 && tickLevel <= 0.85) tickColor = '#ffff64';  // jaune
            if (tickLevel > 0.85) tickColor = '#ff6464';                      // rouge

            ctx.strokeStyle = tickColor;
            ctx.lineWidth = t % 5 === 0 ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }

        // --- Zones colorées (vert, jaune, rouge) en arc ---
        const zoneColors = [
            { from: 0.0, to: 0.6, color: 'rgba(100, 255, 100, 0.15)' },
            { from: 0.6, to: 0.85, color: 'rgba(255, 255, 100, 0.2)' },
            { from: 0.85, to: 1.0, color: 'rgba(255, 100, 100, 0.25)' }
        ];
        for (const zone of zoneColors) {
            const a1 = angleMin + (angleMax - angleMin) * zone.from;
            const a2 = angleMin + (angleMax - angleMin) * zone.to;
            ctx.fillStyle = zone.color;
            ctx.beginPath();
            ctx.arc(pivotX, pivotY, gradRadius - 2, a1, a2);
            ctx.lineTo(pivotX + Math.cos(a2) * (gradRadius - 10), pivotY + Math.sin(a2) * (gradRadius - 10));
            ctx.lineTo(pivotX + Math.cos(a1) * (gradRadius - 10), pivotY + Math.sin(a1) * (gradRadius - 10));
            ctx.closePath();
            ctx.fill();
        }

        // --- Aiguille ---
        const [cr, cg, cb] = this.channelColors[chIndex];
        const tipX = pivotX + Math.cos(angle) * needleLen;
        const tipY = pivotY + Math.sin(angle) * needleLen;

        // Ombre de l'aiguille
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(pivotX, pivotY);
        ctx.lineTo(tipX + 1, tipY + 1);
        ctx.stroke();

        // Aiguille principale (blanche avec pointe colorée)
        const grad = ctx.createLinearGradient(pivotX, pivotY, tipX, tipY);
        grad.addColorStop(0, '#888');
        grad.addColorStop(0.7, '#ddd');
        grad.addColorStop(1, `rgb(${cr},${cg},${cb})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pivotX, pivotY);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();

        // Pivot (petit cercle)
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Label du niveau (petit texte en bas)
        const dbVal = Math.round(level * 100);
        ctx.fillStyle = '#aaaac8';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(String(dbVal).padStart(3, '0'), pivotX, h - 2);
        ctx.textAlign = 'left';
    }

    setAudioData(leftBuffer, rightBuffer, channelLevels, channelBuffers) {
        // Store audio buffers
        if (leftBuffer) this.leftBuffer = leftBuffer;
        if (rightBuffer) this.rightBuffer = rightBuffer;
        if (channelBuffers && channelBuffers.length > 0) {
            this.channelBuffers = channelBuffers;
        }

        // Update VU levels
        // Les aiguilles montent IMMÉDIATEMENT avec le niveau (attaque rapide),
        // mais redescendent DOUCEMENT quand le volume chute, comme un
        // condensateur qui se décharge (retour progressif vers la cible).
        if (channelLevels) {
            for (let i = 0; i < 4; i++) {
                const target = channelLevels[i] || 0;
                this.vuTargets[i] = target;

                // Attaque rapide : monte instantanément à la cible
                if (target >= this.vuLevels[i]) {
                    this.vuLevels[i] = target;
                }
                // Pas de descente ici : le decay doux dans updateVUMeters
                // s'occupe de ramener l'aiguille vers la cible progressivement

                // Les peaks suivent l'amplitude en temps réel
                if (this.vuLevels[i] >= this.vuPeaks[i]) {
                    this.vuPeaks[i] = this.vuLevels[i];
                } else {
                    // Le peak redescend en suivant le niveau, jamais en dessous
                    this.vuPeaks[i] = Math.max(this.vuLevels[i], this.vuPeaks[i] * 0.95);
                }
            }
        }

        // Le rendu et le decay des aiguilles sont gérés dans la boucle d'animation
        // (updateVUMeters appelé chaque frame dans main.js) pour que le
        // "retour condensateur" reste fluide même sans nouveau flux audio.
    }

    updateVUMeters() {
        // Dessiner les aiguilles analogiques
        for (let i = 0; i < 4; i++) {
            // Decay doux type "condensateur" : si le niveau affiché est
            // au-dessus de la cible réelle, on le fait redescendre
            // progressivement avec une décroissance exponentielle.
            // Le facteur 0.98 par frame (à 60fps) donne une chute d'environ
            // 2 secondes de 100% à ~10 %, comme la décharge d'un condensateur RC.
            // Comme l'attaque est instantanée dans setAudioData, l'aiguille
            // monte vite au son, puis redescend lentement en silence.
            if (this.vuLevels[i] > this.vuTargets[i]) {
                this.vuLevels[i] = Math.max(this.vuTargets[i], this.vuLevels[i] * 0.98);
            }

            this.drawNeedle(i);

            // LED de peak : allumée si le niveau est fort, éteinte sinon
            if (this.vuPeakEls[i]) {
                const peakActive = this.vuPeaks[i] > 0.85;
                this.vuPeakEls[i].style.display = peakActive ? 'block' : 'none';
            }
        }
    }

    /**
     * Calcule la couleur d'une barre VU en fonction du niveau (0..1).
     * La couleur du canal est teintée par la couleur du niveau :
     *   - niveau faible  → teinte verte
     *   - niveau moyen   → teinte jaune
     *   - niveau fort    → teinte rouge
     * La couleur du canal est interpolée avec la couleur du niveau
     * pour garder chaque canal identifiable tout en reflétant son
     * amplitude réelle en temps réel.
     */
    levelToColor(level, cr, cg, cb) {
        // Teinte selon le niveau (HSB) : 120° (vert) → 0° (rouge)
        // On garde une saturation élevée et une luminosité moyenne pour
        // être bien visible sur fond sombre.
        const hue = 120 * (1 - level); // 120 = vert, 0 = rouge
        const [hr, hg, hb] = this.hslToRgb(hue / 360, 0.9, 0.55);

        // Interpoler 70% couleur de niveau + 30% couleur du canal
        // pour garder l'identité du canal tout en montrant le niveau
        return [
            Math.round(hr * 0.7 + cr * 0.3),
            Math.round(hg * 0.7 + cg * 0.3),
            Math.round(hb * 0.7 + cb * 0.3)
        ];
    }

    updateSpectrum() {
        if (!this.leftBuffer || this.leftBuffer.length === 0) return;

        const samplesPerBand = this.leftBuffer.length / this.spectrum.length;
        for (let i = 0; i < this.spectrum.length; i++) {
            let sum = 0;
            for (let j = 0; j < samplesPerBand; j++) {
                const idx = i * samplesPerBand + j;
                if (idx < this.leftBuffer.length) {
                    sum += Math.abs(this.leftBuffer[idx]);
                }
            }
            const newVal = (sum / samplesPerBand) * 3.0;
            this.spectrum[i] = Math.max(this.prevSpectrum[i] * 0.8, newVal);
            this.prevSpectrum[i] = this.spectrum[i];
        }

        // Mettre à jour les 4 spectres par canal
        if (this.channelBuffers && this.channelBuffers.length > 0) {
            const numChans = Math.min(4, this.channelBuffers.length);
            for (let ch = 0; ch < numChans; ch++) {
                const buf = this.channelBuffers[ch];
                if (!buf || buf.length === 0) continue;

                const chSamplesPerBand = buf.length / this.channelSpectrums[ch].length;

                // Normalisation RMS : les buffers par canal ne sont PAS atténués
                // (contrairement au mix global à gauche/droite qui est multiplié par 0.4)
                // donc on ne peut pas utiliser le même facteur *3.0 que le spectre global.
                let rmsSum = 0;
                for (let j = 0; j < buf.length; j++) {
                    rmsSum += buf[j] * buf[j];
                }
                const rms = Math.sqrt(rmsSum / buf.length);
                // Gain adaptatif lissé : évite de saturer et évite les sauts brutaux
                // quand le canal passe par du silence
                const targetGain = rms > 0.001 ? Math.min(4.0, 0.5 / rms) : 1.0;
                if (!this.channelGains) this.channelGains = [1, 1, 1, 1];
                this.channelGains[ch] = this.channelGains[ch] * 0.9 + targetGain * 0.1;

                for (let i = 0; i < this.channelSpectrums[ch].length; i++) {
                    let sum = 0;
                    for (let j = 0; j < chSamplesPerBand; j++) {
                        const idx = i * chSamplesPerBand + j;
                        if (idx < buf.length) {
                            sum += Math.abs(buf[idx]);
                        }
                    }
                    // Gain normalisé + plafond à 1.0 pour ne pas dépasser la hauteur
                    const newVal = Math.min(0.95, (sum / chSamplesPerBand) * this.channelGains[ch]);
                    // Si le niveau a baissé, laisscer redescendre les barres SANS superposition :
                    // on prend la valeur directe (pas de max avec l'ancienne).
                    // Un léger lissage (50% ancien + 50% nouveau) évite les sauts brutaux.
                    this.channelSpectrums[ch][i] = (this.prevChannelSpectrums[ch][i] + newVal) * 0.5;
                    this.prevChannelSpectrums[ch][i] = this.channelSpectrums[ch][i];
                }
            }
        }
    }

    reset() {
        this.vuLevels = [0, 0, 0, 0];
        this.vuPeaks = [0, 0, 0, 0];
        this.vuTargets = [0, 0, 0, 0];
        this.spectrum.fill(0);
        this.prevSpectrum.fill(0);
        for (let ch = 0; ch < 4; ch++) {
            this.channelSpectrums[ch].fill(0);
            this.prevChannelSpectrums[ch].fill(0);
        }
        this.leftBuffer = null;
        this.rightBuffer = null;
        this.channelBuffers = null;
        this.channelGains = [1, 1, 1, 1];
        this.updateVUMeters();
    }

    draw() {
        const ctx = this.visCtx;
        const width = this.visCanvas.width;
        const height = this.visCanvas.height;

        // Background gradient (couleurs du thème)
        const cs = getComputedStyle(document.body);
        const deepBg = cs.getPropertyValue('--canvas-bg-deep').trim() || '#05050f';
        const midBg = cs.getPropertyValue('--canvas-bg').trim() || '#0a0a1e';

        const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
        bgGrad.addColorStop(0, midBg);
        bgGrad.addColorStop(1, deepBg);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        if (this.visMode === 0 || this.visMode === 2) {
            this.drawSpectrum(ctx, width, height);
        }

        if (this.visMode === 1 || this.visMode === 2) {
            this.drawOscilloscope(ctx, width, height);
        }
    }

    drawSpectrum(ctx, width, height) {
        // En mode BOTH, le spectre occupe la moitié supérieure
        const specHeight = this.visMode === 2 ? height / 2 : height;

        // Diviser la hauteur en 4 sections, une par canal
        const numChans = 4;
        const sectionHeight = specHeight / numChans;
        const topPadding = 3;
        const barAreaHeight = Math.max(4, sectionHeight - topPadding * 2 - 11); // 11px pour le label
        const barWidth = width / this.channelSpectrums[0].length;

        // Afficher les 4 spectres empilés, un par canal
        for (let ch = 0; ch < numChans; ch++) {
            const sectionTop = ch * sectionHeight;
            const baseY = sectionTop + topPadding + barAreaHeight;
            const spectrum = this.channelSpectrums[ch];
            const [r, g, b] = this.channelColors[ch];

            // Label du canal
            ctx.font = 'bold 8px monospace';
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillText(`CH${ch + 1}`, 3, sectionTop + 9);

            // Ligne de séparation
            if (ch > 0) {
                ctx.strokeStyle = 'rgba(80, 80, 120, 0.3)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, sectionTop);
                ctx.lineTo(width, sectionTop);
                ctx.stroke();
            }

            for (let i = 0; i < spectrum.length; i++) {
                let barHeight = spectrum[i] * barAreaHeight;
                barHeight = Math.min(barHeight, barAreaHeight);

                const x = i * barWidth;
                // Clamp y pour ne jamais sortir de la section (même en valeurs extrêmes)
                let y = baseY - barHeight;
                if (y < sectionTop + topPadding) {
                    y = sectionTop + topPadding;
                    barHeight = baseY - y;
                }

                // Bar avec dégradé dans la couleur du canal
                const grad = ctx.createLinearGradient(x, baseY, x, y);
                grad.addColorStop(0, `rgba(${r/4},${g/4},${b/4},0.5)`);
                grad.addColorStop(1, `rgb(${r},${g},${b})`);
                ctx.fillStyle = grad;
                ctx.fillRect(x + 1, y, barWidth - 2, barHeight);

                // Point de pic
                ctx.fillStyle = 'rgba(255,255,255,0.8)';
                ctx.fillRect(x + 1, y - 2, barWidth - 2, 1);
            }
        }
    }

    drawOscilloscope(ctx, width, height) {
        const centerY = this.visMode === 2 ? height * 3 / 4 : height / 2;
        const amplitude = this.visMode === 2 ? height / 4 - 10 : height / 2 - 20;

        if (!this.leftBuffer || !this.rightBuffer) return;

        // Left channel (cyan)
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < this.leftBuffer.length; i++) {
            const x = i * width / this.leftBuffer.length;
            const y = centerY - this.leftBuffer[i] * amplitude;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Right channel (magenta)
        ctx.strokeStyle = 'rgba(255, 0, 255, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < this.rightBuffer.length; i++) {
            const x = i * width / this.rightBuffer.length;
            const y = centerY - this.rightBuffer[i] * amplitude;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Center line
        ctx.strokeStyle = 'rgba(50, 50, 50, 0.5)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();
    }
}