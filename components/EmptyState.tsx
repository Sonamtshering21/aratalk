import type { ReactNode } from "react";

export function EmptyState({
  emoji,
  title,
  children,
}: {
  emoji: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-card border-2 border-dashed border-espresso/15 px-6 py-12 text-center">
      <div className="text-4xl" aria-hidden="true">
        {emoji}
      </div>
      <h2 className="mt-3 text-lg font-extrabold text-espresso">{title}</h2>
      {children && <div className="mx-auto mt-1.5 max-w-sm text-ink-soft">{children}</div>}
    </div>
  );
}
