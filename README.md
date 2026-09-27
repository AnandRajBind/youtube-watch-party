# YouTube Watch Party

A synchronized YouTube watch party web application built with **React**, **Node.js**, **Express**, **Socket.IO**, and **MongoDB**.

It allows multiple users to watch YouTube videos together in sync. Key highlights include server-authoritative playback synchronization, a strict three-tier Role-Based Access Control (RBAC) hierarchy, and a participant change-request approval workflow where guests can suggest playback changes without disrupting the room.

---

## 🌐 Live Deployments

- **Frontend App**: [https://youtube-watch-party-dcfh.onrender.com](https://youtube-watch-party-dcfh.onrender.com)
- **Backend API**: [https://youtube-watch-party-f6i3.onrender.com](https://youtube-watch-party-f6i3.onrender.com)
- **Health Check**: [https://youtube-watch-party-f6i3.onrender.com/api/health](https://youtube-watch-party-f6i3.onrender.com/api/health)

---

## 🚀 Key Highlights & Architecture

### 1. Server-Authoritative Playback Synchronization
Playback state (`play`, `pause`, `seek`, `change_video`) is validated and orchestrated centrally on the server.
- **Anti-Echo Mechanism**: When a Host or Moderator performs an action, the server updates state and broadcasts to `socket.to(roomCode)` (omitting the sender). This prevents duplicate action echoes, player stutter, and infinite sync loops.
- **Virtual Playback Time Calculation**: Instead of writing the playhead position to the database every second, the server stores an anchor timestamp (`playbackTime`, `lastUpdatedAt`, and `playbackState`). Virtual elapsed time is calculated dynamically on read:
  $$\text{currentTime} = \begin{cases} \text{playbackTime} + (\text{now} - \text{lastUpdatedAt}), & \text{if state is PLAYING} \\ \text{playbackTime}, & \text{if state is PAUSED} \end{cases}$$

### 2. Role-Based Access Control (RBAC) Matrix
Permissions are strictly verified against MongoDB on the server for every HTTP and WebSocket request. Client-sent roles (`{ role: "host" }`) are completely ignored.

| Action | Host | Moderator | Participant | Server Enforcement |
| :--- | :---: | :---: | :---: | :--- |
| **Play / Pause / Seek** | ✅ | ✅ | ❌ | `canControlPlayback(role)` |
| **Change Video** | ✅ | ✅ | ❌ | `canControlPlayback(role)` |
| **Request Action** | ✅ | ✅ | ✅ | Allowed for all room members |
| **Approve / Reject Request** | ✅ | ✅ | ❌ | `canApproveAction(role)` |
| **Assign Roles (Promote/Demote)** | ✅ | ❌ | ❌ | `canManageRoles(role)` |
| **Remove / Kick Participant** | ✅ | ❌ | ❌ | `canRemoveParticipant(role)` |
| **Transfer Host Ownership** | ✅ | ❌ | ❌ | `canTransferHost(role)` |

### 3. Participant Change-Request Approval Workflow
Participants cannot alter playback directly. Instead, when they attempt an action, they submit a change request (`request_action`).
1. Host and Moderator receive real-time notification with a pending request queue badge.
2. Clicking **Approve** automatically executes the action (seek, pause, play, or video change) across the entire room.
3. Clicking **Reject** notifies the requester with an optional reason; room playback remains untouched.
4. Requests expire automatically after 5 minutes in an in-memory queue.

### 4. Resilient Session Continuity & Multi-Tab Presence
- **Multi-Tab Presence**: Opening multiple tabs from the same browser user session tracks all active socket connections without duplicating participant counts or accidentally emitting `user_left` until the last tab closes.
- **Page Refresh Continuity**: Refreshing the browser or opening a direct link (`/room/:roomCode`) automatically restores session identity and re-establishes socket synchronization.
- **Render SPA Fallback**: Configured with `/* -> /index.html` rewrite on Render static site to ensure direct shared room URLs always load properly.

---

## 🛠️ Tech Stack

### Frontend
- **React 19** with **TypeScript**
- **Vite** for fast builds and optimized production bundling
- **Tailwind CSS v4** for modern, responsive UI design
- **Socket.IO Client** for real-time WebSocket communication
- **React Router DOM v7** for SPA routing
- **Axios** for REST API communication
- **YouTube IFrame API** for video playback control

### Backend
- **Node.js** & **Express** with **TypeScript** (configured for `Node16`/`ES2022`)
- **Socket.IO v4** for real-time bidirectional room events
- **MongoDB** & **Mongoose v8** with 24-hour TTL indexes (`expiresAt`)
- **Zod** for runtime schema validation on HTTP requests and environment variables
- **Helmet** & **CORS** for HTTP security headers and origin whitelisting
- **In-Memory Rate Limiting** to prevent brute-force room creation and API abuse

---

## 📁 Repository Structure

```text
youtube-watch-party/
├── backend/
│   ├── src/
│   │   ├── config/          # MongoDB connection & Zod env validation
│   │   ├── controllers/     # Health check & room REST controllers
│   │   ├── middleware/      # Rate limiter, validation, and error handlers
│   │   ├── models/          # Mongoose Room schema with 24h TTL
│   │   ├── routes/          # Express routes (/api/health, /api/rooms)
│   │   ├── services/        # Business logic (sync, permissions, room, action requests)
│   │   ├── sockets/         # Socket.IO handlers (room, sync, roles, requests)
│   │   ├── types/           # Domain interfaces & TypeScript enums
│   │   ├── utils/           # YouTube parser, room code generator, logger
│   │   ├── app.ts           # Express application setup
│   │   └── server.ts        # Server entry point
│   ├── tests/               # Automated test suites (RBAC, sync, API, checklist)
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── components/      # UI components (player, controls, queue, modals)
│   │   ├── hooks/           # useWatchPartySocket custom hook
│   │   ├── layouts/         # Main layout shell
│   │   ├── pages/           # HomePage, RoomPage, NotFoundPage
│   │   ├── services/        # Axios API client
│   │   ├── socket/          # Socket.IO client instance
│   │   ├── types/           # Shared frontend type definitions
│   │   └── utils/           # Clipboard, permission helpers, YouTube parser
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
│
├── render.yaml              # Render blueprint deployment specification
└── README.md
```

---

## ⚙️ Local Development Setup

### Prerequisites
- Node.js (v20 or newer)
- npm (v10 or newer)
- MongoDB instance (local or MongoDB Atlas connection string)

### 1. Clone the Repository
```bash
git clone https://github.com/AnandRajBind/youtube-watch-party.git
cd youtube-watch-party
```

### 2. Configure & Run Backend
```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/youtube-watch-party
CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

Install dependencies and start the backend in watch mode:
```bash
npm install
npm run dev
```
The backend starts at `http://localhost:5000`.

### 3. Configure & Run Frontend
In a new terminal window:
```bash
cd frontend
cp .env.example .env
```

Edit `frontend/.env`:
```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

Install dependencies and start Vite dev server:
```bash
npm install
npm run dev
```
The frontend starts at `http://localhost:5173`.

---

## 🧪 Testing & Verification

Run the automated test suites covering playback synchronization, role enforcement, and room management:

```bash
# Run comprehensive backend checklist test
cd backend
npx tsx tests/comprehensiveChecklist.test.ts

# Run role permission (RBAC) verification test
npx tsx tests/rbac.test.ts

# Run change-request approval workflow test
npx tsx tests/actionRequest.test.ts

# Type-check both codebases
cd backend && npm run typecheck
cd ../frontend && npm run typecheck

# Production build verification
cd ../backend && npm run build
cd ../frontend && npm run build
```

---

## 🚢 Render Deployment

The repository includes a [`render.yaml`](render.yaml) blueprint for one-click deployment.

### Backend (Web Service)
- **Root Directory**: `backend`
- **Build Command**: `npm install --include=dev && npm run build`
- **Start Command**: `npm start`
- **Health Check Path**: `/api/health`
- **Environment Variables**:
  - `NODE_ENV`: `production`
  - `MONGODB_URI`: `<Your MongoDB Atlas connection URI>`
  - `CLIENT_URL`: `https://youtube-watch-party-dcfh.onrender.com`

### Frontend (Static Site)
- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Publish Directory**: `dist`
- **SPA Rewrite Rule**:
  - Source: `/*`
  - Destination: `/index.html`
- **Environment Variables**:
  - `VITE_API_URL`: `https://youtube-watch-party-f6i3.onrender.com`
  - `VITE_SOCKET_URL`: `https://youtube-watch-party-f6i3.onrender.com`

---

## 🔒 Security Best Practices

1. **Server-Enforced Roles**: Role permissions are verified from MongoDB for each action; client-side tampering is rendered impossible.
2. **Input Sanitization**: Usernames are validated with strict regex (`/^[a-zA-Z0-9_\s-]+$/`) and stripped of HTML brackets. Room codes follow standard `XXX-XXX` format.
3. **YouTube URL Sanitization**: Video IDs are validated through strict regex, rejecting malicious injection strings with `INVALID_VIDEO_ID`.
4. **NoSQL Injection Guard**: Queries use strict Mongoose schemas with parameterized primitives.
5. **Rate Limiting**: Protects against automated room creation spam (30 rooms/min per IP) and general API spam (120 req/min per IP).
6. **Error Masking**: Stack traces are hidden in production to prevent information disclosure.
