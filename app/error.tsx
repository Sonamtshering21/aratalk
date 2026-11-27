"use client";

import { EmptyState } from "@/components/EmptyState";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <EmptyState emoji="🫗" title="Oops, we spilled the Ara">
      <p>Something went wrong on our side. Give it another try in a moment.</p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-5 inline-flex min-h-11 items-center rounded-full bg-espresso px-5 font-bold text-cream transition hover:bg-espresso-soft active:scale-95"
      >
        Try again
      </button>
    </EmptyState>
  );
}
