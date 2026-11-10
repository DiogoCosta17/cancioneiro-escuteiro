import { formatChordNotation } from './chords';

export interface ChordDefinition {
  name: string;
  frets: number[]; // um elemento por corda, da corda mais grave/4ª-6ª (esquerda do diagrama) até à 1ª. -1 = abafada (x), 0 = solta (o). Guitarra: 6 elementos (Mi grave .. Mi agudo)
  fingers?: number[]; // finger for each string (1=index, 2=middle, 3=ring, 4=pinky, 0=none)
  barre?: { fret: number; fromString: number; toString: number }; // 0-indexed (guitarra: 0=low E, 5=high E)
  baseFret?: number; // 1-based, defaults to 1
}

export const GUITAR_CHORDS: Record<string, ChordDefinition> = {
  // === MAIORES BÁSICOS ===
  'C': { name: 'C', frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], baseFret: 1 },
  'C#': { name: 'C#', frets: [-1, 4, 6, 6, 6, 4], fingers: [0, 1, 2, 3, 4, 1], barre: { fret: 4, fromString: 1, toString: 5 }, baseFret: 4 },
  'Db': { name: 'Db', frets: [-1, 4, 6, 6, 6, 4], fingers: [0, 1, 2, 3, 4, 1], barre: { fret: 4, fromString: 1, toString: 5 }, baseFret: 4 },
  'D': { name: 'D', frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], baseFret: 1 },
  'D#': { name: 'D#', frets: [-1, 6, 8, 8, 8, 6], fingers: [0, 1, 2, 3, 4, 1], barre: { fret: 6, fromString: 1, toString: 5 }, baseFret: 6 },
  'Eb': { name: 'Eb', frets: [-1, 6, 8, 8, 8, 6], fingers: [0, 1, 2, 3, 4, 1], barre: { fret: 6, fromString: 1, toString: 5 }, baseFret: 6 },
  'E': { name: 'E', frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], baseFret: 1 },
  'F': { name: 'F', frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], barre: { fret: 1, fromString: 0, toString: 5 }, baseFret: 1 },
  'F#': { name: 'F#', frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1], barre: { fret: 2, fromString: 0, toString: 5 }, baseFret: 2 },
  'Gb': { name: 'Gb', frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1], barre: { fret: 2, fromString: 0, toString: 5 }, baseFret: 2 },
  'G': { name: 'G', frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3], baseFret: 1 },
  'G#': { name: 'G#', frets: [4, 6, 6, 5, 4, 4], fingers: [1, 3, 4, 2, 1, 1], barre: { fret: 4, fromString: 0, toString: 5 }, baseFret: 4 },
  'Ab': { name: 'Ab', frets: [4, 6, 6, 5, 4, 4], fingers: [1, 3, 4, 2, 1, 1], barre: { fret: 4, fromString: 0, toString: 5 }, baseFret: 4 },
  'A': { name: 'A', frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], baseFret: 1 },
  'A#': { name: 'A#', frets: [-1, 1, 3, 3, 3, 1], fingers: [0, 1, 2, 3, 4, 1], barre: { fret: 1, fromString: 1, toString: 5 }, baseFret: 1 },
  'Bb': { name: 'Bb', frets: [-1, 1, 3, 3, 3, 1], fingers: [0, 1, 2, 3, 4, 1], barre: { fret: 1, fromString: 1, toString: 5 }, baseFret: 1 },
  'B': { name: 'B', frets: [-1, 2, 4, 4, 4, 2], fingers: [0, 1, 2, 3, 4, 1], barre: { fret: 2, fromString: 1, toString: 5 }, baseFret: 2 },

  // === MENORES BÁSICOS ===
  'Am': { name: 'Am', frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], baseFret: 1 },
  'A#m': { name: 'A#m', frets: [-1, 1, 3, 3, 2, 1], fingers: [0, 1, 3, 4, 2, 1], barre: { fret: 1, fromString: 1, toString: 5 }, baseFret: 1 },
  'Bbm': { name: 'Bbm', frets: [-1, 1, 3, 3, 2, 1], fingers: [0, 1, 3, 4, 2, 1], barre: { fret: 1, fromString: 1, toString: 5 }, baseFret: 1 },
  'Bm': { name: 'Bm', frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], barre: { fret: 2, fromString: 1, toString: 5 }, baseFret: 2 },
  'Cm': { name: 'Cm', frets: [-1, 3, 5, 5, 4, 3], fingers: [0, 1, 3, 4, 2, 1], barre: { fret: 3, fromString: 1, toString: 5 }, baseFret: 3 },
  'C#m': { name: 'C#m', frets: [-1, 4, 6, 6, 5, 4], fingers: [0, 1, 3, 4, 2, 1], barre: { fret: 4, fromString: 1, toString: 5 }, baseFret: 4 },
  'Dbm': { name: 'Dbm', frets: [-1, 4, 6, 6, 5, 4], fingers: [0, 1, 3, 4, 2, 1], barre: { fret: 4, fromString: 1, toString: 5 }, baseFret: 4 },
  'Dm': { name: 'Dm', frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], baseFret: 1 },
  'D#m': { name: 'D#m', frets: [-1, 6, 8, 8, 7, 6], fingers: [0, 1, 3, 4, 2, 1], barre: { fret: 6, fromString: 1, toString: 5 }, baseFret: 6 },
  'Ebm': { name: 'Ebm', frets: [-1, 6, 8, 8, 7, 6], fingers: [0, 1, 3, 4, 2, 1], barre: { fret: 6, fromString: 1, toString: 5 }, baseFret: 6 },
  'Em': { name: 'Em', frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], baseFret: 1 },
  'Fm': { name: 'Fm', frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1], barre: { fret: 1, fromString: 0, toString: 5 }, baseFret: 1 },
  'F#m': { name: 'F#m', frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1], barre: { fret: 2, fromString: 0, toString: 5 }, baseFret: 2 },
  'Gbm': { name: 'Gbm', frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1], barre: { fret: 2, fromString: 0, toString: 5 }, baseFret: 2 },
  'Gm': { name: 'Gm', frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1], barre: { fret: 3, fromString: 0, toString: 5 }, baseFret: 3 },
  'G#m': { name: 'G#m', frets: [4, 6, 6, 4, 4, 4], fingers: [1, 3, 4, 1, 1, 1], barre: { fret: 4, fromString: 0, toString: 5 }, baseFret: 4 },
  'Abm': { name: 'Abm', frets: [4, 6, 6, 4, 4, 4], fingers: [1, 3, 4, 1, 1, 1], barre: { fret: 4, fromString: 0, toString: 5 }, baseFret: 4 },

  // === ACORDES SUSPENSO 2 (sus2) ===
  'Csus2': { name: 'Csus2', frets: [-1, 3, 0, 0, 1, 3], fingers: [0, 3, 0, 0, 1, 4], baseFret: 1 },
  'Dsus2': { name: 'Dsus2', frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 2, 0], baseFret: 1 },
  'Esus2': { name: 'Esus2', frets: [0, 2, 4, 4, 0, 0], fingers: [0, 1, 3, 4, 0, 0], baseFret: 1 },
  'Gsus2': { name: 'Gsus2', frets: [3, 0, 0, 0, 3, 3], fingers: [1, 0, 0, 0, 3, 4], baseFret: 1 },
  'Asus2': { name: 'Asus2', frets: [-1, 0, 2, 2, 0, 0], fingers: [0, 0, 1, 2, 0, 0], baseFret: 1 },
  'Bsus2': { name: 'Bsus2', frets: [-1, 2, 4, 4, 2, 2], fingers: [0, 1, 3, 4, 1, 1], barre: { fret: 2, fromString: 1, toString: 5 }, baseFret: 2 },

  // === ACORDES SUSPENSO 4 (sus4 / sus) ===
  'Csus4': { name: 'Csus4', frets: [-1, 3, 3, 0, 1, 1], fingers: [0, 3, 4, 0, 1, 1], baseFret: 1 },
  'Dsus4': { name: 'Dsus4', frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 4], baseFret: 1 },
  'Esus4': { name: 'Esus4', frets: [0, 2, 2, 2, 0, 0], fingers: [0, 2, 3, 4, 0, 0], baseFret: 1 },
  'Fsus4': { name: 'Fsus4', frets: [1, 3, 3, 3, 1, 1], fingers: [1, 2, 3, 4, 1, 1], barre: { fret: 1, fromString: 0, toString: 5 }, baseFret: 1 },
  'Gsus4': { name: 'Gsus4', frets: [3, 3, 0, 0, 1, 3], fingers: [2, 3, 0, 0, 1, 4], baseFret: 1 },
  'Asus4': { name: 'Asus4', frets: [-1, 0, 2, 2, 3, 0], fingers: [0, 0, 1, 2, 3, 0], baseFret: 1 },
  'Bsus4': { name: 'Bsus4', frets: [-1, 2, 4, 4, 5, 2], fingers: [0, 1, 2, 3, 4, 1], barre: { fret: 2, fromString: 1, toString: 5 }, baseFret: 2 },

  // === ADD9 / 9 (Nona) ===
  'C9': { name: 'C9', frets: [-1, 3, 2, 0, 3, 3], fingers: [0, 2, 1, 0, 3, 4], baseFret: 1 },
  'Cadd9': { name: 'Cadd9', frets: [-1, 3, 2, 0, 3, 3], fingers: [0, 2, 1, 0, 3, 4], baseFret: 1 },
  'D9': { name: 'D9', frets: [-1, -1, 0, 2, 1, 0], fingers: [0, 0, 0, 2, 1, 0], baseFret: 1 },
  'Dadd9': { name: 'Dadd9', frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 2, 0], baseFret: 1 },
  'E9': { name: 'E9', frets: [0, 2, 0, 1, 0, 2], fingers: [0, 2, 0, 1, 0, 3], baseFret: 1 },
  'Eadd9': { name: 'Eadd9', frets: [0, 2, 4, 1, 0, 0], fingers: [0, 2, 4, 1, 0, 0], baseFret: 1 },
  'Fadd9': { name: 'Fadd9', frets: [1, 3, 3, 2, 1, 3], fingers: [1, 2, 3, 4, 1, 4], baseFret: 1 },
  'G9': { name: 'G9', frets: [3, 2, 0, 2, 0, 1], fingers: [3, 2, 0, 4, 0, 1], baseFret: 1 },
  'Gadd9': { name: 'Gadd9', frets: [3, 0, 0, 0, 0, 3], fingers: [2, 0, 0, 0, 0, 3], baseFret: 1 },
  'A9': { name: 'A9', frets: [-1, 0, 2, 4, 2, 3], fingers: [0, 0, 1, 3, 1, 2], baseFret: 1 },
  'Aadd9': { name: 'Aadd9', frets: [-1, 0, 2, 4, 2, 0], fingers: [0, 0, 1, 3, 2, 0], baseFret: 1 },

  // === MAJ7 / M7 / 7M (Sétima Maior) ===
  'Cmaj7': { name: 'Cmaj7', frets: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0], baseFret: 1 },
  'Dmaj7': { name: 'Dmaj7', frets: [-1, -1, 0, 2, 2, 2], fingers: [0, 0, 0, 1, 1, 1], barre: { fret: 2, fromString: 3, toString: 5 }, baseFret: 1 },
  'Emaj7': { name: 'Emaj7', frets: [0, 2, 1, 1, 0, 0], fingers: [0, 3, 1, 2, 0, 0], baseFret: 1 },
  'Fmaj7': { name: 'Fmaj7', frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0], baseFret: 1 },
  'Gmaj7': { name: 'Gmaj7', frets: [3, 2, 0, 0, 0, 2], fingers: [2, 1, 0, 0, 0, 3], baseFret: 1 },
  'Amaj7': { name: 'Amaj7', frets: [-1, 0, 2, 1, 2, 0], fingers: [0, 0, 2, 1, 3, 0], baseFret: 1 },
  'Bmaj7': { name: 'Bmaj7', frets: [-1, 2, 4, 3, 4, 2], fingers: [0, 1, 3, 2, 4, 1], barre: { fret: 2, fromString: 1, toString: 5 }, baseFret: 2 },
  'Bbmaj7': { name: 'Bbmaj7', frets: [-1, 1, 3, 2, 3, 1], fingers: [0, 1, 3, 2, 4, 1], barre: { fret: 1, fromString: 1, toString: 5 }, baseFret: 1 },

  // === MAJ7SUS2 / M7SUS2 (O acorde específico do utilizador!) ===
  'Dmaj7sus2': { name: 'Dmaj7sus2', frets: [-1, -1, 0, 2, 2, 0], fingers: [0, 0, 0, 1, 2, 0], baseFret: 1 },
  'Cmaj7sus2': { name: 'Cmaj7sus2', frets: [-1, 3, 0, 0, 0, 0], fingers: [0, 3, 0, 0, 0, 0], baseFret: 1 },
  'Amaj7sus2': { name: 'Amaj7sus2', frets: [-1, 0, 2, 1, 0, 0], fingers: [0, 0, 2, 1, 0, 0], baseFret: 1 },

  // === SÉTIMAS DOMINANTES (7) ===
  'C7': { name: 'C7', frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0], baseFret: 1 },
  'C#7': { name: 'C#7', frets: [-1, 4, 6, 4, 6, 4], fingers: [0, 1, 3, 1, 4, 1], barre: { fret: 4, fromString: 1, toString: 5 }, baseFret: 4 },
  'Db7': { name: 'Db7', frets: [-1, 4, 6, 4, 6, 4], fingers: [0, 1, 3, 1, 4, 1], barre: { fret: 4, fromString: 1, toString: 5 }, baseFret: 4 },
  'D7': { name: 'D7', frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3], baseFret: 1 },
  'D#7': { name: 'D#7', frets: [-1, 6, 8, 6, 8, 6], fingers: [0, 1, 3, 1, 4, 1], barre: { fret: 6, fromString: 1, toString: 5 }, baseFret: 6 },
  'Eb7': { name: 'Eb7', frets: [-1, 6, 8, 6, 8, 6], fingers: [0, 1, 3, 1, 4, 1], barre: { fret: 6, fromString: 1, toString: 5 }, baseFret: 6 },
  'E7': { name: 'E7', frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0], baseFret: 1 },
  'F7': { name: 'F7', frets: [1, 3, 1, 2, 1, 1], fingers: [1, 3, 1, 2, 1, 1], barre: { fret: 1, fromString: 0, toString: 5 }, baseFret: 1 },
  'F#7': { name: 'F#7', frets: [2, 4, 2, 3, 2, 2], fingers: [1, 3, 1, 2, 1, 1], barre: { fret: 2, fromString: 0, toString: 5 }, baseFret: 2 },
  'G7': { name: 'G7', frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1], baseFret: 1 },
  'G#7': { name: 'G#7', frets: [4, 6, 4, 5, 4, 4], fingers: [1, 3, 1, 2, 1, 1], barre: { fret: 4, fromString: 0, toString: 5 }, baseFret: 4 },
  'Ab7': { name: 'Ab7', frets: [4, 6, 4, 5, 4, 4], fingers: [1, 3, 1, 2, 1, 1], barre: { fret: 4, fromString: 0, toString: 5 }, baseFret: 4 },
  'A7': { name: 'A7', frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 1, 0, 2, 0], baseFret: 1 },
  'A#7': { name: 'A#7', frets: [-1, 1, 3, 1, 3, 1], fingers: [0, 1, 3, 1, 4, 1], barre: { fret: 1, fromString: 1, toString: 5 }, baseFret: 1 },
  'Bb7': { name: 'Bb7', frets: [-1, 1, 3, 1, 3, 1], fingers: [0, 1, 3, 1, 4, 1], barre: { fret: 1, fromString: 1, toString: 5 }, baseFret: 1 },
  'B7': { name: 'B7', frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4], baseFret: 1 },

  // === MENORES COM SÉTIMA (m7) ===
  'Am7': { name: 'Am7', frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0], baseFret: 1 },
  'Bm7': { name: 'Bm7', frets: [-1, 2, 4, 2, 3, 2], fingers: [0, 1, 3, 1, 2, 1], barre: { fret: 2, fromString: 1, toString: 5 }, baseFret: 2 },
  'Cm7': { name: 'Cm7', frets: [-1, 3, 5, 3, 4, 3], fingers: [0, 1, 3, 1, 2, 1], barre: { fret: 3, fromString: 1, toString: 5 }, baseFret: 3 },
  'C#m7': { name: 'C#m7', frets: [-1, 4, 6, 4, 5, 4], fingers: [0, 1, 3, 1, 2, 1], barre: { fret: 4, fromString: 1, toString: 5 }, baseFret: 4 },
  'Dm7': { name: 'Dm7', frets: [-1, -1, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1], barre: { fret: 1, fromString: 4, toString: 5 }, baseFret: 1 },
  'Em7': { name: 'Em7', frets: [0, 2, 0, 0, 0, 0], fingers: [0, 1, 0, 0, 0, 0], baseFret: 1 },
  'F#m7': { name: 'F#m7', frets: [2, 4, 2, 2, 2, 2], fingers: [1, 3, 1, 1, 1, 1], barre: { fret: 2, fromString: 0, toString: 5 }, baseFret: 2 },
  'Gm7': { name: 'Gm7', frets: [3, 5, 3, 3, 3, 3], fingers: [1, 3, 1, 1, 1, 1], barre: { fret: 3, fromString: 0, toString: 5 }, baseFret: 3 },

  // === SLASH CHORDS CLÁSSICOS (Baixos Invertidos) ===
  'D/F#': { name: 'D/F#', frets: [2, 0, 0, 2, 3, 2], fingers: [1, 0, 0, 2, 4, 3], baseFret: 1 },
  'G/B': { name: 'G/B', frets: [-1, 2, 0, 0, 3, 3], fingers: [0, 1, 0, 0, 3, 4], baseFret: 1 },
  'C/E': { name: 'C/E', frets: [0, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], baseFret: 1 },
  'A/C#': { name: 'A/C#', frets: [-1, 4, 2, 2, 2, 0], fingers: [0, 4, 1, 2, 3, 0], baseFret: 1 },

  // === ALIASES POPULARES & ACORDES "2" (comuns em cancioneiros) ===
  'C2': { name: 'C2', frets: [-1, 3, 0, 0, 3, 0], fingers: [0, 2, 0, 0, 3, 0], baseFret: 1 },
  'D2': { name: 'D2', frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 2, 0], baseFret: 1 },
  'G2': { name: 'G2', frets: [3, 0, 0, 0, 3, 3], fingers: [1, 0, 0, 0, 3, 4], baseFret: 1 },
  'A2': { name: 'A2', frets: [-1, 0, 2, 2, 0, 0], fingers: [0, 0, 1, 2, 0, 0], baseFret: 1 },
  'E2': { name: 'E2', frets: [0, 2, 4, 1, 0, 0], fingers: [0, 2, 4, 1, 0, 0], baseFret: 1 },
  'DM7sus2': { name: 'DM7sus2', frets: [-1, -1, 0, 2, 2, 0], fingers: [0, 0, 0, 1, 2, 0], baseFret: 1 },
  'CM7sus2': { name: 'CM7sus2', frets: [-1, 3, 0, 0, 0, 0], fingers: [0, 3, 0, 0, 0, 0], baseFret: 1 },
  'AM7sus2': { name: 'AM7sus2', frets: [-1, 0, 2, 1, 0, 0], fingers: [0, 0, 2, 1, 0, 0], baseFret: 1 },
};

