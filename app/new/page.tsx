import type { Metadata } from "next";
import Link from "next/link";
import { CreatePostForm } from "@/components/CreatePostForm";
import { ArrowLeftIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Create a post" };

export default function NewPostPage() {
  return (
    <>
      <Link
        href="/"
        className="-ml-3 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-ink-soft transition hover:bg-cream-deep hover:text-espresso"
      >
        <ArrowLeftIcon size={18} /> Back to the feed
      </Link>
      <h1 className="text-2xl font-extrabold tracking-tight text-espresso">Start a conversation</h1>
      <p className="mt-1 mb-5 text-ink-soft">
        No names needed. Just a title and a few words. Be kind; we&apos;re all friends here.
      </p>
      <CreatePostForm />
    </>
  );
}
