"use client";

import { useActionState, useState } from "react";
import { createPost, type FormState } from "@/app/actions";
import { Honeypot } from "./Honeypot";

const TITLE_MAX = 120;
const BODY_MAX = 2000;

export function CreatePostForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createPost, {});
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const titleOk = title.trim().length >= 3;
  const bodyOk = body.trim().length >= 1;

  return (
    <form action={formAction} className="space-y-5 rounded-card bg-card p-5 shadow-card sm:p-6">
      <Honeypot />

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor="title" className="font-bold text-espresso">
            Title
          </label>
          <span className="text-xs text-ink-soft tabular-nums">
            {title.length}/{TITLE_MAX}
          </span>
        </div>
        <input
          id="title"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={3}
          maxLength={TITLE_MAX}
          autoComplete="off"
          placeholder="What's on your mind?"
          className="min-h-12 w-full rounded-2xl border border-espresso/15 bg-cream/50 px-4 text-base text-ink placeholder:text-ink-soft/70 transition focus:border-gold focus:bg-white focus:outline-none"
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor="body" className="font-bold text-espresso">
            Description
          </label>
          <span className="text-xs text-ink-soft tabular-nums">
            {body.length}/{BODY_MAX}
          </span>
        </div>
        <textarea
          id="body"
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          maxLength={BODY_MAX}
          rows={7}
          placeholder="Tell the story, ask the question, share the thought…"
          className="w-full resize-y rounded-2xl border border-espresso/15 bg-cream/50 px-4 py-3 text-base leading-relaxed text-ink placeholder:text-ink-soft/70 transition focus:border-gold focus:bg-white focus:outline-none"
        />
      </div>

      {state.error && (
        <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {state.error}
        </p>
      )}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-ink-soft">
          You&apos;ll post under a random nickname. Text only, up to 2 links.
        </p>
        <button
          type="submit"
          disabled={pending || !titleOk || !bodyOk}
          className="min-h-12 rounded-full bg-gold px-6 font-bold text-white shadow-sm transition hover:bg-gold-deep active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
        >
          {pending ? "Posting…" : "Share anonymously"}
        </button>
      </div>
    </form>
  );
}
