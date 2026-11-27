import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import { Header } from "@/components/Header";
import { Heartbeat } from "@/components/Heartbeat";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

const SITE_TITLE = "AraTalk – No names. No shame. Just talk!";
const SITE_DESCRIPTION =
  "An anonymous, text-only place for Bhutan to talk, like friends sharing a cup of Ara. No sign-up, no names.";

// Icons come from app/icon.svg and app/apple-icon.png (file conventions).
export const metadata: Metadata = {
  // Makes generated image URLs (og:image) absolute, on the canonical domain.
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: "%s · AraTalk",
  },
  description: SITE_DESCRIPTION,
  applicationName: "AraTalk",
  openGraph: {
    type: "website",
    siteName: "AraTalk",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#34251B",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${nunito.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-cream font-sans text-ink">
        <Header />
        <Heartbeat />
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 pb-16">{children}</main>
        <footer className="border-t border-espresso/10 bg-cream-deep/60">
          <div className="mx-auto max-w-2xl space-y-1.5 px-4 py-6 text-xs leading-relaxed text-ink-soft">
            <p>
              <strong className="text-espresso">A small, honest note:</strong> AraTalk never
              asks for your name, email or phone. Your browser gets a random cookie, and we
              store only a scrambled version of it so you can like and post under one
              nickname. That isn&apos;t perfect anonymity: your network, device or the way you
              write can still give you away, so please don&apos;t share anything that could
              identify you or others.
            </p>
            <p>Be kind. Content reported by several people is hidden automatically.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
