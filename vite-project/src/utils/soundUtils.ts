// Sound utilities backed by lightweight HTMLAudio elements
// Using files placed in /public so we can swap sounds without touching code

const basePath = (import.meta.env.BASE_URL || '/')

interface PlayerOptions {
  fadeInMs?: number
  fadeOutMs?: number
  maxDurationMs?: number
}

const createPlayer = (fileName: string, volume = 0.9, options?: PlayerOptions) => {
  const src = `${basePath}${fileName}`
  return () => {
    try {
      const audio = new Audio(src)
      const fadeInMs = options?.fadeInMs ?? 0
      const fadeOutMs = options?.fadeOutMs ?? 0
      const maxDurationMs = options?.maxDurationMs
      const targetVolume = Math.max(0, Math.min(1, volume))

      if (fadeInMs > 0) {
        audio.volume = 0
      } else {
        audio.volume = targetVolume
      }

      const playPromise = audio.play()
      if (playPromise !== undefined) {
        playPromise.catch(err => console.debug('Audio play blocked:', err))
      }

      if (fadeInMs > 0) {
        const startedAt = performance.now()
        const fadeInTick = () => {
          const progress = Math.min(1, (performance.now() - startedAt) / fadeInMs)
          audio.volume = targetVolume * progress
          if (progress < 1 && !audio.paused) {
            window.setTimeout(fadeInTick, 16)
          }
        }
        window.setTimeout(fadeInTick, 16)
      }

      if (fadeOutMs > 0) {
        const stopAtMs =
          maxDurationMs !== undefined ? maxDurationMs : Math.max(fadeOutMs + 120, 480)
        const fadeOutStartMs = Math.max(0, stopAtMs - fadeOutMs)
        window.setTimeout(() => {
          const startVolume = audio.volume
          const fadeStart = performance.now()
          const fadeOutTick = () => {
            const progress = Math.min(1, (performance.now() - fadeStart) / fadeOutMs)
            audio.volume = startVolume * (1 - progress)
            if (progress < 1 && !audio.paused) {
              window.setTimeout(fadeOutTick, 16)
            } else {
              audio.pause()
              audio.currentTime = 0
            }
          }
          fadeOutTick()
        }, fadeOutStartMs)
      } else if (maxDurationMs !== undefined) {
        window.setTimeout(() => {
          audio.pause()
          audio.currentTime = 0
        }, maxDurationMs)
      }
    } catch (e) {
      console.debug('Audio error:', e)
    }
  }
}

// Hover remains a subtle cue
export const playHoverSound = createPlayer('hover.mp3', 0.5)
export const playPreviewCueSound = createPlayer('hover.mp3', 0.24, {
  fadeOutMs: 90,
  maxDurationMs: 160
})

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

// Optional transition cue used during representation switches
export const playWhooshSound = createPlayer('folding2.mp3', 0.22, {
  fadeInMs: 24,
  fadeOutMs: 120,
  maxDurationMs: 420
})

// Soft confirmation cue for color encoding changes
export const playColorConfirmSound = createPlayer('click8.mp3', 0.24, {
  fadeOutMs: 80,
  maxDurationMs: 200
})
// African sound for slider animation end
export const playAfricanSound = createPlayer('dingdong2.mp3', 0.9)

// Timeline year selection confirmation
export const playDingdong4Sound = createPlayer('dingdong4.mp3', 0.9)

