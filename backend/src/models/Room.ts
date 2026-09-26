import mongoose, { Document, Schema } from 'mongoose';
import { IParticipant, IRoom, PlaybackState, Role } from '../types/room.types';

export interface IRoomDocument extends Omit<IRoom, 'participants'>, Document {
  participants: (IParticipant & Document)[];
}

/**
 * Participant Sub-Schema:
 * Stores persistent membership and role within a room.
 * Volatile connection identifiers (such as socketId) are intentionally omitted.
 */
const ParticipantSchema = new Schema<IParticipant>(
  {
    userId: {
      type: String,
      required: [true, 'User ID is required'],
      trim: true,
    },
    username: {
      type: String,
      required: [true, 'Username is required'],
      trim: true,
      maxlength: [50, 'Username cannot exceed 50 characters'],
    },
    role: {
      type: String,
      enum: {
        values: Object.values(Role),
        message: 'Role must be either host, moderator, or participant',
      },
      default: Role.PARTICIPANT,
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  { _id: false }
);

/**
 * Room Schema:
 * Stores room identity, host information, persistent video/playback state,
 * and persistent participant records.
 */
const RoomSchema = new Schema<IRoomDocument>(
  {
    roomCode: {
      type: String,
      required: [true, 'Room code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
      match: [/^[A-Z0-9]{3}-[A-Z0-9]{3}$|^[A-Z0-9]{6}$/, 'Room code must be in XXX-XXX or XXXXXX format'],
    },
    hostUserId: {
      type: String,
      required: [true, 'Host user ID is required'],
      trim: true,
      index: true,
    },
    currentVideoId: {
      type: String,
      required: [true, 'Current video ID is required'],
      trim: true,
      default: 'dQw4w9WgXcQ',
      match: [/^[a-zA-Z0-9_-]{11}$/, 'Invalid YouTube video ID format (must be 11 characters)'],
    },
    playbackState: {
      type: String,
      enum: {
        values: Object.values(PlaybackState),
        message: 'Playback state must be either playing or paused',
      },
      default: PlaybackState.PAUSED,
      required: true,
    },
    playbackTime: {
      type: Number,
      default: 0,
      min: [0, 'Playback time cannot be negative'],
      required: true,
    },
    lastUpdatedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    participants: {
      type: [ParticipantSchema],
      default: [],
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24-hour TTL
      index: { expires: 0 },
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

export const RoomModel = mongoose.model<IRoomDocument>('Room', RoomSchema);
