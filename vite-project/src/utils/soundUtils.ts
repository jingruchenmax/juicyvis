// Simple sound utilities using Web Audio API
// Create single persistent audio context
let audioContext: AudioContext | null = null

const getAudioContext = (): AudioContext | null => {
  if (audioContext) return audioContext
  
  try {
    const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextConstructor) return null
    
    audioContext = new AudioContextConstructor()
    
    // Resume context if suspended (required by browser autoplay policy)
    if (audioContext.state === 'suspended') {
      document.addEventListener('click', () => {
        if (audioContext && audioContext.state === 'suspended') {
          audioContext.resume().catch(err => console.debug('Audio context resume failed:', err))
        }
      }, { once: true })
    }
    
    return audioContext
  } catch (e) {
    return null
  }
}

export const playHoverSound = () => {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    
    const now = ctx.currentTime
    
    // Brief beep - 800Hz for 80ms
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    
    osc.connect(gain)
    gain.connect(ctx.destination)
    
    osc.frequency.value = 800
    gain.gain.setValueAtTime(0.1, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08)
    
    osc.start(now)
    osc.stop(now + 0.08)
  } catch (e) {
    console.debug('Hover sound error:', e)
  }
}

export const playClickSound = () => {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    
    const now = ctx.currentTime
    
    // Two-tone click - starts at 600Hz, drops to 400Hz
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    
    osc.connect(gain)
    gain.connect(ctx.destination)
    
    osc.frequency.setValueAtTime(600, now)
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.1)
    gain.gain.setValueAtTime(0.15, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1)
    
    osc.start(now)
    osc.stop(now + 0.1)
  } catch (e) {
    console.debug('Click sound error:', e)
  }
}

export const playGrabSound = () => {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    
    const now = ctx.currentTime
    
    // Grab sound - upward sweep from 400Hz to 600Hz, short duration
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    
    osc.connect(gain)
    gain.connect(ctx.destination)
    
    osc.frequency.setValueAtTime(400, now)
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.12)
    gain.gain.setValueAtTime(0.12, now)
    gain.gain.exponentialRampToValueAtTime(0.02, now + 0.12)
    
    osc.start(now)
    osc.stop(now + 0.12)
  } catch (e) {
    console.debug('Grab sound error:', e)
  }
}

export const playReleaseSound = () => {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    
    const now = ctx.currentTime
    
    // Release sound - downward sweep from 600Hz to 400Hz, short duration
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    
    osc.connect(gain)
    gain.connect(ctx.destination)
    
    osc.frequency.setValueAtTime(600, now)
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.1)
    gain.gain.setValueAtTime(0.1, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1)
    
    osc.start(now)
    osc.stop(now + 0.1)
  } catch (e) {
    console.debug('Release sound error:', e)
  }
}

export const playZoomSound = () => {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    
    const now = ctx.currentTime
    
    // Zoom sound - ascending two-tone
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    
    osc.connect(gain)
    gain.connect(ctx.destination)
    
    osc.frequency.setValueAtTime(300, now)
    osc.frequency.exponentialRampToValueAtTime(700, now + 0.15)
    gain.gain.setValueAtTime(0.08, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15)
    
    osc.start(now)
    osc.stop(now + 0.15)
  } catch (e) {
    console.debug('Zoom sound error:', e)
  }
}

export const playWhooshSound = () => {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    
    const now = ctx.currentTime
    
    // Whoosh effect - fast sweep from 800Hz down to 200Hz
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    
    osc.connect(gain)
    gain.connect(ctx.destination)
    
    osc.frequency.setValueAtTime(800, now)
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.25)
    gain.gain.setValueAtTime(0.08, now)
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25)
    
    osc.start(now)
    osc.stop(now + 0.25)
  } catch (e) {
    console.debug('Whoosh sound error:', e)
  }
}

