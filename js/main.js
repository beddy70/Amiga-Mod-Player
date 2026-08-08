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

        // Alimenter en permanence le visualiseur (VU mètres + spectre) avec les
        // données audio. Défini ici (et non dans play()) pour que le spectre et
        // les VU mètres fonctionnent AUSSI en mode pas-à-pas, où la lecture
        // classique (play) n'est pas active.
        this.player.onAudioData = (left, right, levels, channelBuffers) => {
            this.visualizer.setAudioData(left, right, levels, channelBuffers);
        };

        // Connecter les potentiomètres de balance du visualiseur au player.
        // Chaque slider renvoie sa valeur au player qui l'applique au mixage.
        this.visualizer.onPanChange = (channel, pan) => {
            this.player.setChannelPan(channel, pan);
        };

        // Bouton de réinitialisation des balances des canaux.
        this.resetPanBtn = document.getElementById('reset-pan-btn');
        this.resetPanBtn.addEventListener('click', () => {
            this.visualizer.resetPans();
        });

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

        // Popup d'information de note
        this.notePopup = document.getElementById('note-popup');
        this.notePopupBody = document.getElementById('note-popup-body');
        this.notePopupClose = document.getElementById('note-popup-close');
        this.popupRow = -1;
        this.popupChannel = -1;

        // Mappings pour les noms de notes (anglais → français)
        this.NOTE_NAMES_FR = {
            'C-': 'DO', 'C#': 'DO#', 'D-': 'RÉ', 'D#': 'RÉ#',
            'E-': 'MI', 'F-': 'FA', 'F#': 'FA#', 'G-': 'SOL',
            'G#': 'SOL#', 'A-': 'LA', 'A#': 'LA#', 'B-': 'SI'
        };

        // Noms des effets ProTracker
        this.EFFECT_NAMES = {
            0x0: 'ARPEGGIO',
            0x1: 'PORTA UP',
            0x2: 'PORTA DOWN',
            0x3: 'TONE PORTA',
            0x4: 'VIBRATO',
            0x5: 'TONEPORTA+VOLSLIDE',
            0x6: 'VIBRATO+VOLSLIDE',
            0x7: 'TREMOLO',
            0x9: 'SAMPLE OFFSET',
            0xA: 'VOLUME SLIDE',
            0xB: 'POSITION JUMP',
            0xC: 'SET VOLUME',
            0xD: 'PATTERN BREAK',
            0xE: 'EXTENDED',
            0xF: 'SET SPEED/TEMPO'
        };

        // Noms des sous-effets étendus (0xE0-Ey)
        this.EXTENDED_EFFECT_NAMES = {
            0x0: 'FILTER ON',
            0x1: 'FINE PORTA UP',
            0x2: 'FINE PORTA DOWN',
            0x3: 'GLISSANDO CONTROL',
            0x4: 'VIBRATO WAVEFORM',
            0x5: 'FINETUNE',
            0x6: 'PATTERN LOOP',
            0x7: 'TREMOLO WAVEFORM',
            0x9: 'RETRIGGER',
            0xA: 'FINE VOLUME UP',
            0xB: 'FINE VOLUME DOWN',
            0xC: 'NOTE CUT',
            0xD: 'NOTE DELAY',
            0xE: 'PATTERN DELAY'
        };
        // Géométrie du pattern (pour détection du clic)
        this.patternGeom = null;

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
        this.scrollRow = 0;  // Position de défilement manuelle (hors lecture)

        // Sélection de texte dans le pattern
        // Format : { row, ch } pour le début et la fin (inclusifs)
        this.selectionStart = null;
        this.selectionEnd = null;
        this.isSelecting = false;
        // Indique si le dernier mousedown/mouseup était un glisser de sélection
        // (utilisé pour ignorer le click suivant et ne pas ouvrir le popup)
        this.lastSelectionWasDrag = false;

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

        // Clic sur le pattern pour afficher les infos de la note
        this.patternCanvas.addEventListener('click', (e) => this.handlePatternClick(e));

        // Sélection de texte dans le pattern (clic + glisser + Ctrl/Cmd+C)
        this.patternCanvas.addEventListener('mousedown', (e) => this.handlePatternMouseDown(e));
        document.addEventListener('mousemove', (e) => this.handlePatternMouseMove(e));
        document.addEventListener('mouseup', (e) => this.handlePatternMouseUp(e));

        // Molette pour défiler dans le pattern (hors lecture)
        this.patternCanvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (this.isPlaying) return;
            if (!this.player.getNumPatterns()) return;

            const delta = e.deltaY > 0 ? 3 : -3;
            this.scrollRow = Math.max(0, Math.min(64 - this.visibleRows, this.scrollRow + delta));
        });

        // Fermer le popup de note
        this.notePopupClose.addEventListener('click', () => this.hideNotePopup());

        // Fermer le popup si clic en dehors
        document.addEventListener('click', (e) => {
            if (this.notePopup.classList.contains('visible') &&
                !this.notePopup.contains(e.target) &&
                e.target !== this.patternCanvas) {
                this.hideNotePopup();
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
            // Copie de la sélection du pattern (Cmd/Ctrl + C)
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
                if (this.selectionStart && this.selectionEnd) {
                    e.preventDefault();
                    this.copyPatternSelection();
                }
                return;
            }

            // Effacer la sélection avec Échap
            if (e.key === 'Escape') {
                if (this.selectionStart || this.selectionEnd) {
                    this.selectionStart = null;
                    this.selectionEnd = null;
                }
                return;
            }

            // Navigation pas à pas dans le pattern (flèches haut/bas)
            // Interprète une note à la fois sans lancer la lecture
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (!this.player.getNumPatterns()) return;
                // Avance d'une ligne en suivant EXACTEMENT les règles de
                // lecture d'une chanson (pattern break, position jump,
                // pattern loop, fin de pattern, changement de position...).
                this.player.stepForward();
                const nextRow = this.player.getCurrentRow();
                this.stepNavigation(nextRow);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (!this.player.getNumPatterns()) return;
                const prevRow = this.player.getCurrentRow() - 1;
                if (prevRow >= 0) {
                    this.player.jumpToRow(prevRow);
                    this.stepNavigation(prevRow);
                }
                return;
            }

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

            // Réinitialiser le défilement et fermer le popup
            this.scrollRow = 0;
            this.hideNotePopup();

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
        // L'affichage du pattern courant est géré par animationLoop(),
        // qui continue de montrer le pattern affiché (position 0 par défaut).
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
        // Largeur du contenu de la cellule + marge à droite
        const cellWidth = metrics.width + 10;
        // Espace entre les canaux : zone dédiée au crochet de boucle (┐ │ ┘) 
        // et au compteur d'itérations (×N), sans chevaucher le canal suivant
        const channelGap = 32;

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
        } else {
            // En pause : utiliser la position de défilement manuelle
            startRow = this.scrollRow || 0;
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

            // Indicateur de mute : si le canal est muet, dessiner une icône "M" barrée
            const isMuted = player.isChannelMuted(i);
            const chColor = this.CHANNEL_COLORS[i % 4];

            // Fond du bouton canal (pour montrer la zone cliquable)
            ctx.fillStyle = isMuted ? 'rgba(80, 80, 100, 0.3)' : 'rgba(40, 40, 60, 0.15)';
            ctx.fillRect(colX - 2, headerY - 20, 28, 16);

            // Bordure du bouton canal
            ctx.strokeStyle = isMuted ? '#666688' : '#3c3c50';
            ctx.lineWidth = 1;
            ctx.strokeRect(colX - 2, headerY - 20, 28, 16);

            // Libellé du canal dans l'en-tête
            if (isMuted) {
                // Canal muet : couleur atténuée + "M" barré après le texte
                ctx.fillStyle = this.darken(chColor, 0.4);
                ctx.fillText(`CH${i + 1}`, colX, headerY - 6);

                // Icône "M" (mute) en rouge barré
                ctx.fillStyle = '#ff6464';
                ctx.font = `bold 8px monospace`;
                ctx.fillText('M', colX + 22, headerY - 8);

                // Ligne diagonale barrant le "M" (symbolise le mute)
                ctx.strokeStyle = '#ff6464';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(colX + 20, headerY - 12);
                ctx.lineTo(colX + 28, headerY - 6);
                ctx.stroke();
                ctx.font = `bold ${this.fontSize}px monospace`;
            } else {
                ctx.fillStyle = chColor;
                ctx.fillText(`CH${i + 1}`, colX, headerY - 6);
            }

            // Passer à la colonne suivante en ajoutant l'espace inter-canaux
            colX += cellWidth + channelGap;
        }

        // Sauvegarder la géométrie pour la détection de clic
        this.patternGeom = {
            cellWidth,
            channelGap,
            headerY,
            availableHeight,
            startRow,
            endRow,
            visibleRows,
            offsetY,
            numChannels,
            columns,
            width,
            height
        };

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
                    // Couleur légèrement atténuée mais lisible
                    ctx.fillStyle = this.darken(color, 0.8);
                }

                ctx.font = `${this.fontSize}px monospace`;
                ctx.fillText(noteStr, columns[ch], y);

                // Séparateur entre canaux (dans l'espace inter-canaux)
                if (ch < numChannels - 1) {
                    ctx.fillStyle = '#32323a';
                    ctx.fillText('|', columns[ch] + cellWidth + 2, y);
                }
            }
        }

        // --- Surbrillance de la sélection ---
        // Dessine un fond qui couvre les cellules sélectionnées (de selectionStart à selectionEnd)
        if (this.selectionStart && this.selectionEnd) {
            const selStartRow = Math.min(this.selectionStart.row, this.selectionEnd.row);
            const selEndRow = Math.max(this.selectionStart.row, this.selectionEnd.row);
            const selStartCh = Math.min(this.selectionStart.ch, this.selectionEnd.ch);
            const selEndCh = Math.max(this.selectionStart.ch, this.selectionEnd.ch);

            ctx.fillStyle = 'rgba(100, 160, 255, 0.18)';
            for (let row = selStartRow; row <= selEndRow; row++) {
                // Ligne visible ?
                if (row < startRow || row >= endRow) continue;
                const y = offsetY + (row - startRow) * this.rowHeight;
                const yTop = y - this.fontHeight + 3;

                for (let ch = selStartCh; ch <= selEndCh; ch++) {
                    const colX = columns[ch];
                    ctx.fillRect(colX, yTop, cellWidth, this.rowHeight - 2);
                }
            }
        }

        // --- Encoches des boucles E60 → E6x sur chaque canal ---
        // Dessiner sur la droite de chaque colonne un crochet ligne par ligne :
        //   - Ligne E60 (début) :  ┐
        //   - Lignes entre les deux : │
        //   - Ligne E6x (fin) :    ┘  (avec ×N = nombre d'itérations)
        // Chaque ligne du bloc affiche le caractère correspondant, dans la couleur du canal.
        ctx.font = `bold 11px monospace`;
        for (let ch = 0; ch < numChannels; ch++) {
            const loops = this.findPatternLoops(patternData, ch);
            if (!loops || loops.length === 0) continue;

            const chColor = this.CHANNEL_COLORS[ch % 4];
            // Position du crochet : dans l'espace inter-canaux, après le séparateur
            const xHook = columns[ch] + cellWidth + 4;

            for (const loop of loops) {
                // Pour chaque ligne du bloc (loop.startRow à loop.endRow inclus)
                for (let r = loop.startRow; r <= loop.endRow; r++) {
                    // Ne dessiner que les lignes visibles
                    if (r < startRow || r >= endRow) continue;

                    const y = offsetY + (r - startRow) * this.rowHeight;
                    ctx.fillStyle = chColor;

                    if (r === loop.startRow && loop.startRow === loop.endRow) {
                        // Cas particulier : bloc d'une seule ligne (E60 et E6x sur la même ligne)
                        ctx.fillText('┐┘', xHook, y);
                        // Afficher le compteur d'itérations à droite
                        ctx.font = 'bold 9px monospace';
                        ctx.fillText('×' + loop.iterations, xHook + 14, y + 3);
                        ctx.font = `bold 11px monospace`;
                    } else if (r === loop.startRow) {
                        // Ligne de début : ┐
                        ctx.fillText('┐', xHook, y);
                    } else if (r === loop.endRow) {
                        // Ligne de fin : ┘ + compteur d'itérations
                        ctx.fillText('┘', xHook, y);
                        // Étiquette du nombre d'itérations
                        ctx.font = 'bold 9px monospace';
                        ctx.fillText('×' + loop.iterations, xHook + 14, y + 3);
                        ctx.font = `bold 11px monospace`;
                    } else {
                        // Ligne intermédiaire : │
                        ctx.fillText('│', xHook, y);
                    }
                }
            }
        }

        // Piste de scroll vertical (visible aussi bien en lecture qu'en mode manuel)
        let scrollPosition = this.isPlaying ? currentRow : this.scrollRow;
        const sbTop = headerY + this.topPadding;
        const sbHeight = height - sbTop - this.topPadding;
        const scrollY = sbTop + (scrollPosition / 64.0) * sbHeight;
        
        // Fond de la piste
        ctx.fillStyle = 'rgba(80, 80, 100, 0.2)';
        ctx.fillRect(width - 10, sbTop, 8, sbHeight);
        
        // Poignée de scroll
        ctx.fillStyle = '#505064';
        ctx.fillRect(width - 8, scrollY, 5, Math.max(12, sbHeight * (this.visibleRows / 64.0)));
    }

    /**
     * Analyse un canal du pattern pour trouver les blocs de boucle E60 → E6x.
     * @param {Array} patternData - Les données du pattern (64 lignes × canaux)
     * @param {number} channel - Numéro du canal (0-indexé)
     * @returns {Array} - Liste des blocs { startRow, endRow, iterations }
     */
    findPatternLoops(patternData, channel) {
        const loops = [];
        // Le loopstart du canal. Il est défini par :
        // - E60 (début de boucle explicite)
        // - Le premier E6x sans E60 (début implicite = position du E6x)
        // Le loopstart reste actif jusqu'à ce qu'un nouveau E60 soit rencontré,
        // ce qui correspond au comportement réel de ProTracker.
        let loopStart = -1;

        for (let row = 0; row < 64; row++) {
            const note = patternData[row][channel];
            if (!note || note.effect !== 0xE) continue;

            const x = (note.effectParam >> 4) & 0x0F;
            const y = note.effectParam & 0x0F;

            if (x === 0x6) {
                if (y === 0) {
                    // E60 : début de boucle explicite
                    loopStart = row;
                } else {
                    // E6x : fin de boucle avec x itérations
                    if (loopStart === -1) {
                        // Premier E6x sans E60 : le loopstart est la position courante
                        // du E6x lui-même (début implicite dans ProTracker)
                        loopStart = row;
                        // Pas encore de bloc à afficher (la boucle commence ici)
                        // Le bloc sera créé au prochain E6x du même canal
                    } else if (loopStart < row) {
                        // Créer le bloc du loopstart à la row courante
                        loops.push({
                            startRow: loopStart,
                            endRow: row,
                            iterations: y
                        });
                        // Ne PAS réinitialiser loopStart : le loopstart reste actif
                        // pour les itérations suivantes (comme ProTracker)
                    }
                }
            }
        }

        // Les boucles ouvertes sans E6x de fermeture sont ignorées
        return loops;
    }

    darken(hexColor, factor) {
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        return `rgb(${Math.floor(r * factor)}, ${Math.floor(g * factor)}, ${Math.floor(b * factor)})`;
    }

    // =========================================================================
    // Popup d'information de note
    // =========================================================================

    /**
     * Convertit une période ProTracker en note (format "C-2")
     * @param {number} period - La période ProTracker
     * @returns {string|null} - Nom de la note ou null si invalide
     */
    periodToNoteName(period) {
        if (!period || period <= 0) return null;
        const periods = this.player.PERIOD_TABLE[0];
        let closest = 0;
        let minDiff = 999999;
        for (let i = 0; i < periods.length; i++) {
            const diff = Math.abs(periods[i] - period);
            if (diff < minDiff) {
                minDiff = diff;
                closest = i;
            }
        }
        if (closest >= 0 && closest < 36) {
            const octave = Math.floor(closest / 12) + 1;
            const n = closest % 12;
            return this.player.NOTE_NAMES[n] + octave;
        }
        return null;
    }

    /**
     * Convertit un nom de note en anglais (ex: "C-2") en nom français (ex: "DO 2")
     * @param {string} noteName - Nom de la note en notation anglaise
     * @returns {string} - Nom de la note en français
     */
    noteNameToFrench(noteName) {
        if (!noteName) return '-';
        // Format : "C-2" ou "C#3" → séparer le nom de l'octave
        const match = noteName.match(/^([A-G][#-]?)(\d+)$/);
        if (!match) return noteName;
        const note = match[1];
        const octave = match[2];
        const fr = this.NOTE_NAMES_FR[note] || note;
        return `${fr} ${octave}`;
    }

    /**
     * Retourne le nom complet d'un effet ProTracker
     * @param {number} effect - Code effet (0x0-0xF)
     * @param {number} param - Paramètre de l'effet
     * @returns {string} - Nom de l'effet
     */
    getEffectName(effect, param) {
        if (effect === 0 && param === 0) return 'NONE';
        // Sous-effet étendu : le code est dans le nibble haut du paramètre
        if (effect === 0xE) {
            const subEffect = (param >> 4) & 0x0F;
            return this.EXTENDED_EFFECT_NAMES[subEffect] || 'EXTENDED';
        }
        return this.EFFECT_NAMES[effect] || 'NONE';
    }

    /**
     * Retourne une description détaillée du paramètre d'un effet ProTracker.
     * Explique à quoi correspond le code hexadécimal (x, y ou xx).
     * @param {number} effect - Code effet (0x0-0xF)
     * @param {number} param - Paramètre de l'effet
     * @returns {string} - Description du paramètre
     */
    getEffectDetail(effect, param) {
        const phex = param.toString(16).toUpperCase().padStart(2, '0');
        const x = (param >> 4) & 0x0F;
        const y = param & 0x0F;

        // Si pas d'effet réel
        if (effect === 0 && param === 0) return "Pas d'effet";

        switch (effect) {
            case 0x0: // Arpeggio
                return `Joue la note, puis ${x} et ${y} demi-tons au-dessus`;
            case 0x1: // Porta Up
                return `Vitesse de montée du pitch : ${phex} (périodes/frame)`;
            case 0x2: // Porta Down
                return `Vitesse de descente du pitch : ${phex} (périodes/frame)`;
            case 0x3: // Tone Porta
                return `Vitesse de glissement vers la note suivante : ${phex}`;
            case 0x4: // Vibrato
                return `Vitesse ${phex} (${x}) | Profondeur ${y}`;
            case 0x5: // Tone Porta + Vol Slide
                return `Volume +${x} ou -${y} par frame`;
            case 0x6: // Vibrato + Vol Slide
                return `Volume +${x} ou -${y} par frame`;
            case 0x7: // Tremolo
                return `Vitesse ${x} | Profondeur ${y}`;
            case 0x9: // Sample Offset
                return `Offset de lecture : ${param * 256} échantillons`;
            case 0xA: // Volume Slide
                if (x > 0) return `Montée du volume de +${x} par frame`;
                if (y > 0) return `Descente du volume de -${y} par frame`;
                return 'Pas de changement de volume';
            case 0xB: // Position Jump
                // Afficher le pattern correspondant à la position de destination
                const order = this.player.getPatternOrder();
                const destPattern = order && order[param] ? order[param].patternNum : null;
                if (destPattern !== null) {
                    return `Saute à la position ${String(param).padStart(2, '0')} de la chanson → Pattern ${String(destPattern).padStart(2, '0')}`;
                }
                return `Saute à la position ${param} de la chanson`;
            case 0xC: // Set Volume
                return `Volume fixé à ${param} (0-64)`;
            case 0xD: // Pattern Break
                return `Continue au pattern suivant à la ligne ${param}`;
            case 0xF: // Speed/Tempo
                if (param < 32) return `Vitesse : ${param} ticks par ligne`;
                return `Tempo : ${param} BPM`;
            case 0xE: // Extended
                switch (x) {
                    case 0x1: return `FINE PORTA UP : période -${y}`;
                    case 0x2: return `FINE PORTA DOWN : période +${y}`;
                    case 0x6: 
                        if (y === 0) return 'Définit le début de la boucle (loopstart)';
                        return `Retourne au début de la boucle ${y} fois avant de continuer`;
                    case 0x9: return `RETRIGGER : rejoue la note toutes les ${y} ticks`;
                    case 0xA: return `FINE VOLUME UP : +${y}`;
                    case 0xB: return `FINE VOLUME DOWN : -${y}`;
                    case 0xC: return `NOTE CUT : note coupée après ${y} ticks`;
                    case 0xD: return `NOTE DELAY : note retardée de ${y} ticks`;
                    case 0xE: return `PATTERN DELAY : délai de ${y} lignes`;
                    default: return `Sous-effet ${x} - paramètre ${y}`;
                }
            default:
                return `Paramètre hex : ${phex}`;
        }
    }

    /**
     * Gère le clic sur le canvas du pattern pour afficher les infos de la note
     * @param {MouseEvent} e - L'événement de clic
     */
    handlePatternClick(e) {
        if (!this.player.getNumPatterns()) return;
        if (!this.patternGeom) return;

        // Si le clic venait d'un glisser de sélection, ignorer le popup
        if (this.lastSelectionWasDrag) {
            this.lastSelectionWasDrag = false;
            return;
        }

        const rect = this.patternCanvas.getBoundingClientRect();
        // Convertir les coordonnées CSS en coordonnées internes du canvas
        // (le canvas peut être mis à l'échelle par CSS)
        const scaleX = this.patternCanvas.width / rect.width;
        const scaleY = this.patternCanvas.height / rect.height;
        const mx = (e.clientX - rect.left) * scaleX;
        const my = (e.clientY - rect.top) * scaleY;

        const player = this.player;
        const geom = this.patternGeom;
        const numChannels = geom.numChannels;
        const currentPattern = player.getCurrentPattern();
        const patternData = player.getPatternData(currentPattern);
        if (!patternData) return;

        // --- Vérifier si le clic est dans l'en-tête (boutons canal) ---
        if (my < this.headerHeight) {
            // Chercher quel canal a été cliqué
            for (let ch = 0; ch < numChannels; ch++) {
                const colX = geom.columns[ch];
                if (mx >= colX && mx < colX + geom.cellWidth) {
                    player.toggleChannelMute(ch);
                    this.drawPattern();
                    return;
                }
            }
            return;
        }

        // --- Vérifier si le clic est dans la zone des lignes ---
        if (my < geom.headerY + this.topPadding - 10) return;

        // Le texte de chaque ligne est dessiné avec sa baseline à
        // y = offsetY + row * rowHeight, donc le texte occupe visuellement
        // [y - fontHeight, y]. Pour que le clic prenne la ligne du texte
        // visuellement sous le curseur, on convertit la position du clic
        // en comparant au CENTRE du texte de chaque ligne avec Math.round.
        const rowIdx = Math.round((my - (geom.offsetY - this.fontHeight / 2)) / this.rowHeight);
        if (rowIdx < 0 || rowIdx >= geom.visibleRows) return;

        const row = geom.startRow + rowIdx;

        // --- Vérifier si le clic est dans une colonne de canal ---
        // La zone cliquable est limitée à cellWidth (sans l'espace inter-canaux)
        for (let ch = 0; ch < numChannels; ch++) {
            const colX = geom.columns[ch];
            if (mx >= colX && mx < colX + geom.cellWidth) {
                const note = patternData[row][ch];
                // Placer le curseur de lecture du track sur la note cliquée
                this.player.jumpToRow(row);
                this.showNotePopup(note, ch, row);
                return;
            }
        }
    }

    /**
     * Convertit les coordonnées d'un événement souris en coordonnées internes
     * du canvas (le canvas peut être mis à l'échelle par CSS)
     * @param {MouseEvent} e - L'événement souris
     * @returns {{mx: number, my: number}} - Coordonnées internes du canvas
     */
    canvasMousePos(e) {
        const rect = this.patternCanvas.getBoundingClientRect();
        const scaleX = this.patternCanvas.width / rect.width;
        const scaleY = this.patternCanvas.height / rect.height;
        return {
            mx: (e.clientX - rect.left) * scaleX,
            my: (e.clientY - rect.top) * scaleY
        };
    }

    /**
     * Convertit une position souris en coordonnées pattern (row et canal).
     * @param {number} mx - Position X interne du canvas
     * @param {number} my - Position Y interne du canvas
     * @returns {{row: number, ch: number}|null} - Coordonnées pattern ou null
     */
    canvasToPatternCoords(mx, my) {
        if (!this.patternGeom || !this.player.getNumPatterns()) return null;
        const geom = this.patternGeom;

        // Zone de l'en-tête : pas une note
        if (my < geom.headerY) return null;

        // Zone des lignes
        const rowIdx = Math.round((my - (geom.offsetY - this.fontHeight / 2)) / this.rowHeight);
        if (rowIdx < 0 || rowIdx >= geom.visibleRows) return null;
        const row = geom.startRow + rowIdx;

        // Canal cliqué (limitée à cellWidth, pas l'espace inter-canaux)
        for (let ch = 0; ch < geom.numChannels; ch++) {
            const colX = geom.columns[ch];
            if (mx >= colX && mx < colX + geom.cellWidth) {
                return { row, ch };
            }
        }
        return null;
    }

    /**
     * Début de la sélection de texte dans le pattern (clic gauche maintenu)
     * @param {MouseEvent} e - L'événement mousedown
     */
    handlePatternMouseDown(e) {
        // Seulement avec le bouton gauche
        if (e.button !== 0) return;
        if (!this.player.getNumPatterns()) return;
        if (!this.patternGeom) return;

        const { mx, my } = this.canvasMousePos(e);
        const coords = this.canvasToPatternCoords(mx, my);
        if (!coords) return;

        // Début de sélection
        this.selectionStart = coords;
        this.selectionEnd = coords;
        this.isSelecting = true;
        this.lastSelectionWasDrag = false;

        // Empêcher le navigateur de faire une sélection native
        e.preventDefault();
    }

    /**
     * Étendre la sélection pendant le déplacement de la souris
     * @param {MouseEvent} e - L'événement mousemove
     */
    handlePatternMouseMove(e) {
        if (!this.isSelecting) return;

        const { mx, my } = this.canvasMousePos(e);
        const coords = this.canvasToPatternCoords(mx, my);
        if (coords) {
            this.selectionEnd = coords;

            // Si la sélection couvre plus d'une cellule, c'est un glisser (pas un clic simple)
            if (coords.row !== this.selectionStart.row || coords.ch !== this.selectionStart.ch) {
                this.lastSelectionWasDrag = true;
            }
        }
    }

    /**
     * Fin de la sélection de texte (relâchement du bouton)
     * @param {MouseEvent} e - L'événement mouseup
     */
    handlePatternMouseUp(e) {
        if (e.button !== 0) return;
        if (this.isSelecting) {
            // Si la sélection fait moins d'un caractère (un clic simple),
            // on la réinitialise (pas de sélection persistante sur clic simple)
            if (this.selectionStart && this.selectionEnd &&
                this.selectionStart.row === this.selectionEnd.row &&
                this.selectionStart.ch === this.selectionEnd.ch) {
                this.selectionStart = null;
                this.selectionEnd = null;
            }
        }
        this.isSelecting = false;
    }

    /**
     * Copie la sélection du pattern dans le presse-papier au format texte
     * (format tracker standard : "row | canal1 canal2 canal3 canal4")
     */
    copyPatternSelection() {
        if (!this.selectionStart || !this.selectionEnd) return;
        if (!this.player.getNumPatterns()) return;

        const player = this.player;
        const numChannels = player.numChannels || 4;
        const currentPattern = player.getCurrentPattern();
        const patternData = player.getPatternData(currentPattern);
        if (!patternData) return;

        // Normaliser la sélection (le début doit être en haut à gauche)
        const startRow = Math.min(this.selectionStart.row, this.selectionEnd.row);
        const endRow = Math.max(this.selectionStart.row, this.selectionEnd.row);
        const startCh = Math.min(this.selectionStart.ch, this.selectionEnd.ch);
        const endCh = Math.max(this.selectionStart.ch, this.selectionEnd.ch);

        // Construire le texte copié
        const lines = [];
        for (let row = startRow; row <= endRow; row++) {
            const cells = [];
            for (let ch = startCh; ch <= endCh; ch++) {
                const note = patternData[row][ch];
                cells.push(player.formatNote(note));
            }
            lines.push(`${String(row).padStart(2, '0')} | ${cells.join('  ')}`);
        }
        const text = lines.join('\n');

        // Copier dans le presse-papier
        navigator.clipboard.writeText(text).then(() => {
            console.log('Pattern sélectionné copié dans le presse-papier');
        }).catch((err) => {
            console.error('Échec de la copie:', err);
            // Fallback : sélectionner et copier via execCommand
            try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            } catch (e) {
                console.error('Copie impossible:', e);
            }
        });
    }

    /**
     * Navigation pas à pas : met à jour le popup avec la note de la ligne courante.
     * Utilise le canal du popup déjà ouvert, sinon le premier canal avec une note.
     * Fait aussi défiler la vue pour que la ligne courante reste visible en bas
     * du pattern (même comportement que la lecture).
     * @param {number} row - Nouvelle ligne courante
     */
    stepNavigation(row) {
        if (!this.player.getNumPatterns()) return;

        // Faire défiler la vue pour suivre la ligne courante :
        // la ligne courante reste sur la dernière ligne visible
        // (même logique que le défilement en lecture)
        this.scrollRow = Math.max(0, row - this.visibleRows + 1);

        const patternData = this.player.getPatternData(this.player.getCurrentPattern());
        if (!patternData) return;

        const numChannels = this.player.numChannels || 4;

        // Canal à afficher : celui du popup courant, sinon premier canal avec une note
        let channel = this.popupChannel;
        if (channel < 0 || channel >= numChannels) {
            // Chercher le premier canal avec une note ou un effet sur cette ligne
            channel = 0;
            for (let ch = 0; ch < numChannels; ch++) {
                const n = patternData[row][ch];
                if (n && (n.period > 0 || n.sample > 0 || n.effect !== 0 || n.effectParam !== 0)) {
                    channel = ch;
                    break;
                }
            }
        }

        const note = patternData[row][channel];
        this.showNotePopup(note, channel, row);
    }

    /**
     * Affiche le popup avec les informations de la note cliquée
     * @param {object} note - La note du pattern { period, sample, effect, effectParam }
     * @param {number} channel - Numéro du canal (0-indexé)
     * @param {number} row - Numéro de ligne dans le pattern
     */
    showNotePopup(note, channel, row) {
        if (!note) return;

        const player = this.player;
        const enName = this.periodToNoteName(note.period);
        const frName = this.noteNameToFrench(enName);
        const color = this.CHANNEL_COLORS[channel % 4];

        // Informations sur l'instrument
        let instNum = note.sample || 0;
        let instName = '';
        if (instNum > 0) {
            const sampleInfo = player.getSampleData(instNum);
            if (sampleInfo) {
                instName = sampleInfo.name || '(unnamed)';
            }
        }

        // Informations sur l'effet
        const effectHex = note.effect;
        const effectParamHex = note.effectParam;
        const effectCode = `${effectHex.toString(16).toUpperCase()}${effectParamHex.toString(16).toUpperCase().padStart(2, '0')}`;
        const effectName = this.getEffectName(effectHex, note.effectParam);
        const effectDetail = this.getEffectDetail(effectHex, note.effectParam);

        // Valeur de l'effet :
        // - Effets étendus (0xE) : la valeur est sur 4 bits (nibble bas y)
        //   Ex: E61 → code E61, sous-effet 6 (pattern loop), valeur 1
        // - Autres effets : la valeur est le paramètre complet sur 8 bits
        //   Ex: 0F03 → valeur 3 (speed), 0C50 → valeur 0x50=80 (volume)
        let effectValue;
        let effectValueHex;
        if (effectHex === 0xE) {
            const subEffect = (effectParamHex >> 4) & 0x0F;
            const value = effectParamHex & 0x0F;
            effectValue = value;
            effectValueHex = value.toString(16).toUpperCase();
            // Ajouter l'info du sous-effet dans la description
            // (déjà géré par getEffectDetail)
        } else {
            effectValue = effectParamHex;
            effectValueHex = effectParamHex.toString(16).toUpperCase().padStart(2, '0');
        }

        // Construire le HTML du popup
        this.notePopupBody.innerHTML = `
            <div class="note-popup-row" style="border-left-color:${color};">
                <span class="note-popup-label">NOTE (EN)</span>
                <span class="note-popup-value en">${enName || '---'}</span>
            </div>
            <div class="note-popup-row" style="border-left-color:${color};">
                <span class="note-popup-label">NOTE (FR)</span>
                <span class="note-popup-value fr">${frName || '---'}</span>
            </div>
            <div class="note-popup-row" style="border-left-color:${color};">
                <span class="note-popup-label">PATTERN</span>
                <span class="note-popup-value">${String(player.getCurrentPattern()).padStart(2, '0')}</span>
            </div>
            <div class="note-popup-row" style="border-left-color:${color};">
                <span class="note-popup-label">ROW</span>
                <span class="note-popup-value">${String(row).padStart(2, '0')}</span>
            </div>
            <div class="note-popup-row" style="border-left-color:${color};">
                <span class="note-popup-label">CHANNEL</span>
                <span class="note-popup-value">${channel + 1}</span>
            </div>
            <div class="note-popup-row" style="border-left-color:${color};">
                <span class="note-popup-label">INSTRUMENT</span>
                <span class="note-popup-value">${instNum > 0 ? `${String(instNum).padStart(2, '0')} - ${instName}` : '---'}</span>
            </div>
            <div class="note-popup-row" style="border-left-color:${color};">
                <span class="note-popup-label">EFFECT</span>
                <span class="note-popup-value">${effectName}</span>
            </div>
            <div class="note-popup-row" style="border-left-color:${color};">
                <span class="note-popup-label">EFFECT CODE</span>
                <span class="note-popup-value">${effectCode}</span>
            </div>
            <div class="note-popup-row" style="border-left-color:${color};">
                <span class="note-popup-label">EFFECT VALUE</span>
                <span class="note-popup-value">${effectValueHex} (${effectValue})${effectHex === 0xE ? ' [4 bits]' : ' [8 bits]'}</span>
            </div>
            <div class="note-popup-row" style="border-left-color:${color};">
                <span class="note-popup-label">PARAMETER MEANING</span>
                <span class="note-popup-value note-popup-desc">${effectDetail}</span>
            </div>
        `;

        this.notePopup.classList.add('visible');
        this.popupRow = row;
        this.popupChannel = channel;
    }

    /**
     * Masque le popup d'information de note
     */
    hideNotePopup() {
        this.notePopup.classList.remove('visible');
        this.popupRow = -1;
        this.popupChannel = -1;
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

        // Mettre à jour le spectre (calcul par bandes de fréquences)
        this.visualizer.updateSpectrum();

        // Dessiner la visualisation
        this.visualizer.draw();

        // Dessiner le clavier de synthé
        this.synthKeyboard.draw();

        // Redimensionner les VU meters si nécessaire
        this.visualizer.resizeVUCanvases();

        // Mettre à jour les aiguilles des VU meters à chaque frame :
        // le decay "condensateur" (retour progressif vers le silence)
        // est appliqué ici pour rester fluide même sans nouveau flux audio.
        this.visualizer.updateVUMeters();

        // Dessiner le visualiseur de sample (petit + popup agrandi)
        this.sampleViewer.draw();
        this.sampleViewer.drawPopup();

        // Mettre à jour l'affichage de la position.
        // Affiche toujours le pattern réellement affiché à l'écran,
        // que ce soit en lecture, en pause, en navigation pas à pas,
        // ou même sans lecture (pattern courant par défaut).
        if (this.player.getNumPatterns()) {
            const len = this.player.getSongLength();
            const pat = this.player.getCurrentPattern();
            const row = this.player.getCurrentRow();
            const pos = this.player.getCurrentPosition();

            if (this.isPlaying && !this.isPaused) {
                this.positionDisplay.textContent = `Pos: ${String(pos).padStart(2, '0')}/${String(len).padStart(2, '0')} | Pat: ${String(pat).padStart(2, '0')} | Row: ${String(row).padStart(2, '0')}`;
            } else if (this.isPaused) {
                this.positionDisplay.textContent = `Pos: ${String(pos).padStart(2, '0')}/${String(len).padStart(2, '0')} | Pat: ${String(pat).padStart(2, '0')} | Row: ${String(row).padStart(2, '0')} (PAUSED)`;
            } else {
                // Arrêté ou jamais lu : afficher tout de même le pattern courant
                this.positionDisplay.textContent = `Pos: ${String(pos).padStart(2, '0')}/${String(len).padStart(2, '0')} | Pat: ${String(pat).padStart(2, '0')} | Row: ${String(row).padStart(2, '0')} (STOPPED)`;
            }
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