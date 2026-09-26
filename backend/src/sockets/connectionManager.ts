/**
 * ConnectionManager:
 * Manages volatile runtime WebSocket connection state in memory.
 *
 * Why in memory?
 * 1. High frequency: Connects, disconnects, and packet blips happen constantly.
 *    Writing to MongoDB on every socket event introduces unnecessary latency and database load.
 * 2. Transient lifecycle: Socket IDs only exist for the lifetime of a TCP/WebSocket connection.
 *    If a server restarts or a client reconnects, previous socket IDs become invalid immediately.
 */
interface ConnectionInfo {
  userId: string;
  roomCode: string;
}

export class ConnectionManager {
  // socketId -> { userId, roomCode }
  private socketToConnection: Map<string, ConnectionInfo> = new Map();

  // "roomCode:userId" -> Set of socketIds (supports multiple tabs from same user)
  private userToSockets: Map<string, Set<string>> = new Map();

  // roomCode -> Set of active socketIds
  private roomToSockets: Map<string, Set<string>> = new Map();

  private getUserKey(roomCode: string, userId: string): string {
    return `${roomCode.toUpperCase()}:${userId}`;
  }

  public addConnection(socketId: string, userId: string, roomCode: string): void {
    const code = roomCode.toUpperCase();
    this.socketToConnection.set(socketId, { userId, roomCode: code });

    // Track user sockets
    const userKey = this.getUserKey(code, userId);
    if (!this.userToSockets.has(userKey)) {
      this.userToSockets.set(userKey, new Set());
    }
    this.userToSockets.get(userKey)!.add(socketId);

    // Track room sockets
    if (!this.roomToSockets.has(code)) {
      this.roomToSockets.set(code, new Set());
    }
    this.roomToSockets.get(code)!.add(socketId);
  }

  public removeConnection(socketId: string): ConnectionInfo | null {
    const info = this.socketToConnection.get(socketId);
    if (!info) {
      return null;
    }

    this.socketToConnection.delete(socketId);

    // Clean up user sockets
    const userKey = this.getUserKey(info.roomCode, info.userId);
    const userSockets = this.userToSockets.get(userKey);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        this.userToSockets.delete(userKey);
      }
    }

    // Clean up room sockets
    const roomSockets = this.roomToSockets.get(info.roomCode);
    if (roomSockets) {
      roomSockets.delete(socketId);
      if (roomSockets.size === 0) {
        this.roomToSockets.delete(info.roomCode);
      }
    }

    return info;
  }

  public isUserOnline(userId: string, roomCode: string): boolean {
    const userKey = this.getUserKey(roomCode, userId);
    const sockets = this.userToSockets.get(userKey);
    return Boolean(sockets && sockets.size > 0);
  }

  public getOnlineUserIds(roomCode: string): string[] {
    const code = roomCode.toUpperCase();
    const onlineUsers = new Set<string>();

    for (const [key, sockets] of this.userToSockets.entries()) {
      if (key.startsWith(`${code}:`) && sockets.size > 0) {
        const userId = key.split(':')[1];
        onlineUsers.add(userId);
      }
    }

    return Array.from(onlineUsers);
  }

  public getSocketIdsForUser(userId: string, roomCode: string): string[] {
    const userKey = this.getUserKey(roomCode, userId);
    const sockets = this.userToSockets.get(userKey);
    return sockets ? Array.from(sockets) : [];
  }
}

export const connectionManager = new ConnectionManager();
