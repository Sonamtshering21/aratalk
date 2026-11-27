// Seed AraTalk with friendly sample conversations.
// Run with `npm run db:seed` (uses Node's built-in TypeScript support).

import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { nicknameFromHash } from "../lib/nickname.ts";

const prisma = new PrismaClient();

const hash = (seed: string) => createHash("sha256").update(`seed:${seed}`).digest("hex");
const person = (seed: string) => {
  const h = hash(seed);
  return { authorHash: h, nickname: nicknameFromHash(h) };
};
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

type SeedPost = {
  author: string;
  hoursAgo: number;
  title: string;
  body: string;
  likes: number;
  /** Total views; defaults to a believable multiple of the engagement. */
  views?: number;
  comments: SeedComment[];
};

type SeedReply = { author: string; hoursAgo: number; body: string; likes?: number };
type SeedComment = SeedReply & { replies?: SeedReply[] };

const POSTS: SeedPost[] = [
  {
    author: "a",
    hoursAgo: 2,
    title: "Best ema datshi you've ever had?",
    body: "Mine was at a tiny roadside place on the way to Punakha. The cheese was perfect and the chillies made me cry (in a good way).\n\nWhere's yours?",
    likes: 14,
    comments: [
      {
        author: "b",
        hoursAgo: 1.5,
        body: "Honestly? My ama's. Nothing beats it.",
        likes: 9,
        replies: [
          { author: "e", hoursAgo: 1.4, body: "Every ama's ema datshi is the best ema datshi 😄", likes: 4 },
          { author: "a", hoursAgo: 1.3, body: "Can't argue with that.", likes: 2 },
          { author: "g", hoursAgo: 1.1, body: "Mine adds tomatoes. Controversial, I know.", likes: 1 },
          { author: "h", hoursAgo: 0.8, body: "Tomatoes?! We need a separate post for this." },
        ],
      },
      { author: "c", hoursAgo: 1, body: "There's a place near the Thimphu weekend market. Ask for extra cheese 🧀", likes: 5 },
      { author: "d", hoursAgo: 0.5, body: "Add some dried yak cheese on top. Trust me." },
    ],
  },
  {
    author: "b",
    hoursAgo: 5,
    title: "Feeling nervous about my first job interview",
    body: "I have an interview next week for a civil service position. I've been studying a lot but I still feel nervous. Any tips from people who've been through it?",
    likes: 21,
    views: 1240,
    comments: [
      {
        author: "e",
        hoursAgo: 4,
        body: "Breathe slowly and take your time answering. They want to see how you think, not just facts.",
        likes: 7,
        replies: [
          { author: "b", hoursAgo: 3.5, body: "Thank you, this actually calms me down a lot 🙏", likes: 3 },
        ],
      },
      { author: "a", hoursAgo: 3, body: "You've prepared, that's the hardest part. Good luck! 🍀" },
    ],
  },
  {
    author: "c",
    hoursAgo: 10,
    title: "Is it just me or are winters getting warmer?",
    body: "I remember way more snow in Thimphu when I was a kid. This year barely anything. Climate change is real and it's happening here too.",
    likes: 9,
    comments: [
      {
        author: "f",
        hoursAgo: 8,
        body: "My grandparents say the same thing about Bumthang.",
        likes: 3,
        replies: [
          { author: "c", hoursAgo: 7, body: "Same in Haa. The passes used to be white for months." },
          { author: "h", hoursAgo: 6, body: "We should all plant more trees this spring.", likes: 2 },
        ],
      },
    ],
  },
  {
    author: "d",
    hoursAgo: 20,
    title: "Archery match this weekend in Changlimithang!",
    body: "Anyone else going? The songs and dances between rounds are the best part honestly 🏹",
    likes: 17,
    comments: [
      { author: "b", hoursAgo: 18, body: "Wouldn't miss it. Bring snacks!" },
      { author: "g", hoursAgo: 15, body: "The teasing songs from the opposing team are pure art 😂" },
    ],
  },
  {
    author: "e",
    hoursAgo: 30,
    title: "Missing home while studying abroad",
    body: "I'm studying in Australia and some nights I really miss suja and the sound of prayer wheels. How do others deal with homesickness?",
    likes: 26,
    views: 2380,
    comments: [
      { author: "c", hoursAgo: 28, body: "Find the Bhutanese community there! There are more of us than you'd think." },
      { author: "h", hoursAgo: 25, body: "Video call your family during dinner time. It helps a lot." },
      { author: "a", hoursAgo: 20, body: "Sending a virtual cup of suja your way 🍵" },
    ],
  },
  {
    author: "f",
    hoursAgo: 48,
    title: "What's a small thing that made you happy today?",
    body: "For me: a stray dog followed me all the way to the office and just sat with me at the gate. Simple joys.",
    likes: 12,
    comments: [
      { author: "d", hoursAgo: 40, body: "Saw the black-necked cranes in Phobjikha. Still smiling." },
    ],
  },
  {
    author: "g",
    hoursAgo: 72,
    title: "Momo debate: steamed or fried?",
    body: "Settle this once and for all. My friends and I have been arguing for weeks.",
    likes: 8,
    comments: [
      { author: "e", hoursAgo: 70, body: "Steamed, with plenty of ezay. Fried is for emergencies." },
      {
        author: "f",
        hoursAgo: 65,
        body: "Fried, and I will not be taking questions.",
        likes: 6,
        replies: [{ author: "e", hoursAgo: 64, body: "Respectfully: wrong. 😤", likes: 4 }],
      },
    ],
  },
  {
    author: "h",
    hoursAgo: 120,
    title: "Recommendations for a weekend hike near Thimphu?",
    body: "Looking for something not too hard, maybe half a day. Bonus points for a nice view and a quiet spot to have tea.",
    likes: 6,
    comments: [
      { author: "b", hoursAgo: 110, body: "Tango and Cheri monasteries! Beautiful and peaceful." },
    ],
  },
];

