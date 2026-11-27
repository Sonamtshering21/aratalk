"use client";

import { useActionState, useEffect, useEffectEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { addComment, type FormState } from "@/app/actions";
import { Honeypot } from "./Honeypot";
import { SendIcon } from "./icons";

const MAX = 1000;

type Props = {
  postId: string;
  /** When set, this form posts a reply to that comment. */
  parentId?: string;
  /** Label for the reply target, e.g. "Anonymous Yak". */
  replyingTo?: string;
  onCancel?: () => void;
  onDone?: () => void;
};

export function CommentForm({ postId, parentId, replyingTo, onCancel, onDone }: Props) {
  const isReply = parentId !== undefined;
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    addComment.bind(null, postId, parentId ?? null),
    {},
  );
  const [body, setBody] = useState("");
  const [handled, setHandled] = useState<number | undefined>(undefined);
  const router = useRouter();
  const fieldId = useId();

  // Clear the box once per successful submission.
  if (state.ok && state.nonce !== handled) {
    setHandled(state.nonce);
    setBody("");
  }

  // Pull in the fresh comment list once per successful submission.
  const onSuccess = useEffectEvent(() => {
    router.refresh();
    onDone?.();
  });
  useEffect(() => {
    if (state.ok && state.nonce) onSuccess();
  }, [state.ok, state.nonce]);

  return (
    <form
      action={formAction}
      className={isReply ? "mt-2" : "rounded-card bg-card p-4 shadow-card"}
    >
      <Honeypot />
      <label htmlFor={fieldId} className="sr-only">
        {isReply ? `Reply to ${replyingTo ?? "comment"}` : "Write a comment"}
      </label>
      <textarea
        id={fieldId}
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && onCancel) onCancel();
        }}
        required
        maxLength={MAX}
        rows={isReply ? 2 : 3}
        autoFocus={isReply}
        placeholder={isReply ? `Reply to ${replyingTo ?? "this comment"}…` : "Add your thoughts…"}
        className="w-full resize-y rounded-2xl border border-espresso/15 bg-cream/50 px-4 py-3 text-base leading-relaxed text-ink placeholder:text-ink-soft/70 transition focus:border-gold focus:bg-white focus:outline-none"
      />
      {state.error && (
        <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          {state.error}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-ink-soft tabular-nums">
          {body.length}/{MAX}
        </span>
        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="min-h-11 rounded-full px-4 text-sm font-bold text-ink-soft transition hover:bg-cream-deep hover:text-espresso"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={pending || body.trim().length === 0}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-gold px-5 text-sm font-bold text-white shadow-sm transition hover:bg-gold-deep active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
          >
            <SendIcon size={17} />
            {pending ? "Sending…" : isReply ? "Reply" : "Comment"}
          </button>
        </div>
      </div>
    </form>
  );
}
