# YouTube Watch Party — Backend Service

A production-ready, server-authoritative backend service for synchronized YouTube watch parties. Built with Node.js, Express, TypeScript, Socket.IO, and MongoDB, featuring real-time playback synchronization, role-based access control (RBAC), and a participant change-request approval workflow.

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Folder Structure](#3-folder-structure)
4. [Environment Variables](#4-environment-variables)
5. [Installation](#5-installation)
6. [Development Command](#6-development-command)
7. [Production Build](#7-production-build)
8. [REST API Endpoints](#8-rest-api-endpoints)
9. [Socket.IO Events](#9-socketio-events)
10. [Role Permissions (RBAC Matrix)](#10-role-permissions-rbac-matrix)
11. [Playback Synchronization Architecture](#11-playback-synchronization-architecture)
12. [MongoDB Usage & State Separation](#12-mongodb-usage--state-separation)
13. [Security Decisions](#13-security-decisions)
14. [Centralized Error Handling](#14-centralized-error-handling)
15. [Render Deployment Steps](#15-render-deployment-steps)

---

## 1. Project Overview

The YouTube Watch Party backend powers real-time collaborative video viewing rooms where multiple users can watch YouTube videos synchronously.

### Core Capabilities:
- **Server-Authoritative Synchronization**: Prevents player jitter, race conditions, and infinite broadcast loops across clients.
- **Strict Role-Based Access Control (RBAC)**: Enforces three distinct roles (`HOST`, `MODERATOR`, `PARTICIPANT`) where permissions are verified strictly against the database.
- **Participant Change-Request System**: Enforces the assignment rule where participants cannot directly mutate playback but can submit change requests (`play`, `pause`, `seek`, `change_video`) for Host or Moderator approval.
- **Clean Architecture & Separation of Concerns**: Isolates persistent database records from high-frequency volatile WebSocket connection states in memory.

---

## 2. Technology Stack

| Layer | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Runtime** | Node.js | v20+ | Asynchronous event-driven JavaScript runtime |
| **Language** | TypeScript | v5.7+ | Strict type safety, interfaces, and compile-time correctness |
| **Framework** | Express.js | v4.21+ | HTTP server, REST API routing, and middleware |
| **WebSockets** | Socket.IO | v4.8+ | Low-latency bi-directional room events and state broadcasting |
| **Database** | MongoDB | v7.0+ | Persistent room documents, participant membership, and TTL |
| **ODM** | Mongoose | v8.10+ | Schema definitions, indexing, and transactional validations |
| **Validation** | Zod | v3.24+ | Runtime schema parsing and sanitization for HTTP & environment |
| **Security** | Helmet / CORS | Latest | HTTP security headers and origin-whitelisted requests |
| **Rate Limiter**| Custom In-Memory | Custom | Dependency-free IP rate limiting for API and room creation |
| **Logging** | Morgan & Logger | Latest | HTTP request logging and formatted console logs |

---

## 3. Folder Structure

```
backend/
├── src/
│   ├── config/               # System configuration & service lifecycles
│   │   ├── database.ts       # MongoDB connection lifecycle, listeners & disconnect
│   │   └── env.ts            # Type-safe environment variable parsing via Zod
│   ├── controllers/          # Express route controllers
│   │   └── roomController.ts # HTTP handlers for creating, joining, and fetching rooms
│   ├── middleware/           # Express middleware layer
│   │   ├── errorHandler.ts   # Centralized error handling & 404 handler
│   │   ├── rateLimiter.ts    # Lightweight in-memory rate limiter (API & room creation)
│   │   └── validateRequest.ts# Zod request validation middleware (body, params, query)
│   ├── models/               # Mongoose data layer
│   │   └── Room.ts           # Room schema, subdocuments, indexes & 24h TTL
│   ├── routes/               # Express routing
│   │   ├── healthRoutes.ts   # Health check (/api/health)
│   │   └── roomRoutes.ts     # Room REST endpoints (/api/rooms)
│   ├── services/             # Core business & domain logic
│   │   ├── actionRequestService.ts # In-memory change-request queue & execution
│   │   ├── permissionService.ts    # Centralized RBAC matrix & reusable auth helpers
│   │   ├── roomService.ts    # Room CRUD, membership, persistent state updates
│   │   └── syncService.ts    # Virtual playback time calculation & sync assertions
│   ├── sockets/              # Socket.IO real-time architecture
│   │   ├── handlers/
│   │   │   ├── actionRequestHandler.ts # Change-request events (request, approve, reject)
│   │   │   ├── roleHandler.ts          # RBAC events (assign_role, remove_participant, transfer_host)
│   │   │   ├── roomHandler.ts          # Presence events (join_room, leave_room, disconnect, sync_state)
│   │   │   └── syncHandler.ts          # Playback events (play, pause, seek, change_video)
│   │   ├── index.ts          # Socket server initialization & handler binding
│   │   ├── roomSocket.ts     # Volatile in-memory runtime store (socketId <-> user)
│   │   └── socketTypes.ts    # Shared Socket.IO event names, interfaces & DTOs
│   ├── types/                # Domain models & TypeScript enums
│   │   └── room.types.ts     # Role, PlaybackState, SafeRoomDto, SafeParticipantDto
│   ├── utils/                # Utility helpers
│   │   ├── apiError.ts       # Operational HTTP error class
│   │   ├── logger.ts         # Structured logging utility with timestamps
│   │   ├── roomCode.ts       # Cryptographic room code generator (XXX-XXX format)
│   │   └── youtube.ts        # Robust YouTube video ID extractor & validator
│   ├── app.ts                # Express application configuration & middleware setup
│   └── server.ts             # HTTP server entry point & graceful shutdown hooks
├── tests/                    # Automated integration & unit test suites
│   ├── actionRequest.test.ts # Change-request approval workflow test suite
│   ├── comprehensiveChecklist.test.ts # Master 7-section verification test
│   ├── dataLayer.test.ts     # MongoDB schema & persistence test suite
│   ├── playbackSync.test.ts  # Playback sync & anti-loop verification test
│   ├── rbac.test.ts          # Role permissions & anti-spoofing test suite
│   ├── roomApi.test.ts       # Room REST API endpoints test suite
│   └── socketServer.test.ts  # Socket.IO room presence & multi-tab test suite
├── .env.example              # Sample environment configuration template
├── package.json              # Dependencies, scripts & build configuration
└── tsconfig.json             # TypeScript compiler configuration
```

---

## 4. Environment Variables

Environment variables are validated on server startup using Zod in [`src/config/env.ts`](file:///d:/youtube-watch-party/backend/src/config/env.ts). If any required variable is missing or malformed, the process logs clear instructions and aborts execution immediately.

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `PORT` | Optional | `5000` | Port number the HTTP and WebSocket server listens on (`1-65535`). |
| `MONGODB_URI` / `MONGO_URI` | **Required** | None | MongoDB connection string (supports local and MongoDB Atlas). |
| `CLIENT_URL` | Optional | `http://localhost:5173` | Allowed frontend origin for CORS and Socket.IO handshakes. |
| `NODE_ENV` | Optional | `development` | Environment mode (`development`, `production`, `test`). |

Template provided in [`.env.example`](file:///d:/youtube-watch-party/backend/.env.example):
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/youtube-watch-party
CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

---

## 5. Installation

Navigate to the `backend` directory and install dependencies:

```bash
cd backend
npm install
```

---

## 6. Development Command

Runs the backend in development mode with continuous hot-reloading using `tsx watch`:

```bash
npm run dev
```

Server starts at `http://localhost:5000` with automated reload on TypeScript changes.

---

## 7. Production Build

Compiles TypeScript to standard JavaScript in the `dist/` directory and executes the compiled server:

```bash
# 1. Clean previous build and compile TypeScript
npm run build

# 2. Start the production server
npm start
```

---

## 8. REST API Endpoints

All responses follow a consistent JSON format. Sensitive database internals (`_id`, `__v`, `expiresAt`) are stripped via [`SafeRoomDto`](file:///d:/youtube-watch-party/backend/src/types/room.types.ts#L41-L51).

### `GET /api/health`
Health check endpoint reporting server uptime, timestamp, environment, and MongoDB connection status.
- **Response `200 OK`**:
  ```json
  {
    "status": "ok",
    "timestamp": "2026-09-26T11:15:00.000Z",
    "uptime": 124.5,
    "database": {
      "status": "connected",
      "readyState": 1
    }
  }
  ```

### `POST /api/rooms`
Creates a new watch party room. Generates a unique room code (`XXX-XXX`) and assigns the creator as `HOST`.
- **Rate Limit**: 30 requests/minute per IP.
- **Request Body**:
  ```json
  {
    "username": "Alice",
    "initialVideoUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "success": true,
    "message": "Room created successfully",
    "data": {
      "room": {
        "roomCode": "ABC-XYZ",
        "hostUserId": "user-uuid",
        "currentVideoId": "dQw4w9WgXcQ",
        "playbackState": "paused",
        "playbackTime": 0,
        "participantCount": 1,
        "participants": [...]
      },
      "hostUser": {
        "userId": "user-uuid",
        "username": "Alice",
        "role": "host"
      }
    }
  }
  ```

### `GET /api/rooms/:roomCode`
Retrieves safe room metadata and computes the current real-time virtual playback position.
- **Response `200 OK`**:
  ```json
  {
    "success": true,
    "data": {
      "roomCode": "ABC-XYZ",
      "hostUserId": "user-uuid",
      "currentVideoId": "dQw4w9WgXcQ",
      "playbackState": "playing",
      "playbackTime": 42.5,
      "participantCount": 2,
      "participants": [...]
    }
  }
  ```

### `POST /api/rooms/:roomCode/join`
Initializes a participant identity before establishing a WebSocket connection. Default role is `PARTICIPANT`. If the creator reconnects, their `HOST` role is preserved.
- **Request Body**:
  ```json
  {
    "username": "Bob"
  }
  ```
- **Response `200 OK`**: Returns safe room metadata, participant identity, and session credentials.

---

## 9. Socket.IO Events

### Client-to-Server Events

| Event | Payload | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `join_room` | `{ roomCode, username, userId? }` | Any | Joins room, binds socket to session, resolves server-side role. |
| `leave_room` | `{ roomCode }` | Member | Explicitly leaves room and frees runtime state. |
| `sync_state` | `{}` | Member | Requests fresh authoritative playback state. |
| `play` | `{ currentTime? }` | Host / Mod | Transitions room state to playing at playhead timestamp. |
| `pause` | `{ currentTime? }` | Host / Mod | Transitions room state to paused at playhead timestamp. |
| `seek` | `{ time }` | Host / Mod | Seeks playhead to specific second (`>= 0`). |
| `change_video` | `{ videoId }` | Host / Mod | Changes YouTube video, resets time to `0`, state to `paused`. |
| `assign_role` | `{ userId, role }` | **Host Only** | Promotes to `moderator` or demotes to `participant`. |
| `remove_participant` | `{ userId }` | **Host Only** | Kicks participant, severs sockets, and updates DB. |
| `transfer_host` | `{ targetUserId }` | **Host Only** | Transfers ownership; former host becomes `moderator`. |
| `request_action` | `{ action, time?, videoId? }` | Member | Submits change request (`play`, `pause`, `seek`, `change_video`). |
| `approve_action` | `{ requestId }` | Host / Mod | Approves request, executes action, broadcasts playback update. |
| `reject_action` | `{ requestId, reason? }` | Host / Mod | Rejects request; playback remains unchanged. |

### Server-to-Client Broadcast Events

| Event | Payload | Recipient | Description |
| :--- | :--- | :---: | :--- |
| `sync_state` | `{ playState, currentTime, videoId, userRole, participants, ... }` | Joining Client | Authoritative room snapshot on connection. |
| `user_joined` | `{ user: SafeParticipantDto, participantCount, roomCode }` | Room (except sender)| Fired when a new user enters the room. |
| `user_left` | `{ userId, username, participantCount, roomCode }` | Room | Fired when a user closes their last active tab/socket. |
| `participant_update` | `{ participants: SafeParticipantDto[], participantCount }` | All in Room | Full refreshed participant list. |
| `play` | `{ currentTime, serverTimestamp, triggeredBy }` | Room (except sender)| Video play command. |
| `pause` | `{ currentTime, serverTimestamp, triggeredBy }` | Room (except sender)| Video pause command. |
| `seek` | `{ currentTime, serverTimestamp, triggeredBy }` | Room (except sender)| Video seek command. |
| `change_video` | `{ videoId, playState, currentTime, serverTimestamp, triggeredBy }` | All in Room | Video changed; all clients reload player. |
| `role_assigned` | `{ userId, role, updatedBy }` | All in Room | Role updated. |
| `participant_removed` | `{ userId, removedBy, reason? }` | Target & Room | Fired to target before disconnect, and to remaining members. |
| `host_transferred` | `{ previousHostUserId, newHostUserId, updatedBy }` | All in Room | Host ownership transferred. |
| `action_request_created` | `{ requestId, requesterUserId, requesterUsername, action, ... }`| All in Room | New participant change request created. |
| `action_request_approved`| `{ requestId, action, approvedBy, requesterUsername, ... }` | All in Room | Action request approved by Host or Moderator. |
| `action_request_rejected`| `{ requestId, action, rejectedBy, requesterUsername, reason }` | All in Room | Action request denied by Host or Moderator. |
| `error` | `{ code, message }` | Requester Socket | Emitted on validation or authorization rejection. |

---

## 10. Role Permissions (RBAC Matrix)

All permissions are strictly verified server-side through [`permissionService.ts`](file:///d:/youtube-watch-party/backend/src/services/permissionService.ts):

| Action / Permission | `HOST` | `MODERATOR` | `PARTICIPANT` | Helper Function |
| :--- | :---: | :---: | :---: | :--- |
| `play` | ✅ | ✅ | ❌ | `canControlPlayback(role)` |
| `pause` | ✅ | ✅ | ❌ | `canControlPlayback(role)` |
| `seek` | ✅ | ✅ | ❌ | `canControlPlayback(role)` |
| `change_video` | ✅ | ✅ | ❌ | `canControlPlayback(role)` |
| `assign_role` | ✅ | ❌ | ❌ | `canManageRoles(role)` |
| `remove_participant` | ✅ | ❌ | ❌ | `canRemoveParticipant(role)` |
| `transfer_host` | ✅ | ❌ | ❌ | `canTransferHost(role)` |
| `request_action` | ✅ | ✅ | ✅ | Any Room Member |
| `approve_action` | ✅ | ✅ | ❌ | `canApproveAction(role)` |
| `reject_action` | ✅ | ✅ | ❌ | `canApproveAction(role)` |

---

## 11. Playback Synchronization Architecture

To achieve sub-second synchronization and prevent playback stutter:

```
Host / Moderator sends "seek(45.5)"
       │
       ▼
Socket.IO Server validates authorization (Host or Mod?)
       │
       ▼
Server computes authoritative timestamp & updates MongoDB
       │
       ├─────────────────────────────────┐
       ▼                                 ▼
Sender Client                     Other Room Members
(No Echo - Local player already   Receive `seek` event
 moved, preventing action loops)  and synchronize player head
```

### Key Engineering Decisions:
1. **Virtual Playback Time Calculation**:
   Instead of continuously writing playhead timestamps to the database 60 times a second, the server records the anchor `playbackTime`, `playbackState`, and `lastUpdatedAt` timestamp:
   $$\text{currentTime} = \begin{cases} \text{playbackTime} + (\text{now} - \text{lastUpdatedAt}), & \text{if state is PLAYING} \\ \text{playbackTime}, & \text{if state is PAUSED} \end{cases}$$
2. **Loop & Echo Prevention**:
   Broadcast events use `socket.to(roomCode).emit(...)` rather than `io.to(roomCode).emit(...)`. The initiating client is omitted from the echo broadcast, eliminating playback jitter and endless feedback loops.
3. **Monotonic Video Resets**:
   Changing video automatically resets playback time to `0` and sets the state to `PAUSED` across the cluster to guarantee all clients start from the beginning.

---

## 12. MongoDB Usage & State Separation

We enforce a strict distinction between persistent storage and volatile runtime memory:

```
┌─────────────────────────────────────────┐  ┌─────────────────────────────────────────┐
│           MongoDB Storage               │  │           In-Memory Store               │
│         (Persistent Domain)             │  │          (Volatile Real-Time)           │
├─────────────────────────────────────────┤  ├─────────────────────────────────────────┤
│ • Room identity & Room code (XXX-XXX)   │  │ • Active WebSocket connections (socketId) │
│ • Persistent participant list & roles   │  │ • Socket-to-Room channel mapping        │
│ • Host User ID                          │  │ • Multi-tab presence count per user     │
│ • Current YouTube video ID              │  │ • Pending change-requests (5-min TTL)   │
│ • Playback anchor time & state          │  │ • Fast connection session cache         │
│ • 24-Hour TTL index (expiresAt)         │  │                                         │
└─────────────────────────────────────────┘  └─────────────────────────────────────────┘
```

- **Why?** Writing high-frequency WebSocket socket IDs to MongoDB creates unnecessary database I/O, latency, and leaves orphan records if the Node process restarts. In-memory presence provides instant lookups with zero DB thrashing.

---

## 13. Security Decisions

1. **Server-Side Role Resolution (Anti-Spoofing)**:
   Any `role` attribute passed in HTTP bodies or WebSocket payloads (`{ role: "host" }`) is completely discarded. The server retrieves the user's role solely from MongoDB.
2. **XSS & Input Sanitization**:
   Usernames are validated against alphanumeric/dash regex (`/^[a-zA-Z0-9_\s-]+$/`) and stripped of HTML brackets. Room codes are enforced in uppercase `XXX-XXX` format.
3. **Injection-Safe Queries**:
   Queries use parameterized primitives (e.g. `{ roomCode: string }`), eliminating NoSQL operator injection (`$gt`, `$where`).
4. **Rate Limiting**:
   Custom in-memory rate limiting prevents brute-force room creation (30 rooms/min per IP) and API spam (120 req/min per IP).
5. **YouTube URL Sanitization**:
   Video IDs are validated through strict regex and extracted into safe 11-character tokens. Malicious URLs or scripts are rejected with `INVALID_VIDEO_ID`.

---

## 14. Centralized Error Handling

- **`ApiError` Class**: Operational errors extend `Error` with HTTP status codes and machine-readable error codes (`FORBIDDEN_PLAYBACK_CONTROL`, `USER_NOT_FOUND`, etc.).
- **Global Error Middleware**: Catches Zod validation errors (formatted as `VALIDATION_ERROR` with field details), MongoDB errors, and unhandled exceptions without leaking stack traces in production.
- **WebSocket Rejection Events**: Unauthorized or invalid WebSocket operations emit a dedicated `error` event `{ code, message }` directly to the client without terminating the connection.

---

## 15. Render Deployment Steps

The backend is configured for deployment as a Web Service on [Render](https://render.com):

1. **Create Web Service**:
   - Connect your GitHub repository on the Render Dashboard.
   - Select **Web Service**.
2. **Configure Settings**:
   - **Name**: `youtube-watch-party-backend`
   - **Region**: Select closest region (e.g., Singapore, Frankfurt, Oregon)
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
3. **Environment Variables on Render**:
   Add the following under the **Environment** tab:
   - `NODE_ENV` = `production`
   - `PORT` = `10000` (or leave default, Render sets `PORT` automatically)
   - `MONGODB_URI` = `mongodb+srv://<username>:<password>@cluster.mongodb.net/youtube-watch-party?retryWrites=true&w=majority`
   - `CLIENT_URL` = `https://your-frontend-app.onrender.com` (or your frontend deployment URL)
4. **Deploy**:
   - Click **Create Web Service**.
   - Monitor logs. Verify that `HTTP Server` and `MongoDB connection established successfully` are logged.
   - Test `https://your-backend-service.onrender.com/api/health` to confirm `status: "ok"`.

---

## 16. Verification & Test Execution

Run the full automated test suite containing unit, integration, and load tests:

```bash
# Run comprehensive checklist test (Validates all 7 categories)
npx tsx tests/comprehensiveChecklist.test.ts

# Run RBAC & anti-spoofing verification
npx tsx tests/rbac.test.ts

# Run change-request approval workflow verification
npx tsx tests/actionRequest.test.ts

# Run playback synchronization test
npx tsx tests/playbackSync.test.ts

# Type-check entire codebase
npm run typecheck
```
