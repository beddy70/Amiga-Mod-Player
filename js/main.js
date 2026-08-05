/**
 * Main - Interface utilisateur, gestion des événements et rendu
 */
class ModPlayerApp {
    constructor() {
        // Références DOM
        this.player = new ModPlayer();
        this.visualizer = new Visualizer();
        this.sampleViewer = new SampleViewer();
        this.sampleViewer.setPlayer(this.player);
        this.synthKeyboard = new SynthKeyboard();
        this.synthKeyboard.setPlayer(this.player);

        this.titleDisplay = document.getElementById('title-display');
        this.infoDisplay = document.getElementById('info-display');
        this.positionDisplay = document.getElementById('position-display');
        this.patternCanvas = document.getElementById('pattern-canvas');
        this.patternCtx = this.patternCanvas.getContext('2d');

        this.loadBtn = document.getElementById('load-btn');
        this.playBtn = document.getElementById('play-btn');
        this.pauseBtn = document.getElementById('pause-btn');
        this.stopBtn = document.getElementById('stop-btn');
        this.volumeSlider = document.getElementById('volume-slider');
        this.fileInput = document.getElementById('file-input');
        this.instrumentsList = document.getElementById('instruments-list');
        this.patternsList = document.getElementById('patterns-list');

        // Contrôles vitesse/tempo
        this.speedMinusBtn = document.getElementById('speed-minus');
        this.speedPlusBtn = document.getElementById('speed-plus');
        this.speedDisplay = document.getElementById('speed-display');
        this.tempoMinusBtn = document.getElementById('tempo-minus');
        this.tempoPlusBtn = document.getElementById('tempo-plus');
        this.tempoDisplay = document.getElementById('tempo-display');

        // Sélecteur de thème
        this.themeSelect = document.getElementById('theme-select');
        this.themeKey = 'modplayer_theme';
        this.themeSelect.addEventListener('change', (e) => {
            this.applyTheme(e.target.value);
            this.saveTheme(e.target.value);
        });
        this.loadTheme();

        // État du sample sélectionné
        this.selectedSample = 0;
        this.sampleItems = [];

        // Couleurs des canaux (style Amiga)
        this.CHANNEL_COLORS = [
            '#ff6464', // Canal 1 - Rouge
            '#64ff64', // Canal 2 - Vert
            '#6464ff', // Canal 3 - Bleu
            '#ffff64'  // Canal 4 - Jaune
        ];

        // Constantes de rendu
        this.headerHeight = 26;
        this.fontSize = 12;
        this.fontHeight = 16;
        this.rowHeight = 18;
        this.leftPadding = 8;
        this.topPadding = 10;

        // État
        this.isPlaying = false;
        this.isPaused = false;
        this.visibleRows = 20;

        // Bind des événements
        this.bindEvents();

        // Lancement du rendu
        this.animationLoop();
    }

