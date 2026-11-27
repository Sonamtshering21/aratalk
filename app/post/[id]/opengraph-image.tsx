import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { avatarEmoji } from "@/components/Avatar";
import { getPostPreview } from "@/lib/queries";

// Link preview image for a post (Telegram, Messenger, WhatsApp, Facebook, X…).
// Hidden or missing posts get a generic AraTalk card with no post content.

export const alt = "AraTalk – No names. No shame. Just talk!";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ESPRESSO = "#34251B";
const CREAM = "#F5EFE4";
const GOLD = "#B98245";
const GOLD_SOFT = "#F1E2CF";
const INK_SOFT = "#6B5E54";
const TAGLINE = "No names. No shame. Just talk!";

// Nunito (the site's font) for Latin text, Noto Serif Tibetan for Dzongkha.
// Loaded once per server instance; see assets/fonts/README.md.
const fontDir = join(process.cwd(), "assets/fonts");
const fonts = Promise.all([
  readFile(join(fontDir, "Nunito-ExtraBold.ttf")),
  readFile(join(fontDir, "Nunito-SemiBold.ttf")),
  readFile(join(fontDir, "NotoSerifTibetan-Bold.ttf")),
]).then(([extraBold, semiBold, tibetan]) => [
  { name: "Nunito", data: extraBold, weight: 800 as const, style: "normal" as const },
  { name: "Nunito", data: semiBold, weight: 600 as const, style: "normal" as const },
  { name: "Noto Serif Tibetan", data: tibetan, weight: 700 as const, style: "normal" as const },
]);

/** Cut at a word boundary so long titles end cleanly. */
function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return flat.slice(0, max).replace(/\s+\S*$/, "").replace(/[,.;:!?-]+$/, "") + "…";
}

function titleSize(title: string): number {
  if (title.length <= 40) return 76;
  if (title.length <= 70) return 64;
  return 54;
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPostPreview(id);
  const title = post ? truncate(post.title, 110) : "An anonymous place for Bhutan to talk";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: CREAM,
          padding: "64px 72px 56px",
          borderBottom: `18px solid ${GOLD}`,
          fontFamily: "Nunito, 'Noto Serif Tibetan'",
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: ESPRESSO,
              color: GOLD,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 48,
              fontWeight: 800,
            }}
          >
            A
          </div>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 800, color: ESPRESSO }}>
            Ara<span style={{ color: GOLD }}>Talk</span>
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            fontSize: titleSize(title),
            fontWeight: 800,
            lineHeight: 1.15,
            color: ESPRESSO,
            letterSpacing: -1,
          }}
        >
          {title}
        </div>

        {/* Footer: nickname + tagline */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24 }}>
          {post ? (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  background: GOLD_SOFT,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 30,
                }}
              >
                {avatarEmoji(post.nickname)}
              </div>
              <div style={{ display: "flex", fontSize: 30, fontWeight: 600, color: INK_SOFT }}>
                {post.nickname}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex" }} />
          )}
          <div style={{ display: "flex", fontSize: 30, fontWeight: 800, color: GOLD }}>{TAGLINE}</div>
        </div>
      </div>
    ),
    { ...size, fonts: await fonts, emoji: "twemoji" },
  );
}
