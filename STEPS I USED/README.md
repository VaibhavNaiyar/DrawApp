# DrawApp — Build Journal

## Phase 1 - understanding the system architecture and  coding language

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

## What Comes Next

| Phase | Work |
|---|---|
| **Phase 3** | New drawing WebSocket server (`apps/draw-ws/`) with `WsDataType` events, room management, shape broadcasting, cursor tracking, multi-tab awareness |
| **Phase 4** | Next.js frontend from scratch — Canvas engine with `roughjs` + `perfect-freehand`, standalone drawing mode, local storage |
| **Phase 5** | Connect canvas to draw-ws, real-time sync, URL-fragment E2EE encryption |
