# Structure d'un fichier Module Amiga (Format MOD)

## Introduction

Le format **MOD** est le format de module musical original créé pour l'**Amiga** par Karsten Obarski en 1987 avec son logiciel **Soundtracker**. Ce format a ensuite été popularisé par **ProTracker 2.3D** (1990), qui est aujourd'hui la référence de compatibilité pour la plupart des joueurs de modules.

Un fichier MOD contient :
- Des **samples** (échantillons audio 8 bits)
- Des **patterns** (grilles de notes)
- Une **liste de lecture** (ordre des patterns)
- Des **paramètres de lecture** (vitesse, tempo, position de redémarrage)

---

## 1. Vue d'ensemble de l'architecture

```
┌──────────────────────────────────────────────┐
│         EN-TÊTE (Header)                     │
│  Titre (20 octets)                           │
│  31 × En-têtes de samples (30 octets each)   │
│  Longueur de la chanson (1 octet)            │
│  Position de redémarrage (1 octet)           │
│  Table d'ordre des patterns (128 octets)     │
│  Signature "M.K." (4 octets)                 │
├──────────────────────────────────────────────┤
│         PATTERNS                             │
│  Pattern 0 : 64 lignes × 4 canaux × 4 octets │
│  Pattern 1 : idem                            │
│  ...                                         │
├──────────────────────────────────────────────┤
│         DONNÉES SAMPLES                      │
│  Sample 1 (8 bits signés)                    │
│  Sample 2                                    │
│  ...                                         │
└──────────────────────────────────────────────┘
```

---

## 2. L'en-tête (Header)

### 2.1 Structure générale

| Offset | Taille | Description |
|--------|--------|-------------|
| 0 | 20 octets | Titre du module |
| 20 | 930 octets | 31 en-têtes de samples (30 octets chacun) |
| 950 | 1 octet | Longueur de la chanson (nombre de positions) |
| 951 | 1 octet | Position de redémarrage |
| 952 | 128 octets | Table d'ordre des patterns |
| 1080 | 4 octets | Signature de format |

**Total : 1084 octets** pour le format 31 samples.

### 2.2 Titre (offset 0, 20 octets)

- Chaîne de caractères ASCII, **non terminée par un zéro**.
- Les octets au-delà de la fin du titre sont remplis avec des espaces (0x20).
- La longueur maximale est de 20 caractères.

### 2.3 En-têtes de samples (offset 20, 30 octets chacun)

Chaque en-tête de sample a la structure suivante :

| Offset (relatif) | Taille | Description |
|------------------|--------|-------------|
| 0 | 22 octets | Nom du sample (ASCII, espaces de remplissage) |
| 22 | 2 octets | Longueur du sample **en mots** (big-endian) |
| 24 | 1 octet | Finetune (4 bits de poids fort) + réservé |
| 25 | 1 octet | Volume (0-64) |
| 26 | 2 octets | Début de boucle **en mots** (big-endian) |
| 28 | 2 octets | Longueur de boucle **en mots** (big-endian) |

#### Détails importants :

- **Longueur** : stockée en mots (1 mot = 2 octets). La longueur réelle en octets est `longueur_mots × 2`.
- **Finetune** : stocké dans les 4 bits de poids fort de l'octet 24. La valeur est un entier signé sur 4 bits :
  - `0x0` à `0x7` = finetune positif (0 à +7)
  - `0x8` à `0xF` = finetune négatif (-8 à -1)
  - Pour obtenir la valeur : `finetune = (octet >> 4) & 0x0F`
- **Volume** : valeur 0-64, où 64 est le volume maximum.
- **Boucle** : le début et la longueur de boucle sont également en mots. Si `longueur_boucle ≤ 2`, le sample est considéré comme **sans boucle** (one-shot).

### 2.4 Longueur de chanson (offset 950)

- 1 octet, généralement 0-128.
- Indique le nombre d'entrées valides dans la table d'ordre des patterns.

