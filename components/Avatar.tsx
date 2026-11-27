import { NICKNAMES } from "@/lib/nickname";

const EMOJI: Record<(typeof NICKNAMES)[number], string> = {
  Yak: "🐂",
  Dragon: "🐉",
  Panda: "🐼",
  Potato: "🥔",
  Tiger: "🐯",
  Takin: "🐐",
  Momo: "🥟",
  "Ema Datshi": "🌶️",
  "Red Panda": "🦊",
  "Snow Leopard": "🐆",
  Hornbill: "🐦",
  Raven: "🐦‍⬛",
  "Blue Poppy": "🌸",
  "Butter Tea": "🍵",
  "Red Rice": "🍚",
  "Kewa Datshi": "🧀",
  Juniper: "🌲",
  "Black-necked Crane": "🕊️",
  Zaow: "🍿",
  Doma: "🌿",
};

/** The emoji shown for a nickname such as "Anonymous Yak". */
export function avatarEmoji(nickname: string): string {
  return EMOJI[nickname.replace(/^Anonymous /, "") as (typeof NICKNAMES)[number]] ?? "🍶";
}

export function Avatar({ nickname, size = "sm" }: { nickname: string; size?: "sm" | "md" }) {
  const emoji = avatarEmoji(nickname);
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-gold-soft ${
        size === "md" ? "size-10 text-xl" : "size-8 text-base"
      }`}
    >
      {emoji}
    </span>
  );
}
