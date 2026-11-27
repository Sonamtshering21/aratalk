import Link from "next/link";
import { PlusIcon } from "./icons";

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-espresso/10 bg-cream/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
        <Link
          href="/"
          className="group flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl"
          aria-label="AraTalk home"
        >
          <span
            className="grid size-10 shrink-0 place-items-center rounded-2xl bg-espresso text-xl shadow-sm transition-transform group-hover:-rotate-6"
            aria-hidden="true"
          >
            🍶
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block text-lg font-extrabold tracking-tight text-espresso">
              Ara<span className="text-gold">Talk</span>
            </span>
            <span className="block truncate text-xs font-semibold text-ink-soft">
              No names. No shame. Just talk!
            </span>
          </span>
        </Link>

        <Link
          href="/new"
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-gold px-4 text-sm font-bold text-white shadow-sm transition hover:bg-gold-deep active:scale-95"
        >
          <PlusIcon size={18} />
          <span>Create Post</span>
        </Link>
      </div>
    </header>
  );
}
