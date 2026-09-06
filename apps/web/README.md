# ForenSweep — apps/web

Standalone Next.js (App Router) build of the ForenSweep frontend, runnable
today against mock data, structured to drop straight into your Turborepo
`apps/web` and wire up to the real Express/Prisma backend.

## Design system
Clinical, cool-neutral palette (not warm-cream, not pure white/black) —
deliberately distinct from a generic dev-tool aesthetic since this is a
forensic evidence tool, not a marketing site. Full tokens in
`tailwind.config.ts`. Color discipline:
- `destructive` (red) — erase actions, danger states, invalid verification, high risk
- `recovery` (purple) — recovery module only, never a danger color
- `warning` (amber) — pending approval, sanitization limitations, medium risk
- `success` (green) — verified/completed/valid states only

## Run locally
```bash
cd apps/web        # or wherever you place this in your monorepo
bun install
bun dev
```
Visit http://localhost:3000 — redirects to `/login`. Sign in uses the backend
at `NEXT_PUBLIC_API_URL`, and new users can register at `/signup`.

## Wiring to the real backend
Everything currently reads from `lib/mock-data.ts`. To connect the real API:
1. Set `.env.local` from `.env.example` with your Express server URL.
2. Replace the mock calls in each page (marked with `// Real integration:`
   comments) with real `fetch` calls to the documented endpoints, using
   `lib/auth.ts`'s token for the `Authorization` header.
3. Replace `lib/types.ts` with imports from your monorepo's `packages/shared`
   — the shapes here mirror it 1:1, so this should be a pure import swap.
4. Replace the `useSimulatedProgress` hook in `erase/[jobId]/page.tsx` with a
   real WebSocket connection to `${WS_URL}/ws/jobs/:jobId`.

## Environment variables
| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the Express API |
| `NEXT_PUBLIC_WS_URL` | Base URL for job WebSocket connections |

## Pages implemented
- `/login` — backend-backed sign-in form
- `/signup` — backend-backed account creation form
- `/dashboard` — job counts, recent jobs, recent certificates, device risk summary
- `/devices`, `/devices/[deviceId]` — inventory + SSD/HDD-aware recommendation detail
- `/erase/new` — 6-step wizard: device → scope → standard → preview → confirm → submit
- `/erase/[jobId]` — approval gate + simulated live progress + verification result
- `/recover/new` — acquisition (hash-gated) → scan type → submit
- `/recover/[jobId]` — results grid with expandable multi-factor confidence breakdown
- `/certificates`, `/certificates/[certId]` — list + detail + verify action
- `/audit` — hash-chained event timeline + "Verify chain integrity" action

## Known gaps (flagged per the spec, not silently faked)
- No dedicated `/erase/preview` endpoint assumed — reuses `/erase/recommend/:deviceId`.
- No distinct CARVING/VALIDATING/RECONSTRUCTING job-status enum assumed on the
  backend — represented via `message`/`currentPass` strings on `RUNNING`.
- Recovered-file thumbnails are placeholders — no thumbnail URL is fabricated;
  wire in a real preview path once the backend returns one.
- Auth currently uses `localStorage` for the demo build; swap to an httpOnly
   cookie once the backend can set one on login.
