// Web Audio API Ringtone and Ringback Synthesizer
// Lightweight, zero-dependency chimes and melodies

class RingtoneSynthesizer {
  constructor() {
    this.audioCtx = null;
    this.isPlaying = false;
    this.timer = null;
    this.activeNodes = [];
    this.volume = 1.0;
  }

  initContext() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  setVolume(vol) {
    this.volume = vol;
  }

  // Synthesize a single note with pluck/decay
  playNote(frequency, startTime, duration, type = 'sine', decay = 0.8) {
    if (!this.audioCtx) return;
    
    const osc = this.audioCtx.createOscillator();
    const gainNode = this.audioCtx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startTime);
    
    // Pluck envelope: rapid attack, smooth exponential decay
    gainNode.gain.setValueAtTime(0.001, startTime);
    gainNode.gain.linearRampToValueAtTime(this.volume * 0.3, startTime + 0.03);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration * decay);
    
    osc.connect(gainNode);
    gainNode.connect(this.audioCtx.destination);
    
    osc.start(startTime);
    osc.stop(startTime + duration);
    
    this.activeNodes.push(osc);
  }

  // Ringtone Presets
  playPreset(preset, time) {
    const now = time;
    switch (preset) {
      case 'marimba': {
        // High quality digital marimba melody (E5, G5, A5, E5, etc.)
        const notes = [659.25, 783.99, 880.00, 659.25, 783.99, 880.00, 987.77, 783.99];
        notes.forEach((freq, idx) => {
          this.playNote(freq, now + idx * 0.15, 0.25, 'triangle', 0.8);
        });
        break;
      }
      case 'whatsapp': {
        // Modern bell chimes (A5 -> E5 -> C5 -> E5)
        const melody = [880.00, 659.25, 523.25, 659.25];
        melody.forEach((freq, idx) => {
          this.playNote(freq, now + idx * 0.25, 0.4, 'sine', 0.9);
        });
        break;
      }
      case 'signal': {
        // High pitch bubble chimes (rising sine wave)
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          this.playNote(freq, now + idx * 0.12, 0.3, 'sine', 0.75);
        });
        break;
      }
      case 'telegram': {
        // Electronic sweet trill
        for (let i = 0; i < 6; i++) {
          const freq = i % 2 === 0 ? 880.00 : 987.77;
          this.playNote(freq, now + i * 0.08, 0.15, 'sine', 0.6);
        }
        break;
      }
      case 'bells': {
        // Clear double chimes
        this.playNote(587.33, now, 0.8, 'sine', 0.95);
        this.playNote(880.00, now + 0.1, 0.8, 'sine', 0.95);
        break;
      }
      case 'pulse': {
        // Classic retro digital ring
        this.playNote(1200, now, 0.1, 'square', 0.5);
        this.playNote(1200, now + 0.15, 0.1, 'square', 0.5);
        this.playNote(1200, now + 0.3, 0.3, 'square', 0.5);
        break;
      }
      case 'zen': {
        // Meditative low chime bowl
        this.playNote(220.00, now, 1.5, 'sine', 0.99);
        this.playNote(440.00, now + 0.2, 1.2, 'sine', 0.99);
        break;
      }
      case 'cyber': {
        // Arpeggiated tech sound
        const notes = [440, 554.37, 659.25, 880, 1108.73];
        notes.forEach((freq, idx) => {
          this.playNote(freq, now + idx * 0.06, 0.2, 'sawtooth', 0.7);
        });
        break;
      }
      case 'ringback': {
        // Outgoing Ringback (standard US/Europe: 440Hz + 480Hz dual-tone for 1.5s)
        if (!this.audioCtx) return;
        const osc1 = this.audioCtx.createOscillator();
        const osc2 = this.audioCtx.createOscillator();
        const gainNode = this.audioCtx.createGain();

        osc1.frequency.setValueAtTime(440, now);
        osc2.frequency.setValueAtTime(480, now);

        gainNode.gain.setValueAtTime(0.001, now);
        gainNode.gain.linearRampToValueAtTime(this.volume * 0.15, now + 0.05);
        gainNode.gain.setValueAtTime(this.volume * 0.15, now + 1.45);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 1.5);
        osc2.stop(now + 1.5);

        this.activeNodes.push(osc1, osc2);
        break;
      }
    }
  }

  // Play a preset ringtone or ringback in a loop
  play(preset, volume = 1.0) {
    this.stop();
    this.initContext();
    this.isPlaying = true;
    this.volume = volume;

    console.log(`[Ringtone Debug] Playing preset: ${preset} with volume: ${volume}`);

    const loopInterval = preset === 'ringback' ? 4000 : 2000;
    
    // Play immediately
    this.playPreset(preset, this.audioCtx.currentTime);

    // Loop
    this.timer = setInterval(() => {
      if (this.isPlaying && this.audioCtx) {
        this.playPreset(preset, this.audioCtx.currentTime);
      }
    }, loopInterval);
  }

  stop() {
    this.isPlaying = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    
    // Stop all active oscillators immediately
    this.activeNodes.forEach(node => {
      try {
        node.stop();
      } catch (e) {}
    });
    this.activeNodes = [];
  }
}

export const ringtoneSynth = new RingtoneSynthesizer();
