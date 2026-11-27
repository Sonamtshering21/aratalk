"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reportContent } from "@/app/actions";
import { FlagIcon } from "./icons";

type Props = {
  targetType: "POST" | "COMMENT";
  targetId: string;
  /** Where to go if the reported item gets hidden (e.g. "/" for posts). */
  hiddenRedirect?: string;
};

export function ReportButton({ targetType, targetId, hiddenRedirect }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const inputId = useId();
  const label = targetType === "POST" ? "post" : "comment";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await reportContent({ targetType, targetId, reason });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setMessage(result.message);
        setOpen(false);
        if (result.hidden) {
          if (hiddenRedirect) router.push(hiddenRedirect);
          else router.refresh();
        }
      } catch {
        setError("Couldn't send the report. Please try again.");
      }
    });
  }

  if (message) {
    return (
      <p role="status" className="py-2 text-xs font-semibold text-ink-soft">
        {message}
      </p>
    );
  }

  return (
    <div className="w-full">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-bold text-ink-soft transition hover:bg-cream hover:text-espresso"
        >
          <FlagIcon size={16} /> Report
        </button>
      ) : (
        <form onSubmit={submit} className="mt-2 rounded-2xl bg-cream p-3">
          <label htmlFor={inputId} className="block text-sm font-bold text-espresso">
            Report this {label}
          </label>
          <input
            id={inputId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            placeholder="Reason (optional)"
            className="mt-2 min-h-11 w-full rounded-xl border border-espresso/15 bg-white px-3 text-sm focus:border-gold focus:outline-none"
          />
          {error && (
            <p role="alert" className="mt-2 text-xs font-semibold text-red-800">
              {error}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-11 rounded-full px-4 text-sm font-bold text-ink-soft hover:bg-cream-deep"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="min-h-11 rounded-full bg-espresso px-4 text-sm font-bold text-cream transition hover:bg-espresso-soft active:scale-95 disabled:opacity-60"
            >
              {pending ? "Sending…" : "Send report"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
