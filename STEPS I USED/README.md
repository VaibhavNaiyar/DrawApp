# DrawApp — Complete Build Notes

A real-time collaborative whiteboard app built from scratch. Users can draw together in the same room with end-to-end encryption, live cursor presence, and persistent shape history.

**Reference repo:** [coderomm/CollabyDraw](https://github.com/coderomm/CollabyDraw)

---

## Table of Contents

- [Phase 1 — Architecture Audit](#phase-1--architecture-audit)
- [Phase 2 — DB & Auth Alignment](#phase-2--db--auth-alignment)
- [Phase 3 — Drawing WebSocket Server](#phase-3--drawing-websocket-server)
- [Phase 4 — Frontend Core & Standalone Canvas](#phase-4--frontend-core--standalone-canvas)
- [Phase 5 — Real-Time Sync & E2EE](#phase-5--real-time-sync--e2ee)
- [Phase 6 — Polish](#phase-6--polish)
- [Phase 7 — Deployment & Docker](#phase-7--deployment--docker)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | Turborepo + pnpm workspaces |
| Frontend | Next.js 15, TypeScript |
| Auth | NextAuth v5 (beta) — Credentials + JWT strategy |
| Database | PostgreSQL 16 via Prisma v6 |
| Drawing WS | Custom Node.js WebSocket server (port 8081) |
| Chat WS | Original reference server (port 8080) — never removed |
| HTTP API | Express (port 3001) |
| Drawing lib | roughjs (shapes) + perfect-freehand (pencil) |
| Encryption | Web Crypto API — AES-GCM-256 |
| Deployment | Docker Compose, esbuild bundles, Next.js standalone |

---

## Phase 1 — Architecture Audit

**Goal:** Understand the existing codebase and the reference repo before writing any code. Identify what to keep, what to replace, and what's missing.

---

### 1.1 — Monorepo Structure

```
DrawApp/
├── apps/
│   ├── web/              ← Next.js 15 frontend (port 3000)
│   ├── http-backend/     ← Express REST API (port 3001)
│   ├── ws-backend/       ← Original chat WebSocket server (port 8080)
│   └── draw-ws/          ← NEW: Drawing WebSocket server (port 8081)
├── packages/
│   ├── common/           ← Shared types: WsDataType enum, WebSocketMessage, Zod schemas
│   ├── backend-common/   ← Shared secrets: AUTH_SECRET, JWT_SECRET alias
│   └── db/               ← Prisma client singleton
├── docker/               ← One Dockerfile per service
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

**Key decision:** Keep the existing `ws-backend` (chat server) completely intact as a learning reference. The drawing server is built as a separate service (`draw-ws`) on a different port so the two never interfere.

---

### 1.2 — Gaps Found in the Original Code

| Area | Problem | Phase Fixed |
|---|---|---|
| Prisma | v5 with `previewFeatures = ["driverAdapters"]` — now stable in v6 | 2 |
| Auth | Used `JWT_SECRET`, no NextAuth setup | 2 |
| DB Schema | Integer room IDs (enumerable/guessable), `username` field, no `Shape` table | 2 |
| WS events | Untyped string events (`"join_room"`, etc.) — no shared enum | 2 |
| Draw WS | Didn't exist | 3 |
| Canvas | Chat-based room page, no drawing functionality | 4 |
| Encryption | None — shapes stored as plaintext | 5 |
| Docker | Dockerfiles existed but had runtime bugs (no Prisma binary, wrong ports) | 7 |

---

### 1.3 — Rules Established

1. **Never remove the chat `ws-backend`** — it stays as a working reference
2. **Audit first, code second** — read existing code before modifying anything
3. **One secret (`AUTH_SECRET`)** — shared across NextAuth, the WS token endpoint, and http-backend middleware
4. **esbuild for all backends** — single bundled output file, faster than `tsc`, smaller Docker images
5. **GitHub Actions per service** — path-based filtering so frontend changes don't rebuild the WS Docker image

---

## Phase 2 — DB & Auth Alignment

### Rule: Audit first, code second. Chat ws-backend is NEVER removed (kept as learning reference).

---

### 2.1 — Prisma Upgrade (v5 → v6)

**File:** `packages/db/package.json`

```json
"@prisma/adapter-neon": "^6.5.0",
"@prisma/client": "^6.5.0",
"prisma": "^6.5.0"
```

**Why:** Prisma 6 promotes driver adapters (like the Neon adapter) from `previewFeatures` to stable. The `previewFeatures = ["driverAdapters"]` flag in `schema.prisma` is removed.

---

### 2.2 — New Prisma Schema

**File:** `packages/db/prisma/schema.prisma`

```prisma
model User {
  id            String    @id @default(cuid())
  name          String
  email         String    @unique
  emailVerified DateTime?
  password      String
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  rooms  Room[]
  shapes Shape[]
}

model Room {
  id        String   @id @default(cuid())
  adminId   String
  admin     User     @relation(fields: [adminId], references: [id])
  shapes    Shape[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Shape {
  id        String   @id @default(cuid())
  message   String   -- JSON-encoded shape data (will be E2EE encrypted in Phase 5)
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  roomId    String
  room      Room     @relation(fields: [roomId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Decision breakdown:**

| Change | Why |
|---|---|
| UUID → cuid | URL-safe, sortable, unguessable, shorter than UUID |
| Removed `username` | App is email-based. Username is redundant when email is already unique |
| Added `emailVerified` | NextAuth stores OAuth verification timestamp here. Needed for Google/GitHub sign-in later |
| `image` not `photo` | NextAuth convention — OAuth providers return `image`, not `photo` |
| Added `updatedAt` | Good practice. Required if switching to NextAuth DB sessions later |
| Room ID: Int → String cuid | Integer IDs (1,2,3) are enumerable — anyone can guess room IDs. Cuids are unguessable |
| Removed `Room.slug` | Rooms are identified by ID only. Slug was cosmetic and added DB complexity for no gain |
| Chat → Shape | We store drawing shapes, not chat messages. The `message` field now holds JSON-encoded shape data |

---

### 2.3 — GlobalThis Singleton (Prisma Client)

**File:** `packages/db/src/index.ts`

```typescript
declare const globalThis: {
  prismaGlobal: PrismaClient | undefined;
} & typeof global;

function createPrismaClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaNeon(pool);
  return new PrismaClient({ adapter });
}

export const prismaClient = globalThis.prismaGlobal ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prismaClient;
}
```

**Why:** Next.js hot-reloads modules constantly in development. Without this singleton, every reload creates a new `PrismaClient` + new Neon connection pool. You quickly hit Neon's connection limit. The `globalThis` trick reuses the same instance across reloads.

Also fixed a bug: dotenv path was `"../.env"` (wrong — goes to `packages/db/`) changed to `"../../../.env"` (correct — goes to workspace root).

---

### 2.4 — AUTH_SECRET replaces JWT_SECRET

**File:** `packages/backend-common/src/index.ts`

```typescript
export const AUTH_SECRET = parsed.data.AUTH_SECRET;
export const JWT_SECRET = parsed.data.AUTH_SECRET; // alias for old ws-backend
```

**Why:** NextAuth v5 specifically requires an env var named `AUTH_SECRET`. To use one single secret for everything (NextAuth sessions, WS token verification, http-backend JWT middleware), we standardize on `AUTH_SECRET`. The `JWT_SECRET` alias keeps the old chat ws-backend compiling without any changes.

**Root `.env` change:**
```
# Old
JWT_SECRET=your-secret

# New
AUTH_SECRET=your-secret
```

---

### 2.5 — Updated Zod Schemas + WS Types

**File:** `packages/common/src/types.ts`

```typescript
// Email-based auth
export const SignupSchema = z.object({
  email: z.string().email().trim(),
  name: z.string().min(2).trim(),
  password: z.string()
    .min(6)
    .regex(/[a-zA-Z]/, "Must contain at least one letter.")
    .regex(/[0-9]/, "Must contain at least one number.")
    .regex(/[^a-zA-Z0-9]/, "Must contain at least one special character.")
    .trim(),
});

export const SigninSchema = z.object({
  email: z.string().email().trim(),
  password: z.string().min(1),
});

// WebSocket event enum — shared by frontend AND drawing ws-backend
export enum WsDataType {
  JOIN = "JOIN",
  LEAVE = "LEAVE",
  USER_JOINED = "USER_JOINED",
  USER_LEFT = "USER_LEFT",
  DRAW = "DRAW",
  ERASER = "ERASER",
  UPDATE = "UPDATE",
  EXISTING_PARTICIPANTS = "EXISTING_PARTICIPANTS",
  CLOSE_ROOM = "CLOSE_ROOM",
  CONNECTION_READY = "CONNECTION_READY",
  EXISTING_SHAPES = "EXISTING_SHAPES",
  STREAM_SHAPE = "STREAM_SHAPE",
  STREAM_UPDATE = "STREAM_UPDATE",
  CURSOR_MOVE = "CURSOR_MOVE",
}

// Typed WS message — same shape sent/received on all sides
export interface WebSocketMessage {
  id: string | null;
  type: WsDataType;
  connectionId: string;   // unique per browser tab
  roomId: string;
  userId: string;
  userName: string | null;
  message: string | null; // JSON-encoded shape data or null
  participants: RoomParticipants[] | null;
  timestamp: string | null;
}
```

**Why the enum:** Raw strings like `"join_room"` are error-prone. An enum means TypeScript catches typos at compile time. Both frontend and backend share the exact same event names from one source of truth in `@repo/common`.

**Why weak signin password rules:** We only enforce strong password at signup. At signin we just check `min(1)` — we don't want to lock out users from older accounts.

---

### 2.6 — NextAuth v5 Setup

NextAuth v5 is the latest. It requires splitting config into two files because of the Edge runtime constraint.

**The Edge runtime problem:**
- `middleware.ts` runs in the Edge runtime (like Cloudflare Workers)
- Edge runtime CANNOT use Node.js native modules: `bcrypt`, Prisma, `ws`
- But verifying a JWT (for middleware auth) doesn't need DB access
- Solution: split the config

**File 1: `apps/web/auth.config.ts`** (Edge-safe)
```typescript
export const authConfig: NextAuthConfig = {
  pages: { signIn: "/signin" },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isProtected = nextUrl.pathname.startsWith("/dashboard") ||
                          nextUrl.pathname.startsWith("/room");
      if (isProtected) return isLoggedIn;
      return true;
    },
  },
  providers: [], // no providers here — no DB/bcrypt needed
};
```

**File 2: `apps/web/auth.ts`** (Full Node.js — has Prisma + bcrypt)
```typescript
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,  // spread the edge config
  providers: [
    Credentials({
      async authorize(credentials) {
        // Validate with Zod
        const parsed = SigninSchema.safeParse(credentials);
        if (!parsed.success) return null;

        // Hit DB directly
        const user = await prismaClient.user.findUnique({ where: { email } });
        if (!user) return null;

        // Verify password
        const match = await bcrypt.compare(password, user.password);
        if (!match) return null;

        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  session: { strategy: "jwt" }, // JWT not DB sessions (needed for WS auth)
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.userId = user.id; // store userId in JWT
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.userId as string; // expose in session
      return session;
    },
  },
});
```

**File 3: `apps/web/middleware.ts`** (uses edge-safe config)
```typescript
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);
export default auth;

export const config = {
  matcher: ["/dashboard/:path*", "/room/:path*"],
};
```

**Why `session: { strategy: "jwt" }`:** The WebSocket server needs to verify the user. If we used database sessions, the WS server would need to query the DB on every connection. With JWT strategy, the WS server just verifies the token cryptographically — no DB call needed.

---

### 2.7 — API Routes Restructured

**Deleted:**
- `app/api/auth/signin/route.ts` — NextAuth handles `POST /api/auth/callback/credentials` itself. Having a static `signin` route there blocks NextAuth's own handler
- `app/api/auth/signout/route.ts` — Same reason. NextAuth handles `POST /api/auth/signout`

**Created:**
- `app/api/auth/[...nextauth]/route.ts` — Catch-all for all NextAuth internals

```typescript
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

**Updated: `app/api/auth/signup/route.ts`**
Now hits Prisma directly (no Express proxy). Cleaner, faster, no network hop.
```typescript
const { email, name, password } = parsed.data;
const hashedPassword = await bcrypt.hash(password, 10);
await prismaClient.user.create({ data: { email, name, password: hashedPassword } });
return NextResponse.json({ ok: true });
```

**Updated: `app/api/auth/token/route.ts`**
Issues a WS-specific JWT from the NextAuth session.
```typescript
const session = await auth();
// Sign a fresh JWT specifically for WebSocket auth
const wsToken = jwt.sign(
  { userId: session.user.id, name: session.user.name },
  process.env.AUTH_SECRET!,
  { expiresIn: "1h" }
);
return NextResponse.json({ token: wsToken });
```

**Why issue a separate WS JWT:** The NextAuth session cookie (`authjs.session-token`) is an encrypted JWT. The WS server (a plain Node.js process) can't easily decrypt NextAuth's proprietary format. Instead we issue a plain `{ userId, name }` JWT signed with `AUTH_SECRET` that any `jsonwebtoken.verify()` call can read.

---

### 2.8 — Frontend Pages Updated

**signin/page.tsx:** Username field → Email field. Uses `signIn()` from `next-auth/react` instead of `fetch("/api/auth/signin")`.

**signup/page.tsx:** Username field → Name field. After successful registration, automatically calls `signIn()` so the user lands on the dashboard without having to sign in manually.

**dashboard/page.tsx:** Uses `signOut()` from `next-auth/react`. Room IDs changed from numeric inputs to text inputs (cuids are strings like `clx4k2...`).

---

### 2.9 — next.config.ts

```typescript
const nextConfig: NextConfig = {
  serverExternalPackages: ["ws", "@neondatabase/serverless", "bcrypt"],
};
```

**Why:** Next.js webpack tries to bundle ALL imports — including server-only Node.js packages. `ws` (WebSocket), `@neondatabase/serverless`, and `bcrypt` use native Node.js APIs and will fail if webpack tries to bundle them for the browser. `serverExternalPackages` tells webpack: "leave these alone — they're server-side only."

---

### 2.10 — HTTP Backend Updates

**middlewares.ts:** Uses `AUTH_SECRET` instead of `JWT_SECRET`. Handles both `decoded.sub` (NextAuth JWT format where user ID is in `sub`) and `decoded.userId` (our custom JWT format) — makes it robust to both token types.

**index.ts:**
- Signup: `email + name + password` (no username)
- Signin: lookup by `email` (not username)
- `POST /room`: no slug, just creates room with adminId, returns cuid
- `GET /room/:id`: accepts String ID (cuid), not number

---

### 2.11 — Docker & CI/CD

**Three Dockerfiles** (one per service):
- `docker/Dockerfile.frontend` — Multi-stage Next.js build
- `docker/Dockerfile.websocket` — Chat ws-backend (reference)
- `docker/Dockerfile.http-backend` — Express REST backend

**docker-compose.yml** — Orchestrates all services + local PostgreSQL 16.

**Three GitHub Actions workflows:**
- `.github/workflows/cd_frontend.yml` — Triggers on changes to `apps/web/**` or `packages/**`
- `.github/workflows/cd_ws.yml` — Triggers on changes to `apps/ws-backend/**` or `packages/**`
- `.github/workflows/cd_http.yml` — Triggers on changes to `apps/http-backend/**` or `packages/**`

**Path filtering on workflows is important:** Pushing a frontend fix should NOT re-build the WebSocket Docker image. Each pipeline only runs for the files it owns.

**Deploy step is commented out** — needs `VM_HOST`, `VM_USERNAME`, `SSH_PRIVATE_KEY` GitHub secrets. Uncomment when a server is provisioned.

---

## Commands to Run After Phase 2

```bash
# 1. Start a local Postgres container (new port 5433 if 5432 is taken)
docker run -d \
  --name drawapp-db \
  -e POSTGRES_DB=drawapp \
  -e POSTGRES_USER=drawapp \
  -e POSTGRES_PASSWORD=drawapp_dev \
  -p 5433:5432 \
  --restart unless-stopped \
  postgres:16-alpine

# 2. Update root .env
# AUTH_SECRET=your-strong-secret
# DATABASE_URL=postgresql://drawapp:drawapp_dev@localhost:5433/drawapp
# NEXT_PUBLIC_BASE_URL=http://localhost:3000
# NEXT_PUBLIC_WS_URL=ws://localhost:8080
# NEXT_PUBLIC_HTTP_URL=http://localhost:3001

# 3. Install new dependencies
pnpm install

# 4. Run DB migration (DESTRUCTIVE — creates new schema)
cd packages/db
pnpm db:migrate
# Enter migration name: schema_alignment

# 5. Start everything
cd ../..
pnpm dev

# 6. Verify DB tables
docker exec -it drawapp-db psql -U drawapp -d drawapp -c "\dt"
# Should show: User, Room, Shape
```

---

## GitHub Actions Secrets Required

Set these in GitHub → Settings → Secrets → Actions:

| Secret | Description |
|---|---|
| `DOCKER_USERNAME` | Your Docker Hub username |
| `DOCKER_PASSWORD` | Your Docker Hub password / access token |
| `DATABASE_URL` | Neon (or hosted Postgres) connection string |
| `AUTH_SECRET` | Same secret used in all services |
| `NEXT_PUBLIC_BASE_URL` | e.g. `https://yourdomain.com` |
| `NEXT_PUBLIC_WS_URL` | e.g. `wss://ws.yourdomain.com` |
| `NEXT_PUBLIC_HTTP_URL` | e.g. `https://api.yourdomain.com` |
| `VM_HOST` | Server IP (for SSH deploy — uncomment deploy step) |
| `VM_USERNAME` | Server SSH username |
| `SSH_PRIVATE_KEY` | Private key for SSH access to server |

---

---

## Phase 3 — Drawing WebSocket Server

**New service:** `apps/draw-ws/` running on port **8081**.
The existing chat `ws-backend` (port 8080) is kept untouched as a reference.

---

### 3.1 — Why a separate server?

| Concern | Detail |
|---|---|
| Separation of concerns | Chat and drawing are completely different protocols. Mixing them in one server creates confusion |
| Independent scaling | The drawing WS receives far more messages than chat (every mouse move = a CURSOR_MOVE event). They need to scale independently |
| Reference stays clean | The chat ws-backend is kept intact as a learning reference. A separate drawing server doesn't pollute it |

---

### 3.2 — Architecture: Chat WS vs Draw WS

| Feature | Chat ws-backend (reference) | Draw-ws (new) |
|---|---|---|
| Port | 8080 | 8081 |
| Room ID type | `number` | `string` (cuid) |
| Events | `join_room`, `leave_room`, `chat` | 14 typed events (enum) |
| Connection tracking | Array of users | `Map<connectionId, user>` |
| Multi-tab support | No | Yes — unique `connectionId` per tab |
| Shape/message persistence | DB (Chat table) | DB (Shape table) + in-memory cache |
| Cursor tracking | No | Yes — CURSOR_MOVE event |
| Build tool | `tsc` | `esbuild` (single bundled file, faster) |

---

### 3.3 — In-Memory State Design

Three Maps power the server:

```typescript
// Every active WebSocket tab/connection
const connections = new Map<string, ConnectedUser>();
//   connectionId  →  { userId, userName, ws, rooms: Set<roomId> }

// Which connections are in which room
const roomConnections = new Map<string, Set<string>>();
//   roomId  →  Set of connectionIds

// Cached shapes per room (loaded from DB on first join)
const roomShapes = new Map<string, WebSocketMessage[]>();
//   roomId  →  array of shape messages
```

**Why Maps over Arrays:** The chat ws-backend used arrays and scanned them with `find()`. With Maps, lookup is O(1) instead of O(n). Critical when you have hundreds of concurrent connections.

**Why cache shapes in memory:** Every time a shape is drawn it gets broadcast immediately. If we fetched from DB on every broadcast, latency would spike. Pattern: load from DB once on first join → keep in memory → write to DB on DRAW/UPDATE/ERASER → free memory when room empties.

---

### 3.4 — Multi-Tab Awareness

A single user can have the same whiteboard open in 3 browser tabs. Each tab:
- Gets its own `connectionId` (a UUID assigned server-side on connect)
- Is a separate entry in `connections` Map
- Has the same `userId`

`getParticipants()` deduplicates by `userId` when building the participant list so 3 tabs = 1 participant shown in the UI.

---

### 3.5 — All 14 WebSocket Events

| Event | Direction | Persisted? | Description |
|---|---|---|---|
| `CONNECTION_READY` | Server → Client | No | Sent immediately on connect. Carries the assigned `connectionId` |
| `JOIN` | Client → Server | No | Enter a drawing room |
| `EXISTING_SHAPES` | Server → Client | No | Sent to the joining user — all shapes currently in the room |
| `EXISTING_PARTICIPANTS` | Server → Client | No | Sent to the joining user — who is currently in the room |
| `USER_JOINED` | Server → Room | No | Broadcast to everyone else when a user joins |
| `LEAVE` | Client → Server | No | Explicit room exit |
| `USER_LEFT` | Server → Room | No | Broadcast when a user leaves or disconnects |
| `DRAW` | Client → Server → Room | **Yes** | A completed shape (on mouse-up). Stored in DB + memory |
| `STREAM_SHAPE` | Client → Server → Room | No | Live preview while drawing (every mouse-move). Not persisted |
| `ERASER` | Client → Server → Room | **Yes** | Delete shapes by ID. Removed from DB + memory |
| `UPDATE` | Client → Server → Room | **Yes** | Shape property changed (color, size…). Updated in DB + memory |
| `STREAM_UPDATE` | Client → Server → Room | No | Live preview while resizing/moving. Not persisted |
| `CURSOR_MOVE` | Client → Server → Room | No | Broadcast cursor `{ x, y }` to all others. Never persisted |
| `CLOSE_ROOM` | Client → Server → Room | No | Admin-only. Evicts all connections, wipes memory (DB kept) |

---

### 3.6 — Data Flow: Joining a Room

```
User navigates to /room/[roomId]
        │
        ▼
Frontend:
  1. GET /api/auth/token  → receives wsToken (JWT signed with AUTH_SECRET)
  2. new WebSocket("ws://localhost:8081?token=<wsToken>")
        │
        ▼
draw-ws connection handler:
  1. Parse token from query string
  2. jwt.verify(token, AUTH_SECRET) → extract userId, userName
  3. connectionId = randomUUID()
  4. connections.set(connectionId, { userId, userName, ws, rooms: new Set() })
  5. send CONNECTION_READY { connectionId }
        │
        ▼
Frontend sends JOIN: { type: "JOIN", roomId: "clx..." }
        │
        ▼
draw-ws JOIN handler:
  1. prismaClient.room.findUnique({ id: roomId }) — validate room exists
  2. user.rooms.add(roomId)
  3. roomConnections[roomId].add(connectionId)
  4. If first user in room: load all shapes from DB into roomShapes[roomId]
  5. send EXISTING_SHAPES { message: JSON.stringify(shapes) }
  6. send EXISTING_PARTICIPANTS { participants: [...] }
  7. broadcast USER_JOINED to everyone else
```

---

### 3.7 — Data Flow: Drawing a Shape

```
User draws on canvas (mouse-up)
        │
        ▼
Frontend sends DRAW:
{ type: "DRAW", roomId: "clx...", id: null, message: "{...shape data...}" }
        │
        ▼
draw-ws DRAW handler:
  1. Assign shapeId = randomUUID()
  2. Stamp { connectionId, userId, userName, timestamp }
  3. Push to roomShapes[roomId] (memory)
  4. prismaClient.shape.create({ id: shapeId, message: JSON.stringify(shape) })
  5. broadcast(roomId, shape, excludeConnId=connectionId)
        │
        ▼
Every other connection in the room renders the shape
```

---

### 3.8 — Shape Persistence Strategy

| Event | Memory | Database |
|---|---|---|
| DRAW | Push to `roomShapes[roomId]` | `shape.create()` |
| ERASER | Filter out shape IDs | `shape.deleteMany()` |
| UPDATE | Replace shape at index | `shape.update()` |
| STREAM_SHAPE | Nothing | Nothing |
| STREAM_UPDATE | Nothing | Nothing |
| CURSOR_MOVE | Nothing | Nothing |
| Room empty | `roomShapes.delete(roomId)` | Untouched (source of truth) |
| Room rejoined | Reload from DB into memory | Unchanged |

Shapes are **never deleted from the DB** when a room closes — only when the eraser tool is used. Drawing history is always recoverable.

---

### 3.9 — Build Tool: esbuild

```json
"build": "esbuild src/index.ts --bundle --platform=node --format=cjs --outfile=dist/index.js"
```

| | `tsc` | `esbuild` |
|---|---|---|
| Output | Many `.js` files | Single `dist/index.js` (all bundled) |
| Build time | Slow (full type checking) | ~10ms (no type checking) |
| `node_modules` needed at runtime | Yes | No — all deps bundled in |
| Docker image size | Larger | Smaller |

Type checking is done separately via `tsc --noEmit`. esbuild is only for the production artifact.

---

### 3.10 — draw-ws Folder Structure (Refactored)

The original `src/index.ts` was 413 lines — everything in one file. Refactored into modules:

```
apps/draw-ws/src/
├── index.ts                   ← entry point only (3 lines of logic)
├── connection.ts              ← JWT auth + message routing switch
├── types.ts                   ← ConnectedUser interface
├── state.ts                   ← connections, roomConnections, roomShapes Maps
├── utils/
│   ├── broadcast.ts           ← broadcast(), send(), stampMessage()
│   └── participants.ts        ← getParticipants() (dedup by userId)
└── handlers/
    ├── onJoin.ts
    ├── onDraw.ts
    ├── onEraser.ts
    ├── onUpdate.ts
    ├── onBroadcastOnly.ts     ← STREAM_SHAPE, STREAM_UPDATE, CURSOR_MOVE
    ├── onLeave.ts             ← leaveRoom() + onLeave()
    └── onCloseRoom.ts
```

**`stampMessage()` utility** — extracted from a closure inside the message handler to a standalone function in `broadcast.ts`. Every handler uses it to stamp outgoing messages with `connectionId`, `userId`, `userName`, and `timestamp`.

**`onBroadcastOnly`** — STREAM_SHAPE, STREAM_UPDATE, and CURSOR_MOVE have identical logic: guard check → stamp → broadcast (excluding sender). One handler covers all three.

---

### 3.11 — Package & Config Fixes

| File | Change | Why |
|---|---|---|
| `apps/web/package.json` | `"next-auth": "beta"` (was `"^5.0.0"`) | v5 is on the `beta` npm tag — `^5.0.0` doesn't resolve on the stable channel |
| `packages/common/package.json` | Added `"default": "./dist/index.js"` to exports | esbuild's active conditions include `default` but not `require` |
| `packages/backend-common/package.json` | Same `"default"` condition added | Same reason |
| `packages/db/package.json` | Added `"main"` + `"types"` pointing to `./src/index.ts` | With `moduleResolution: node`, TypeScript ignores `exports` field — needs `main`/`types` to resolve |
| `apps/draw-ws/tsconfig.json` | `"module": "CommonJS"`, `"moduleResolution": "node"` | Base tsconfig uses NodeNext which requires `.js` extensions on all relative imports — CommonJS avoids this |

---

### 3.12 — Bug Fixes

| Bug | Old code | Fixed code |
|---|---|---|
| Eraser filter logic | `s.id !== null && !idsToRemove.includes(s.id)` — dropped null-id shapes AND kept targeted shapes | `!s.id \|\| !idsToRemove.includes(s.id)` — keeps null-id shapes (untargetable), removes matched IDs |
| `ws.on("message")` type | `data` param untyped | Typed as `RawData` from `ws` package |

---

### Commands to Run After Phase 3

```bash
pnpm install
pnpm dev
# draw-ws starts on port 8081

# Type-check
cd apps/draw-ws
node_modules/.bin/tsc --noEmit

# Production build
node_modules/.bin/esbuild src/index.ts --bundle --platform=node --format=cjs --outfile=dist/index.js

# Test with wscat
npx wscat -c "ws://localhost:8081?token=<token-from-/api/auth/token>"
```

---

---

## Phase 4 — Frontend Core & Standalone Canvas

**Goal:** A full-screen drawing canvas on the room page that works entirely offline (no WebSocket). Phase 5 will connect it to `draw-ws`.

**Libraries added:**
- `roughjs@^4.6.6` — hand-drawn sketch aesthetic for shapes (rectangles, ellipses, lines, arrows)
- `perfect-freehand@^1.2.2` — pressure-sensitive smooth pencil strokes

---

### 4.1 — New File Structure

```
apps/web/
├── components/
│   └── canvas/
│       ├── types.ts              ← Shape discriminated union, Tool type, CanvasSettings
│       ├── hitTest.ts            ← Per-shape hit detection + bounding box
│       ├── renderer.ts           ← renderCanvas() — pure drawing, no React
│       ├── useDrawHistory.ts     ← Undo/redo stack (pos+historyRef pattern)
│       ├── Toolbar.tsx           ← Floating left-side toolbar
│       ├── Toolbar.module.css
│       ├── DrawCanvas.tsx        ← Main "use client" canvas component
│       └── DrawCanvas.module.css
└── app/
    └── room/[roomId]/
        ├── page.tsx              ← Replaced: server component → renders DrawCanvas
        └── room.module.css       ← Simplified to full-screen container
```

---

### 4.2 — Shape Type System (`types.ts`)

All shapes use a **discriminated union** on the `type` field:

```typescript
export type DrawingShape =
  | { type: "pencil";  id: string; points: [number, number][];           strokeColor: string; strokeWidth: number }
  | { type: "rect";    id: string; x: number; y: number; w: number; h: number; fillColor: string; strokeColor: string; strokeWidth: number }
  | { type: "ellipse"; id: string; cx: number; cy: number; rx: number; ry: number; fillColor: string; strokeColor: string; strokeWidth: number }
  | { type: "line";    id: string; x1: number; y1: number; x2: number; y2: number; strokeColor: string; strokeWidth: number }
  | { type: "arrow";   id: string; x1: number; y1: number; x2: number; y2: number; strokeColor: string; strokeWidth: number }
```

**Why discriminated union:** TypeScript gives exhaustive type narrowing for free in every `switch(shape.type)`. No default-with-throw needed in the renderer, hit-tester, or translate helper.

**Ellipse stored as `cx, cy, rx, ry`** (center + half-radii) rather than AABB because `rough.canvas.ellipse(cx, cy, width, height)` takes center — storing center avoids recomputing it on every render.

**Pencil `points: [number, number][]`** — compatible directly with `perfect-freehand`'s `getStroke()` input format (accepts `number[][]`).

---

### 4.3 — History: pos+historyRef Pattern (`useDrawHistory.ts`)

```typescript
const historyRef = useRef<DrawingShape[][]>([[]]); // full undo/redo stack
const [pos, setPos] = useState(0);                  // current index (React state → triggers re-render)

const shapes = historyRef.current[pos] ?? [];

function commit(next: DrawingShape[]) {
  const newStack = historyRef.current.slice(0, pos + 1); // truncate redo future
  newStack.push(next);
  historyRef.current = newStack;
  setPos(newStack.length - 1);
}

function undo() { setPos(p => Math.max(0, p - 1)); }
function redo() { setPos(p => Math.min(historyRef.current.length - 1, p + 1)); }
```

**Why not store shapes in useState:** The history array is large and changes frequently. If stored as state, every `commit` triggers a full React reconciliation with the old AND new arrays in memory simultaneously. With `historyRef`, only the scalar `pos` causes re-renders. React reconciles once, reads `historyRef.current[pos]`, done.

**Why `pos` as React state and `historyRef` as a ref:** `pos` changing is what triggers the render (we need the component to re-draw when history position changes). `historyRef` is mutated directly because mutating a ref never triggers a render — we want to update the stack silently and only re-render once via `setPos`.

---

### 4.4 — Rendering (`renderer.ts`)

**Pure function — no React, no hooks.** Called imperatively from both `useEffect` and `onMouseMove`.

```typescript
export function renderCanvas(
  ctx: CanvasRenderingContext2D,
  shapes: DrawingShape[],
  rc: RoughCanvas,
  selectedId: string | null
): void {
  // 1. Clear + fill dark background (#06060a)
  // 2. For each shape: renderShape(ctx, rc, shape)
  // 3. If shape.id === selectedId: draw dashed purple selection box
}
```

**roughjs options used:**
```typescript
{
  stroke: shape.strokeColor,
  strokeWidth: shape.strokeWidth,
  fill: fillColor === "transparent" ? undefined : fillColor,
  fillStyle: "hachure",  // cross-hatch interior — the classic sketch look
  roughness: 1.2,        // 0 = perfectly smooth, 2.5+ = unreadably chaotic
}
```

**Arrow rendering** — roughjs has no built-in arrow. Rendered as:
1. `rc.line(x1, y1, x2, y2)` for the shaft (roughness 0.5 — less jitter so the tip looks intentional)
2. Two `ctx.lineTo()` calls for the arrowhead at `±0.42 radians` (~24°) and length 14px

**Pencil rendering (perfect-freehand):**
```typescript
const stroke = getStroke(points, { size: strokeWidth * 2.5, thinning: 0.6, smoothing: 0.5, simulatePressure: true });
// stroke is number[][] — outline polygon of the stroke
const path = new Path2D(strokeToSvgPath(stroke));
ctx.fillStyle = strokeColor;
ctx.fill(path);
```

`perfect-freehand` returns an outline polygon (not a centerline). `strokeToSvgPath` converts it to a quadratic bezier SVG path for smooth curves via `Path2D`.

**Why roughjs for shapes but perfect-freehand for pencil:**
- `roughjs.linearPath()` would add unwanted jitter to freehand lines — the random variation breaks the flow
- `perfect-freehand` gives pressure-sensitive calligraphic strokes with natural tapering
- The two libraries don't compete; they serve completely different roles

---

### 4.5 — Mouse Event Architecture (`DrawCanvas.tsx`)

The most important architectural decision: **in-progress shapes bypass React state entirely during `mousemove`.**

```
mousemove → draw imperatively on canvas → no setState → no re-render
mouseup   → commit to history → setState(pos) → render effect runs
```

If we called `setState` on every `mousemove`, React would reconcile at 60fps. Imperative canvas calls in `mousemove` keep drawing at full speed.

**Three categories of refs (no re-render on update):**
```typescript
const canvasRef        = useRef<HTMLCanvasElement | null>(null);
const roughCanvasRef   = useRef<RoughCanvas | null>(null);    // created once on mount
const isDrawingRef     = useRef(false);
const startPosRef      = useRef({ x: 0, y: 0 });
const currentShapeRef  = useRef<DrawingShape | null>(null);   // shape being drawn
const dragStateRef     = useRef<DragState | null>(null);      // select-tool drag
```

**Render effect** (runs when committed state changes):
```typescript
useEffect(() => {
  const displayShapes = transientShapes ?? shapes; // transient = drag preview
  renderCanvas(ctx, displayShapes, rc, selectedId);
}, [shapes, transientShapes, selectedId]);
```

**onMouseDown:**
- `select` tool: hit-test displayShapes (last-to-first order so topmost wins), set `selectedId`, init `dragStateRef`
- `eraser` tool: hit-test and immediately commit filtered shapes
- Drawing tools: create initial shape, assign to `currentShapeRef`, call `drawImmediate([...shapes, shape])`

**onMouseMove:**
- Select drag: compute total `(dx, dy)` from drag start, set `transientShapes` → triggers render effect for preview
- Drawing tools: update `currentShapeRef` with new coordinates, call `drawImmediate` directly (bypasses React)
- Eraser drag: hit-test and commit on every move frame

**onMouseUp:**
- Select drag: commit final moved position (single history entry for the whole drag), clear `transientShapes`
- Drawing: if shape is significant (non-zero size), commit `[...shapes, finalShape]`

---

### 4.6 — Drag-Move: The Transient Layer

**The problem:** During a shape drag, we need to preview the moved position at 60fps without adding hundreds of undo entries.

**The solution: `transientShapes` state**

```typescript
const [transientShapes, setTransientShapes] = useState<DrawingShape[] | null>(null);

// During drag (mousemove):
const movedShape = translateShape(drag.snapshot, dx, dy); // total delta from drag start
setTransientShapes(shapes.map(s => s.id === drag.shapeId ? movedShape : s));

// On mouseup (commit):
commit(transientShapes); // single history entry
setTransientShapes(null);
```

**Why total delta from snapshot, not incremental delta:**
If we applied `dx, dy` incrementally (last mouse position → current), floating-point errors accumulate over hundreds of mousemove events. Applying a total displacement to the original snapshot is always exact.

**`translateShape(snapshot, totalDx, totalDy)`** — pure function, handles each shape type's fields:
```typescript
case "rect":    → { ...shape, x: shape.x + dx, y: shape.y + dy }
case "ellipse": → { ...shape, cx: shape.cx + dx, cy: shape.cy + dy }
case "line":    → { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2+dx, y2: shape.y2+dy }
case "pencil":  → { ...shape, points: shape.points.map(([x,y]) => [x+dx, y+dy]) }
```

---

### 4.7 — Hit Testing (`hitTest.ts`)

Each shape type uses the most appropriate test:

| Shape | Test | Notes |
|---|---|---|
| `rect` (filled) | Point inside AABB | Standard `x >= rx && x <= rx+rw` etc. |
| `rect` (unfilled) | Point near border ± tolerance | Interior clicks miss, border clicks hit |
| `ellipse` (filled) | `(dx/rx)² + (dy/ry)² <= 1` | Standard ellipse equation |
| `ellipse` (unfilled) | Between inner and outer ellipse | Ring test |
| `line` / `arrow` | Point-to-segment distance ≤ threshold | `distToSegment()` using perpendicular drop formula |
| `pencil` | Point within threshold of any segment | Iterates all consecutive point pairs |

**Iteration order:** `shapes` is iterated **last-to-first** so the most recently drawn shape (visually on top) wins first.

---

### 4.8 — Toolbar Design

- **Position:** Absolute, left edge, vertically centered (`left: 12px; top: 50%; transform: translateY(-50%)`)
- **Style:** Dark glass panel (`background: rgba(12,12,22,0.88); backdrop-filter: blur(14px)`)
- **Active tool:** Highlighted with `background: #7c3aed` (app's purple accent)
- **Tooltips:** CSS `::after` pseudo-element via `data-tip` attribute — no JS needed

Tools in order: Select, Pencil, Rectangle, Ellipse, Line, Arrow, Eraser

Controls below the tool buttons:
- **Stroke color** — `<input type="color">` hidden inside a circular swatch `<div>`
- **Fill color** — same; plus a separate checkerboard "no fill" toggle button
- **Stroke width** — vertical `<input type="range" min="1" max="20">` slider
- **Undo / Redo / Clear** — icon buttons at the bottom

---

### 4.9 — Keyboard Shortcuts

| Key | Action |
|---|---|
| `S` | Select tool |
| `P` | Pencil tool |
| `R` | Rectangle tool |
| `E` | Ellipse tool |
| `L` | Line tool |
| `A` | Arrow tool |
| `X` | Eraser tool |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Delete` / `Backspace` | Delete selected shape |

---

### 4.10 — Room Page: Server Component

The room page was rewritten from a `"use client"` WS chat component to a clean server component:

```typescript
// app/room/[roomId]/page.tsx
export default async function RoomPage({ params }) {
  // Run auth() and params in parallel
  const [session, { roomId }] = await Promise.all([auth(), params]);
  if (!session?.user) redirect("/signin");
  return (
    <div className={styles.container}>
      <DrawCanvas roomId={roomId} />
    </div>
  );
}
```

**Why `Promise.all([auth(), params])`:** In Next.js 15+, `params` is a Promise. Running both resolutions in parallel saves latency vs. awaiting them sequentially.

**No session passed to DrawCanvas:** Phase 4 canvas is stateless (no identity needed for local-only drawing). Phase 5 will re-add user context when connecting to draw-ws.

---

### 4.11 — tsconfig & Type Fixes

| File | Change | Why |
|---|---|---|
| `apps/web/tsconfig.json` | Added `"baseUrl": "."` and `"paths": { "@/*": ["./*"] }` | Next.js resolves `@/` via its compiler, but standalone `tsc --noEmit` needs explicit `paths` to find `@/auth`, `@/components/...` |
| `apps/web/tsconfig.json` | Added `"declaration": false`, `"declarationMap": false` | Base tsconfig has `"declaration": true`. Next.js apps never emit `.d.ts` files, but TypeScript still validates that inferred types can be named — NextAuth v5 types resolve through pnpm virtual store paths that can't be named portably. Disabling declaration eliminates the TS2742 errors |
| `apps/web/auth.ts` | Removed `declare module "next-auth/jwt"` augmentation | NextAuth v5 `jwt` module augmentation caused TS2664. Auth v5 puts user ID in `token.sub` natively — use that instead of a custom `userId` field |

---

### Commands to Run After Phase 4

```bash
# Install new dependencies (roughjs, perfect-freehand)
pnpm install

# Start the dev server
pnpm dev

# Type-check web app
cd apps/web
node_modules/.bin/tsc --noEmit
```

**What you'll see:**
1. Sign in at `http://localhost:3000/signin`
2. Go to Dashboard → create or join a room
3. The room page shows the full drawing canvas
4. Try the tools: Pencil draws smooth strokes, Rectangle/Ellipse/Line/Arrow use the rough sketch aesthetic
5. Select a shape with `S` then press `Delete` to remove it
6. `Ctrl+Z` undoes, `Ctrl+Shift+Z` redoes

---

## Phase 5 — Real-Time Sync & E2EE

**Goal:** Connect `DrawCanvas` to the `draw-ws` WebSocket server so multiple users can draw together in real-time. Add AES-GCM-256 end-to-end encryption via the URL fragment so the server only ever stores opaque blobs.

---

### 5.1 Architecture Overview

```
Browser A ──────────────────────────────────────────── Browser B
┌──────────────┐  encrypted WS msgs   ┌──────────────┐
│  DrawCanvas  │◄────────────────────►│  DrawCanvas  │
│  + useWS     │                      │  + useWS     │
│  + crypto    │     draw-ws server   │  + crypto    │
└──────┬───────┘  (stores enc. blobs) └──────┬───────┘
       │                                     │
       │  URL: /room/abc#<key-base64url>      │
       │  Key never leaves the browser       │
```

Key invariant: **`#fragment` is never sent to the server** (HTTP spec). Both users must share the room URL including the fragment to decrypt each other's shapes.

---

### 5.2 Files Created

| File | Role |
|---|---|
| `apps/web/components/canvas/crypto.ts` | AES-GCM-256 utilities: generate/import/export key, encrypt, decrypt, fragment helpers |
| `apps/web/components/canvas/useWebSocket.ts` | WS lifecycle hook: connect, route 14 event types, throttled send functions |
| `apps/web/components/canvas/CursorOverlay.tsx` | React component: renders remote cursors as absolute `<div>` labels |
| `apps/web/components/canvas/CursorOverlay.module.css` | Cursor label styles |
| `apps/web/app/api/ws-token/route.ts` | `GET /api/ws-token` — signs short-lived JWT for WS handshake |

**Files modified:**
| File | Change |
|---|---|
| `apps/web/components/canvas/types.ts` | Added `RemoteCursor` interface |
| `apps/web/components/canvas/DrawCanvas.tsx` | Integrated WS, E2EE, cursor overlay, two-bucket shape model |
| `apps/web/app/room/[roomId]/page.tsx` | Passes `userId` and `userName` from session to `DrawCanvas` |
| `apps/web/components/canvas/DrawCanvas.module.css` | Added `.dotOnline` / `.dotOffline` connection status indicator styles |
| `apps/web/.env.local` | Added `NEXT_PUBLIC_DRAW_WS_URL=ws://localhost:8081` |

---

### 5.3 E2EE: crypto.ts

**Algorithm:** AES-GCM-256 (authenticated encryption — provides both confidentiality and integrity).

**Key lifecycle:**
1. On mount, `DrawCanvas` reads `window.location.hash`.
2. If no fragment → generate a new key via `crypto.subtle.generateKey`, export to base64url, write to `window.location.hash` via `history.replaceState` (no page reload, no server round-trip).
3. If fragment exists → import the key from base64url.
4. Key is stored in `cryptoKeyRef` (a React ref) — never in React state (no re-renders).

**Wire format:** `base64url(IV[12 bytes] || AES-GCM ciphertext)`. The 12-byte IV is random per encryption, prepended so the recipient can split it off. AES-GCM produces a 16-byte authentication tag appended to the ciphertext automatically.

**What is encrypted:**
- `DRAW` message field (shape JSON)
- `STREAM_SHAPE` message field (in-progress shape JSON)
- `UPDATE` message field (moved shape JSON)

**What is NOT encrypted** (server reads these server-side):
- `ERASER` message field (`["id1","id2"]` — the server deletes from DB by ID; shape IDs are not sensitive content)
- `CURSOR_MOVE` message field (`{x, y}` — coordinates, not drawing content)

---

### 5.4 WS Auth: /api/ws-token

**Problem:** The draw-ws server expects a JWT in `?token=<jwt>` on the WS URL. But:
- NextAuth session cookies are HTTP-only (JS can't read them).
- We can't expose `AUTH_SECRET` client-side.

**Solution:** A Next.js server-side API route (`GET /api/ws-token`) that:
1. Calls `auth()` server-side to verify the session.
2. Signs a new short-lived JWT (2-minute expiry) with `AUTH_SECRET` and the user's `sub` + `name`.
3. Returns it as JSON.

The client fetches this token once before opening the WebSocket.

**Claims format:** `{ sub: userId, name: userName }` — matches what `draw-ws/connection.ts` reads (`decoded.sub`, `decoded.name`).

---

### 5.5 useWebSocket Hook

**Location:** `apps/web/components/canvas/useWebSocket.ts`

**Inputs:**
```typescript
useWebSocket(
  roomId: string,
  userId: string,
  userName: string,
  cryptoKeyRef: MutableRefObject<CryptoKey | null>,
  handlers: WsHandlers
)
```

**`WsHandlers` interface:**
```typescript
{
  onExistingShapes(shapes: DrawingShape[]): void;
  onRemoteDraw(shape: DrawingShape): void;
  onRemoteEraser(ids: string[]): void;
  onRemoteUpdate(shape: DrawingShape): void;
  onRemoteStream(connectionId: string, shape: DrawingShape): void;
  onRemoteStreamUpdate(connectionId: string, shape: DrawingShape): void;
  onCursorMove(connectionId: string, userId: string, userName: string, x: number, y: number): void;
  onParticipants(participants: RoomParticipants[]): void;
  onUserJoined(participants: RoomParticipants[]): void;
  onUserLeft(connectionId: string): void;
}
```

**Outputs:**
```typescript
{
  isConnected: boolean;
  connectionId: string | null;
  participants: RoomParticipants[];
  sendDraw(shape: DrawingShape): Promise<void>;
  sendStreamShape(shape: DrawingShape): Promise<void>;  // throttled 50ms
  sendEraser(ids: string[]): void;
  sendUpdate(shape: DrawingShape): Promise<void>;
  sendCursorMove(x: number, y: number): void;           // throttled 50ms
}
```

**Stale-closure prevention:**
- `handlers` object is stored in `handlersRef` and updated every render (no stale callbacks).
- `roomId`, `userId`, `userName` are mirrored into refs so send functions (with `[]` deps) always see the latest values without needing to re-create.
- The WS connection effect depends only on `[roomId, userId]` — reconnects only if room or user changes.

**Connection flow:**
```
1. fetch /api/ws-token → short-lived JWT
2. new WebSocket(WS_URL?token=<jwt>)
3. ← CONNECTION_READY {connectionId}
4. → JOIN {roomId}
5. ← EXISTING_SHAPES {message: JSON.stringify(WebSocketMessage[])}
6. ← EXISTING_PARTICIPANTS {participants}
7. ← USER_JOINED broadcast to others
```

**EXISTING_SHAPES format:** The server stores full `WebSocketMessage` objects. So `msg.message = JSON.stringify(WebSocketMessage[])`. Each `WebSocketMessage[i].message` is the encrypted shape JSON.

---

### 5.6 Two-Bucket Shape Model

**Problem:** If all shapes (yours + others') were in the undo history, pressing Ctrl+Z would undo other people's work. That's bad UX.

**Solution:** Two separate buckets:
- `shapes` (from `useDrawHistory`) — only shapes YOU drew this session. Ctrl+Z only affects these.
- `remoteShapes` state — existing room shapes + others' draws. NOT in undo history.

**Rendering:** `[...shapes, ...remoteShapes, ...Array.from(remoteStreams.values())]`

**Drag-move across buckets:** If you drag a shape from `remoteShapes`, on mouseUp it's removed from `remoteShapes` and committed to local `shapes` (then an UPDATE event is sent so others see the move).

**Eraser across buckets:** Detects which bucket the hit shape is in, removes from the correct one.

---

### 5.7 Remote Stream Previews

While another user is drawing (between mouseDown and mouseUp), they send throttled `STREAM_SHAPE` events. We store these in:

```typescript
const [remoteStreams, setRemoteStreams] = useState<Map<string, DrawingShape>>(new Map());
```

Key = `connectionId` of the sender. When we receive `DRAW` (committed shape), we clear the stream entry for that shape ID.

**50ms throttle** on both send side (inside `useWebSocket`) and receive side (React state update batching).

---

### 5.8 Remote Cursor Presence

**Send:** Every `onMouseMove`, call `sendCursorMove(x, y)` (throttled to 50ms inside the hook). Payload: `JSON.stringify({x, y})` — NOT encrypted (coordinates aren't drawing content).

**Receive:** `CURSOR_MOVE` events update a `Map<connectionId, RemoteCursor>` in state.

**RemoteCursor type:**
```typescript
interface RemoteCursor {
  connectionId: string;
  userId: string;
  userName: string;
  color: string;       // deterministic from userId (stable across reconnects)
  x: number;
  y: number;
}
```

**Color:** `userColor(userId)` — hashes the userId string to a hue, returns `hsl(hue, 70%, 55%)`. Same user always gets same color regardless of when they connect.

**CursorOverlay:** Absolutely-positioned `<div>` elements inside the canvas wrapper. Each cursor has an SVG pointer icon + a name label with the user's color as background.

---

### 5.9 Connection Status Badge

The room info badge (top-right) now shows a status dot:
- Green dot (`.dotOnline`) — connected to draw-ws
- Amber dot (`.dotOffline`) — connecting / disconnected

---

### 5.10 drawImmediate + Remote Shapes

The `drawImmediate` function (called in `onMouseMove` for 60fps local drawing preview) was updated to render remote shapes alongside the local in-progress shape:

```typescript
const drawImmediate = (localWithPreview: DrawingShape[]) => {
  const streams = Array.from(remoteStreamsRef.current.values());
  renderCanvas(ctx, [...localWithPreview, ...remoteShapesRef.current, ...streams], rc, null);
};
```

`remoteShapesRef` and `remoteStreamsRef` mirror the corresponding state via `useEffect` — they're always fresh without causing `drawImmediate` to be re-created.

---

### 5.11 How to Test Phase 5

**Prerequisites:** draw-ws must be running (`pnpm --filter draw-ws dev` or `start`).

1. Open two browser windows at the same room URL (both must have the same `#fragment` key).
2. Draw in one window — shapes appear in the other after the mouseUp commit.
3. Move your mouse — the other window shows your cursor label.
4. While drawing, the other user sees a real-time stream preview (thin in-progress stroke).
5. The green connection dot confirms the WS is live.

---

---

## Phase 6 — Polish

**Goal:** Complete the user-facing experience: My Rooms on dashboard, E2EE key persistence, participants indicator, copy-link button, mobile touch support, and explicit LEAVE on back navigation.

---

### 6.1 Files Created / Modified

| File | Change |
|---|---|
| `app/api/rooms/route.ts` | **New** — `GET /api/rooms` returns user's 10 most recent rooms from DB |
| `app/dashboard/page.tsx` | Added "My Rooms" section (fetches rooms on mount, lists with Open button) |
| `app/dashboard/dashboard.module.css` | Added room list, section title, buttonSm styles |
| `components/canvas/crypto.ts` | Added `getStoredKey` / `storeKey` (localStorage key persistence) |
| `components/canvas/useWebSocket.ts` | Added `sendLeave(roomId)` to `UseWebSocketReturn` |
| `components/canvas/DrawCanvas.tsx` | Full refactor: touch support, copy-link, participants count, leave via WS, localStorage key init |
| `components/canvas/DrawCanvas.module.css` | Added `.online`, `.copyBtn` styles |

---

### 6.2 E2EE Key Persistence (localStorage)

**Problem:** Every time a user navigated to `/room/<id>` without a `#fragment`, a NEW AES-GCM key was generated. Old shapes (encrypted with the previous key) would fail to decrypt and be silently dropped.

**Solution:** Store the room's encryption key in `localStorage` under the key `drawapp_key_<roomId>`. On mount, `DrawCanvas` now follows this priority:

```
1. URL fragment (#key)  — highest priority, used when opening a shared link
2. localStorage         — returning user on the same browser
3. generate new key     — first visit, no fragment, no stored key
```

After determining the key, it is always written back to **both** localStorage and the URL fragment, so:
- Sharing the current URL (with `#fragment`) gives the recipient the correct key.
- Returning to the same room (by clicking "Open →" in My Rooms) reuses the key automatically.

```typescript
// Priority chain in DrawCanvas useEffect:
const fragment = getKeyFromFragment();
if (fragment) {
  key = await importKeyFromBase64url(fragment);
} else {
  const stored = await getStoredKey(roomId);
  key = stored ?? (await generateKey());
}
const b64 = await exportKeyToBase64url(key);
setKeyInFragment(b64);
await storeKey(roomId, key);   // persist for return visits
cryptoKeyRef.current = key;
```

---

### 6.3 My Rooms on Dashboard

**API route:** `GET /api/rooms`
- Uses `auth()` server-side to get the session.
- Queries `prismaClient.room.findMany({ where: { adminId: userId }, orderBy: { updatedAt: "desc" }, take: 10 })`.
- Returns `{ rooms: [{ id, createdAt, updatedAt }] }`.

**Dashboard:** On mount, fetches `/api/rooms` and renders a list below the Create/Join cards. Each row shows:
- Short room ID (first 8 chars of the cuid)
- Creation date
- "Open →" button → navigates to `/room/<id>` (localStorage key is reused automatically)

Note: The list only shows rooms the user **created** (`adminId = userId`). Rooms joined as a guest aren't tracked in the current schema (no `UserRoom` join table). This is a known limitation for Phase 6.

---

### 6.4 Participants Indicator

`useWebSocket` already returns `participants: RoomParticipants[]` (updated on `USER_JOINED`, `USER_LEFT`, `EXISTING_PARTICIPANTS` events). `DrawCanvas` now shows:

```
Room abc123… | 3 online | Copy Link  ●
```

The "N online" badge:
- Green text on a subtle green background.
- `title` attribute lists all participant userNames (visible on hover).
- Hidden when count is 0 (not yet connected or empty room).

---

### 6.5 Copy Link Button

A "Copy Link" button in the room badge copies `window.location.href` to the clipboard. Since the URL always contains the `#key` fragment (set during crypto init), the copied link is a complete invite link — the recipient can open it and immediately decrypt all shapes.

Visual feedback: button text changes to "Copied!" for 1.8 seconds.

---

### 6.6 Explicit Leave (LEAVE WS event)

The "← back" button now calls `handleLeave()`:
1. `sendLeave(roomId)` — sends `{ type: WsDataType.LEAVE, roomId }` to draw-ws.
2. `router.push("/dashboard")` — navigates away, causing component unmount.
3. On unmount, `useWebSocket`'s cleanup closes the WebSocket socket.

This sequence updates other users' participant lists immediately (via `USER_LEFT` broadcast from the server) instead of waiting for the server to detect the TCP close, which can take seconds.

---

### 6.7 Mobile Touch Support

The canvas now handles touch events alongside mouse events. The core pointer logic was refactored into three shared functions:

```typescript
function pointerDown(x: number, y: number) { ... }  // tool-specific down logic
function pointerMove(x: number, y: number) { ... }  // tool-specific move logic
function pointerUp(x: number, y: number)   { ... }  // commit + send
```

Thin wrappers extract coordinates and call the shared functions:

```typescript
// Mouse:
handleMouseDown  → e.clientX / e.clientY → pointerDown
handleMouseMove  → e.clientX / e.clientY → pointerMove
handleMouseUp    → e.clientX / e.clientY → pointerUp

// Touch:
handleTouchStart → e.touches[0].clientX/Y        → pointerDown
handleTouchMove  → e.touches[0].clientX/Y        → pointerMove
handleTouchEnd   → e.changedTouches[0].clientX/Y → pointerUp
```

All touch handlers call `e.preventDefault()` to suppress browser scroll/zoom during drawing. The canvas element gets `style={{ touchAction: "none" }}` to hint to the browser that we're handling touch ourselves.

`changedTouches[0]` (not `touches[0]`) is used in `touchend` because `touches` doesn't include the finger that just lifted.

---

### 6.8 How to Test Phase 6

1. Create a room → you land in the canvas.
2. Click "Copy Link" → paste in a new browser tab → both windows share the same key, shapes decrypt correctly.
3. On the dashboard, "My Rooms" shows your created rooms. Click "Open →" → key is loaded from localStorage, old shapes are visible.
4. On mobile (or DevTools device mode), draw with a finger — all tools work via touch.
5. Hover over the "N online" badge to see participant names.
6. Click "← back" → you're immediately removed from the participants list in other windows.

---

---

## Phase 7 — Deployment & Docker

**Goal:** Make every service buildable and runnable via Docker Compose. Fix all latent Docker bugs from earlier phases and establish a clean, reproducible build process.

---

### 7.1 Files Created / Modified

| File | Change |
|---|---|
| `.dockerignore` | **New** — excludes `node_modules`, `.next`, `dist`, `.git`, logs from Docker build context |
| `apps/web/next.config.js` | Added `output: "standalone"` — required for the frontend Dockerfile's `.next/standalone` copy |
| `apps/http-backend/package.json` | Switched build from `tsc -b` → esbuild; added `esbuild` devDependency |
| `apps/ws-backend/package.json` | Same esbuild switch |
| `apps/draw-ws/package.json` | Added `--external:@prisma/client` to esbuild (fixes Prisma native binary runtime error) |
| `packages/db/package.json` | Added `db:deploy` script (`prisma migrate deploy`) for production migrations |
| `docker/Dockerfile.draw-ws` | Full rewrite: 3-stage build, proper Prisma handling |
| `docker/Dockerfile.http-backend` | Full rewrite: esbuild bundle, proper Prisma handling |
| `docker/Dockerfile.websocket` | Full rewrite: esbuild bundle, proper Prisma handling |
| `docker/Dockerfile.frontend` | Fixed: added `NEXT_PUBLIC_DRAW_WS_URL` ARG/ENV, removed unneeded pnpm in runner |
| `docker/Dockerfile.migrate` | **New** — one-shot container that runs `prisma migrate deploy` and exits |
| `docker-compose.yml` | Added `migrate` service, fixed port mapping (5433:5432), added `service_completed_successfully` deps |
| `turbo.json` | Added `NEXT_PUBLIC_DRAW_WS_URL` and `NEXT_PUBLIC_HTTP_URL` to build env list |
| `Makefile` | **New** — convenience commands: `up`, `down`, `build`, `rebuild`, `logs`, `migrate`, `shell-db`, `fresh` |

---

### 7.2 Bugs Fixed in Existing Dockerfiles

#### Bug 1: Missing `output: 'standalone'` in Next.js config
`Dockerfile.frontend` copied from `.next/standalone` but `next.config.js` had no `output: "standalone"`. That directory is only generated when standalone mode is configured. The build would succeed but the runner stage would fail at COPY.

**Fix:** Added `output: "standalone"` to `next.config.js`.

#### Bug 2: Missing `NEXT_PUBLIC_DRAW_WS_URL` in `Dockerfile.frontend`
`docker-compose.yml` passed `NEXT_PUBLIC_DRAW_WS_URL` as a build arg, but the Dockerfile never declared `ARG NEXT_PUBLIC_DRAW_WS_URL` or set it as `ENV`. The `useWebSocket` hook's `WS_URL` constant would be `undefined` in production.

**Fix:** Added `ARG NEXT_PUBLIC_DRAW_WS_URL` and `ENV NEXT_PUBLIC_DRAW_WS_URL=${NEXT_PUBLIC_DRAW_WS_URL}` to the builder stage.

#### Bug 3: Prisma native binary missing from draw-ws runner
`Dockerfile.draw-ws` (original) only copied `dist/index.js` to the runner. The esbuild command bundled `@prisma/client`'s JavaScript inline, but the Prisma native query engine binary (`.so.node`) was not copied. Prisma would fail at runtime when trying to load the binary.

**Fix:**
1. Added `--external:@prisma/client` to the esbuild command in `draw-ws/package.json`. This makes the bundle reference `require('@prisma/client')` at runtime instead of inlining it.
2. Runner now copies `node_modules` from the deps stage (includes `@prisma/client` + the pnpm store with the native binary generated for Alpine Linux) and `packages/db` (which contains the Prisma generated client files).

#### Bug 4: http-backend and ws-backend runtime failures
These services used `tsc -b` to compile. The runner tried to use the compiled JS with workspace packages that couldn't be resolved at runtime:
- `@repo/db` has `"main": "./src/index.ts"` — TypeScript, not executable in production Node.js
- The runner's `COPY --from=builder /app/node_modules ./node_modules` copied pnpm symlinks that point to paths which don't exist in the minimal runner stage

**Fix:** Switched both services to esbuild with `--external:@prisma/client`, same pattern as draw-ws. Runner copies `node_modules` + `packages/db` for Prisma runtime.

---

### 7.3 Three-Stage Dockerfile Pattern (all backends)

```
┌─────────────────────────────────────────────────────────────────┐
│ Stage 1: deps (node:20-alpine)                                  │
│   pnpm install --frozen-lockfile                                │
│   pnpm db:generate  ← generates Prisma binary for linux-musl   │
├─────────────────────────────────────────────────────────────────┤
│ Stage 2: builder (FROM deps)                                    │
│   pnpm --filter @repo/common build                              │
│   pnpm --filter @repo/backend-common build                      │
│   pnpm --filter <service> build  ← esbuild → dist/index.js     │
├─────────────────────────────────────────────────────────────────┤
│ Stage 3: runner (node:20-alpine, clean)                         │
│   COPY node_modules from deps  ← pnpm store + Prisma binary    │
│   COPY packages/db from deps   ← generated Prisma client       │
│   COPY dist/index.js from builder                               │
│   CMD ["node", "index.js"]                                      │
└─────────────────────────────────────────────────────────────────┘
```

**Why copy the entire `node_modules`?** pnpm uses a content-addressable virtual store (`.pnpm/`). The Prisma query engine native binary lives inside the store at a version-hashed path. Simple Docker COPY preserves symlinks, so all pnpm symlinks from `node_modules/@prisma/client` → `.pnpm/...` continue to work in the runner. Trying to copy only specific paths requires knowing exact version hashes at Dockerfile write time — impractical.

**Image sizes:** The runner images are larger (~300-400MB each) than a minimal single-file approach, but this is correct and predictable. For a production system with many instances, the images could be slimmed down with `pnpm deploy`, but that requires additional Prisma schema configuration.

---

### 7.4 esbuild + `--external:@prisma/client`

All three Node.js backends now use the same esbuild command pattern:
```
esbuild src/index.ts --bundle --platform=node --format=cjs --outfile=dist/index.js --external:@prisma/client
```

- `--bundle`: inline all imports (including workspace packages like `@repo/common`)
- `--platform=node`: use Node.js built-ins, no browser shims
- `--format=cjs`: CommonJS output (required for `require('@prisma/client')`)
- `--external:@prisma/client`: leave `@prisma/client` as a runtime require (its native binary cannot be bundled)

Workspace packages (`@repo/common`, `@repo/backend-common`, `@repo/db`) ARE bundled inline. They're found by esbuild via their `main` field in `package.json`. `@repo/db` uses `"main": "./src/index.ts"` which esbuild handles natively (it transpiles TypeScript). The `PrismaClient` import inside `@repo/db/src/index.ts` becomes a runtime `require('@prisma/client')` in the output.

---

### 7.5 Next.js Standalone Mode

`next.config.js` now has `output: "standalone"`. When Next.js builds in standalone mode:
- It generates `.next/standalone/` — a minimal copy of the app + required `node_modules` subset (no `pnpm install` needed in runner)
- `server.js` is the entry point (runs the Next.js server without `next start`)
- Static files (`.next/static/`, `public/`) must be copied separately

```dockerfile
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

CMD ["node", "apps/web/server.js"]
```

The runner also sets `ENV HOSTNAME=0.0.0.0` so the server binds to all interfaces (not just localhost).

---

### 7.6 DB Migration Service

A dedicated `migrate` service in docker-compose runs `prisma migrate deploy` and exits. Other services depend on it:

```yaml
migrate:
  build:
    context: .
    dockerfile: ./docker/Dockerfile.migrate
  environment:
    DATABASE_URL: postgresql://drawapp:...@db:5432/drawapp
  depends_on:
    db:
      condition: service_healthy
  restart: "no"

http-backend:
  depends_on:
    migrate:
      condition: service_completed_successfully
```

`service_completed_successfully` is a Docker Compose condition that waits for the migrate container to exit with code 0. This guarantees the schema is applied before any service starts.

The Dockerfile.migrate is intentionally minimal — it only installs `@repo/db` (which includes `prisma` CLI) and runs `pnpm db:deploy` (`prisma migrate deploy`).

---

### 7.7 Port Mapping Fix

The PostgreSQL service was mapped as `5432:5432` (host:container). Changed to `5433:5432` to match the dev setup in `.env` (`DATABASE_URL` uses port 5433 on the host) and avoid conflicting with a local PostgreSQL installation.

---

### 7.8 Makefile Commands

```bash
make up        # docker compose up -d
make down      # docker compose down
make build     # docker compose build
make rebuild   # docker compose build --no-cache
make logs      # docker compose logs -f
make migrate   # docker compose run --rm migrate
make shell-db  # psql shell inside the db container
make fresh     # wipe everything and start clean (down -v + up --build)
```

---

### 7.9 How to Run in Production

```bash
# 1. Copy env template and fill in real values
cp .env.example .env
# Edit .env: set AUTH_SECRET, DATABASE_URL, NEXT_PUBLIC_* URLs

# 2. Build and start everything
make build
make up

# 3. Migrations run automatically (migrate service exits after success)
# Check logs to confirm:
make logs

# 4. Access the app
# Frontend:     http://localhost:3000
# HTTP API:     http://localhost:3001
# Draw WS:      ws://localhost:8081
# Chat WS:      ws://localhost:8080
# Postgres:     localhost:5433
```

---

## All Phases Complete

| Phase | Status | Description |
|---|---|---|
| 1 | ✅ | Code Review & Gap Analysis |
| 2 | ✅ | DB & Auth (PostgreSQL, NextAuth v5, Prisma) |
| 3 | ✅ | Drawing WebSocket Server (draw-ws, 14 events, esbuild) |
| 4 | ✅ | Frontend Canvas (roughjs, perfect-freehand, 7 tools, undo/redo) |
| 5 | ✅ | Real-Time Sync & E2EE (useWebSocket, AES-GCM-256, cursor overlay) |
| 6 | ✅ | Polish (My Rooms, localStorage keys, copy-link, touch, leave) |
| 7 | ✅ | Deployment (Docker Compose, esbuild all services, standalone Next.js) |
