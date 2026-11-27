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

3. Create `.env` in the project root (it is git-ignored):

   ```env
   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/aratalk?schema=public"
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
| `DATABASE_URL`    | PostgreSQL connection string used by Prisma.                                                                  |
| `IDENTITY_SECRET` | At least 16 characters. Salts the anonymous identity hash. Changing it gives every visitor a new identity. |

Generate a secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

## Commands

| Command              | What it does                                             |
| -------------------- | -------------------------------------------------------- |
| `npm run dev`        | Start the dev server                                     |
| `npm run db:migrate` | Create and apply Prisma migrations (`prisma migrate dev`) |
| `npm run db:seed`    | Wipe the data and insert the sample posts                |
| `npm run db:studio`  | Browse the database in Prisma Studio                     |
| `npm run build`      | Production build                                         |
| `npm start`          | Run the production build                                 |
| `npm run lint`       | ESLint                                                   |

For production, run `npx prisma migrate deploy` instead of `db:migrate`.

## How it works

- **Anonymous identity:** on the first like, post, comment or report, the server sets an httpOnly cookie holding a random UUID. Only `sha256(uuid + IDENTITY_SECRET)` is stored. The nickname (e.g. "Anonymous Takin") is derived from that hash. Neither the UUID nor the hash is ever sent to the browser.
- **Writes:** all writes are Server Actions in `app/actions.ts`. Reads are in `lib/queries.ts` and always `select` explicit public fields.
- **Moderation:** any content reported 5 times is hidden automatically. There are also rate limits (per identity and per hashed IP), a honeypot field, a limit of 2 links per post or comment, and a block on identical posts within 1 hour.
- **Trending:** `(1 + likes + 2 × comments) / (ageHours + 2)^1.5` over the last 30 days.

> The rate limiter is in-memory, so it resets on restart and only covers a single server process. If you run several instances, move it to Redis or the database.