### 2.5 Position de redémarrage (offset 951)

- 1 octet.
- Position dans la liste de lecture où la musique revient après la fin de la chanson.
- Souvent ignoré et forcé à 0 par certains joueurs.

### 2.6 Table d'ordre des patterns (offset 952, 128 octets)

- 128 octets contenant chacun un numéro de pattern (0-63 dans ProTracker).
- L'ordre de lecture des patterns est défini par cette table.

### 2.7 Signature de format (offset 1080, 4 octets)

La signature détermine le nombre de canaux et le nombre de samples :

| Signature | Nombre de canaux | Nombre de samples | Remarque |
|-----------|------------------|-------------------|----------|
| `"M.K."` | 4 | 31 | ProTracker standard |
| `"M!K!"` | 4 | 31 | ProTracker (variante) |
| `"FLT4"` | 4 | 31 | ProTracker (variante) |
| `"4CHN"` | 4 | 31 | ProTracker 2 |
| `"6CHN"` | 6 | 31 | ProTracker 2 |
| `"8CHN"` | 8 | 31 | ProTracker 2 |
| `"N.T."` | 4 | 31 | ProTracker (variante) |
| Pas de signature | 4 | 15 | Soundtracker original |

**Note** : Pour le format Soundtracker 15 samples (sans signature), l'en-tête ne fait que **600 octets** (20 + 15×30 + 1 + 1 + 128).

---

## 3. Les Patterns

### 3.1 Structure générale

Les patterns commencent à l'offset **1084** (pour les formats 31 samples) ou **600** (pour le format 15 samples).

Chaque pattern est composé de **64 lignes** (aussi appelées "rows"). Chaque ligne contient une note pour chaque canal.

**Taille d'un pattern :** `64 lignes × canaux × 4 octets`

| Format | Taille d'un pattern |
|--------|---------------------|
| 4 canaux | 1024 octets |
| 6 canaux | 1536 octets |
| 8 canaux | 2048 octets |

### 3.2 Cellule de note (4 octets)

Chaque cellule de note de 4 octets est organisée comme suit :

```
Octet 0     Octet 1     Octet 2     Octet 3
┌─────────┬─────────┬─────────┬─────────┐
│ 0000FFFF│ FFFFFFFF│ 0000FFFF│ FFFFFFFF│
│  │   │            │   │               │
│  │   └─Période    │   └─Paramètre     │
│  │                │       d'effet     │
│  └─Numéro de      │                   │
│     sample        └─Effet             │
└───────────────────────────────────────┘
```

Détaillé bit par bit :

| Bits | Description |
|------|-------------|
| Octet 0, bits 0-3 | **Période** (bits 8-11) |
| Octet 0, bits 4-7 | **Numéro de sample** (bits 4-7) |
| Octet 1, bits 0-7 | **Période** (bits 0-7) |
| Octet 2, bits 0-3 | **Effet** (0x0-0xF) |
| Octet 2, bits 4-7 | **Numéro de sample** (bits 0-3) |
| Octet 3, bits 0-7 | **Paramètre d'effet** |

En résumé :
- **Période** : 12 bits (octet 0 bits 0-3 + octet 1 entier)
- **Sample** : 5 bits (octet 0 bits 4-7 + octet 2 bits 4-7)
- **Effet** : 4 bits (octet 2 bits 0-3)
- **Paramètre** : 8 bits (octet 3)

### 3.3 La période (note)

La période est une valeur entière qui définit la hauteur de la note. Elle est directement liée à la fréquence du sample par la formule :

```
Fréquence = AMIGA_CLOCK / (2 × Période)
```

Où `AMIGA_CLOCK = 7093789.2 Hz` (PAL) ou `7159090.5 Hz` (NTSC).

ProTracker utilise une **table de périodes** avec 37 entrées par finetune (dixit le code source). Voici un extrait pour le finetune 0 :

