// Sound utilities backed by lightweight HTMLAudio elements
// Using files placed in /public so we can swap sounds without touching code

const basePath = (import.meta.env.BASE_URL || '/')

const createPlayer = (fileName: string, volume = 0.9) => {
  const src = `${basePath}${fileName}`
  return () => {
    try {
      const audio = new Audio(src)
      audio.volume = volume
      const playPromise = audio.play()
      if (playPromise !== undefined) {
        playPromise.catch(err => console.debug('Audio play blocked:', err))
      }
    } catch (e) {
      console.debug('Audio error:', e)
    }
  }
}

// Hover remains a subtle cue
export const playHoverSound = createPlayer('hover.mp3', 0.5)

// Selection (country click)
export const playClickSound = createPlayer('Minimalist13.mp3', 0.9)

// Dragging/panning the canvas
export const playGrabSound = createPlayer('Minimalist1.mp3', 0.75)
export const playReleaseSound = createPlayer('Minimalist1.mp3', 0.55)
export const playDragStartSound = createPlayer('Minimalist8.mp3', 0.8)

// Zooming feedback
export const playZoomSound = createPlayer('Minimalist5.mp3', 0.7)

// Bar chart wave animation
export const playMinimalistSound = createPlayer('Coffee2.mp3', 0.6)

// Optional whoosh used during fast pans
export const playWhooshSound = createPlayer('dragon-studio-simple-whoosh-03-433005.mp3', 0.35)