// === DIMINUTOS, MEIO-DIMINUTOS E AUMENTADOS (desenhos móveis) ===
// Sem estes desenhos, "Bdim" ou "Caug" caíam no acorde maior (desenho e som errados).
// Cada qualidade tem um desenho com a fundamental na 6.ª corda (Mi) e outro na 5.ª (Lá);
// usa-se o que fica mais perto da pestana. Valores relativos à casa da fundamental (null = abafada).
const MOVABLE_SHAPES: Record<string, { rootString: 0 | 1; offsets: (number | null)[] }[]> = {
  dim: [
    { rootString: 0, offsets: [0, 1, 2, 0, null, null] },
    { rootString: 1, offsets: [null, 0, 1, 2, 1, null] },
  ],
  dim7: [
    { rootString: 0, offsets: [0, 1, 2, 0, 2, 0] },
    { rootString: 1, offsets: [null, 0, 1, -1, 1, null] },
  ],
  m7b5: [
    { rootString: 0, offsets: [0, 1, 2, 0, 3, 0] },
    { rootString: 1, offsets: [null, 0, 1, 0, 1, null] },
  ],
  aug: [
    { rootString: 0, offsets: [0, null, 2, 1, 1, null] },
    { rootString: 1, offsets: [null, 0, -1, -2, -2, null] },
  ],
};