async function main() {
  console.log("Clearing old data…");
  await prisma.report.deleteMany();
  await prisma.commentLike.deleteMany();
  await prisma.like.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.postView.deleteMany();
  await prisma.post.deleteMany();

  // Like rows from fake visitors, so likeCount always matches reality.
  const likers = (key: string, n = 0) =>
    Array.from({ length: n }, (_, i) => ({ userHash: hash(`liker-${key}-${i}`) }));

  let commentTotal = 0;
  for (const p of POSTS) {
    const total = p.comments.reduce((n, c) => n + 1 + (c.replies?.length ?? 0), 0);
    commentTotal += total;

    const post = await prisma.post.create({
      data: {
        title: p.title,
        body: p.body,
        ...person(p.author),
        createdAt: hoursAgo(p.hoursAgo),
        likeCount: p.likes,
        commentCount: total, // includes replies
        viewCount: p.views ?? p.likes * 9 + total * 14 + (p.title.length % 17),
        likes: { create: likers(p.title, p.likes) },
      },
      select: { id: true },
    });

    for (const c of p.comments) {
      const parent = await prisma.comment.create({
        data: {
          postId: post.id,
          body: c.body,
          ...person(c.author),
          createdAt: hoursAgo(c.hoursAgo),
          likeCount: c.likes ?? 0,
          likes: { create: likers(c.body, c.likes) },
        },
        select: { id: true },
      });
      for (const r of c.replies ?? []) {
        await prisma.comment.create({
          data: {
            postId: post.id,
            parentId: parent.id,
            body: r.body,
            ...person(r.author),
            createdAt: hoursAgo(r.hoursAgo),
            likeCount: r.likes ?? 0,
            likes: { create: likers(r.body, r.likes) },
          },
          select: { id: true },
        });
      }
    }
  }

  // Optional filler so infinite scroll has something to page through:
  //   SEED_EXTRA_POSTS=60 npm run db:seed
  const extra = Math.min(500, Math.max(0, Number(process.env.SEED_EXTRA_POSTS) || 0));
  const topics = ["Thimphu traffic", "best chilli in the market", "weekend in Paro", "rainy season plans", "favourite festival", "learning Dzongkha", "a good book", "football on Sunday", "power cuts again", "finding a flat"];
  for (let i = 0; i < extra; i++) {
    const topic = topics[i % topics.length];
    const likes = (i * 7) % 23;
    await prisma.post.create({
      data: {
        title: `Chat #${i + 1}: ${topic}`,
        body: `What does everyone think about ${topic}? Just a sample post for scrolling (#${i + 1}).`,
        ...person(`extra-${i % 9}`),
        createdAt: hoursAgo(130 + i * 5),
        likeCount: likes,
        viewCount: likes * 8 + (i % 11) * 3,
        likes: { create: likers(`extra-${i}`, likes) },
      },
      select: { id: true },
    });
  }
  if (extra) console.log(`Added ${extra} filler posts.`);

  console.log(`Seeded ${POSTS.length} posts and ${commentTotal} comments/replies. 🍶`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
