/**
 * MOD Player - ProTracker 2.3D compatible
 * Implémentation JavaScript basée sur le code source Java de référence
 * Utilise l'API Web Audio pour la lecture
 */
class ModPlayer {
    constructor() {
        this.SAMPLE_RATE = 44100;
        this.BUFFER_SIZE = 512;
        this.AMIGA_CLOCK = 7093789.2; // PAL

        // Table vibrato EXACTE de ProTracker (32 entrées, 0-255, demi-onde sinus)
        this.VIBRATO_TABLE = [
            0x00, 0x18, 0x31, 0x4A, 0x61, 0x78, 0x8D, 0xA1,
            0xB4, 0xC5, 0xD4, 0xE0, 0xEB, 0xF4, 0xFA, 0xFD,
            0xFF, 0xFD, 0xFA, 0xF4, 0xEB, 0xE0, 0xD4, 0xC5,
            0xB4, 0xA1, 0x8D, 0x78, 0x61, 0x4A, 0x31, 0x18
        ];

        // Table des périodes ProTracker avec 37 entrées par finetune
        this.PERIOD_TABLE = [
            // Finetune 0
            [856,808,762,720,678,640,604,570,538,508,480,453,428,404,381,360,339,320,302,285,269,254,240,226,214,202,190,180,170,160,151,143,135,127,120,113,0],
            // Finetune 1
            [850,802,757,715,674,637,601,567,535,505,477,450,425,401,379,357,337,318,300,284,268,253,239,225,213,201,189,179,169,159,150,142,134,126,119,113,0],
            // Finetune 2
            [844,796,752,709,670,632,597,563,532,502,474,447,422,398,376,355,335,316,298,282,266,251,237,224,211,199,188,177,167,158,149,141,133,125,118,112,0],
            // Finetune 3
            [838,791,746,704,665,628,592,559,528,498,470,444,419,395,373,352,332,314,296,280,264,249,235,222,209,198,187,176,166,157,148,140,132,125,118,111,0],
            // Finetune 4
            [832,785,741,699,660,623,588,555,524,494,467,441,416,392,370,350,330,312,294,278,262,247,233,220,208,196,185,175,165,156,147,139,131,124,117,110,0],
            // Finetune 5
            [826,779,736,694,655,619,584,551,520,491,463,437,413,390,368,347,328,309,292,276,260,245,232,219,206,195,184,174,164,155,146,138,130,123,116,109,0],
            // Finetune 6
            [820,774,730,689,651,614,580,547,516,487,460,434,410,387,365,345,325,307,290,274,258,244,230,217,205,193,183,172,163,154,145,137,129,122,115,109,0],
            // Finetune 7
            [814,768,725,684,646,610,575,543,513,484,457,431,407,384,363,342,323,305,288,272,256,242,228,216,204,192,181,171,161,152,144,136,128,121,114,108,0],
            // Finetune -8
            [907,856,808,762,720,678,640,604,570,538,508,480,453,428,404,381,360,339,320,302,285,269,254,240,226,214,202,190,180,170,160,151,143,135,127,120,0],
            // Finetune -7
            [900,850,802,757,715,675,636,601,567,535,505,477,450,425,401,379,357,337,318,300,284,268,253,238,225,212,200,189,179,169,159,150,142,134,126,119,0],
            // Finetune -6
            [894,844,796,752,709,670,632,597,563,532,502,474,447,422,398,376,355,335,316,298,282,266,251,237,223,211,199,188,177,167,158,149,141,133,125,118,0],
            // Finetune -5
            [887,838,791,746,704,665,628,592,559,528,498,470,444,419,395,373,352,332,314,296,280,264,249,235,222,209,198,187,176,166,157,148,140,132,125,118,0],
            // Finetune -4
            [881,832,785,741,699,660,623,588,555,524,494,467,441,416,392,370,350,330,312,294,278,262,247,233,220,208,196,185,175,165,156,147,139,131,123,117,0],
            // Finetune -3
            [875,826,779,736,694,655,619,584,551,520,491,463,437,413,390,368,347,328,309,292,276,260,245,232,219,206,195,184,174,164,155,146,138,130,123,116,0],
            // Finetune -2
            [868,820,774,730,689,651,614,580,547,516,487,460,434,410,387,365,345,325,307,290,274,258,244,230,217,205,193,183,172,163,154,145,137,129,122,115,0],
            // Finetune -1
            [862,814,768,725,684,646,610,575,543,513,484,457,431,407,384,363,342,323,305,288,272,256,242,228,216,203,192,181,171,161,152,144,136,128,121,114,0]
        ];

        // Données du MOD
        this.modData = null;
        this.title = "";
        this.samples = new Array(32).fill(null);
        this.songLength = 0;
        this.restartPosition = 0;
        this.patternOrder = new Array(128).fill(0);
        this.numPatterns = 0;
        this.numChannels = 4;
        this.numSamples = 31;
        this.patternOffset = 1084;
        this.patterns = [];

        // État de lecture
        this.channels = [];
        this.currentPosition = 0;
        this.currentRow = 0;
        this.currentTick = 0;
        this.speed = 6;
        this.tempo = 125;
        this.samplesPerTick = 0;
        this.tickSampleCount = 0;

        // Pattern break/jump
        this.breakRow = -1;
        this.jumpPosition = -1;
        this.posJumpAssert = false;
        this.pBreakFlag = false;
        this.patternDelay = 0;
        this.patternDelayCount = 0;

        // Pattern loop (E6x) - chaque canal a son propre loopstart et compteur
        // (les boucles E6x sont par canal dans ProTracker, pas globales)
        // Taille 8 = nombre max de canaux supportés (4, 6 ou 8 selon le MOD)
        this.patternLoopRow = new Array(8).fill(0);
        this.patternLoopCount = new Array(8).fill(0);
        this.skipRowProcessing = false;

        // Audio
        this.audioContext = null;
        this.audioBufferSource = null;
        this.playing = false;
        this.paused = false;
        this.masterGain = null;
        this.volumeLevel = 0.8;
        this.audioQueue = [];

        // Mode pas-à-pas (step) : la lecture avance normalement mais
        // s'arrête après la ligne courante (pas de nextRow automatique)
        this.stepMode = false;

        // Callbacks
        this.onAudioData = null;
        this.onStateChange = null;

        // Channel levels for VU meters
        this.channelLevels = new Float32Array(4);

        // Channel mute state (true = canal muet)
        this.channelMuted = [false, false, false, false];

        // Note names for display
        this.NOTE_NAMES = ["C-", "C#", "D-", "D#", "E-", "F-", "F#", "G-", "G#", "A-", "A#", "B-"];
    }

