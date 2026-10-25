// Lightweight native Web Audio API sound synthesizer
// Zero external files, zero latency, toggleable
class SoundEffects {
  constructor() {
    this.ctx = null
    this.enabled = typeof window !== 'undefined' && localStorage.getItem('civicSound') !== 'false'
  }

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (AudioCtx) {
        this.ctx = new AudioCtx()
      }
    }
  }

  playBeep(freq = 600, duration = 0.04, type = 'sine', volume = 0.035) {
    if (!this.enabled) return
    try {
      this.init()
      if (!this.ctx) return
      if (this.ctx.state === 'suspended') {
        this.ctx.resume()
      }
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime)
      gain.gain.setValueAtTime(volume, this.ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration)
      osc.connect(gain)
      gain.connect(this.ctx.destination)
      osc.start()
      osc.stop(this.ctx.currentTime + duration)
    } catch {
      // AudioContext policy suppression gracefully handled
    }
  }

  click() {
    this.playBeep(750, 0.025, 'sine', 0.03)
  }

  pop() {
    this.playBeep(920, 0.035, 'triangle', 0.04)
  }

  success() {
    this.playBeep(620, 0.04, 'sine', 0.04)
    setTimeout(() => this.playBeep(980, 0.07, 'sine', 0.04), 50)
  }

  alert() {
    this.playBeep(380, 0.08, 'sawtooth', 0.03)
  }

  toggle() {
    this.enabled = !this.enabled
    if (typeof window !== 'undefined') {
      localStorage.setItem('civicSound', String(this.enabled))
    }
    if (this.enabled) this.click()
    return this.enabled
  }

  isEnabled() {
    return this.enabled
  }
}

export const sound = new SoundEffects()