const OPEN_STRING_PC = [4, 9]; // Mi e Lá
const ROOT_PC: [string, number][] = [
  ['C', 0], ['C#', 1], ['Db', 1], ['D', 2], ['D#', 3], ['Eb', 3], ['E', 4], ['F', 5],
  ['F#', 6], ['Gb', 6], ['G', 7], ['G#', 8], ['Ab', 8], ['A', 9], ['A#', 10], ['Bb', 10], ['B', 11],
];

function buildMovableChord(name: string, rootPc: number, quality: string): ChordDefinition | null {
  let best: number[] | null = null;
  for (const shape of MOVABLE_SHAPES[quality]) {
    const minOffset = Math.min(...shape.offsets.filter((o): o is number => o !== null));
    let rootFret = (((rootPc - OPEN_STRING_PC[shape.rootString]) % 12) + 12) % 12;
    // Nenhuma corda pode ficar abaixo da casa 0
    if (rootFret + minOffset < 0) rootFret += 12;
    const frets = shape.offsets.map(o => (o === null ? -1 : rootFret + o));
    if (!best || Math.max(...frets) < Math.max(...best)) best = frets;
  }
  if (!best) return null;
  const pressed = best.filter(f => f > 0);
  const baseFret = Math.max(...best) <= 4 ? 1 : Math.min(...pressed);
  return { name, frets: best, baseFret };
}

