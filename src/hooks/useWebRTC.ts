import { useEffect, useRef, useState, useCallback } from 'react'
import { ref, onValue, set, remove, onChildAdded } from 'firebase/database'
import { database } from '../lib/firebase'
import type { ParticipantRole } from '../types'

// Free STUN servers for NAT traversal
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
}

type WebRTCState = 'idle' | 'connecting' | 'connected' | 'failed'

export function useWebRTC(
  sessionCode: string | null,
  role: ParticipantRole | null,
  localStream: MediaStream | null,
  onPhotoReceived?: (photo: string, index: number) => void
) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [state, setState] = useState<WebRTCState>('idle')

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const hasCreatedOffer = useRef(false)
  const hasAnswered = useRef(false)
  const iceCandidatesQueue = useRef<RTCIceCandidate[]>([])
  const pendingPhotos = useRef<{ photo: string; index: number }[]>([])

  // Clean up function
  const cleanup = useCallback(() => {
    if (dataChannelRef.current) {
      dataChannelRef.current.close()
      dataChannelRef.current = null
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }
    remoteStreamRef.current = null
    setRemoteStream(null)
    setState('idle')
    hasCreatedOffer.current = false
    hasAnswered.current = false
    iceCandidatesQueue.current = []
    pendingPhotos.current = []
  }, [])

  // Send a single photo through the data channel with chunking for large messages
  const sendPhotoData = useCallback((channel: RTCDataChannel, photo: string, index: number) => {
    const message = JSON.stringify({ type: 'photo', photo, index })
    const CHUNK_SIZE = 16000 // Safe chunk size for WebRTC

    if (message.length <= CHUNK_SIZE) {
      channel.send(message)
    } else {
      // Send in chunks
      const chunks = Math.ceil(message.length / CHUNK_SIZE)
      const messageId = Date.now()

      for (let i = 0; i < chunks; i++) {
        const chunk = message.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
        channel.send(JSON.stringify({
          type: 'chunk',
          messageId,
          chunkIndex: i,
          totalChunks: chunks,
          data: chunk,
        }))
      }
    }
  }, [])

  // Reassemble chunked messages
  const chunkedMessages = useRef<Map<number, { chunks: string[]; received: number; total: number }>>(new Map())

  // Handle incoming data channel messages
  const setupDataChannel = useCallback((channel: RTCDataChannel) => {
    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'chunk') {
          // Handle chunked message
          const { messageId, chunkIndex, totalChunks, data: chunkData } = data

          if (!chunkedMessages.current.has(messageId)) {
            chunkedMessages.current.set(messageId, {
              chunks: new Array(totalChunks).fill(''),
              received: 0,
              total: totalChunks,
            })
          }

          const msg = chunkedMessages.current.get(messageId)!
          msg.chunks[chunkIndex] = chunkData
          msg.received++

          if (msg.received === msg.total) {
            // All chunks received, reassemble
            const fullMessage = msg.chunks.join('')
            chunkedMessages.current.delete(messageId)

            try {
              const parsed = JSON.parse(fullMessage)
              if (parsed.type === 'photo' && onPhotoReceived) {
                onPhotoReceived(parsed.photo, parsed.index)
              }
            } catch (err) {
              console.error('Error parsing reassembled message:', err)
            }
          }
        } else if (data.type === 'photo' && onPhotoReceived) {
          onPhotoReceived(data.photo, data.index)
        }
      } catch (err) {
        console.error('Error parsing data channel message:', err)
      }
    }
    channel.onopen = () => {
      console.log('Data channel opened')
      // Send any pending photos
      while (pendingPhotos.current.length > 0) {
        const pending = pendingPhotos.current.shift()!
        sendPhotoData(channel, pending.photo, pending.index)
      }
    }
    channel.onclose = () => {
      console.log('Data channel closed')
    }
    channel.onerror = (err) => {
      console.error('Data channel error:', err)
    }
    dataChannelRef.current = channel
  }, [onPhotoReceived, sendPhotoData])

  // Create peer connection
  const createPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) return peerConnectionRef.current

    const pc = new RTCPeerConnection(ICE_SERVERS)

    // Create remote stream container
    remoteStreamRef.current = new MediaStream()
    setRemoteStream(remoteStreamRef.current)

    // Host creates the data channel
    if (role === 'host') {
      const channel = pc.createDataChannel('photos')
      setupDataChannel(channel)
    }

    // Guest receives the data channel
    pc.ondatachannel = (event) => {
      setupDataChannel(event.channel)
    }

    // Handle incoming tracks
    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStreamRef.current?.addTrack(track)
      })
      if (remoteStreamRef.current) {
        setRemoteStream(new MediaStream(remoteStreamRef.current.getTracks()))
      }
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && sessionCode && role) {
        const candidateKey = role === 'host' ? 'hostCandidates' : 'guestCandidates'
        const candidateRef = ref(database, `sessions/${sessionCode}/webrtc/${candidateKey}/${Date.now()}`)
        set(candidateRef, event.candidate.toJSON())
      }
    }

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setState('connected')
      } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        setState('failed')
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setState('connected')
      } else if (pc.connectionState === 'failed') {
        setState('failed')
      }
    }

    peerConnectionRef.current = pc
    return pc
  }, [sessionCode, role, setupDataChannel])

  // Add local stream to peer connection
  useEffect(() => {
    if (!localStream || !peerConnectionRef.current) return

    const pc = peerConnectionRef.current
    const senders = pc.getSenders()

    // Add tracks if not already added
    localStream.getTracks().forEach((track) => {
      const existingSender = senders.find(s => s.track?.kind === track.kind)
      if (!existingSender) {
        pc.addTrack(track, localStream)
      }
    })
  }, [localStream])

  // Main WebRTC logic
  useEffect(() => {
    if (!sessionCode || !role || !localStream) return
    if (sessionCode === 'solo') return

    setState('connecting')
    const pc = createPeerConnection()

    // Add local tracks
    localStream.getTracks().forEach((track) => {
      const senders = pc.getSenders()
      const existingSender = senders.find(s => s.track?.kind === track.kind)
      if (!existingSender) {
        pc.addTrack(track, localStream)
      }
    })

    // Host: Create and send offer
    if (role === 'host' && !hasCreatedOffer.current) {
      hasCreatedOffer.current = true

      const createOffer = async () => {
        try {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)

          await set(ref(database, `sessions/${sessionCode}/webrtc/offer`), {
            type: offer.type,
            sdp: offer.sdp,
          })
        } catch (err) {
          console.error('Error creating offer:', err)
          setState('failed')
        }
      }

      createOffer()
    }

    // Guest: Listen for offer and create answer
    if (role === 'guest') {
      const offerRef = ref(database, `sessions/${sessionCode}/webrtc/offer`)

      const unsubscribeOffer = onValue(offerRef, async (snapshot) => {
        if (!snapshot.exists() || hasAnswered.current) return

        const offer = snapshot.val()
        if (!offer || !offer.sdp) return

        hasAnswered.current = true

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer))

          // Process queued ICE candidates
          for (const candidate of iceCandidatesQueue.current) {
            await pc.addIceCandidate(candidate)
          }
          iceCandidatesQueue.current = []

          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)

          await set(ref(database, `sessions/${sessionCode}/webrtc/answer`), {
            type: answer.type,
            sdp: answer.sdp,
          })
        } catch (err) {
          console.error('Error answering:', err)
          setState('failed')
        }
      })

      return () => {
        unsubscribeOffer()
      }
    }

    // Host: Listen for answer
    if (role === 'host') {
      const answerRef = ref(database, `sessions/${sessionCode}/webrtc/answer`)

      const unsubscribeAnswer = onValue(answerRef, async (snapshot) => {
        if (!snapshot.exists()) return

        const answer = snapshot.val()
        if (!answer || !answer.sdp) return
        if (pc.currentRemoteDescription) return

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer))

          // Process queued ICE candidates
          for (const candidate of iceCandidatesQueue.current) {
            await pc.addIceCandidate(candidate)
          }
          iceCandidatesQueue.current = []
        } catch (err) {
          console.error('Error setting answer:', err)
        }
      })

      return () => {
        unsubscribeAnswer()
      }
    }
  }, [sessionCode, role, localStream, createPeerConnection])

  // Listen for ICE candidates from partner
  useEffect(() => {
    if (!sessionCode || !role || sessionCode === 'solo') return

    const partnerCandidatesKey = role === 'host' ? 'guestCandidates' : 'hostCandidates'
    const candidatesRef = ref(database, `sessions/${sessionCode}/webrtc/${partnerCandidatesKey}`)

    const unsubscribe = onChildAdded(candidatesRef, async (snapshot) => {
      if (!snapshot.exists()) return

      const candidateData = snapshot.val()
      if (!candidateData) return

      const candidate = new RTCIceCandidate(candidateData)
      const pc = peerConnectionRef.current

      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(candidate)
        } catch (err) {
          console.error('Error adding ICE candidate:', err)
        }
      } else {
        // Queue candidate for later
        iceCandidatesQueue.current.push(candidate)
      }
    })

    return () => unsubscribe()
  }, [sessionCode, role])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()

      // Clean up WebRTC data from Firebase
      if (sessionCode && sessionCode !== 'solo') {
        remove(ref(database, `sessions/${sessionCode}/webrtc`))
      }
    }
  }, [sessionCode, cleanup])

  // Send photo through data channel (with queuing if not ready)
  const sendPhoto = useCallback((photo: string, index: number) => {
    const channel = dataChannelRef.current
    if (channel && channel.readyState === 'open') {
      sendPhotoData(channel, photo, index)
    } else {
      // Queue for later when channel opens
      console.log('Data channel not ready, queuing photo', index)
      pendingPhotos.current.push({ photo, index })
    }
  }, [sendPhotoData])

  return {
    remoteStream,
    state,
    cleanup,
    sendPhoto,
  }
}
