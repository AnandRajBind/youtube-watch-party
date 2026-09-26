import mongoose, { Document, Schema } from 'mongoose';
import { IParticipant, IPlaybackState, IRoom, IVideoState, PlaybackStatus, Role } from '../types/room.types';

export interface IRoomDocument extends Omit<IRoom, 'participants'>, Document {
  participants: (IParticipant & Document)[];
}

const ParticipantSchema = new Schema<IParticipant>(
  {
    userId: { type: String, required: true },
    socketId: { type: String, default: '' },
    username: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: Object.values(Role),
      default: Role.PARTICIPANT,
    },
    joinedAt: { type: Date, default: Date.now },
    isOnline: { type: Boolean, default: true },
  },
  { _id: false }
);

const VideoSchema = new Schema<IVideoState>(
  {
    videoId: { type: String, required: true, default: 'dQw4w9WgXcQ' },
    title: { type: String, default: 'YouTube Video' },
    duration: { type: Number, default: 0 },
  },
  { _id: false }
);

const PlaybackSchema = new Schema<IPlaybackState>(
  {
    status: {
      type: String,
      enum: Object.values(PlaybackStatus),
      default: PlaybackStatus.PAUSED,
    },
    currentTime: { type: Number, default: 0 },
    lastUpdatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const RoomSchema = new Schema<IRoomDocument>(
  {
    roomCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      default: 'Watch Party Room',
      trim: true,
    },
    hostUserId: {
      type: String,
      required: true,
    },
    video: {
      type: VideoSchema,
      default: () => ({ videoId: 'dQw4w9WgXcQ', title: 'YouTube Video', duration: 0 }),
    },
    playback: {
      type: PlaybackSchema,
      default: () => ({ status: PlaybackStatus.PAUSED, currentTime: 0, lastUpdatedAt: new Date() }),
    },
    participants: [ParticipantSchema],
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24-hour TTL
      index: { expires: 0 },
    },
  },
  {
    timestamps: true,
  }
);

export const RoomModel = mongoose.model<IRoomDocument>('Room', RoomSchema);
