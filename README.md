# AraTalk 🍶

**No names. No shame. Just talk!**

AraTalk is a simple, anonymous, text-only discussion space for Bhutan. The name comes from Ara, the traditional drink shared among friends.

Built with Next.js 16 (App Router, Cache Components), Tailwind CSS 4, Prisma 6 and PostgreSQL.

## Setup

1. Install dependencies (this also generates the Prisma client):

   ```bash
   npm install
   ```

2. Create the database in your local PostgreSQL:

   ```bash
   createdb -U postgres aratalk
   ```

3. Copy `.env.example` to `.env` (it is git-ignored) and fill it in:

   ```env
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/aratalk?schema=public"
   DIRECT_URL="${DATABASE_URL}"
   IDENTITY_SECRET="a-long-random-string"
   ```

4. Run the migrations, seed sample posts and start the dev server:

   ```bash
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```

   Open http://localhost:3000.

## Environment variables

| Variable          | Purpose                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`    | PostgreSQL connection string used by the app. On Neon, use the pooled one.                                      |
| `DIRECT_URL`      | Direct (non-pooled) connection string used by `prisma migrate`. Locally, `"${DATABASE_URL}"` is fine.           |
| `IDENTITY_SECRET` | Salts the anonymous identity hash; at least 32 characters in production. Changing it gives every visitor a new identity. |
| `NEXT_PUBLIC_SITE_URL`| Optional: public address used in share links and link previews. Defaults to `https://aratalk.vercel.app`; set it if you add a custom domain (it is baked in at build time, so redeploy after changing it). |
| `DATABASE_POOL_SIZE`| Optional: database connections per server instance (default 5). |
| `SEED_EXTRA_POSTS`| Optional, seed only: adds filler posts.                                                                         |

In production the server refuses to start if `DATABASE_URL` or `IDENTITY_SECRET` is missing (see `instrumentation.ts`).

Generate a secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

## Commands

| Command              | What it does                                             |
| -------------------- | -------------------------------------------------------- |
| `npm run dev`        | Start the dev server                                     |
| `npm run db:migrate` | Create and apply Prisma migrations (`prisma migrate dev`) |
| `npm run db:seed`    | Wipe the data and insert the sample posts. Add `SEED_EXTRA_POSTS=60` to also insert filler posts for trying infinite scroll |
| `npm run db:studio`  | Browse the database in Prisma Studio                     |
| `npm run build`      | Production build                                         |
| `npm start`          | Run the production build                                 |
| `npm run lint`       | ESLint                                                   |

`npm run vercel-build` runs `prisma migrate deploy` and then `next build`. Vercel runs it automatically.

## Deploy to Vercel + Neon

