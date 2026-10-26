import { isValidRoomCode, normalizeRoomCode } from '#shared/utils/room'
import { getRoom } from '../utils/room-store'
import type { RoomSocketPeer } from '../utils/room-socket'
import {
  noteRoomRevision,
  registerRoomSocket,
  unregisterRoomSocket
} from '../utils/room-socket'

export default defineWebSocketHandler({
  async open(peer) {
    const socketPeer = peer as unknown as RoomSocketPeer
    const url = new URL(peer.request.url)
    const code = normalizeRoomCode(url.searchParams.get('room') ?? '')
    const playerId = url.searchParams.get('playerId') || null

    if (!isValidRoomCode(code)) {
      peer.close(4400, 'INVALID_ROOM')
      return
    }

    const room = await getRoom(code, playerId)

    if (!room) {
      peer.close(4404, 'ROOM_NOT_FOUND')
      return
    }

    socketPeer.context.roomCode = code
    socketPeer.context.playerId = playerId
    registerRoomSocket(code, socketPeer, room.revision)
    peer.send(JSON.stringify({ type: 'room', room }))
  },

  async message(peer, message) {
    const text = message.text()

    if (text === 'ping') {
      peer.send(JSON.stringify({ type: 'pong' }))
      return
    }

    if (text !== 'sync') {
      return
    }

    const roomCode = peer.context.roomCode

    if (typeof roomCode !== 'string') {
      return
    }

    const playerId = typeof peer.context.playerId === 'string'
      ? peer.context.playerId
      : null
    const room = await getRoom(roomCode, playerId)

    if (!room) {
      peer.close(4404, 'ROOM_CLOSED')
      return
    }

    noteRoomRevision(roomCode, room.revision)
    peer.send(JSON.stringify({ type: 'room', room }))
  },

  close(peer) {
    const roomCode = peer.context.roomCode

    if (typeof roomCode === 'string') {
      unregisterRoomSocket(roomCode, peer.id)
    }
  },

  error(peer) {
    const roomCode = peer.context.roomCode

    if (typeof roomCode === 'string') {
      unregisterRoomSocket(roomCode, peer.id)
    }
  }
})