    bindEvents() {
        this.loadBtn.addEventListener('click', () => this.fileInput.click());
        this.playBtn.addEventListener('click', () => this.play());
        this.pauseBtn.addEventListener('click', () => this.pause());
        this.stopBtn.addEventListener('click', () => this.stop());
        this.volumeSlider.addEventListener('input', (e) => {
            this.player.setVolume(parseInt(e.target.value));
        });

        // Contrôles vitesse
        this.speedMinusBtn.addEventListener('click', () => {
            this.player.setSpeed(this.player.getSpeed() - 1);
            this.updateTempoDisplay();
        });
        this.speedPlusBtn.addEventListener('click', () => {
            this.player.setSpeed(this.player.getSpeed() + 1);
            this.updateTempoDisplay();
        });

        // Contrôles tempo
        this.tempoMinusBtn.addEventListener('click', () => {
            this.player.setTempo(this.player.getTempo() - 1);
            this.updateTempoDisplay();
        });
        this.tempoPlusBtn.addEventListener('click', () => {
            this.player.setTempo(this.player.getTempo() + 1);
            this.updateTempoDisplay();
        });

        this.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.loadMod(file);
            }
        });

        // Drag & drop
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        document.addEventListener('drop', (e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file && file.name.toLowerCase().endsWith('.mod')) {
                this.loadMod(file);
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            switch (e.key.toLowerCase()) {
                case 'o':
                    this.fileInput.click();
                    break;
                case 'p':
                    this.play();
                    break;
                case ' ':
                    e.preventDefault();
                    this.pause();
                    break;
                case 's':
                    this.stop();
                    break;
            }
        });
    }

    async loadMod(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const info = await this.player.load(arrayBuffer);

            this.titleDisplay.textContent = info.title || 'Untitled';
            this.infoDisplay.textContent = `Patterns: ${info.numPatterns} | Length: ${info.songLength} | Channels: ${info.numChannels} | Samples: ${info.samples.length}`;

            this.positionDisplay.textContent = 'Pos: --/-- | Pat: -- | Row: --';

            // Remplir la liste des patterns
            this.populatePatterns();

            // Remplir la liste des instruments
            this.populateInstruments(info.samples);

            // Si un fichier était en cours de lecture, on arrête
            this.stop();

            console.log('MOD chargé:', info);
            console.log('Samples:', info.samples);
        } catch (err) {
            console.error('Erreur lors du chargement:', err);
            this.titleDisplay.textContent = 'Error loading MOD';
            this.infoDisplay.textContent = err.message;
        }
    }

    populatePatterns() {
        this.patternsList.innerHTML = '';

        const order = this.player.getPatternOrder();
        if (!order || order.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'pattern-item empty';
            empty.textContent = 'No patterns';
            this.patternsList.appendChild(empty);
            return;
        }

        // Compter les occurrences de chaque pattern pour détecter les répétitions
        const occurrences = new Map();
        for (const entry of order) {
            occurrences.set(entry.patternNum, (occurrences.get(entry.patternNum) || 0) + 1);
        }

        this.patternItems = [];

        for (const entry of order) {
            const item = document.createElement('div');
            item.className = 'pattern-item';
            item.title = `Position ${entry.position} - Pattern ${entry.patternNum} - Clic pour naviguer`;

            const posEl = document.createElement('span');
            posEl.className = 'pat-pos';
            posEl.textContent = String(entry.position).padStart(2, '0');

            const numEl = document.createElement('span');
            numEl.className = 'pat-num';
            numEl.textContent = `P${String(entry.patternNum).padStart(2, '0')}`;

            item.appendChild(posEl);
            item.appendChild(numEl);

            // Badge "x2", "x3"... si le pattern revient plusieurs fois
            if (occurrences.get(entry.patternNum) > 1) {
                const repeatEl = document.createElement('span');
                repeatEl.className = 'pat-repeat';
                repeatEl.textContent = `x${occurrences.get(entry.patternNum)}`;
                item.appendChild(repeatEl);
            }

            // Clic pour sauter à cette position
            item.addEventListener('click', () => {
                this.player.jumpToPosition(entry.position);
            });

            this.patternsList.appendChild(item);
            this.patternItems.push({ item, position: entry.position });
        }
    }

    updatePatternHighlight() {
        if (!this.patternItems) return;
        const currentPos = this.player.getCurrentPosition();

        for (const pi of this.patternItems) {
            if (pi.position === currentPos) {
                pi.item.classList.add('active');
            } else {
                pi.item.classList.remove('active');
            }
        }
    }

    populateInstruments(samples) {
        this.instrumentsList.innerHTML = '';

        if (!samples || samples.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'instrument-item empty';
            empty.textContent = 'No instruments';
            this.instrumentsList.appendChild(empty);
            return;
        }

        // Trier par numéro d'instrument
        const sortedSamples = [...samples].sort((a, b) => a.num - b.num);
        this.sampleItems = [];

        // Sélectionner automatiquement l'instrument 1 (ou le premier disponible)
        this.selectedSample = 0;
        const defaultSample = sortedSamples.find(s => s.num === 1) || sortedSamples[0];
        if (defaultSample) {
            this.selectedSample = defaultSample.num;
            this.sampleViewer.setSample(this.selectedSample);
        }

        for (const smp of sortedSamples) {
            const item = document.createElement('div');
            item.className = 'instrument-item';
            item.title = `Instrument ${smp.num} - Clic pour voir le sample`;

            const numEl = document.createElement('span');
            numEl.className = 'inst-num';
            numEl.textContent = String(smp.num).padStart(2, '0');

            const nameEl = document.createElement('span');
            nameEl.className = 'inst-name';
            nameEl.textContent = smp.name || '(unnamed)';

            const lenEl = document.createElement('span');
            lenEl.className = 'inst-len';
            lenEl.textContent = this.formatSampleLength(smp.length);

            const volEl = document.createElement('span');
            volEl.className = 'inst-vol';
            volEl.textContent = `${smp.volume}`;

            item.appendChild(numEl);
            item.appendChild(nameEl);
            item.appendChild(lenEl);
            item.appendChild(volEl);

            // Clic pour sélectionner le sample et le charger dans le viewer
            item.addEventListener('click', () => {
                this.selectSample(smp.num);
            });

            // Marquer comme sélectionné si c'est le sample courant
            if (smp.num === this.selectedSample) {
                item.classList.add('selected');
            }

            this.instrumentsList.appendChild(item);
            this.sampleItems.push({ item, num: smp.num });
        }
    }

    selectSample(sampleNum) {
        this.selectedSample = sampleNum;

        // Mettre à jour la surbrillance dans la liste
        for (const si of this.sampleItems) {
            if (si.num === sampleNum) {
                si.item.classList.add('selected');
            } else {
                si.item.classList.remove('selected');
            }
        }

        // Charger dans le visualiseur
        this.sampleViewer.setSample(sampleNum);

        // Arrêter toute prévisualisation en cours
        this.player.stopPreview();
    }

    updateTempoDisplay() {
        this.speedDisplay.textContent = `SPD: ${this.player.getSpeed()}`;
        this.tempoDisplay.textContent = `TMP: ${this.player.getTempo()}`;
    }

    // =========================================================================
    // Gestion des thèmes
    // =========================================================================

    applyTheme(themeName) {
        document.body.setAttribute('data-theme', themeName);
    }

    saveTheme(themeName) {
        // Sauvegarder dans localStorage (fiable pour file://)
        try {
            localStorage.setItem(this.themeKey, themeName);
        } catch (e) {
            // Fallback cookie si localStorage indisponible
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + 365);
            document.cookie = `${this.themeKey}=${themeName}; expires=${expiry.toUTCString()}; path=/`;
        }
    }

    loadTheme() {
        let savedTheme = null;

        // Lire depuis localStorage
        try {
            savedTheme = localStorage.getItem(this.themeKey);
        } catch (e) {
            savedTheme = null;
        }

        // Fallback : lire le cookie si pas de localStorage
        if (!savedTheme) {
            const match = document.cookie.match(new RegExp('(?:^|; )' + this.themeKey + '=([^;]*)'));
            if (match) savedTheme = match[1];
        }

        if (savedTheme) {
            this.applyTheme(savedTheme);
            this.themeSelect.value = savedTheme;
        } else {
            // Thème par défaut : Amiga
            this.applyTheme('amiga');
            this.themeSelect.value = 'amiga';
        }
    }

    formatSampleLength(length) {
        if (length >= 1000) {
            return `${(length / 1000).toFixed(1)}k`;
        }
        return String(length);
    }

    play() {
        if (!this.player.getNumPatterns()) {
            this.infoDisplay.textContent = 'Load a .MOD file first!';
            return;
        }

        if (this.isPaused) {
            this.player.pause(); // Reprendre
            this.isPaused = false;
            this.pauseBtn.textContent = 'PAUSE';
            return;
        }

        if (this.isPlaying) return;

        this.player.onAudioData = (left, right, levels, channelBuffers) => {
            this.visualizer.setAudioData(left, right, levels, channelBuffers);
        };

        this.player.onStateChange = (state) => {
            this.isPlaying = state.playing;
            this.isPaused = state.paused;
        };

        this.player.play();
        this.isPlaying = true;
        this.pauseBtn.textContent = 'PAUSE';
    }

    pause() {
        if (!this.isPlaying) return;
        this.player.pause();
        this.isPaused = this.player.isPaused();
        this.pauseBtn.textContent = this.isPaused ? 'RESUME' : 'PAUSE';
    }

    stop() {
        this.player.stop();
        this.isPlaying = false;
        this.isPaused = false;
        this.pauseBtn.textContent = 'PAUSE';
        this.positionDisplay.textContent = 'Pos: --/-- | Pat: -- | Row: --';
        this.visualizer.reset();

        // Retirer les surlignages des patterns
        if (this.patternItems) {
            for (const pi of this.patternItems) {
                pi.item.classList.remove('active');
            }
        }
    }

    // =========================================================================
    // Rendu du pattern
    // =========================================================================

    drawPattern() {
        const ctx = this.patternCtx;
        const canvas = this.patternCanvas;
        const width = canvas.width;
        const height = canvas.height;

        // Background (couleur du thème)
        const canvasBg = getComputedStyle(document.body).getPropertyValue('--canvas-bg').trim();
        ctx.fillStyle = canvasBg || '#181820';
        ctx.fillRect(0, 0, width, height);

        const player = this.player;
        if (!player.getNumPatterns()) {
            ctx.fillStyle = '#aaaac8';
            ctx.font = '12px monospace';
            ctx.fillText('No module loaded - Load a .MOD file', 20, 30);
            return;
        }

        const numChannels = player.numChannels || 4;
        const currentRow = player.getCurrentRow();
        const currentPattern = player.getCurrentPattern();
        const patternData = player.getPatternData(currentPattern);

        if (!patternData) return;

        // --- Calcul des dimensions ---
        ctx.font = `${this.fontSize}px monospace`;
        const metrics = ctx.measureText('C-1 01 01A');
        const cellWidth = metrics.width + 12;

        // Espace disponible pour les lignes
        const headerY = this.headerHeight;
        const availableHeight = height - headerY - this.topPadding;
        const dynamicRows = Math.max(4, Math.floor(availableHeight / this.rowHeight));
        
        // Adapter le nombre de lignes visibles à la hauteur disponible
        this.visibleRows = Math.min(dynamicRows, 64);

        // Défilement simple : la ligne courante reste sur la dernière ligne visible
        // Les lignes défilent vers le haut et sortent naturellement de la vue
        let startRow = 0;
        if (this.isPlaying) {
            // En lecture : défilement continu, la ligne courante reste en bas de la vue
            startRow = Math.max(0, currentRow - this.visibleRows + 1);
        }
        const endRow = Math.min(64, startRow + this.visibleRows);
        const visibleRows = endRow - startRow;

        // Centre verticalement les lignes dans l'espace disponible
        const usedHeight = visibleRows * this.rowHeight;
        const offsetY = headerY + this.topPadding + (availableHeight - usedHeight) / 2;

        // --- En-tête du pattern ---
        ctx.font = `bold ${this.fontSize}px monospace`;
        ctx.fillStyle = '#ffc864';
        ctx.fillText('ROW', this.leftPadding, headerY - 6);

        // Position X des colonnes par canal
        const columns = [];
        let colX = this.leftPadding + 34;
        for (let i = 0; i < numChannels; i++) {
            columns.push(colX);
            
            // Libellé du canal dans l'en-tête
            ctx.fillStyle = this.CHANNEL_COLORS[i % 4];
            ctx.fillText(`CH${i + 1}`, colX, headerY - 6);
            
            colX += cellWidth;
        }

        // Dessiner la ligne de séparation sous l'en-tête
        ctx.strokeStyle = '#3c3c50';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, headerY + 2);
        ctx.lineTo(width, headerY + 2);
        ctx.stroke();

        // --- Dessiner les lignes ---
        for (let row = startRow; row < endRow; row++) {
            const y = offsetY + (row - startRow) * this.rowHeight;
            const isCurrentRow = (row === currentRow);

            // Fond de la ligne courante
            if (isCurrentRow && this.isPlaying) {
                ctx.fillStyle = 'rgba(60, 60, 100, 0.6)';
                ctx.fillRect(0, y - this.fontHeight + 3, width, this.rowHeight - 2);
            }

            // Numéro de ligne
            ctx.font = 'bold 11px monospace';
            ctx.fillStyle = isCurrentRow ? '#ffc864' : '#8888a0';
            ctx.fillText(String(row).padStart(2, '0'), this.leftPadding, y);

            // Données des canaux
            for (let ch = 0; ch < numChannels; ch++) {
                const note = patternData[row][ch];
                const noteStr = player.formatNote(note);

                // Couleur du canal (plus lumineuse sur la ligne courante)
                const color = this.CHANNEL_COLORS[ch % 4];

                if (isCurrentRow) {
                    ctx.fillStyle = color;
                } else {
                    // Couleur assombrie
                    ctx.fillStyle = this.darken(color, 0.5);
                }

                ctx.font = `${this.fontSize}px monospace`;
                ctx.fillText(noteStr, columns[ch], y);

                // Séparateur entre canaux
                if (ch < numChannels - 1) {
                    ctx.fillStyle = '#32323a';
                    ctx.fillText('|', columns[ch] + cellWidth - 6, y);
                }
            }
        }

        // Piste de scroll vertical
        if (this.isPlaying) {
            const sbTop = headerY + this.topPadding;
            const sbHeight = height - sbTop - this.topPadding;
            const scrollY = sbTop + (currentRow / 64.0) * sbHeight;
            ctx.fillStyle = '#505064';
            ctx.fillRect(width - 8, scrollY, 5, Math.max(12, sbHeight * (this.visibleRows / 64.0)));
        }
    }

    darken(hexColor, factor) {
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        return `rgb(${Math.floor(r * factor)}, ${Math.floor(g * factor)}, ${Math.floor(b * factor)})`;
    }

    // =========================================================================
    // Animation loop
    // =========================================================================

    animationLoop() {
        // Redimensionner le canvas pour correspondre au conteneur
        const container = this.patternCanvas.parentElement;
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight - 32; // moins position-display

        if (this.patternCanvas.width !== containerWidth) {
            this.patternCanvas.width = containerWidth;
        }
        if (this.patternCanvas.height !== containerHeight) {
            this.patternCanvas.height = containerHeight;
        }

        // Redimensionner le canvas de visualisation
        // Utilise la taille réelle du canvas (calculée par flexbox CSS)
        const visCanvas = this.visualizer.visCanvas;
        const visWidth = visCanvas.clientWidth;
        const visHeight = visCanvas.clientHeight;

        if (visCanvas.width !== visWidth) {
            visCanvas.width = visWidth;
        }
        if (visCanvas.height !== visHeight) {
            visCanvas.height = visHeight;
        }

        // Mettre à jour la surbrillance du pattern courant
        if (this.isPlaying) {
            this.updatePatternHighlight();
        }

        // Dessiner le pattern
        this.drawPattern();

        // Dessiner la visualisation
        this.visualizer.draw();

        // Dessiner le clavier de synthé
        this.synthKeyboard.draw();

        // Dessiner le visualiseur de sample
        this.sampleViewer.draw();

        // Mettre à jour l'affichage de la position
        if (this.isPlaying && !this.isPaused) {
            const pos = this.player.getCurrentPosition();
            const len = this.player.getSongLength();
            const pat = this.player.getCurrentPattern();
            const row = this.player.getCurrentRow();
            this.positionDisplay.textContent = `Pos: ${String(pos).padStart(2, '0')}/${String(len).padStart(2, '0')} | Pat: ${String(pat).padStart(2, '0')} | Row: ${String(row).padStart(2, '0')}`;
        }

        // Mettre à jour la vitesse/tempo affichée
        this.updateTempoDisplay();

        requestAnimationFrame(() => this.animationLoop());
    }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ModPlayerApp();
});