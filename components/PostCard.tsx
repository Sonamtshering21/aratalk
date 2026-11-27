import Link from "next/link";
import { excerpt, type PostView } from "@/lib/queries";
import { timeAgo } from "@/lib/time";
import { LikeButton } from "./LikeButton";
import { ChatIcon } from "./icons";
import { Avatar } from "./Avatar";

export function PostCard({ post, now }: { post: PostView; now: number }) {
  const href = `/post/${post.id}`;
  return (
    <article className="group relative rounded-card bg-card p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover">
      <div className="mb-3 flex items-center gap-2.5 text-sm">
        <Avatar nickname={post.nickname} />
        <span className="min-w-0 truncate font-bold text-espresso">{post.nickname}</span>
        <span className="text-ink-soft" aria-hidden="true">·</span>
        <time dateTime={post.createdAt.toISOString()} className="shrink-0 text-ink-soft">
          {timeAgo(post.createdAt, now)}
        </time>
      </div>

      <h2 className="text-lg leading-snug font-extrabold break-words text-ink">
        {/* Stretched link: the whole card is tappable, buttons sit above it. */}
        <Link href={href} className="after:absolute after:inset-0 after:rounded-card">
          {post.title}
        </Link>
      </h2>
      <p className="mt-1.5 line-clamp-3 break-words text-[0.95rem] leading-relaxed text-ink-soft">
        {excerpt(post.body)}
      </p>

      <div className="-ml-3 mt-3 flex items-center gap-1">
        <LikeButton postId={post.id} initialLiked={post.likedByMe} initialCount={post.likeCount} />
        <Link
          href={`${href}#comments`}
          className="relative z-10 inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-bold text-ink-soft transition hover:bg-cream hover:text-espresso active:scale-95"
          aria-label={`${post.commentCount} comments`}
        >
          <ChatIcon size={19} />
          <span className="tabular-nums">{post.commentCount}</span>
        </Link>
      </div>
    </article>
  );
}
