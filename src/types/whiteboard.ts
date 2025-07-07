export interface DrawingEvent {
  type: 'draw' | 'cursor' | 'clear'
  x: number
  y: number
  prevX?: number
  prevY?: number
  color: string
  timestamp: number
  userId: string
}

export interface User {
  id: string
  name: string
  color: string
  cursor?: { x: number; y: number }
}

export interface RealtimeMessage {
  id: string
  type: string
  data: DrawingEvent | { x: number; y: number; userId: string } | Record<string, unknown>
  timestamp: number
  userId: string
  metadata?: {
    displayName?: string
    color?: string
  }
}

export interface PresenceUser {
  userId: string
  metadata?: {
    displayName?: string
    color?: string
  }
  joinedAt: number
  lastSeen: number
}

export interface RealtimeChannel {
  subscribe: (options: { userId: string; metadata?: { displayName?: string; color?: string } }) => Promise<void>
  publish: (type: string, data: DrawingEvent | { x: number; y: number; userId: string } | Record<string, unknown>, options?: { userId?: string; metadata?: { displayName?: string; color?: string } }) => Promise<void>
  onMessage: (callback: (message: RealtimeMessage) => void) => void
  onPresence: (callback: (users: PresenceUser[]) => void) => void
  unsubscribe: () => Promise<void>
}