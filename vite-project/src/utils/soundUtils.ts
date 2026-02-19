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
export const playClickSound = createPlayer('click13.mp3', 0.9)

// Dragging/panning the canvas
export const playGrabSound = createPlayer('click1.mp3', 0.75)
export const playReleaseSound = createPlayer('click1.mp3', 0.55)
export const playDragStartSound = createPlayer('click8.mp3', 0.8)

// Zooming feedback
export const playZoomSound = createPlayer('click5.mp3', 0.7)

// Bar chart wave animation
export const playMinimalistSound = createPlayer('dingdong1.mp3', 0.6)

// Optional whoosh used during fast pans
export const playWhooshSound = createPlayer('huhu1.mp3', 0.35)
// African sound for slider animation end
export const playAfricanSound = createPlayer('dingdong2.mp3', 0.9)

