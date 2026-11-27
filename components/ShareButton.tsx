"use client";

import { useEffect, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { recordShare } from "@/app/actions";
import { formatCount } from "@/lib/format";
import { postUrl } from "@/lib/site";
import {
  BoltBubbleIcon,
  CheckIcon,
  CloseIcon,
  LinkIcon,
  PaperPlaneIcon,
  PhoneBubbleIcon,
  ShareIcon,
} from "./icons";

type Props = {
  postId: string;
  title: string;
  excerpt: string;
  initialCount: number;
  initialShared: boolean;
  size?: "sm" | "md";
};

/**
 * Share button with a live count. Uses the phone's native share sheet when the
 * browser supports navigator.share; otherwise opens a small share sheet.
 * A share counts when native sharing completes, a target is tapped, or the
 * link is copied (once per browser per post, enforced by the server).
 */
export function ShareButton({ postId, title, excerpt, initialCount, initialShared, size = "sm" }: Props) {
  const [state, setState] = useState({ count: initialCount, shared: initialShared });
  const [server, setServer] = useState({ count: initialCount, shared: initialShared });
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Adopt fresh server values when the page re-renders with new data.
  if (server.count !== initialCount || server.shared !== initialShared) {
    setServer({ count: initialCount, shared: initialShared });
    setState({ count: initialCount, shared: initialShared });
  }

  const url = postUrl(postId);

  function record() {
    const previous = state;
    if (!previous.shared) setState({ count: previous.count + 1, shared: true }); // optimistic
    startTransition(async () => {
      try {
        const result = await recordShare(postId);
        if (result.ok) setState({ count: result.shareCount, shared: true });
        else setState(previous);
      } catch {
        setState(previous);
      }
    });
  }

  async function onClick() {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text: excerpt, url });
        record();
        return;
      } catch (e) {
        // Cancelled by the user: don't count, don't open anything else.
        if (e instanceof DOMException && e.name === "AbortError") return;
        // Any other failure (e.g. not allowed here): fall back to the sheet.
      }
    }
    setOpen(true);
  }

  const md = size === "md";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => void onClick()}
        aria-haspopup="dialog"
        aria-label={`Share this post (${state.count} ${state.count === 1 ? "share" : "shares"})`}
        className={`relative z-10 inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 font-bold transition active:scale-95 ${
          md ? "text-base" : "text-sm"
        } ${state.shared ? "text-gold-deep" : "text-ink-soft"} hover:bg-cream hover:text-espresso`}
      >
        <ShareIcon size={md ? 22 : 19} />
        <span className="tabular-nums">{formatCount(state.count)}</span>
      </button>
      {open && (
        <ShareSheet
          url={url}
          title={title}
          onShared={record}
          onClose={() => {
            setOpen(false);
            // The dialog is closed by now, so the button is focusable again.
            requestAnimationFrame(() => buttonRef.current?.focus());
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------- sheet

const isMobileDevice = () =>
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)); // iPadOS

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers or no permission: the textarea trick still works.
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    el.remove();
    return ok;
  }
}

function ShareSheet({
  url,
  title,
  onShared,
  onClose,
}: {
  url: string;
  title: string;
  onShared: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const firstAction = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState<"link" | "messenger" | null>(null);
  const [mobile] = useState(isMobileDevice);

  // Close the native dialog first (the page stops being inert), then let the
  // parent unmount the sheet and put focus back on the Share button.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  const close = () => {
    ref.current?.close();
    closeRef.current();
  };

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal(); // modal: the page behind is inert
    firstAction.current?.focus();
    const onCancel = (e: Event) => {
      e.preventDefault();
      dialog.close();
      closeRef.current();
    };
    dialog.addEventListener("cancel", onCancel); // Escape
    return () => dialog.removeEventListener("cancel", onCancel);
  }, []);

  // Keep Tab / Shift+Tab inside the sheet.
  function trapFocus(e: KeyboardEvent<HTMLDialogElement>) {
    if (e.key !== "Tab") return;
    const items = ref.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
    if (!items || items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  async function copy(kind: "link" | "messenger") {
    if (await copyText(url)) {
      setCopied(kind);
      onShared();
    }
  }

  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const targets = [
    { name: "Telegram", href: `https://t.me/share/url?url=${u}&text=${t}`, icon: <PaperPlaneIcon size={20} /> },
    { name: "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`, icon: <PhoneBubbleIcon size={20} /> },
    { name: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}`, icon: <Glyph>f</Glyph> },
    { name: "X", href: `https://twitter.com/intent/tweet?url=${u}&text=${t}`, icon: <Glyph>X</Glyph> },
  ];

  const row =
    "flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left font-bold text-espresso transition hover:bg-cream focus-visible:bg-cream active:scale-[0.98]";

  return (
    <dialog
      ref={ref}
      aria-labelledby="share-sheet-title"
      onKeyDown={trapFocus}
      onClick={(e) => {
        if (e.target === e.currentTarget) close(); // tap on the backdrop
      }}
      className="fixed inset-x-0 bottom-0 m-0 mt-auto w-full max-w-none rounded-t-3xl bg-card p-0 text-ink shadow-card-hover backdrop:bg-espresso/45 sm:inset-x-auto sm:bottom-auto sm:m-auto sm:max-w-sm sm:rounded-3xl"
    >
      <div className="px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id="share-sheet-title" className="pl-1 text-lg font-extrabold text-espresso">
            Share this conversation
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft transition hover:bg-cream hover:text-espresso"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        <ul className="space-y-1">
          <li>
            <button ref={firstAction} type="button" onClick={() => void copy("link")} className={row}>
              <Circle>{copied === "link" ? <CheckIcon size={20} /> : <LinkIcon size={20} />}</Circle>
              <span aria-live="polite">{copied === "link" ? "Link copied ✓" : "Copy link"}</span>
            </button>
          </li>
          {targets.slice(0, 3).map((target) => (
            <li key={target.name}>
              <a href={target.href} target="_blank" rel="noopener noreferrer" onClick={() => { onShared(); close(); }} className={row}>
                <Circle>{target.icon}</Circle>
                {target.name}
              </a>
            </li>
          ))}
          <li>
            {mobile ? (
              <a href={`fb-messenger://share?link=${u}`} onClick={() => { onShared(); close(); }} className={row}>
                <Circle><BoltBubbleIcon size={20} /></Circle>
                Messenger
              </a>
            ) : (
              // Messenger's web share dialog needs a Facebook app id; copy the link instead.
              <button type="button" onClick={() => void copy("messenger")} className={row}>
                <Circle>{copied === "messenger" ? <CheckIcon size={20} /> : <BoltBubbleIcon size={20} />}</Circle>
                <span aria-live="polite" className="min-w-0">
                  {copied === "messenger" ? "Link copied ✓ Paste it in Messenger" : "Messenger (copy link)"}
                </span>
              </button>
            )}
          </li>
          {targets.slice(3).map((target) => (
            <li key={target.name}>
              <a href={target.href} target="_blank" rel="noopener noreferrer" onClick={() => { onShared(); close(); }} className={row}>
                <Circle>{target.icon}</Circle>
                {target.name}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-2 truncate px-1 text-xs text-ink-soft">{url}</p>
      </div>
    </dialog>
  );
}

function Circle({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-soft text-gold-deep">
      {children}
    </span>
  );
}

function Glyph({ children }: { children: ReactNode }) {
  return <span className="text-lg leading-none font-black">{children}</span>;
}