for (const quality of Object.keys(MOVABLE_SHAPES)) {
  for (const [root, pc] of ROOT_PC) {
    const name = `${root}${quality}`;
    if (!GUITAR_CHORDS[name]) {
      const def = buildMovableChord(name, pc, quality);
      if (def) GUITAR_CHORDS[name] = def;
    }
  }
}

/**
 * Normaliza variações de nomes de acordes (incluindo Solfejo Português):
 * ex: Sol -> G, Ré- -> Dm, Mim -> Em
 *     DM7sus2 -> Dmaj7sus2
 *     CM7 / C7M / C7+ -> Cmaj7
 *     C2 -> Csus2
 *     C9 -> Cadd9 ou C9
 */
export function normalizeChordName(chord: string): string {
  let c = chord.trim();

  // Converter raízes em solfejo português (ex: Sol, Ré-, Mim, Lá7, Dó7M) para alfabético (G, Dm, Em, A7, Cmaj7),
  // incluindo o baixo de slash chords (ex: Ré/Fá# -> D/F#)
  c = formatChordNotation(c, 'alfabetica');

  // M7sus2 -> maj7sus2
  c = c.replace(/M7sus2/i, 'maj7sus2');
  // M7 / 7M / 7+ -> maj7
  c = c.replace(/(?:M7|7M|7\+)/, 'maj7');
  // 7/4 ou 4/7 -> 7sus4
  c = c.replace(/(?:7\/4|4\/7)/, '7sus4');
  // Acordes como C2, D2, G2 (notação moderna para sus2)
  c = c.replace(/^([A-G][#b]?)2$/, '$1sus2');
  // sus -> sus4
  if (c.endsWith('sus')) {
    c += '4';
  }

  return c;
}

const ENHARMONIC_ROOTS: Record<string, string> = {
  'C#': 'Db', 'Db': 'C#', 'D#': 'Eb', 'Eb': 'D#', 'F#': 'Gb', 'Gb': 'F#',
  'G#': 'Ab', 'Ab': 'G#', 'A#': 'Bb', 'Bb': 'A#',
};

/**
 * Procura um acorde numa tabela de dedilhações (de qualquer instrumento) ou encontra a
 * aproximação/variação mais precisa. Partilhado pela guitarra, ukulele e cavaquinho.
 */
export function findChordInTable(table: Record<string, ChordDefinition>, rawChord: string): ChordDefinition | null {
  const norm = normalizeChordName(rawChord);

  // 1. Procura exata do acorde original primeiro (ex: se o utilizador definiu C2 explicitamente)
  if (table[rawChord]) {
    return table[rawChord];
  }
  // 2. Se não existir definição específica, procura pelo nome normalizado
  if (table[norm]) {
    return { ...table[norm], name: rawChord };
  }

  // 3. Se for slash chord (ex: G/B, D/F#, Sol/Si), tenta com a barra ou sem a barra
  const slashIndex = norm.indexOf('/');
  if (slashIndex > 0) {
    const mainChord = norm.substring(0, slashIndex);
    const mainDef = findChordInTable(table, mainChord);
    if (mainDef) {
      return { ...mainDef, name: rawChord };
    }
  }

  // 4. Decomposição inteligente: raiz + tipo de extensão
  const match = norm.match(/^([A-G][#b]?)(.*)/);
  if (!match) return null;

  const root = match[1];
  const extension = match[2];

  // O mesmo acorde escrito com a fundamental enarmónica (ex.: Gb7 = F#7, A#m7 = Bbm7)
  const enharmonic = ENHARMONIC_ROOTS[root];
  if (enharmonic && table[`${enharmonic}${extension}`]) {
    return { ...table[`${enharmonic}${extension}`], name: rawChord };
  }

  // Acordes menores (Am9, Em11, Dmadd9...) nunca devem cair num desenho maior (Aadd9, E, ...)
  const isMinor = /^(?:m(?!aj)|min)/.test(extension);
  // Diminutos, meio-diminutos e aumentados: nunca caem num desenho maior/menor (soaria outro acorde)
  const isHalfDim = /ø|m7\(?(?:b5|-5|5-)\)?/.test(extension);
  const isDim = !isHalfDim && /^(?:dim|[°º])/.test(extension);
  const isAug = /^(?:aug|\+|5\+|\(?#5\)?)/.test(extension);

  // Tenta combinações de extensões conhecidas
  const attempts = (isMinor ? [
    `${root}${extension}`,
    isHalfDim ? `${root}m7b5` : null,
    extension.startsWith('m6') ? `${root}m6` : null,
    extension.includes('7') ? `${root}m7` : null,
    `${root}m`,
  ] : [
    `${root}${extension}`,
    isHalfDim ? `${root}m7b5` : null,
    isDim && extension.includes('7') ? `${root}dim7` : null,
    isDim ? `${root}dim` : null,
    isAug ? `${root}aug` : null,
    extension.includes('7sus4') ? `${root}7sus4` : null,
    extension.includes('9') ? `${root}add9` : null,
    extension.includes('9') ? `${root}9` : null,
    extension.startsWith('6') ? `${root}6` : null,
    extension.includes('maj7') || extension.includes('M7') ? `${root}maj7` : null,
    extension.includes('sus4') || extension === 'sus' ? `${root}sus4` : null,
    extension.includes('sus2') ? `${root}sus2` : null,
    extension.includes('m7') ? `${root}m7` : null,
    extension.includes('7') ? `${root}7` : null,
    root // acorde maior puro
  ]).filter(Boolean) as string[];

  // Sem desenho próprio, mostrar "indisponível" é melhor do que um acorde que soa diferente
  const altered = isHalfDim || isDim || isAug;
  const alteredNames = new Set([`${root}${extension}`, `${root}m7b5`, `${root}dim7`, `${root}dim`, `${root}aug`]);

  for (const att of attempts) {
    if (altered && !alteredNames.has(att)) continue;
    if (table[att]) {
      return { ...table[att], name: rawChord };
    }
  }

  return null;
}

/**
 * Obtém a definição do acorde de guitarra ou encontra a aproximação/variação mais precisa
 */
export function getChordDefinition(rawChord: string): ChordDefinition | null {
  return findChordInTable(GUITAR_CHORDS, rawChord);
}
