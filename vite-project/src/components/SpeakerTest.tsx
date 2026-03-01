import { useCallback, useEffect, useRef, useState } from 'react'
import './SpeakerTest.css'

type MessageMode = 'idle' | 'playing' | 'retry'

const PLAYING_MESSAGE = 'Playing audio. Please make sure your speakers are on. You should hear a few numbers.'
const RETRY_MESSAGE = "Audio couldn't start. Please click again to play."
const FADE_OUT_MS = 300

export default function SpeakerTest() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [messageMode, setMessageMode] = useState<MessageMode>('idle')
  const [fadeOut, setFadeOut] = useState(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fadeTimeoutRef = useRef<number | null>(null)
  const mountedRef = useRef(true)

  const clearFadeTimeout = useCallback(() => {
    if (fadeTimeoutRef.current !== null) {
      window.clearTimeout(fadeTimeoutRef.current)
      fadeTimeoutRef.current = null
    }
  }, [])

  const handleEnded = useCallback(() => {
    if (!mountedRef.current) return
    clearFadeTimeout()
    setIsPlaying(false)
    setFadeOut(true)
    fadeTimeoutRef.current = window.setTimeout(() => {
      fadeTimeoutRef.current = null
      if (!mountedRef.current) return
      setMessageMode('idle')
      setFadeOut(false)
    }, FADE_OUT_MS)
  }, [clearFadeTimeout])

  const handleError = useCallback(() => {
    if (!mountedRef.current) return
    clearFadeTimeout()
    setIsPlaying(false)
    setMessageMode('retry')
    setFadeOut(false)
  }, [clearFadeTimeout])

  const ensureAudio = useCallback((): HTMLAudioElement => {
    if (audioRef.current) return audioRef.current
    const audio = new Audio(`${import.meta.env.BASE_URL}code3179.mp3`)
    audio.preload = 'auto'
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)
    audioRef.current = audio
    return audio
  }, [handleEnded, handleError])

  const handlePlayClick = useCallback(() => {
    if (isPlaying) return
    clearFadeTimeout()
    setIsPlaying(true)
    setMessageMode('playing')
    setFadeOut(false)

    const audio = ensureAudio()
    audio.currentTime = 0

    try {
      const playResult = audio.play()
      if (playResult && typeof playResult.then === 'function') {
        playResult.catch(() => {
          if (!mountedRef.current) return
          setIsPlaying(false)
          setMessageMode('retry')
          setFadeOut(false)
        })
      }
    } catch {
      if (!mountedRef.current) return
      setIsPlaying(false)
      setMessageMode('retry')
      setFadeOut(false)
    }
  }, [clearFadeTimeout, ensureAudio, isPlaying])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearFadeTimeout()
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        audio.removeEventListener('ended', handleEnded)
        audio.removeEventListener('error', handleError)
      }
    }
  }, [clearFadeTimeout, handleEnded, handleError])

  const messageText = messageMode === 'playing' ? PLAYING_MESSAGE : messageMode === 'retry' ? RETRY_MESSAGE : ''

  return (
    <div className="speaker-test-root">
      <div className="speaker-test-panel">
        {messageMode !== 'idle' && (
          <p
            className={`speaker-test-message speaker-test-message-${messageMode} ${fadeOut ? 'speaker-test-message-fade-out' : ''}`.trim()}
            aria-live="polite"
          >
            {messageText}
          </p>
        )}
        <button
          type="button"
          className={`speaker-test-button ${isPlaying ? 'is-playing' : ''}`.trim()}
          onClick={handlePlayClick}
          disabled={isPlaying}
        >
          Play Speaker Test Audio
        </button>
      </div>
    </div>
  )
}
