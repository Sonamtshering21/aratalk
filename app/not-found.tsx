import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";

export default function NotFound() {
  return (
    <EmptyState emoji="🍂" title="This conversation has wandered off">
      <p>It may have been removed, hidden after reports, or never existed.</p>
      <Link
        href="/"
        className="mt-5 inline-flex min-h-11 items-center rounded-full bg-espresso px-5 font-bold text-cream transition hover:bg-espresso-soft active:scale-95"
      >
        Back to the feed
      </Link>
    </EmptyState>
  );
}
