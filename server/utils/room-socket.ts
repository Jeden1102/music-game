import { normalizeRoomCode } from '#shared/utils/room'
import { getRoomViews } from './room-store'

export interface RoomSocketPeer {
  id: string
  context: Record<string, unknown>
  send: (data: string) => unknown
  close: (code?: number, reason?: string) => void
}

interface RoomSocketRegistry {
  __musiclineRoomSockets?: Map<string, Map<string, RoomSocketPeer>>
}

const globalRegistry = globalThis as unknown as RoomSocketRegistry
const peersByRoom = globalRegistry.__musiclineRoomSockets
  ?? new Map<string, Map<string, RoomSocketPeer>>()

globalRegistry.__musiclineRoomSockets = peersByRoom

export function registerRoomSocket(
  code: string,
  peer: RoomSocketPeer
): void {
  const normalizedCode = normalizeRoomCode(code)
  const roomPeers = peersByRoom.get(normalizedCode) ?? new Map<string, RoomSocketPeer>()

  roomPeers.set(peer.id, peer)
  peersByRoom.set(normalizedCode, roomPeers)
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
  }
}

/**
 * Pushes a fresh room snapshot to every connected player. The snapshot is read
 * once and then serialised per viewer, so hidden years and the listening song
 * never leak to other sockets.
 */
export async function broadcastRoom(code: string): Promise<void> {
  const normalizedCode = normalizeRoomCode(code)
  const roomPeers = peersByRoom.get(normalizedCode)

  if (!roomPeers || roomPeers.size === 0) {
    return
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
      return
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
  } catch (error) {
    // A realtime update must never make the successful HTTP action fail.
    console.error('[room-socket] broadcast failed', error)
  }
}
