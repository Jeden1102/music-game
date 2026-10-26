import { normalizeRoomCode } from '#shared/utils/room'
import { getRoomRevision, getRoomViews } from './room-store'

export interface RoomSocketPeer {
  id: string
  context: Record<string, unknown>
  send: (data: string) => unknown
  close: (code?: number, reason?: string) => void
}

interface RoomWatcher {
  timer: ReturnType<typeof setInterval>
  revision: number
  checking: boolean
  failures: number
}

interface RoomSocketRegistry {
  __musiclineRoomSockets?: Map<string, Map<string, RoomSocketPeer>>
  __musiclineRoomWatchers?: Map<string, RoomWatcher>
}

// A Vercel/WebSocket connection is pinned to one function instance. Broadcasts
// therefore only reach peers registered in the same process. Watching the
// persisted room revision lets every instance pick up writes made elsewhere.
const ROOM_REVISION_POLL_MS = 1000

const globalRegistry = globalThis as unknown as RoomSocketRegistry
const peersByRoom = globalRegistry.__musiclineRoomSockets
  ?? new Map<string, Map<string, RoomSocketPeer>>()
const watchersByRoom = globalRegistry.__musiclineRoomWatchers
  ?? new Map<string, RoomWatcher>()

globalRegistry.__musiclineRoomSockets = peersByRoom
globalRegistry.__musiclineRoomWatchers = watchersByRoom

function stopRoomWatcher(code: string): void {
  const watcher = watchersByRoom.get(code)

  if (!watcher) {
    return
  }

  clearInterval(watcher.timer)
  watchersByRoom.delete(code)
}

function startRoomWatcher(code: string, revision: number): void {
  const existing = watchersByRoom.get(code)

  if (existing) {
    existing.revision = Math.max(existing.revision, revision)
    return
  }

  const watcher: RoomWatcher = {
    revision,
    checking: false,
    failures: 0,
    timer: setInterval(() => {
      void checkRoomRevision(code)
    }, ROOM_REVISION_POLL_MS)
  }

  watcher.timer.unref?.()
  watchersByRoom.set(code, watcher)
}

async function checkRoomRevision(code: string): Promise<void> {
  const watcher = watchersByRoom.get(code)

  if (!watcher || watcher.checking) {
    return
  }

  const roomPeers = peersByRoom.get(code)

  if (!roomPeers || roomPeers.size === 0) {
    stopRoomWatcher(code)
    return
  }

  watcher.checking = true

  try {
    const revision = await getRoomRevision(code)

    if (revision === null) {
      for (const peer of roomPeers.values()) {
        peer.close(4404, 'ROOM_CLOSED')
      }

      peersByRoom.delete(code)
      stopRoomWatcher(code)
      return
    }

    watcher.failures = 0

    if (revision > watcher.revision) {
      await broadcastRoom(code)
    }
  } catch (error) {
    watcher.failures += 1

    // Do not flood logs when the database is temporarily unavailable.
    if (watcher.failures === 1) {
      console.error('[room-socket] revision watch failed', error)
    }
  } finally {
    watcher.checking = false
  }
}

export function registerRoomSocket(
  code: string,
  peer: RoomSocketPeer,
  revision = 0
): void {
  const normalizedCode = normalizeRoomCode(code)
  const roomPeers = peersByRoom.get(normalizedCode) ?? new Map<string, RoomSocketPeer>()

  roomPeers.set(peer.id, peer)
  peersByRoom.set(normalizedCode, roomPeers)
  startRoomWatcher(normalizedCode, revision)
}

export function unregisterRoomSocket(
  code: string,
  peerId: string
): void {
  const normalizedCode = normalizeRoomCode(code)
  const roomPeers = peersByRoom.get(normalizedCode)

  if (!roomPeers) {
    return
  }

  roomPeers.delete(peerId)

  if (roomPeers.size === 0) {
    peersByRoom.delete(normalizedCode)
    stopRoomWatcher(normalizedCode)
  }
}

/**
 * Marks a snapshot as already delivered so the watcher does not send it twice.
 */
export function noteRoomRevision(code: string, revision: number): void {
  const watcher = watchersByRoom.get(normalizeRoomCode(code))

  if (watcher && revision > watcher.revision) {
    watcher.revision = revision
  }
}

/**
 * Pushes a fresh room snapshot to every connected player. The snapshot is read
 * once and then serialised per viewer, so hidden years and the listening song
 * never leak to other sockets.
 */
export async function broadcastRoom(code: string): Promise<number | null> {
  const normalizedCode = normalizeRoomCode(code)
  const roomPeers = peersByRoom.get(normalizedCode)

  if (!roomPeers || roomPeers.size === 0) {
    return null
  }

  try {
    const peers = [...roomPeers.values()]
    const views = await getRoomViews(
      normalizedCode,
      peers.map((peer) => {
        const playerId = peer.context.playerId
        return typeof playerId === 'string' ? playerId : null
      })
    )

    if (views.length !== peers.length) {
      for (const peer of peers) {
        peer.close(4404, 'ROOM_CLOSED')
      }

      peersByRoom.delete(normalizedCode)
      stopRoomWatcher(normalizedCode)
      return null
    }

    peers.forEach((peer, index) => {
      try {
        peer.send(JSON.stringify({
          type: 'room',
          room: views[index]
        }))
      } catch {
        unregisterRoomSocket(normalizedCode, peer.id)
      }
    })

    const revision = views[0]?.revision ?? null

    if (revision !== null) {
      noteRoomRevision(normalizedCode, revision)
    }

    return revision
  } catch (error) {
    // A realtime update must never make the successful HTTP action fail.
    console.error('[room-socket] broadcast failed', error)
    return null
  }
}