    // =========================================================================
    // Chargement du fichier MOD
    // =========================================================================

    async load(arrayBuffer) {
        this.modData = new Uint8Array(arrayBuffer);
        this.detectFormat();
        this.parseHeader();
        this.parsePatterns();
        this.loadSamples();
        this.initChannels();
        return {
            title: this.title,
            numPatterns: this.numPatterns,
            songLength: this.songLength,
            numChannels: this.numChannels,
            samples: this.getSampleList()
        };
    }

    detectFormat() {
        if (this.modData.length >= 1084) {
            const sig = this.readString(1080, 4);
            if (sig === "M.K." || sig === "M!K!" || sig === "FLT4" ||
                sig === "4CHN" || sig === "6CHN" || sig === "8CHN") {
                this.numSamples = 31;
                this.patternOffset = 1084;
                if (sig === "6CHN") this.numChannels = 6;
                else if (sig === "8CHN") this.numChannels = 8;
                return;
            }
        }

        // No M.K. signature - assume 15-sample Soundtracker format
        this.numSamples = 15;
        this.patternOffset = 600;
        this.numChannels = 4;
    }

    parseHeader() {
        let pos = 0;
        this.title = this.readString(pos, 20);
        pos += 20;

        // Parse samples
        for (let i = 1; i <= this.numSamples; i++) {
            this.samples[i] = {
                name: this.readString(pos, 22),
                length: this.readWord(pos + 22) * 2,
                finetune: (this.modData[pos + 24] >> 4) & 0x0F,
                volume: Math.min(64, this.modData[pos + 25] & 0x7F),
                repeatStart: this.readWord(pos + 26) * 2,
                repeatLength: this.readWord(pos + 28) * 2,
                data: null
            };
            pos += 30;
        }

        // Initialize remaining samples
        for (let i = this.numSamples + 1; i <= 31; i++) {
            this.samples[i] = {
                name: "",
                length: 0,
                finetune: 0,
                volume: 0,
                repeatStart: 0,
                repeatLength: 0,
                data: null
            };
        }

        this.songLength = this.modData[pos] & 0xFF;
        pos++;
        this.restartPosition = this.modData[pos] & 0xFF;
        pos++;

        let maxPat = 0;
        for (let i = 0; i < 128; i++) {
            this.patternOrder[i] = this.modData[pos + i] & 0xFF;
            if (this.patternOrder[i] > maxPat) maxPat = this.patternOrder[i];
        }
        this.numPatterns = maxPat + 1;
    }

    parsePatterns() {
        let pos = this.patternOffset;
        this.patterns = new Array(this.numPatterns);

        for (let p = 0; p < this.numPatterns; p++) {
            this.patterns[p] = new Array(64);
            for (let row = 0; row < 64; row++) {
                this.patterns[p][row] = new Array(this.numChannels);
                for (let ch = 0; ch < this.numChannels; ch++) {
                    const b0 = this.modData[pos++] & 0xFF;
                    const b1 = this.modData[pos++] & 0xFF;
                    const b2 = this.modData[pos++] & 0xFF;
                    const b3 = this.modData[pos++] & 0xFF;

                    this.patterns[p][row][ch] = {
                        period: ((b0 & 0x0F) << 8) | b1,
                        sample: (b0 & 0xF0) | ((b2 & 0xF0) >> 4),
                        effect: b2 & 0x0F,
                        effectParam: b3
                    };
                }
            }
        }
    }

    loadSamples() {
        let pos = this.patternOffset + (this.numPatterns * 64 * this.numChannels * 4);

        for (let i = 1; i <= 31; i++) {
            if (this.samples[i].length > 0) {
                this.samples[i].data = new Float32Array(this.samples[i].length);
                const copyLen = Math.min(this.samples[i].length, this.modData.length - pos);
                for (let j = 0; j < copyLen; j++) {
                    // Convertir le sample Amiga 8-bit signé en float -1..1
                    const byte = this.modData[pos + j];
                    // Amiga samples are signed 8-bit (-128..127)
                    let val = byte;
                    if (val >= 128) val -= 256;
                    this.samples[i].data[j] = val / 128.0;
                }
                // Remplir le reste avec des zéros
                for (let j = copyLen; j < this.samples[i].length; j++) {
                    this.samples[i].data[j] = 0;
                }
                pos += this.samples[i].length;
            }
        }
    }

    initChannels() {
        this.channels = new Array(this.numChannels);
        for (let i = 0; i < this.numChannels; i++) {
            this.channels[i] = this.createChannel();
        }
    }