1. **Create the database.** In [Neon](https://neon.tech), create a project and a database named `aratalk`. From **Connection Details**, copy two strings:
   - the **pooled** connection string (its host contains `-pooler`), for `DATABASE_URL`;
   - the **direct** connection string (pooling turned off), for `DIRECT_URL`.

   Both should end in `?sslmode=require`.
2. **Import the repo in Vercel.** Choose **Add New → Project** and pick this GitHub repo. The framework is detected as Next.js; keep the default build settings, since Vercel runs the `vercel-build` script.
3. **Set environment variables.** Under **Settings → Environment Variables**, add these for **Production**:

   | Name              | Value                                                                    |
   | ----------------- | ------------------------------------------------------------------------ |
   | `DATABASE_URL`    | Neon pooled connection string                                            |
   | `DIRECT_URL`      | Neon direct connection string                                            |
   | `IDENTITY_SECRET` | New random value: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |

   Use a different `IDENTITY_SECRET` from local development. For **Preview** deployments, either leave these unset or point them at a separate Neon branch. Every build runs `prisma migrate deploy`, so previews that share production's variables migrate the production database.
4. **Deploy.** The build applies pending migrations to Neon, then builds the app.
5. **Seed (optional, once, empty database only).** The seed wipes every table before inserting sample posts, so never run it against a database with real content. From your machine:

   ```bash
   DATABASE_URL="<neon direct url>" DIRECT_URL="<neon direct url>" npm run db:seed
   ```

   On Windows PowerShell, set the variables first: `$env:DATABASE_URL="..."; $env:DIRECT_URL="..."; npm run db:seed`.

### Performance

- **Region:** functions run in `sin1` (Singapore, set in `vercel.json`), next to the Neon database. Keep the Neon project in Singapore too; otherwise every query crosses an ocean.
- **Connections:** `DATABASE_URL` must be Neon's **pooled** connection string (host contains `-pooler`). The app adds `connection_limit=5`, `pool_timeout=15`, `connect_timeout=15` (Neon wakes from scale-to-zero) and `pgbouncer=true` for pooled hosts, unless the URL sets them. Production logs a warning if the direct host is used.
- **Few round trips:**
  - Feed pages are one SQL query each, and ranked tabs write nothing until you scroll to page 2.
  - The post page loads the post and its first comments in parallel, each in one query (Prisma `relationJoins`).
  - Likes, shares and view batches are single statements.
  - `proxy.ts` only queries the database for full page loads of `/post/[id]`, not for in-app navigation, prefetches or form actions.
- **Instant feedback:** switching tabs or ranges highlights the new tab and shows skeleton cards immediately while the data loads.

### What's production-ready

- **Shared state lives in Postgres.** Rate limits and ranked-feed snapshots are stored there, so they work across serverless instances. Expired rows are pruned occasionally.
- **Identity cookie.** It is `httpOnly`, `sameSite=lax`, and `secure` in production.
- **Security headers.** These are set in `next.config.ts`: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY` and `Permissions-Policy`.
- **Missing or hidden posts return a real `404`.** Cache Components streams the page shell with a `200` before the page knows the post is gone, so `proxy.ts` checks the post id first.

## How it works

- **Anonymous identity:** on the first like, post, comment or report, the server sets an httpOnly cookie holding a random UUID. Only `sha256(uuid + IDENTITY_SECRET)` is stored. The nickname (e.g. "Anonymous Takin") is derived from that hash. Neither the UUID nor the hash is ever sent to the browser.
- **Writes:** all writes are Server Actions in `app/actions.ts`. Reads are in `lib/queries.ts` and always `select` explicit public fields.
- **Moderation:** any content reported 5 times is hidden automatically. Posts and comments have a hidden honeypot field; submissions that fill it are silently ignored. Posts are limited to 2 links, and an identical post within 1 hour is blocked.
- **Write protection:** every write (post, comment, like, report, view batch) is checked on the server:
  - **Real browsers only:** the user-agent filter (`lib/bots.ts`) blocks crawlers, scripts and headless browsers. In-app browsers (Telegram, Discord, Facebook, Messenger, Instagram, WhatsApp) and phone models with "bot" in their name are allowed.
  - **Cookie required:** the anonymous browser cookie is issued when a page loads (`proxy.ts`). Writes without it are ignored.
  - **Rate limits:** stored in Postgres. Per browser ID: 1 post/min, 1 comment per 20 s, 30 likes/min, 1 view batch per 10 s, 10 reports/hour. Per IP, 10× those limits plus 100 posts per day. Mobile carriers share IPs, so the per-browser limits do most of the work and the per-IP limits only stop large-scale abuse. `/api/views` answers `429`. Server Actions can't set an HTTP status, so they return `status: 429` in their result and the page shows a "slow down" message.
  - **Input limits:** title 120, description 2000, comment 1000 characters; view batches of at most 50 post IDs.
- **Sharing:** the Share button opens the phone's native share sheet (`navigator.share`). Where that isn't available, it opens a small sheet with Copy link, Telegram, WhatsApp, Facebook, Messenger (an app link on phones; on desktop it copies the link) and X. A share counts once per browser per post (`PostShare`, `Post.shareCount`), when native sharing completes, a target is tapped, or the link is copied. Cancelled native shares don't count. Shares add a small factor (0.5 each) to the Trending score.
- **Visitor stats:** the home page shows "🟢 12 reading now · 👀 1.2K visitors this month".
  - **Heartbeat:** every page sends a tiny heartbeat (`POST /api/presence`) on load, then about once a minute while the tab is visible; it pauses while the tab is hidden.
  - **Reading now:** browsers with a heartbeat in the last 2½ minutes.
  - **Visitors this month:** unique browsers in the current calendar month, in Bhutan time (UTC+6).
  - **Rules:** bots and requests without the anonymous cookie don't count. Only the anonymous identity hash is stored (no IPs), and only counts are ever returned.
  - **Cost:** the numbers are cached for 30 seconds per server instance, and old rows are pruned automatically.
- **Link previews:** each post has its own title, description and a 1200×630 image (`app/post/[id]/opengraph-image.tsx`). Hidden or missing posts get a generic AraTalk card.
- **Pagination:** the feed loads 20 posts at a time (infinite scroll plus a "Load more" button). Comments load 20 top-level comments at a time, newest first, with "Load more comments". Each thread shows its first 3 replies and loads 20 more per "View more replies" (`/api/posts/[id]/comments`, `/api/comments/[id]/replies`).
- **Database connections:** one shared Prisma client per server instance with a small pool (`connection_limit=5` by default, `DATABASE_POOL_SIZE` to change it).
- **Feed tabs:** Latest, Trending and Top. Top has This week / This month / All time. The tab and range are kept in the URL (`/?tab=top&range=week`).
  - **Trending:** `(1 + likes + 2 × comments + 0.1 × views) / (ageHours + 2)^1.5` over the last 30 days.
  - **Top:** ranked by `likes + comments`.
- **Infinite scroll:** pages of 20 come from `GET /api/feed`. Latest uses a `(createdAt, id)` cursor. Trending and Top freeze a ranked snapshot of post IDs on the first page, so likes arriving mid-scroll can't cause duplicates or skips. `GET /api/feed/new` is a cheap count used by the "new posts" pill, checked every 60 s.
- **Views:** a post's view counts once per browser, ever. It's stored as a `PostView` row with a unique `(postId, userHash)`, and `Post.viewCount` goes up only when a new row is created. A view counts when a feed card is at least 50% on screen for 2 seconds, or when the post page is opened. The browser batches viewed ids and sends them to `POST /api/views` every ~10 s, or with `navigator.sendBeacon` when the page is hidden. It remembers sent ids in `localStorage` so they aren't sent again. Obvious bots are ignored by user-agent, and `PostView` rows older than 30 days are pruned.

> Ranked-feed snapshots expire after 30 minutes. A later "load more" then re-ranks, and the browser drops posts it already shows.
