"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { addComment, type FormState } from "@/app/actions";
import { Honeypot } from "./Honeypot";
import { SendIcon } from "./icons";

const MAX = 1000;

export function CommentForm({ postId }: { postId: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    addComment.bind(null, postId),
    {},
  );
  const [body, setBody] = useState("");
  const [handled, setHandled] = useState<number | undefined>(undefined);
  const router = useRouter();

  // Clear the box once per successful submission.
  if (state.ok && state.nonce !== handled) {
    setHandled(state.nonce);
    setBody("");
  }

  // Pull in the fresh comment list after a successful submission.
  useEffect(() => {
    if (state.ok && state.nonce) router.refresh();
  }, [state.ok, state.nonce, router]);

  return (
    <form action={formAction} className="rounded-card bg-card p-4 shadow-card">
      <Honeypot />
      <label htmlFor="comment" className="sr-only">
        Write a comment
      </label>
      <textarea
        id="comment"
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
        maxLength={MAX}
        rows={3}
        placeholder="Add your thoughts…"
        className="w-full resize-y rounded-2xl border border-espresso/15 bg-cream/50 px-4 py-3 text-base leading-relaxed text-ink placeholder:text-ink-soft/70 transition focus:border-gold focus:bg-white focus:outline-none"
      />
      {state.error && (
        <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          {state.error}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-ink-soft tabular-nums">
          {body.length}/{MAX}
        </span>
        <button
          type="submit"
          disabled={pending || body.trim().length === 0}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gold px-5 text-sm font-bold text-white shadow-sm transition hover:bg-gold-deep active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
        >
          <SendIcon size={17} />
          {pending ? "Sending…" : "Comment"}
        </button>
      </div>
    </form>
  );
}
