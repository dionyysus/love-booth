export type Screen = 'landing' | 'choose' | 'waiting' | 'session' | 'result'

export type ParticipantRole = 'host' | 'guest'

export type PhotoSet = {
  role: ParticipantRole
  photos: string[] // Data URLs of 4 photos
  timestamp: number
}

export type SessionData = {
  code: string
  hostJoined: boolean
  guestJoined: boolean
  hostReady: boolean
  guestReady: boolean
  countdown: number | null
  currentShot: number
  status: 'waiting' | 'ready' | 'capturing' | 'complete'
  createdAt: number
  lastUpdate: number
}

export type AppSession = {
  screen: Screen
  role: ParticipantRole | null
  sessionCode: string | null
  localPhotos: string[]
  partnerPhotos: string[]
}

export const initialAppSession: AppSession = {
  screen: 'landing',
  role: null,
  sessionCode: null,
  localPhotos: [],
  partnerPhotos: [],
}
