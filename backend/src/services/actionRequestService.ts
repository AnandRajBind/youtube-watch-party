import crypto from 'crypto';
import { RoomModel } from '../models/Room';
import { PlaybackState } from '../types/room.types';
import { ActionRequestItem, ActionRequestType } from '../sockets/socketTypes';
import { ApiError } from '../utils/apiError';
import { extractYouTubeVideoId } from '../utils/youtube';
import { syncService } from './syncService';
import { logger } from '../utils/logger';

const REQUEST_TTL_MS = 5 * 60 * 1000; // 5 minutes expiration

export interface ApprovedActionResult {
  request: ActionRequestItem;
  targetTime: number;
  videoId: string;
  playState: PlaybackState;
}

export class ActionRequestService {
  // In-memory pending action requests store
  private requests: Map<string, ActionRequestItem> = new Map();
  // Room to Request IDs mapping for clean room teardown
  private roomToRequests: Map<string, Set<string>> = new Map();

  /**
   * Creates a new change request from a participant.
   */
  public createRequest(
    roomCode: string,
    requesterUserId: string,
    requesterUsername: string,
    action: ActionRequestType,
    payload?: { time?: number; currentTime?: number; videoId?: string }
  ): ActionRequestItem {
    const code = roomCode?.trim().toUpperCase();

    // 1. Validate action type
    const validActions: ActionRequestType[] = ['play', 'pause', 'seek', 'change_video'];
    if (!validActions.includes(action)) {
      throw ApiError.badRequest(
        `Invalid action '${action}'. Permitted actions are: play, pause, seek, change_video`,
        'INVALID_ACTION'
      );
    }

    let validatedTime: number | undefined;
    let validatedVideoId: string | undefined;

    // 2. Validate payload attributes based on action
    if (action === 'seek') {
      const seekTime = payload?.time !== undefined ? payload.time : payload?.currentTime;
      if (
        seekTime === undefined ||
        typeof seekTime !== 'number' ||
        Number.isNaN(seekTime) ||
        !Number.isFinite(seekTime) ||
        seekTime < 0
      ) {
        throw ApiError.badRequest(
          'Seek time must be a non-negative finite number',
          'INVALID_SEEK_TIME'
        );
      }
      validatedTime = Number(seekTime.toFixed(2));
    } else if (action === 'play' || action === 'pause') {
      const givenTime = payload?.time !== undefined ? payload.time : payload?.currentTime;
      if (
        givenTime !== undefined &&
        typeof givenTime === 'number' &&
        Number.isFinite(givenTime) &&
        !Number.isNaN(givenTime) &&
        givenTime >= 0
      ) {
        validatedTime = Number(givenTime.toFixed(2));
      }
    } else if (action === 'change_video') {
      if (!payload?.videoId || typeof payload.videoId !== 'string') {
        throw ApiError.badRequest('Video ID or URL is required for change_video', 'INVALID_VIDEO_ID');
      }
      const extracted = extractYouTubeVideoId(payload.videoId);
      if (!extracted) {
        throw ApiError.badRequest(
          'Invalid YouTube video ID or URL format (must resolve to 11 characters)',
          'INVALID_VIDEO_ID'
        );
      }
      validatedVideoId = extracted;
    }

    // 3. Generate unique request identifier
    const requestId = `req_${crypto.randomUUID().slice(0, 8)}`;

    const requestItem: ActionRequestItem = {
      requestId,
      roomCode: code,
      requesterUserId,
      requesterUsername,
      action,
      time: validatedTime,
      videoId: validatedVideoId,
      createdAt: Date.now(),
      status: 'pending',
    };

    this.requests.set(requestId, requestItem);

    if (!this.roomToRequests.has(code)) {
      this.roomToRequests.set(code, new Set());
    }
    this.roomToRequests.get(code)!.add(requestId);

    logger.info(
      `[${code}] Action request created: [id=${requestId}, action=${action}, user=${requesterUsername}]`
    );

    return requestItem;
  }

  /**
   * Retrieves an action request by ID with automatic expiration check.
   */
  public getRequest(requestId: string): ActionRequestItem | null {
    const req = this.requests.get(requestId);
    if (!req) return null;

    // Check expiration
    if (req.status === 'pending' && Date.now() - req.createdAt > REQUEST_TTL_MS) {
      req.status = 'expired';
    }

    return req;
  }