```
C-1: 856    C#1: 808    D-1: 762    D#1: 720
E-1: 678    F-1: 640    F#1: 604    G-1: 570
G#1: 538    A-1: 508    A#1: 480    B-1: 453
C-2: 428    ...         C-3: 214    ...
```

Les notes utilisent la nomenclature de tracker : `C-`, `C#`, `D-`, `D#`, `E-`, `F-`, `F#`, `G-`, `G#`, `A-`, `A#`, `B-`.

---

## 4. Les Samples (données audio)

### 4.1 Emplacement

Les données des samples commencent après le dernier pattern :

```
Offset = PatternOffset + (NombrePatterns × 64 × Canaux × 4)
```

### 4.2 Format des données

- **8 bits signés** (plage de -128 à 127).
- Pas d'entête, les données brutes se suivent dans l'ordre des samples (de 1 à 31).
- La longueur totale est la somme des longueurs de tous les samples.

### 4.3 Bouclage

Si un sample a une longueur de boucle > 2, il est en mode **boucle** :
- La lecture commence au début du sample.
- Quand la position atteint `DébutBoucle + LongueurBoucle`, elle revient à `DébutBoucle`.

Si la longueur de boucle ≤ 2, le sample est en mode **one-shot** :
- La lecture s'arrête à la fin du sample.

---

## 5. Les Effets

Chaque cellule de note peut contenir un effet. Le paramètre est stocké dans l'octet 3, souvent divisé en deux parties x et y (4 bits chacun).

### 5.1 Table des effets standard (ProTracker)

| Valeur | Nom | Description |
|--------|-----|-------------|
| `0x0` | Arpeggio | Alterne la note entre la note base, +x demi-tons et +y demi-tons |
| `0x1` | Portamento Up | Monte la période (donc la note) de la valeur du paramètre |
| `0x2` | Portamento Down | Descend la période de la valeur du paramètre |
| `0x3` | Tone Portamento | Glisse vers la période de la note suivante |
| `0x4` | Vibrato | Modulation périodique de la hauteur |
| `0x5` | Tone Porta + Vol Slide | Combine tone portamento et volume slide |
| `0x6` | Vibrato + Vol Slide | Combine vibrato et volume slide |
| `0x7` | Tremolo | Modulation périodique du volume |
| `0x8` | (Réservé) | Non utilisé dans ProTracker |
| `0x9` | Sample Offset | Démarre la lecture du sample à une position décalée |
| `0xA` | Volume Slide | Monte ou descend le volume |
| `0xB` | Position Jump | Saute à une position de la liste de lecture |
| `0xC` | Set Volume | Règle le volume du canal (0-64) |
| `0xD` | Pattern Break | Passe au pattern suivant à la ligne spécifiée |
| `0xE` | Extended Effects | Effets étendus (voir table ci-dessous) |
| `0xF` | Set Speed/Tempo | < 32 = vitesse, ≥ 32 = tempo |

### 5.2 Effets étendus (0xE)

Le paramètre est divisé en x (nibble haut) et y (nibble bas) :

| Valeur x | Nom | Description |
|----------|-----|-------------|
| `0xE1` | Fine Portamento Up | Portamento fin (une fois) |
| `0xE2` | Fine Portamento Down | Portamento fin descendant |
| `0xE3` | Glissando Control | Active/désactive le glissando |
| `0xE4` | Set Vibrato Waveform | Règle la forme d'onde du vibrato |
| `0xE5` | Set Finetune | Change le finetune du sample |
| `0xE6` | Pattern Loop | Boucle sur une section du pattern |
| `0xE7` | Set Tremolo Waveform | Règle la forme d'onde du tremolo |
| `0xE8` | (Réservé) | - |
| `0xE9` | Retrigger Note | Re-déclenche la note tous les y ticks |
| `0xEA` | Fine Volume Slide Up | Montée fine du volume |
| `0xEB` | Fine Volume Slide Down | Descente fine du volume |
| `0xEC` | Note Cut | Coupe la note au tick y |
| `0xED` | Note Delay | Retarde la note de y ticks |
| `0xEE` | Pattern Delay | Retarde le pattern de y ticks |
| `0xEF` | Funk (Invert Loop) | Inversion de boucle (effet "funk" du modem) |

