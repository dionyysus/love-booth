import { useState, useEffect, useRef, useCallback } from 'react'

export type CameraStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable'

const MAX_RETRIES = 3
const RETRY_DELAY = 500

export function useCamera() {
  const [status, setStatus] = useState<CameraStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const retryCountRef = useRef(0)
  const mountedRef = useRef(true)

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      setStream(null)
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const startCamera = useCallback(async () => {
    // Reset retry count on manual start
    retryCountRef.current = 0

    const attemptStart = async (): Promise<void> => {
      if (!mountedRef.current) return

      setStatus('requesting')
      setError(null)

      // Stop any existing stream first
      stopCamera()

      // Small delay to let previous stream fully release
      await new Promise(resolve => setTimeout(resolve, 100))

      if (!mountedRef.current) return

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 1706 },
          },
          audio: false,
        })

        if (!mountedRef.current) {
          // Component unmounted during request, clean up
          stream.getTracks().forEach(track => track.stop())
          return
        }

        streamRef.current = stream
        setStream(stream)

        if (videoRef.current) {
          videoRef.current.srcObject = stream

          // Wait for video to be ready
          await new Promise<void>((resolve, reject) => {
            const video = videoRef.current!

            const handleCanPlay = () => {
              video.removeEventListener('canplay', handleCanPlay)
              video.removeEventListener('error', handleError)
              resolve()
            }

            const handleError = () => {
              video.removeEventListener('canplay', handleCanPlay)
              video.removeEventListener('error', handleError)
              reject(new Error('Video failed to load'))
            }

            video.addEventListener('canplay', handleCanPlay)
            video.addEventListener('error', handleError)

            video.play().catch(reject)
          })
        }

        if (mountedRef.current) {
          setStatus('active')
          retryCountRef.current = 0
        }
      } catch (err) {
        if (!mountedRef.current) return

        const error = err as Error

        // Handle abort errors with retry
        if (error.name === 'AbortError' || error.message.includes('aborted')) {
          if (retryCountRef.current < MAX_RETRIES) {
            retryCountRef.current++
            console.log(`Camera start aborted, retrying (${retryCountRef.current}/${MAX_RETRIES})...`)
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
            if (mountedRef.current) {
              return attemptStart()
            }
            return
          }
          setStatus('unavailable')
          setError('Camera connection was interrupted. Please refresh the page and try again, or use the upload option.')
          return
        }

        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          setStatus('denied')
          setError('Camera access was denied. Please allow camera access in your browser settings, or use the upload option.')
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          setStatus('unavailable')
          setError('No camera found. Please connect a camera or use the upload option.')
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          setStatus('unavailable')
          setError('Camera is in use by another application. Please close other apps using the camera, or use the upload option.')
        } else if (error.name === 'OverconstrainedError') {
          // Try again with less strict constraints
          if (retryCountRef.current < MAX_RETRIES) {
            retryCountRef.current++
            try {
              const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false,
              })

              if (!mountedRef.current) {
                stream.getTracks().forEach(track => track.stop())
                return
              }

              streamRef.current = stream
              setStream(stream)
              if (videoRef.current) {
                videoRef.current.srcObject = stream
                await videoRef.current.play()
              }
              setStatus('active')
              return
            } catch {
              // Fall through to generic error
            }
          }
          setStatus('unavailable')
          setError('Camera does not support the required settings. Please try a different camera or use the upload option.')
        } else {
          setStatus('unavailable')
          setError('Could not access camera. Please refresh and try again, or use the upload option.')
        }
      }
    }

    await attemptStart()
  }, [stopCamera])

  const captureFrame = useCallback((): string | null => {
    if (!videoRef.current || status !== 'active') return null

    const video = videoRef.current
    const canvas = document.createElement('canvas')

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    return canvas.toDataURL('image/jpeg', 0.92)
  }, [status])

  // Track mounted state
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopCamera()
    }
  }, [stopCamera])

  return {
    videoRef,
    stream,
    status,
    error,
    startCamera,
    stopCamera,
    captureFrame,
  }
}