    createChannel() {
        return {
            // Sample
            sampleNum: 0,
            sampleData: null,
            sampleLength: 0,
            repeatStart: 0,
            repeatLength: 0,
            finetune: 0,

            // Position
            position: 0,
            increment: 0,

            // Période
            period: 0,
            wantedPeriod: 0,

            // Volume
            volume: 0,

            // Vibrato
            vibratoPos: 0,
            vibratoCmd: 0,
            waveControl: 0,

            // Tremolo
            tremoloPos: 0,
            tremoloCmd: 0,

            // Portamento
            portaSpeed: 0,

            // Tremolo volume offset
            tremoloVolume: undefined,

            // Glissando/Funk
            glissFunk: 0,

            reset() {
                this.position = 0;
                this.increment = 0;
                this.period = 0;
                this.wantedPeriod = 0;
                this.volume = 0;
                this.sampleNum = 0;
                this.sampleData = null;
                this.vibratoPos = 0;
                this.vibratoCmd = 0;
                this.tremoloPos = 0;
                this.tremoloCmd = 0;
                this.waveControl = 0;
                this.tremoloVolume = undefined;
                this.glissFunk = 0;
            }
        };
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    readString(offset, length) {
        let sb = "";
        for (let i = 0; i < length; i++) {
            const c = this.modData[offset + i];
            if (c === 0) break;
            if (c >= 32 && c < 127) sb += String.fromCharCode(c);
        }
        return sb.trim();
    }

    readWord(offset) {
        return ((this.modData[offset] & 0xFF) << 8) | (this.modData[offset + 1] & 0xFF);
    }

    getSampleList() {
        const list = [];
        for (let i = 1; i <= 31; i++) {
            if (this.samples[i] && this.samples[i].length > 0) {
                list.push({
                    num: i,
                    name: this.samples[i].name,
                    volume: this.samples[i].volume,
                    length: this.samples[i].length,
                    finetune: this.samples[i].finetune
                });
            }
        }
        return list;
    }

    // =========================================================================
    // Audio setup
    // =========================================================================

    initAudio() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = this.volumeLevel;
            this.masterGain.connect(this.audioContext.destination);
        }
    }

    calculateSamplesPerTick() {
        this.samplesPerTick = Math.round(this.SAMPLE_RATE * 2.5 / this.tempo);
    }

    // =========================================================================
    // Lecture
    // =========================================================================

    play() {
        if (this.playing) return;

        this.initAudio();
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        // Sortir du mode pas-à-pas : la lecture continue normalement
        this.stepMode = false;

        this.playing = true;
        this.paused = false;

        // Reset playback state
        this.currentPosition = 0;
        this.currentRow = 0;
        this.currentTick = 0;
        this.speed = 6;
        this.tempo = 125;
        this.calculateSamplesPerTick();
        this.tickSampleCount = 0;
        this.breakRow = -1;
        this.jumpPosition = -1;
        this.posJumpAssert = false;
        this.pBreakFlag = false;
        this.patternDelay = 0;
        this.patternDelayCount = 0;
        this.patternLoopRow.fill(0);
        this.patternLoopCount.fill(0);
        this.skipRowProcessing = false;

        for (const ch of this.channels) {
            ch.reset();
        }

        // Process first row
        this.processRow();

        // Start audio rendering
        this.startAudioRendering();

        if (this.onStateChange) {
            this.onStateChange({ playing: true, paused: false });
        }
    }

    startAudioRendering() {
        // Stopper le processeur précédent si existant
        if (this.scriptProcessor) {
            this.scriptProcessor.disconnect();
            this.scriptProcessor = null;
        }

        // Buffer size = BUFFER_SIZE (512 samples)
        this.scriptProcessor = this.audioContext.createScriptProcessor(this.BUFFER_SIZE, 0, 2);
        this.scriptProcessor.connect(this.masterGain);

        // Variables pour la génération audio
        const leftBuffer = new Float32Array(this.BUFFER_SIZE);
        const rightBuffer = new Float32Array(this.BUFFER_SIZE);

        this.scriptProcessor.onaudioprocess = (event) => {
            const outputL = event.outputBuffer.getChannelData(0);
            const outputR = event.outputBuffer.getChannelData(1);

            // En mode step (pas à pas), on entend le son mais la lecture n'avance pas
            if (this.stepMode && !this.playing) {
                // Laisser la génération audio se faire normalement
            } else if (!this.playing || this.paused) {
                outputL.fill(0);
                outputR.fill(0);
                return;
            }

            const channelBuffers = [];
            for (let ch = 0; ch < this.numChannels; ch++) {
                channelBuffers.push(new Float32Array(this.BUFFER_SIZE));
            }

            // RMS accumulators
            const rmsSum = new Float64Array(Math.min(4, this.numChannels));
            const rmsSamples = new Int32Array(Math.min(4, this.numChannels));

            for (let i = 0; i < this.BUFFER_SIZE; i++) {
                let left = 0, right = 0;

                for (let ch = 0; ch < this.numChannels; ch++) {
                    // Si le canal est muet, on ne le mixe pas (silence total)
                    const muted = ch < 4 && this.channelMuted[ch];
                    const sample = muted ? 0 : this.mixChannel(this.channels[ch]);

                    if (ch < 4) {
                        channelBuffers[ch][i] = sample;
                        rmsSum[ch] += sample * sample;
                        rmsSamples[ch]++;
                    }

                    // Amiga panning: ch 0,3 left, ch 1,2 right
                    if (ch === 0 || ch === 3) {
                        left += sample;
                        right += sample * 0.25;
                    } else {
                        left += sample * 0.25;
                        right += sample;
                    }
                }

                left *= 0.4;
                right *= 0.4;

                leftBuffer[i] = left;
                rightBuffer[i] = right;
                outputL[i] = left;
                outputR[i] = right;

                this.tickSampleCount++;
                if (this.tickSampleCount >= this.samplesPerTick) {
                    this.tickSampleCount = 0;
                    this.advanceTick();
                }
            }

            // Calculate RMS levels for VU meters
            // Amplitude réelle normalisée (0..1) : le RMS du sample direct
            // (pas de conversion en dB qui déforme la réponse)
            for (let ch = 0; ch < Math.min(4, this.numChannels); ch++) {
                if (rmsSamples[ch] > 0) {
                    const rms = Math.sqrt(rmsSum[ch] / rmsSamples[ch]);
                    // Normalisation : 0.5 = niveau plein échelle (~ -6dBFS)
                    // On multiplie par 2 pour que le max RMS (0.5) atteigne 1.0
                    this.channelLevels[ch] = Math.min(1, rms * 2);
                } else {
                    this.channelLevels[ch] = 0;
                }
            }

            // Callback for visualization
            if (this.onAudioData) {
                this.onAudioData(leftBuffer, rightBuffer, this.channelLevels, channelBuffers);
            }
        };
    }

    mixChannel(ch) {
        if (ch.sampleData === null || ch.period === 0) {
            return 0;
        }

        // Appliquer le volume tremolo si présent
        let outputVolume = ch.volume / 64.0;
        if (ch.tremoloVolume !== undefined) {
            outputVolume = ch.tremoloVolume / 64.0;
            ch.tremoloVolume = undefined;
        }

        let pos = Math.floor(ch.position);

        // Loop handling
        const loopEnd = ch.repeatStart + ch.repeatLength;

        if (ch.repeatLength > 2) {
            // Sample with loop
            if (pos >= loopEnd) {
                const delta = ch.position - loopEnd;
                ch.position = ch.repeatStart + (delta % ch.repeatLength);
                pos = Math.floor(ch.position);
            }
        } else {
            // Sample without loop (one-shot)
            if (pos >= ch.sampleLength) {
                ch.sampleData = null;
                return 0;
            }
        }

        // Bounds check
        if (pos < 0 || pos >= ch.sampleLength) {
            return 0;
        }

        // Linear interpolation
        let pos2 = pos + 1;
        if (ch.repeatLength > 2) {
            if (pos2 >= loopEnd) pos2 = ch.repeatStart;
        } else {
            if (pos2 >= ch.sampleLength) pos2 = ch.sampleLength - 1;
        }

        pos = Math.max(0, Math.min(pos, ch.sampleLength - 1));
        pos2 = Math.max(0, Math.min(pos2, ch.sampleLength - 1));

        const frac = ch.position - Math.floor(ch.position);
        const s1 = ch.sampleData[pos];
        const s2 = ch.sampleData[pos2];
        const sample = s1 + (s2 - s1) * frac;

        ch.position += ch.increment;

        // Re-wrap after increment
        if (ch.repeatLength > 2 && ch.position >= loopEnd) {
            const delta = ch.position - loopEnd;
            ch.position = ch.repeatStart + (delta % ch.repeatLength);
        }

        return sample * outputVolume;
    }

    advanceTick() {
        this.currentTick++;

        if (this.currentTick >= this.speed) {
            // Mode pas-à-pas : on reste sur la ligne courante sans avancer.
            // Les effets continuent de tourner mais nextRow() n'est pas appelé.
            if (this.stepMode && !this.playing) {
                this.currentTick = this.speed - 1;
                // Les effets du dernier tick s'appliquent encore
                for (let ch = 0; ch < this.numChannels; ch++) {
                    this.processEffects(ch);
                }
                return;
            }

            this.currentTick = 0;

            // Pattern delay (EEx)
            if (this.patternDelay > 0) {
                this.patternDelayCount++;
                if (this.patternDelayCount > this.patternDelay) {
                    this.patternDelayCount = 0;
                    this.patternDelay = 0;
                    this.nextRow();
                } else {
                    for (let ch = 0; ch < this.numChannels; ch++) {
                        this.processEffects(ch);
                    }
                }
            } else {
                this.nextRow();
            }
        } else {
            // Continuous effects (ticks > 0)
            for (let ch = 0; ch < this.numChannels; ch++) {
                this.processEffects(ch);
            }
        }
    }

    nextRow() {
        // Reset du flag de saut de boucle E6 (la ligne loopstart sera jouée normalement)
        this.skipRowProcessing = false;

        // Handle pattern break / position jump
        if (this.posJumpAssert || this.pBreakFlag) {
            const prevPosition = this.currentPosition;
            if (this.posJumpAssert) {
                this.currentPosition = this.jumpPosition;
                if (this.currentPosition >= this.songLength) {
                    this.currentPosition = 0;
                }
            } else {
                this.currentPosition++;
                if (this.currentPosition >= this.songLength) {
                    this.currentPosition = 0;
                }
            }
            this.currentRow = this.breakRow >= 0 ? this.breakRow : 0;
            this.breakRow = -1;
            this.jumpPosition = -1;
            this.posJumpAssert = false;
            this.pBreakFlag = false;
            if (this.currentPosition !== prevPosition) {
                this.patternLoopRow.fill(0);
                this.patternLoopCount.fill(0);
            }
        } else {
            this.currentRow++;
            if (this.currentRow >= 64) {
                this.currentRow = 0;
                this.currentPosition++;
                if (this.currentPosition >= this.songLength) {
                    this.currentPosition = this.restartPosition;
                }
                this.patternLoopRow.fill(0);
                this.patternLoopCount.fill(0);
            }
        }

        this.processRow();
    }

    processRow() {
        // Si un saut de boucle (E6y) a été demandé, ne pas traiter les autres canaux
        if (this.skipRowProcessing) {
            this.skipRowProcessing = false;
            return;
        }

        const pattern = this.patterns[this.patternOrder[this.currentPosition]];

        for (let ch = 0; ch < this.numChannels; ch++) {
            // Restore increment based on base period before processing note
            if (this.channels[ch].period > 0) {
                this.updatePeriod(this.channels[ch]);
            }

            const note = pattern[this.currentRow][ch];
            this.processNote(ch, note);

            // Si l'effet E6y a déclenché un saut de boucle, arrêter le traitement
            if (this.skipRowProcessing) break;
        }
    }

    processNote(chNum, note) {
        const ch = this.channels[chNum];
        const effect = note.effect;
        const param = note.effectParam;
        const x = (param >> 4) & 0x0F;
        const y = param & 0x0F;

        // Si un E6y (Pattern Loop) doit déclencher un saut immédiat,
        // ne pas jouer la note de cette ligne (on saute directement au loopstart)
        if (effect === 0xE && x === 0x6 && y > 0 && this.patternLoopCount[chNum] < y) {
            this.processEffectTick0(chNum, note);
            return;
        }

        // If effect ED (Note Delay), don't trigger note at tick 0
        const hasNoteDelay = (effect === 0xE && x === 0xD);

        // Load sample if specified (unless note delay)
        if (!hasNoteDelay && note.sample > 0 && note.sample <= 31) {
            const smp = this.samples[note.sample];
            if (smp) {
                ch.sampleNum = note.sample;
                ch.sampleLength = smp.length;
                ch.repeatStart = smp.repeatStart;
                ch.repeatLength = smp.repeatLength;
                ch.volume = smp.volume;
                ch.finetune = smp.finetune;
                ch.sampleData = smp.data;
            }
        }

        // Handle period/note (unless note delay)
        if (!hasNoteDelay && note.period > 0) {
            // Waveform retrigger if bit 2 not set
            if ((ch.waveControl & 0x04) === 0) ch.vibratoPos = 0;
            if ((ch.waveControl & 0x40) === 0) ch.tremoloPos = 0;

            // For tone portamento, store as target
            if (effect === 3 || effect === 5) {
                ch.wantedPeriod = note.period;
            } else {
                ch.period = note.period;
                ch.wantedPeriod = note.period;

                // Sample offset
                if (effect === 9) {
                    let offset = param * 256;
                    if (offset >= ch.sampleLength) {
                        if (ch.repeatLength > 2) {
                            offset = ch.repeatStart;
                        } else {
                            offset = 0;
                        }
                    }
                    ch.position = offset;
                } else {
                    ch.position = 0;
                }

                this.updatePeriod(ch);
            }
        }

        // Process effect at tick 0
        this.processEffectTick0(chNum, note);
    }

    processEffectTick0(chNum, note) {
        const ch = this.channels[chNum];
        const effect = note.effect;
        const param = note.effectParam;
        const x = (param >> 4) & 0x0F;
        const y = param & 0x0F;

        switch (effect) {
            case 0x0: // Arpeggio
                break;

            case 0x3: // Tone portamento
                if (param !== 0) ch.portaSpeed = param;
                break;

            case 0x4: // Vibrato
                if (x !== 0) ch.vibratoCmd = (ch.vibratoCmd & 0x0F) | (x << 4);
                if (y !== 0) ch.vibratoCmd = (ch.vibratoCmd & 0xF0) | y;
                break;

            case 0x5: // Tone porta + volume slide
                break;

            case 0x6: // Vibrato + volume slide
                break;

            case 0x7: // Tremolo
                if (x !== 0) ch.tremoloCmd = (ch.tremoloCmd & 0x0F) | (x << 4);
                if (y !== 0) ch.tremoloCmd = (ch.tremoloCmd & 0xF0) | y;
                break;

            case 0x9: // Sample offset
                break;

            case 0xA: // Volume slide
                break;

            case 0xB: // Position jump
                this.jumpPosition = param;
                this.pBreakFlag = true;
                this.posJumpAssert = true;
                break;

            case 0xC: // Set volume
                ch.volume = Math.min(64, param);
                break;

            case 0xD: // Pattern break (BCD!)
                this.breakRow = x * 10 + y;
                if (this.breakRow > 63) this.breakRow = 0;
                if (!this.posJumpAssert) this.pBreakFlag = true;
                break;

            case 0xE: // Extended
                this.processExtendedTick0(ch, chNum, x, y);
                break;

            case 0xF: // Set speed/tempo
                if (param === 0) {
                    // Stop
                } else if (param < 32) {
                    this.speed = param;
                } else {
                    this.tempo = param;
                    this.calculateSamplesPerTick();
                }
                break;
        }
    }

    processExtendedTick0(ch, chNum, x, y) {
        switch (x) {
            case 0x1: // Fine portamento up
                ch.period -= y;
                if (ch.period < 113) ch.period = 113;
                this.updatePeriod(ch);
                break;

            case 0x2: // Fine portamento down
                ch.period += y;
                if (ch.period > 856) ch.period = 856;
                this.updatePeriod(ch);
                break;

            case 0x3: // Glissando control
                ch.glissFunk = (ch.glissFunk & 0xF0) | y;
                break;

            case 0x4: // Set vibrato waveform
                ch.waveControl = (ch.waveControl & 0xF0) | y;
                break;

            case 0x5: // Set finetune
                ch.finetune = y;
                break;

            case 0x6: // Pattern loop (E60 = loopstart, E6y = boucle y fois)
                if (y === 0) {
                    // E60 : définir le point de départ de la boucle (par canal)
                    this.patternLoopRow[chNum] = this.currentRow;
                } else {
                    // E6y : "Jump to loop y times before playing on"
                    // Comportement ProTracker :
                    //   - E60 sur la ligne n définit le loopstart du canal
                    //   - E6N sur la ligne n+1 : sauter IMMÉDIATEMENT à n (sans jouer n+1),
                    //     N fois au total, puis continuer normalement n+1, n+2, ...
                    // Exemple : E61 → un seul saut → on revient à n, on rejoue n,
                    // puis on continue n+1, n+2, ...
                    // IMPORTANT : le loopstart est PAR CANAL (ProTracker).
                    // Chaque canal a son propre E60 → son propre point de retour.
                    // Les boucles (ex: E60 CH1 et E60 CH3) ne se mélangent jamais.
                    if (this.patternLoopCount[chNum] < y) {
                        // Encore des sauts à effectuer : incrémenter le compteur
                        this.patternLoopCount[chNum]++;

                        // Saut immédiat au loopstart :
                        // - Ne pas jouer la ligne courante (skipRowProcessing)
                        // - currentRow = loopstart - 1, le prochain row++ donnera loopstart
                        // - currentTick = speed pour déclencher immédiatement nextRow()
                        this.skipRowProcessing = true;
                        this.currentRow = this.patternLoopRow[chNum] - 1;
                        this.currentTick = this.speed;
                    } else {
                        // Tous les sauts sont effectués : remettre le compteur à zéro
                        this.patternLoopCount[chNum] = 0;
                    }
                }
                break;

            case 0x7: // Set tremolo waveform
                ch.waveControl = (ch.waveControl & 0x0F) | (y << 4);
                break;

            case 0xA: // Fine volume slide up
                ch.volume += y;
                if (ch.volume > 64) ch.volume = 64;
                break;

            case 0xB: // Fine volume slide down
                ch.volume -= y;
                if (ch.volume < 0) ch.volume = 0;
                break;

            case 0xE: // Pattern delay
                this.patternDelay = y;
                break;
        }
    }

    processEffects(chNum) {
        const ch = this.channels[chNum];
        const pattern = this.patterns[this.patternOrder[this.currentPosition]];
        const note = pattern[this.currentRow][chNum];
        const effect = note.effect;
        const param = note.effectParam;
        const x = (param >> 4) & 0x0F;
        const y = param & 0x0F;

        switch (effect) {
            case 0x0: // Arpeggio
                if (param !== 0) {
                    this.doArpeggio(ch, param);
                }
                break;

            case 0x1: // Portamento up
                ch.period -= param;
                if (ch.period < 113) ch.period = 113;
                this.updatePeriod(ch);
                break;

            case 0x2: // Portamento down
                ch.period += param;
                if (ch.period > 856) ch.period = 856;
                this.updatePeriod(ch);
                break;

            case 0x3: // Tone portamento
                this.doTonePortamento(ch);
                break;

            case 0x4: // Vibrato
                this.doVibrato(ch);
                break;

            case 0x5: // Tone porta + volume slide
                this.doTonePortamento(ch);
                this.doVolumeSlide(ch, param);
                break;

            case 0x6: // Vibrato + volume slide
                this.doVibrato(ch);
                this.doVolumeSlide(ch, param);
                break;

            case 0x7: // Tremolo
                this.doTremolo(ch);
                break;

            case 0xA: // Volume slide
                this.doVolumeSlide(ch, param);
                break;

            case 0xE: // Extended
                if (x === 0x9 && y > 0) { // Retrigger
                    if (this.currentTick % y === 0) {
                        ch.position = 0;
                    }
                } else if (x === 0xC) { // Note cut
                    if (this.currentTick === y) {
                        ch.volume = 0;
                    }
                } else if (x === 0xD) { // Note delay
                    if (this.currentTick === y) {
                        if (note.sample > 0 && note.sample <= 31) {
                            const smp = this.samples[note.sample];
                            if (smp) {
                                ch.sampleNum = note.sample;
                                ch.sampleLength = smp.length;
                                ch.repeatStart = smp.repeatStart;
                                ch.repeatLength = smp.repeatLength;
                                ch.volume = smp.volume;
                                ch.finetune = smp.finetune;
                                ch.sampleData = smp.data;
                            }
                        }
                        if (note.period > 0) {
                            ch.period = note.period;
                            ch.position = 0;
                            this.updatePeriod(ch);
                        }
                    }
                }
                break;
        }
    }

    // =========================================================================
    // Effets
    // =========================================================================

    doArpeggio(ch, param) {
        const arpTick = this.currentTick % 3;
        let arpNote;

        if (arpTick === 1) {
            arpNote = (param >> 4) & 0x0F;
        } else if (arpTick === 2) {
            arpNote = param & 0x0F;
        } else {
            this.updatePeriod(ch);
            return;
        }

        const ft = ch.finetune;
        const periods = this.PERIOD_TABLE[ft];

        for (let baseNote = 0; baseNote < 37; baseNote++) {
            if (ch.period >= periods[baseNote]) {
                const newNote = baseNote + arpNote;
                if (newNote < 37) {
                    const newPeriod = periods[newNote];
                    ch.increment = this.AMIGA_CLOCK / (newPeriod * 2.0) / this.SAMPLE_RATE;
                }
                break;
            }
        }
    }

    doVibrato(ch) {
        const vibratoType = ch.waveControl & 3;
        const pos = ch.vibratoPos & 0x3F;
        const tablePos = pos & 0x1F;

        let vibratoData;
        if (vibratoType === 0) {
            vibratoData = this.VIBRATO_TABLE[tablePos];
        } else if (vibratoType === 1) {
            vibratoData = 255 - (pos << 2);
            if (vibratoData < 0) vibratoData = 0;
        } else if (vibratoType === 2) {
            vibratoData = 255;
        } else {
            vibratoData = this.VIBRATO_TABLE[tablePos];
        }

        const depth = ch.vibratoCmd & 0x0F;
        const delta = (vibratoData * depth) >> 7;

        let newPeriod = (pos < 32) ? ch.period + delta : ch.period - delta;

        if (newPeriod < 113) newPeriod = 113;
        if (newPeriod > 856) newPeriod = 856;

        ch.increment = this.AMIGA_CLOCK / (newPeriod * 2.0) / this.SAMPLE_RATE;

        const speed = (ch.vibratoCmd >> 4) & 0x0F;
        ch.vibratoPos = (ch.vibratoPos + speed) & 0x3F;
    }

    doTremolo(ch) {
        const tremoloPos = (ch.tremoloPos >> 2) & 0x1F;
        const tremoloType = (ch.waveControl >> 4) & 3;

        let tremoloData;
        if (tremoloType === 0) {
            tremoloData = this.VIBRATO_TABLE[tremoloPos];
        } else if (tremoloType === 1) {
            if (ch.tremoloPos < 128) {
                tremoloData = tremoloPos << 3;
            } else {
                tremoloData = 255 - (tremoloPos << 3);
            }
        } else {
            tremoloData = 255;
        }

        tremoloData = (tremoloData * (ch.tremoloCmd & 0x0F)) >> 6;

        let newVol = (ch.tremoloPos < 128) ?
            ch.volume + tremoloData : ch.volume - tremoloData;

        if (newVol < 0) newVol = 0;
        if (newVol > 64) newVol = 64;

        // Tremolo only affects output, not ch.volume
        // Store tremolo volume offset for mixChannel
        ch.tremoloVolume = newVol;
        ch.tremoloPos = (ch.tremoloPos + ((ch.tremoloCmd >> 4) << 2)) & 0xFF;
    }

    doTonePortamento(ch) {
        if (ch.period < ch.wantedPeriod) {
            ch.period += ch.portaSpeed;
            if (ch.period > ch.wantedPeriod) {
                ch.period = ch.wantedPeriod;
            }
        } else if (ch.period > ch.wantedPeriod) {
            ch.period -= ch.portaSpeed;
            if (ch.period < ch.wantedPeriod) {
                ch.period = ch.wantedPeriod;
            }
        }
        this.updatePeriod(ch);
    }

    doVolumeSlide(ch, param) {
        const x = (param >> 4) & 0x0F;
        const y = param & 0x0F;

        if (x > 0) {
            ch.volume += x;
            if (ch.volume > 64) ch.volume = 64;
        } else if (y > 0) {
            ch.volume -= y;
            if (ch.volume < 0) ch.volume = 0;
        }
    }

    updatePeriod(ch) {
        if (ch.period > 0) {
            let period = ch.period;

            // Apply finetune
            if (ch.finetune !== 0) {
                const ft = ch.finetune;
                const ftPeriods = this.PERIOD_TABLE[ft];

                for (let i = 0; i < 36; i++) {
                    if (ch.period >= this.PERIOD_TABLE[0][i]) {
                        period = ftPeriods[i];
                        break;
                    }
                }
            }

            ch.increment = this.AMIGA_CLOCK / (period * 2.0) / this.SAMPLE_RATE;
        }
    }

    // =========================================================================
    // Contrôles
    // =========================================================================

    /**
     * Joue un sample individuel en prévisualisation
     * Utilise un AudioBufferSourceNode Web Audio directement
     */
    previewSample(sampleNum, loop = false) {
        if (!this.audioContext) this.initAudio();
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        const smp = this.samples[sampleNum];
        if (!smp || !smp.data || smp.length === 0) return;

        // Charger le sample dans un AudioBuffer mono
        const buffer = this.audioContext.createBuffer(1, smp.length, this.audioContext.sampleRate);
        buffer.copyToChannel(smp.data, 0);

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;

        // Nœud de gain pour le volume
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = (smp.volume / 64) * this.volumeLevel;
        gainNode.connect(this.masterGain);

        // Pitch natif ProTracker ~ C-3 (période 214)
        const nativeRate = this.AMIGA_CLOCK / (214 * 2.0);
        source.playbackRate.value = nativeRate / this.audioContext.sampleRate;

        // Boucle si le mode loop est activé
        if (loop) {
            source.loop = true;
            if (smp.repeatLength > 2) {
                // Boucle native définie dans le sample
                source.loopStart = smp.repeatStart / this.audioContext.sampleRate;
                source.loopEnd = (smp.repeatStart + smp.repeatLength) / this.audioContext.sampleRate;
            } else {
                // Pas de boucle native : boucler sur tout le sample
                source.loopStart = 0;
                source.loopEnd = smp.length / this.audioContext.sampleRate;
            }
        }

        source.connect(gainNode);

        // Référence pour pouvoir arrêter si nécessaire
        this.lastPreviewSource = {
            source,
            gainNode,
            sampleNum,
            loop,
            startTime: this.audioContext.currentTime,
            sampleLength: smp.length,
            repeatStart: smp.repeatStart,
            repeatLength: smp.repeatLength
        };

        if (loop) {
            // Lecture en boucle sans limite de temps
            source.start();
        } else {
            // Lecture unique avec arrêt après la durée du sample ou 4s max
            const duration = Math.min(smp.length / this.audioContext.sampleRate, 4.0);
            source.start();
            source.stop(this.audioContext.currentTime + duration);
        }
    }

    /**
     * Retourne la position de lecture actuelle du sample en cours de prévisualisation
     * @returns {number|null} - Position en samples, ou null si pas de prévisualisation
     */
    getPreviewPosition() {
        if (!this.lastPreviewSource || !this.audioContext) return null;
        const ps = this.lastPreviewSource;

        // Temps écoulé depuis le début de la lecture
        const elapsed = (this.audioContext.currentTime - ps.startTime) * this.SAMPLE_RATE;

        // Position dans le buffer (compte tenu du playbackRate)
        let pos = elapsed * ps.source.playbackRate.value;

        // Gérer la boucle AVANT de vérifier la fin
        if (ps.loop) {
            if (ps.repeatLength > 2) {
                const loopStart = ps.repeatStart;
                const loopEnd = ps.repeatStart + ps.repeatLength;
                if (pos >= loopEnd) {
                    pos = loopStart + ((pos - loopStart) % ps.repeatLength);
                }
            } else {
                // Boucle sur tout le sample
                pos = pos % ps.sampleLength;
            }
            return pos;
        }

        if (pos >= ps.sampleLength) return null;

        return pos;
    }

    stopPreview() {
        if (this.lastPreviewSource) {
            try {
                this.lastPreviewSource.source.stop();
            } catch (e) {}
            // Disconnect les nœuds
            try {
                this.lastPreviewSource.source.disconnect();
                this.lastPreviewSource.gainNode.disconnect();
            } catch (e) {}
            this.lastPreviewSource = null;
        }
    }

    /**
     * Retourne les données brutes d'un sample pour le visualiseur
     * @param {number} sampleNum - Numéro du sample (1-31)
     * @returns {object|null} - Données du sample ou null
     */
    getSampleData(sampleNum) {
        const smp = this.samples[sampleNum];
        if (!smp || !smp.data || smp.length === 0) return null;
        return {
            num: sampleNum,
            name: smp.name,
            data: smp.data,
            length: smp.length,
            volume: smp.volume,
            finetune: smp.finetune,
            repeatStart: smp.repeatStart,
            repeatLength: smp.repeatLength
        };
    }

    /**
     * Sauter à une position donnée du morceau (dans la liste d'ordre)
     */
    jumpToPosition(position) {
        if (position < 0 || position >= this.songLength) return;
        this.currentPosition = position;
        this.currentRow = 0;
        this.currentTick = 0;
        this.tickSampleCount = 0;
        this.breakRow = -1;
        this.jumpPosition = -1;
        this.posJumpAssert = false;
        this.pBreakFlag = false;
        this.patternDelay = 0;
        this.patternDelayCount = 0;
        this.patternLoopRow.fill(0);
        this.patternLoopCount.fill(0);
        this.skipRowProcessing = false;
        this.processRow();
    }

    /**
     * Sauter à une ligne précise du pattern courant
     * @param {number} row - Numéro de ligne (0-63)
     */
    jumpToRow(row) {
        if (row < 0 || row >= 64) return;
        this.currentRow = row;
        this.currentTick = 0;
        this.tickSampleCount = 0;
        this.breakRow = -1;
        this.jumpPosition = -1;
        this.posJumpAssert = false;
        this.pBreakFlag = false;
        this.patternDelay = 0;
        this.patternDelayCount = 0;
        this.patternLoopRow.fill(0);
        this.patternLoopCount.fill(0);
        this.skipRowProcessing = false;

        // Activer le mode pas-à-pas : on entend le son mais la
        // lecture n'avance pas automatiquement après la ligne.
        // (désactivé par play() ou stop())
        this.stepMode = true;

        // Si le moteur audio n'est pas encore actif, l'initialiser
        // pour que le pas-à-pas produise du son même sans play().
        if (!this.scriptProcessor) {
            this.initAudio();
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            this.startAudioRendering();
        }

        this.processRow();
    }

    /**
     * Retourner la liste d'ordre (positions -> numéro de pattern)
     */
    getPatternOrder() {
        const order = [];
        for (let i = 0; i < this.songLength; i++) {
            order.push({
                position: i,
                patternNum: this.patternOrder[i]
            });
        }
        return order;
    }

    pause() {
        if (!this.playing) return;
        this.paused = !this.paused;
        if (this.onStateChange) {
            this.onStateChange({ playing: this.playing, paused: this.paused });
        }
    }

    stop() {
        this.playing = false;
        this.paused = false;
        this.audioQueue = [];

        // Sortir du mode pas-à-pas
        this.stepMode = false;

        // Déconnecter le processeur audio
        if (this.scriptProcessor) {
            this.scriptProcessor.disconnect();
            this.scriptProcessor = null;
        }

        if (this.onStateChange) {
            this.onStateChange({ playing: false, paused: false });
        }
    }

    setVolume(volume) {
        this.volumeLevel = volume / 100;
        if (this.masterGain) {
            this.masterGain.gain.value = this.volumeLevel;
        }
    }

    setSpeed(speed) {
        if (speed < 1) speed = 1;
        if (speed > 31) speed = 31;
        this.speed = speed;
    }

    setTempo(tempo) {
        if (tempo < 32) tempo = 32;
        if (tempo > 255) tempo = 255;
        this.tempo = tempo;
        this.calculateSamplesPerTick();
    }

    /**
     * Active/désactive le mute d'un canal
     * @param {number} channel - Index du canal (0-3)
     */
    toggleChannelMute(channel) {
        if (channel < 0 || channel >= 4) return;
        this.channelMuted[channel] = !this.channelMuted[channel];
        return this.channelMuted[channel];
    }

    /**
     * Définit l'état muet d'un canal
     * @param {number} channel - Index du canal (0-3)
     * @param {boolean} muted - true = muet, false = audible
     */
    setChannelMuted(channel, muted) {
        if (channel < 0 || channel >= 4) return;
        this.channelMuted[channel] = muted;
    }

    /**
     * Retourne si un canal est muet
     * @param {number} channel - Index du canal (0-3)
     * @returns {boolean}
     */
    isChannelMuted(channel) {
        if (channel < 0 || channel >= 4) return false;
        return this.channelMuted[channel];
    }

    getSpeed() {
        return this.speed;
    }

    getTempo() {
        return this.tempo;
    }

    isPlaying() {
        return this.playing;
    }

    isPaused() {
        return this.paused;
    }

    getCurrentPosition() {
        return this.currentPosition;
    }

    getCurrentRow() {
        return this.currentRow;
    }

    getCurrentPattern() {
        if (this.patternOrder && this.currentPosition < this.songLength) {
            return this.patternOrder[this.currentPosition];
        }
        return 0;
    }

    getSongLength() {
        return this.songLength;
    }

    getTitle() {
        return this.title;
    }

    getNumPatterns() {
        return this.numPatterns;
    }

    // Retourner les données d'un pattern pour l'affichage
    getPatternData(patternNum) {
        if (!this.patterns || patternNum < 0 || patternNum >= this.patterns.length) {
            return null;
        }
        return this.patterns[patternNum];
    }

    // Retourner les périodes actuelles de chaque canal (pour le clavier)
    getChannelPeriods() {
        const periods = [];
        if (!this.channels) return periods;
        for (let ch = 0; ch < this.numChannels; ch++) {
            if (this.channels[ch]) {
                periods.push(this.channels[ch].period);
            } else {
                periods.push(0);
            }
        }
        return periods;
    }

    // =========================================================================
    // Utilities pour l'affichage
    // =========================================================================

    periodToNote(period) {
        const periods = this.PERIOD_TABLE[0];
        let closest = 0;
        let minDiff = 999999;
        for (let i = 0; i < periods.length; i++) {
            const diff = Math.abs(periods[i] - period);
            if (diff < minDiff) {
                minDiff = diff;
                closest = i;
            }
        }
        return closest;
    }

    formatNote(note) {
        if (!note) return "... .. ...";

        const period = note.period;
        const sample = note.sample;
        const effect = note.effect;
        const param = note.effectParam;

        let noteStr = "...";
        if (period > 0) {
            const noteNum = this.periodToNote(period);
            if (noteNum >= 0 && noteNum < 36) {
                const octave = Math.floor(noteNum / 12) + 1;
                const n = noteNum % 12;
                noteStr = this.NOTE_NAMES[n] + octave;
            }
        }

        let sampleStr = sample > 0 ? String(sample).padStart(2, '0') : "..";
        const effectStr = effect.toString(16).toUpperCase() + param.toString(16).toUpperCase().padStart(2, '0');

        return noteStr + " " + sampleStr + " " + effectStr;
    }
}