---

## 6. Format Soundtracker (15 samples)

Le format original Soundtracker est plus simple :

| Offset | Taille | Description |
|--------|--------|-------------|
| 0 | 20 octets | Titre |
| 20 | 450 octets | 15 en-têtes de samples (30 octets chacun) |
| 470 | 1 octet | Longueur de chanson |
| 471 | 1 octet | Position de redémarrage |
| 472 | 128 octets | Table d'ordre des patterns |
| 600 | - | Début des patterns |

- 15 samples maximum
- 4 canaux fixes
- Pas de signature de format

---

## 7. Table des périodes ProTracker

La table des périodes a **37 entrées par finetune**, pour 16 finetunes différents. Le code implémente cette table ainsi :

```javascript
this.PERIOD_TABLE = [
    // Finetune 0
    [856,808,762,720,678,640,604,570,538,508,480,453,
     428,404,381,360,339,320,302,285,269,254,240,226,
     214,202,190,180,170,160,151,143,135,127,120,113,0],
    // Finetune 1
    [850,802,757,715,674,637,601,567,535,505,477,450,
     425,401,379,357,337,318,300,284,268,253,239,225,
     213,201,189,179,169,159,150,142,134,126,119,113,0],
    ...
];
```

### 7.1 Correspondance période → fréquence

La fréquence de lecture est calculée ainsi :

```
increment = AMIGA_CLOCK / (2 × période) / SAMPLE_RATE
```

### 7.2 Les finetunes

| Index | Valeur | Effet |
|-------|--------|-------|
| 0-7 | 0 à +7 | Élève légèrement la hauteur |
| 8 | -8 | Descend au maximum |
| 9-15 | -7 à -1 | Descend légèrement la hauteur |

---

## 8. Lecture et notion de ticks

### 8.1 Vitesse et tempo

- **Speed** (vitesse) : nombre de ticks par ligne. Valeur typique : 6.
- **Tempo** : définit la durée des ticks. Valeur typique : 125.

```
samplesPerTick = SAMPLE_RATE × 2.5 / tempo
```

### 8.2 Cycle de lecture

```
Pour chaque ligne (row) :
  1. Ligne traitée au tick 0 (notes, effets spécifiques)
  2. Ticks 1 à speed-1 : effets continus appliqués
  3. Passage à la ligne suivante
```

### 8.3 Passage de position

- Normalement, après 64 lignes, on passe à la position suivante.
- La position peut être changée par les effets `0xB` (position jump) et `0xD` (pattern break).

---

## 9. Exemple de parse en JavaScript

Extrait du code de `js/modplayer.js` :

```javascript
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
    // Format Soundtracker 15 samples
    this.numSamples = 15;
    this.patternOffset = 600;
    this.numChannels = 4;
}
```

---

## 10. Références et ressources

- **ProTracker 2.3D** : le logiciel de référence pour créer des fichiers MOD
- **Soundtracker** : l'original de Karsten Obarski (1987)
- **The Mod Archive** : base de données de modules (modarchive.org)
- **Amiga Music Preservation** : archivage de la musique Amiga

---

## Annexe : Résumé des constantes

| Constante | Valeur |
|-----------|--------|
| Taille en-tête (31 samples) | 1084 octets |
| Taille en-tête (15 samples) | 600 octets |
| Nombre de lignes par pattern | 64 |
| Taille cellule de note | 4 octets |
| Nombre de samples max (ProTracker) | 31 |
| Nombre de canaux standard | 4 |
| Fréquence d'horloge Amiga PAL | 7093789.2 Hz |
| Volume maximum | 64 |
| Finetune max | ±8 |
| Entrées par finetune | 37 |