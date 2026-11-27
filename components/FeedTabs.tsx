import Link from "next/link";
import type { FeedTab } from "@/lib/queries";
import { FlameIcon, SparkIcon } from "./icons";

const TABS: { id: FeedTab; label: string; href: string; Icon: typeof SparkIcon }[] = [
  { id: "newest", label: "Newest", href: "/", Icon: SparkIcon },
  { id: "trending", label: "Trending", href: "/?tab=trending", Icon: FlameIcon },
];

export function FeedTabs({ active }: { active: FeedTab | null }) {
  return (
    <nav aria-label="Feed" className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-cream-deep p-1">
      {TABS.map(({ id, label, href, Icon }) => {
        const isActive = active === id;
        return (
          <Link
            key={id}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-h-11 items-center justify-center gap-1.5 rounded-full text-sm font-bold transition active:scale-[0.97] ${
              isActive
                ? "bg-espresso text-cream shadow-sm"
                : "text-ink-soft hover:bg-white/60 hover:text-espresso"
            }`}
          >
            <Icon size={17} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
