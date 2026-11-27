"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useTransition, type ReactNode } from "react";

// Instant feedback for tab / range switches: the click starts the navigation in
// a transition, and while it is pending the tabs show the new selection and the
// list shows skeleton cards (instead of the old posts sitting there).

type FeedNavState = {
  pending: boolean;
  /** The URL being navigated to, while pending. */
  target: string | null;
  go: (href: string) => void;
};

const FeedNavContext = createContext<FeedNavState | null>(null);

export function FeedNav({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<string | null>(null);

  const go = (href: string) => {
    setTarget(href);
    startTransition(() => router.push(href));
  };

  return (
    <FeedNavContext.Provider value={{ pending, target: pending ? target : null, go }}>
      {children}
    </FeedNavContext.Provider>
  );
}

/** Null outside <FeedNav> (e.g. in the loading fallback): plain links then. */
export function useFeedNav(): FeedNavState | null {
  return useContext(FeedNavContext);
}
