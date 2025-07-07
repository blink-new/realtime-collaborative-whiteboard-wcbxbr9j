import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trash2, Palette, Users } from 'lucide-react'
import blink from '@/blink/client'
import { DrawingEvent, User, RealtimeChannel, RealtimeMessage, PresenceUser } from '@/types/whiteboard'
import { toast } from 'react-hot-toast'

const USER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
]

export default function Whiteboard() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [onlineUsers, setOnlineUsers] = useState<User[]>([])
  const [cursors, setCursors] = useState<Map<string, { x: number; y: number }>>(new Map())
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 })

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      })
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Initialize user and realtime connection
  useEffect(() => {
    const initializeUser = async () => {
      try {
        const user = await blink.auth.me()
        const userColor = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]
        
        const newUser: User = {
          id: user.id,
          name: user.email?.split('@')[0] || 'Anonymous',
          color: userColor
        }
        
        setCurrentUser(newUser)
        
        // Initialize realtime channel
        const whiteboardChannel = blink.realtime.channel('whiteboard-room') as RealtimeChannel
        setChannel(whiteboardChannel)
        
        // Subscribe to channel
        await whiteboardChannel.subscribe({
          userId: user.id,
          metadata: { 
            displayName: newUser.name,
            color: userColor
          }
        })

        // Listen for drawing events
        whiteboardChannel.onMessage((message: RealtimeMessage) => {
          if (message.type === 'draw') {
            drawOnCanvas(message.data)
          } else if (message.type === 'cursor') {
            setCursors(prev => new Map(prev.set(message.userId, { x: message.data.x, y: message.data.y })))
          } else if (message.type === 'clear') {
            clearCanvas()
          }
        })

        // Listen for presence changes
        whiteboardChannel.onPresence((users: PresenceUser[]) => {
          const mappedUsers = users.map(u => ({
            id: u.userId,
            name: u.metadata?.displayName || 'Anonymous',
            color: u.metadata?.color || USER_COLORS[0]
          }))
          setOnlineUsers(mappedUsers)
        })

        toast.success('Connected to whiteboard!')
      } catch (error) {
        console.error('Failed to initialize:', error)
        toast.error('Failed to connect to whiteboard')
      }
    }

    initializeUser()
  }, [])

  // Canvas drawing functions
  const drawOnCanvas = (event: DrawingEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.strokeStyle = event.color
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (event.prevX !== undefined && event.prevY !== undefined) {
      ctx.beginPath()
      ctx.moveTo(event.prevX, event.prevY)
      ctx.lineTo(event.x, event.y)
      ctx.stroke()
    }
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  // Drawing event handlers
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true)
    const { x, y } = getCoordinates(e)
    
    const event: DrawingEvent = {
      type: 'draw',
      x,
      y,
      color: currentUser?.color || '#000000',
      timestamp: Date.now(),
      userId: currentUser?.id || 'anonymous'
    }
    
    drawOnCanvas(event)
    
    if (channel) {
      channel.publish('draw', event)
    }
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return

    const { x, y } = getCoordinates(e)
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const prevX = e.type.includes('mouse') ? 
      (e as React.MouseEvent).clientX - rect.left :
      (e as React.TouchEvent).touches[0].clientX - rect.left
    const prevY = e.type.includes('mouse') ? 
      (e as React.MouseEvent).clientY - rect.top :
      (e as React.TouchEvent).touches[0].clientY - rect.top

    const event: DrawingEvent = {
      type: 'draw',
      x,
      y,
      prevX,
      prevY,
      color: currentUser?.color || '#000000',
      timestamp: Date.now(),
      userId: currentUser?.id || 'anonymous'
    }
    
    drawOnCanvas(event)
    
    if (channel) {
      channel.publish('draw', event)
    }
  }

  const stopDrawing = () => {
    setIsDrawing(false)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!channel || !currentUser) return

    const { x, y } = getCoordinates(e)
    
    channel.publish('cursor', {
      x,
      y,
      userId: currentUser.id
    })
  }

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    const clientX = e.type.includes('mouse') ? 
      (e as React.MouseEvent).clientX :
      (e as React.TouchEvent).touches[0].clientX
    const clientY = e.type.includes('mouse') ? 
      (e as React.MouseEvent).clientY :
      (e as React.TouchEvent).touches[0].clientY

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    }
  }

  const handleClear = () => {
    clearCanvas()
    if (channel) {
      channel.publish('clear', {})
    }
    toast.success('Whiteboard cleared!')
  }

  // Calculate canvas size based on window size
  const canvasWidth = Math.min(windowSize.width - 40, 1200)
  const canvasHeight = Math.min(windowSize.height - 200, 800)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Collaborative Whiteboard</h1>
              <p className="text-gray-600 mt-1">Draw together in real-time</p>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">
                  {onlineUsers.length} online
                </span>
              </div>
              <Button
                onClick={handleClear}
                variant="destructive"
                size="sm"
                className="flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Clear
              </Button>
            </div>
          </div>

          {/* Online Users */}
          <div className="flex flex-wrap gap-2 mt-4">
            {onlineUsers.map((user) => (
              <Badge
                key={user.id}
                variant="outline"
                className="flex items-center gap-2 px-3 py-1"
                style={{ borderColor: user.color }}
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: user.color }}
                />
                <span className="text-sm">{user.name}</span>
              </Badge>
            ))}
          </div>
        </div>

        {/* Whiteboard */}
        <Card className="relative overflow-hidden shadow-lg">
          <div className="relative">
            <canvas
              ref={canvasRef}
              width={canvasWidth}
              height={canvasHeight}
              className="block bg-white cursor-crosshair touch-none"
              onMouseDown={startDrawing}
              onMouseMove={(e) => {
                draw(e)
                handleMouseMove(e)
              }}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />

            {/* Cursor indicators */}
            {Array.from(cursors.entries()).map(([userId, cursor]) => {
              const user = onlineUsers.find(u => u.id === userId)
              if (!user || userId === currentUser?.id) return null

              return (
                <div
                  key={userId}
                  className="absolute pointer-events-none z-10"
                  style={{
                    left: cursor.x - 6,
                    top: cursor.y - 6,
                    transform: 'translate(-50%, -50%)'
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full border-2 border-white shadow-lg"
                    style={{ backgroundColor: user.color }}
                  />
                  <div
                    className="absolute top-5 left-1/2 transform -translate-x-1/2 bg-black text-white text-xs px-2 py-1 rounded whitespace-nowrap"
                    style={{ backgroundColor: user.color }}
                  >
                    {user.name}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Instructions */}
        <div className="mt-6 text-center text-sm text-gray-600">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Palette className="w-4 h-4" />
            <span>Your drawing color: </span>
            <div
              className="w-4 h-4 rounded-full border border-gray-300"
              style={{ backgroundColor: currentUser?.color }}
            />
          </div>
          <p>Click and drag to draw • Touch and drag on mobile • Share this page to collaborate</p>
        </div>
      </div>
    </div>
  )
}