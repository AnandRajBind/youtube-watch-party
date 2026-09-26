import { io, Socket } from 'socket.io-client';
import type {
  ApproveActionSocketPayload,
  AssignRoleSocketPayload,
  ChangeVideoSocketPayload,
  JoinRoomSocketPayload,
  LeaveRoomSocketPayload,
  PauseSocketPayload,
  PlaySocketPayload,
  RejectActionSocketPayload,
  RemoveParticipantSocketPayload,
  RequestActionSocketPayload,
  SeekSocketPayload,
  TransferHostSocketPayload,
} from '../types/socket.types';
import { SOCKET_EVENTS } from '../types/socket.types';

const getSocketUrl = (): string => {
  const envUrl = import.meta.env.VITE_SOCKET_URL;
  if (!envUrl) {
    return 'http://localhost:5000';
  }
  // Trim trailing slash and strip /api if user mistakenly added it to socket URL
  return envUrl.replace(/\/+$/, '').replace(/\/api$/, '');
};

class SocketService {
  private socket: Socket | null = null;
  private url: string = getSocketUrl();

  /**
   * Initializes or returns the shared Socket.IO instance.
   * Does NOT auto-connect immediately to avoid unnecessary background connections.
   */
  public getSocket(): Socket {
    if (!this.socket) {
      this.socket = io(this.url, {
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        transports: ['websocket', 'polling'],
      });

      this.setupDefaultLifecycleListeners();
    }
    return this.socket;
  }

  /**
   * Connects the socket if not already connected.
   */
  public connect(): Socket {
    const socket = this.getSocket();
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  /**
   * Disconnects the socket and cleans up instance.
   */
  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket.removeAllListeners();
      this.socket = null;
    }
  }

  /**
   * Returns current connection status.
   */
  public isConnected(): boolean {
    return !!this.socket?.connected;
  }

  /**
   * Returns current socket ID.
   */
  public getSocketId(): string | undefined {
    return this.socket?.id;
  }

  // --------------------------------------------------------------------------
  // Emitting Typed Events to Server
  // --------------------------------------------------------------------------

  public joinRoom(payload: JoinRoomSocketPayload): void {
    this.socket?.emit(SOCKET_EVENTS.JOIN_ROOM, payload);
  }

  public leaveRoom(payload: LeaveRoomSocketPayload): void {
    this.socket?.emit(SOCKET_EVENTS.LEAVE_ROOM, payload);
  }

  public requestSyncState(): void {
    this.socket?.emit(SOCKET_EVENTS.SYNC_STATE);
  }

  public play(payload: PlaySocketPayload = {}): void {
    this.socket?.emit(SOCKET_EVENTS.PLAY, payload);
  }

  public pause(payload: PauseSocketPayload = {}): void {
    this.socket?.emit(SOCKET_EVENTS.PAUSE, payload);
  }

  public seek(payload: SeekSocketPayload): void {
    this.socket?.emit(SOCKET_EVENTS.SEEK, payload);
  }

  public changeVideo(payload: ChangeVideoSocketPayload): void {
    this.socket?.emit(SOCKET_EVENTS.CHANGE_VIDEO, payload);
  }

  public assignRole(payload: AssignRoleSocketPayload): void {
    this.socket?.emit(SOCKET_EVENTS.ASSIGN_ROLE, payload);
  }

  public removeParticipant(payload: RemoveParticipantSocketPayload): void {
    this.socket?.emit(SOCKET_EVENTS.REMOVE_PARTICIPANT, payload);
  }

  public transferHost(payload: TransferHostSocketPayload): void {
    this.socket?.emit(SOCKET_EVENTS.TRANSFER_HOST, payload);
  }

  public requestAction(payload: RequestActionSocketPayload): void {
    this.socket?.emit(SOCKET_EVENTS.REQUEST_ACTION, payload);
  }

  public approveAction(payload: ApproveActionSocketPayload): void {
    this.socket?.emit(SOCKET_EVENTS.APPROVE_ACTION, payload);
  }

  public rejectAction(payload: RejectActionSocketPayload): void {
    this.socket?.emit(SOCKET_EVENTS.REJECT_ACTION, payload);
  }

  // --------------------------------------------------------------------------
  // Safe Event Subscription Helpers
  // --------------------------------------------------------------------------

  /**
   * Subscribes to a socket event with automatic cleanup function return.
   */
  public on<T = any>(event: string, callback: (data: T) => void): () => void {
    const s = this.getSocket();
    s.on(event, callback);
    return () => {
      s.off(event, callback);
    };
  }

  /**
   * Subscribes to an event once.
   */
  public once<T = any>(event: string, callback: (data: T) => void): void {
    const s = this.getSocket();
    s.once(event, callback);
  }

  private setupDefaultLifecycleListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect_error', (_err) => {
      // Handled silently or via subscriber
    });
  }
}

export const socketService = new SocketService();
