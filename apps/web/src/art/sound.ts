import { WEAPON_IDS, type WeaponId } from "./fx.js";

export const SOUND_NAMES = ["tick", "select", ...WEAPON_IDS, "hit", "crit", "parry", "ko", "promotion"] as const;

export type SoundName = (typeof SOUND_NAMES)[number];

export const SOUND_LABELS: Record<SoundName, string> = {
  tick: "Menu tick",
  select: "Select",
  flame: "Flame lance",
  ballista: "Ballista",
  coin: "Coin cannon",
  laser: "Laser rifle",
  trebuchet: "Trebuchet",
  railgun: "Clockwork railgun",
  gatling: "Gatling gun",
  rocket: "Rocket",
  orbital: "Orbital beam",
  hit: "Hit",
  crit: "Critical",
  parry: "Parry",
  ko: "K.O.",
  promotion: "Promotion jingle",
};

export interface SoundKit {
  play(name: SoundName): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  dispose(): void;
}

interface ToneOptions {
  frequency: number;
  toFrequency?: number;
  duration: number;
  type?: OscillatorType;
  volume?: number;
  delay?: number;
}

const WEAPON_TONES: Record<WeaponId, (play: (options: ToneOptions) => void, noise: (delay: number, volume: number) => void) => void> = {
  flame: (play, noise) => {
    play({ frequency: 220, toFrequency: 90, duration: 0.32, type: "sawtooth", volume: 0.16 });
    noise(0, 0.1);
  },
  ballista: (play, noise) => {
    play({ frequency: 150, toFrequency: 60, duration: 0.22, type: "square", volume: 0.18 });
    noise(0.03, 0.12);
  },
  coin: (play) => {
    for (let index = 0; index < 5; index += 1) {
      play({ frequency: 1180 + index * 90, duration: 0.05, type: "square", volume: 0.09, delay: index * 0.055 });
    }
  },
  laser: (play) => {
    play({ frequency: 1600, toFrequency: 280, duration: 0.16, type: "sawtooth", volume: 0.12 });
  },
  trebuchet: (play, noise) => {
    play({ frequency: 110, toFrequency: 55, duration: 0.34, type: "triangle", volume: 0.18 });
    noise(0.04, 0.14);
  },
  railgun: (play) => {
    for (let index = 0; index < 3; index += 1) {
      play({ frequency: 320 + index * 80, duration: 0.04, type: "square", volume: 0.08, delay: index * 0.07 });
    }
    play({ frequency: 980, toFrequency: 180, duration: 0.2, type: "sawtooth", volume: 0.14, delay: 0.22 });
  },
  gatling: (play) => {
    for (let index = 0; index < 8; index += 1) {
      play({ frequency: 240 + (index % 2) * 60, duration: 0.035, type: "square", volume: 0.07, delay: index * 0.055 });
    }
  },
  rocket: (play, noise) => {
    play({ frequency: 160, toFrequency: 420, duration: 0.4, type: "sawtooth", volume: 0.09 });
    noise(0.02, 0.1);
  },
  orbital: (play, noise) => {
    play({ frequency: 180, toFrequency: 720, duration: 0.3, type: "sine", volume: 0.1 });
    play({ frequency: 80, toFrequency: 40, duration: 0.5, type: "triangle", volume: 0.2, delay: 0.3 });
    noise(0.3, 0.16);
  },
};

export function createSoundKit(): SoundKit {
  let muted = true;
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;

  const ensureContext = (): AudioContext | null => {
    if (typeof window === "undefined") return null;
    try {
      if (!context) {
        context = new window.AudioContext();
        master = context.createGain();
        master.gain.value = 0.55;
        master.connect(context.destination);
        const length = Math.floor(context.sampleRate * 0.5);
        noiseBuffer = context.createBuffer(1, length, context.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        let noiseState = 0x51f15eed;
        for (let index = 0; index < data.length; index += 1) {
          noiseState = (Math.imul(noiseState, 1664525) + 1013904223) >>> 0;
          data[index] = noiseState / 2147483648 - 1;
        }
      }
      if (context.state === "suspended") void context.resume();
      return context;
    } catch {
      return null;
    }
  };

  const playTone = (options: ToneOptions): void => {
    const audio = ensureContext();
    if (!audio || !master) return;
    try {
      const start = audio.currentTime + (options.delay ?? 0);
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = options.type ?? "square";
      oscillator.frequency.setValueAtTime(options.frequency, start);
      if (options.toFrequency) {
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.toFrequency), start + options.duration);
      }
      const volume = options.volume ?? 0.12;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start);
      oscillator.stop(start + options.duration + 0.02);
    } catch {
      // Audio is decoration. A blocked or exhausted context must never break the show.
    }
  };

  const playNoise = (delay: number, volume: number): void => {
    const audio = ensureContext();
    if (!audio || !master || !noiseBuffer) return;
    try {
      const start = audio.currentTime + delay;
      const source = audio.createBufferSource();
      const gain = audio.createGain();
      const filter = audio.createBiquadFilter();
      source.buffer = noiseBuffer;
      filter.type = "lowpass";
      filter.frequency.value = 1200;
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(start);
      source.stop(start + 0.22);
    } catch {
      // Audio is decoration. See playTone.
    }
  };

  const play = (name: SoundName): void => {
    if (muted) return;
    if (name === "tick") {
      playTone({ frequency: 660, duration: 0.025, volume: 0.06 });
      return;
    }
    if (name === "select") {
      playTone({ frequency: 520, duration: 0.06, volume: 0.09 });
      playTone({ frequency: 780, duration: 0.08, volume: 0.08, delay: 0.06 });
      return;
    }
    if (name === "hit") {
      playTone({ frequency: 190, toFrequency: 90, duration: 0.09, type: "square", volume: 0.12 });
      playNoise(0, 0.08);
      return;
    }
    if (name === "crit") {
      playTone({ frequency: 240, toFrequency: 70, duration: 0.16, type: "square", volume: 0.16 });
      playTone({ frequency: 1320, duration: 0.1, type: "square", volume: 0.08, delay: 0.03 });
      playNoise(0, 0.14);
      return;
    }
    if (name === "parry") {
      playTone({ frequency: 980, duration: 0.07, type: "square", volume: 0.1 });
      playTone({ frequency: 1460, duration: 0.12, type: "triangle", volume: 0.09, delay: 0.02 });
      return;
    }
    if (name === "ko") {
      playTone({ frequency: 320, toFrequency: 45, duration: 0.6, type: "sawtooth", volume: 0.18 });
      playNoise(0, 0.16);
      return;
    }
    if (name === "promotion") {
      const notes = [523, 659, 784, 1047];
      notes.forEach((frequency, index) => {
        playTone({ frequency, duration: 0.12, type: "square", volume: 0.09, delay: index * 0.11 });
      });
      return;
    }
    const weapon = WEAPON_TONES[name];
    if (weapon) weapon(playTone, playNoise);
  };

  return {
    play,
    setMuted(value: boolean) {
      muted = value;
      if (!value && typeof window !== "undefined") ensureContext();
    },
    isMuted() {
      return muted;
    },
    dispose() {
      try {
        if (context) void context.close();
      } catch {
        // Nothing to clean up if the context already went away.
      }
      context = null;
      master = null;
      noiseBuffer = null;
    },
  };
}