  /**
   * Approves an action request and executes the corresponding playback modification in MongoDB.
   * Host and Moderator only.
   */
  public async approveRequest(
    requestId: string,
    roomCode: string,
    _approverUserId: string,
    approverUsername: string
  ): Promise<ApprovedActionResult> {
    const code = roomCode?.trim().toUpperCase();
    const req = this.getRequest(requestId);

    if (!req || req.roomCode !== code) {
      throw ApiError.notFound('Action request not found in this room', 'REQUEST_NOT_FOUND');
    }

    if (req.status === 'expired') {
      throw ApiError.badRequest('Action request has expired', 'REQUEST_EXPIRED');
    }

    if (req.status !== 'pending') {
      throw ApiError.badRequest(
        `Action request has already been ${req.status}`,
        'REQUEST_ALREADY_PROCESSED'
      );
    }

    const room = await RoomModel.findOne({ roomCode: code });
    if (!room) {
      throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
    }

    // Atomic execution of corresponding playback action
    let targetTime = 0;
    let targetPlayState = room.playbackState;
    let targetVideoId = room.currentVideoId;

    if (req.action === 'play') {
      if (req.time !== undefined) {
        targetTime = req.time;
      } else {
        targetTime = syncService.calculateCurrentPlaybackTime(
          room.playbackState,
          room.playbackTime,
          room.lastUpdatedAt
        );
      }
      room.playbackState = PlaybackState.PLAYING;
      room.playbackTime = targetTime;
      room.lastUpdatedAt = new Date();
      targetPlayState = PlaybackState.PLAYING;
    } else if (req.action === 'pause') {
      if (req.time !== undefined) {
        targetTime = req.time;
      } else {
        targetTime = syncService.calculateCurrentPlaybackTime(
          room.playbackState,
          room.playbackTime,
          room.lastUpdatedAt
        );
      }
      room.playbackState = PlaybackState.PAUSED;
      room.playbackTime = targetTime;
      room.lastUpdatedAt = new Date();
      targetPlayState = PlaybackState.PAUSED;
    } else if (req.action === 'seek') {
      targetTime = req.time!;
      room.playbackTime = targetTime;
      room.lastUpdatedAt = new Date();
    } else if (req.action === 'change_video') {
      targetVideoId = req.videoId!;
      targetTime = 0;
      targetPlayState = PlaybackState.PAUSED;
      room.currentVideoId = targetVideoId;
      room.playbackState = PlaybackState.PAUSED;
      room.playbackTime = 0;
      room.lastUpdatedAt = new Date();
    }

    await room.save();

    // Mark as approved (prevents duplicate execution)
    req.status = 'approved';

    logger.info(
      `[${code}] Action request ${requestId} (${req.action}) APPROVED by ${approverUsername}. Action executed.`
    );

    return {
      request: req,
      targetTime,
      videoId: targetVideoId,
      playState: targetPlayState,
    };
  }

  /**
   * Rejects an action request.
   * Host and Moderator only.
   */
  public rejectRequest(
    requestId: string,
    roomCode: string,
    _rejecterUserId: string,
    rejecterUsername: string,
    reason?: string
  ): ActionRequestItem {
    const code = roomCode?.trim().toUpperCase();
    const req = this.getRequest(requestId);

    if (!req || req.roomCode !== code) {
      throw ApiError.notFound('Action request not found in this room', 'REQUEST_NOT_FOUND');
    }

    if (req.status === 'expired') {
      throw ApiError.badRequest('Action request has expired', 'REQUEST_EXPIRED');
    }

    if (req.status !== 'pending') {
      throw ApiError.badRequest(
        `Action request has already been ${req.status}`,
        'REQUEST_ALREADY_PROCESSED'
      );
    }

    // Mark as rejected (prevents duplicate execution)
    req.status = 'rejected';

    logger.info(
      `[${code}] Action request ${requestId} (${req.action}) REJECTED by ${rejecterUsername}. Reason: ${reason || 'None'}`
    );

    return req;
  }

  /**
   * Cleans all active requests for a room when closed.
   */
  public clearRoomRequests(roomCode: string): void {
    const code = roomCode?.trim().toUpperCase();
    const requestIds = this.roomToRequests.get(code);
    if (requestIds) {
      for (const id of requestIds) {
        this.requests.delete(id);
      }
      this.roomToRequests.delete(code);
    }
  }
}

export const actionRequestService = new ActionRequestService();
