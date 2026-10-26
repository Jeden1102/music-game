import type { Ref } from 'vue'
import type { Room } from '#shared/types/room'
import { isValidRoomCode } from '#shared/utils/room'

interface UseRoomSocketOptions {
  code: Ref<string>
  playerId: Ref<string | null>
  onRoom: (room: Room) => void
}

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000]
const HEARTBEAT_INTERVAL_MS = 25_000

export function useRoomSocket(options: UseRoomSocketOptions) {
  const isConnected = ref(false)
  const isConnecting = ref(false)

  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let reconnectAttempt = 0
  let disposed = false
  let connectionKey = ''

  function clearReconnectTimer() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function clearHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  function startHeartbeat() {
    clearHeartbeat()
    heartbeatTimer = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send('ping')
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  function buildSocketUrl(code: string, playerId: string | null) {
    const url = new URL('/ws', window.location.origin)

    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.searchParams.set('room', code)

    if (playerId) {
      url.searchParams.set('playerId', playerId)
    }

    return url.toString()
  }

  function closeSocket() {
    clearReconnectTimer()
    clearHeartbeat()

    if (!socket) {
      return
    }

    const current = socket
    socket = null
    isConnected.value = false
    isConnecting.value = false

    try {
      current.close(1000, 'CLIENT_RECONNECT')
    } catch {
      // The browser may already have torn down the socket.
    }
  }

  function scheduleReconnect() {
    if (disposed) {
      return
    }

    clearReconnectTimer()
    const delay = RECONNECT_DELAYS[Math.min(
      reconnectAttempt,
      RECONNECT_DELAYS.length - 1
    )]!
    reconnectAttempt += 1
    reconnectTimer = setTimeout(connect, delay)
  }

  function connect() {
    if (!import.meta.client || disposed) {
      return
    }

    const code = options.code.value
    const playerId = options.playerId.value

    if (!isValidRoomCode(code)) {
      return
    }

    const nextKey = `${code}:${playerId ?? ''}`

    if (
      socket
      && connectionKey === nextKey
      && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
    ) {
      return
    }

    closeSocket()
    connectionKey = nextKey
    isConnecting.value = true

    let current: WebSocket

    try {
      current = new WebSocket(buildSocketUrl(code, playerId))
    } catch {
      isConnecting.value = false
      scheduleReconnect()
      return
    }

    socket = current

    current.addEventListener('open', () => {
      if (socket !== current) {
        return
      }

      isConnected.value = true
      isConnecting.value = false
      reconnectAttempt = 0
      startHeartbeat()
    })

    current.addEventListener('message', (event) => {
      if (socket !== current || typeof event.data !== 'string') {
        return
      }

      try {
        const message = JSON.parse(event.data) as {
          type?: string
          room?: Room
        }

        if (message.type === 'room' && message.room) {
          options.onRoom(message.room)
        }
      } catch {
        // Ignore malformed frames; the next authoritative state will replace them.
      }
    })

    current.addEventListener('close', (event) => {
      if (socket !== current) {
        return
      }

      socket = null
      isConnected.value = false
      isConnecting.value = false
      clearHeartbeat()

      if (event.code === 4400 || event.code === 4404) {
        return
      }

      scheduleReconnect()
    })

    current.addEventListener('error', () => {
      if (socket === current) {
        isConnected.value = false
      }
    })
  }

  function requestSync() {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send('sync')
      return
    }

    connect()
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      requestSync()
    }
  }

  watch(
    () => [options.code.value, options.playerId.value].join(':'),
    () => {
      reconnectAttempt = 0
      connect()
    }
  )

  onMounted(() => {
    connect()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', requestSync)
  })

  onBeforeUnmount(() => {
    disposed = true
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('online', requestSync)
    closeSocket()
  })

  return {
    isConnected,
    isConnecting,
    requestSync
  }
}
