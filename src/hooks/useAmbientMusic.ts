import { useEffect, useRef, useState, useCallback } from 'react'

export function useAmbientMusic() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  // Initialize audio on first interaction
  const initAudio = useCallback(() => {
    if (!audioRef.current) {
      const audio = new Audio('/calmmusic.mp3')
      audio.loop = true
      audio.volume = 0.3
      audioRef.current = audio
    }
    return audioRef.current
  }, [])

  const play = useCallback(() => {
    const audio = initAudio()
    audio.play().then(() => {
      setIsPlaying(true)
    }).catch((err) => {
      console.log('Audio play failed:', err)
    })
  }, [initAudio])

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
    }
  }, [])

  const toggle = useCallback(() => {
    if (isPlaying) {
      pause()
    } else {
      play()
    }
  }, [isPlaying, play, pause])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  return {
    isPlaying,
    play,
    pause,
    toggle,
  }
}
