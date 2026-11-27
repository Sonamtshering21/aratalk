import Link from "next/link";
import type { FeedPost } from "@/lib/feed-types";
import { formatCount } from "@/lib/format";
import { CardViewTracker } from "./CardViewTracker";
import { timeAgo } from "@/lib/time";
import { Avatar } from "./Avatar";
import { LikeButton } from "./LikeButton";
import { ShareButton } from "./ShareButton";
import { ViewCount } from "./ViewCount";
import { ChatIcon } from "./icons";

// Renders on the server (first page) and the client (infinite scroll pages).
export function PostCard({ post, now }: { post: FeedPost; now: number }) {
  const href = `/post/${post.id}`;
  const createdAt = new Date(post.createdAt);
  return (
    <article className="group relative min-w-0 rounded-card bg-card p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover">
      <CardViewTracker postId={post.id} />
      <div className="mb-3 flex min-w-0 items-center gap-2.5 text-sm">
        <Avatar nickname={post.nickname} />
        <span className="min-w-0 truncate font-bold text-espresso">{post.nickname}</span>
        <span className="text-ink-soft" aria-hidden="true">·</span>
        <time dateTime={post.createdAt} className="shrink-0 text-ink-soft">
          {timeAgo(createdAt, now)}
        </time>
      </div>

      <h2 className="text-lg leading-snug font-extrabold wrap-anywhere text-ink">
        {/* Stretched link: the whole card is tappable, buttons sit above it. */}
        <Link href={href} className="after:absolute after:inset-0 after:rounded-card">
          {post.title}
        </Link>
      </h2>
      <p className="mt-1.5 line-clamp-3 text-[0.95rem] leading-relaxed wrap-anywhere text-ink-soft">
        {post.excerpt}
      </p>

      <div className="-ml-3 mt-3 flex items-center gap-1">
        <LikeButton id={post.id} initialLiked={post.likedByMe} initialCount={post.likeCount} />
        <Link
          href={`${href}#comments`}
          className="relative z-10 inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-bold text-ink-soft transition hover:bg-cream hover:text-espresso active:scale-95"
          aria-label={`${post.commentCount} comments`}
        >
          <ChatIcon size={19} />
          <span className="tabular-nums">{formatCount(post.commentCount)}</span>
        </Link>
        <ShareButton
          postId={post.id}
          title={post.title}
          excerpt={post.excerpt}
          initialCount={post.shareCount}
          initialShared={post.sharedByMe}
        />
        <span className="ml-auto">
          <ViewCount postId={post.id} initial={post.viewCount} />
        </span>
      </div>
    </article>
  );
}
