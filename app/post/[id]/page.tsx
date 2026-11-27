import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getPostPage } from "@/lib/queries";
import { timeAgo } from "@/lib/time";
import { Avatar } from "@/components/Avatar";
import { CommentForm } from "@/components/CommentForm";
import { CommentsSection } from "@/components/CommentsSection";
import { LikeButton } from "@/components/LikeButton";
import { ReportButton } from "@/components/ReportButton";
import { ViewCounter } from "@/components/ViewCounter";
import { ShareButton } from "@/components/ShareButton";
import { excerpt } from "@/lib/feed";
import { getPostPreview } from "@/lib/queries";
import { postUrl } from "@/lib/site";
import type { Metadata } from "next";
import { formatCount } from "@/lib/format";
import { PostPageSkeleton } from "@/components/Skeletons";
import { ArrowLeftIcon, ChatIcon } from "@/components/icons";

/** Per-post link previews. Hidden or missing posts get no preview content. */
export async function generateMetadata({ params }: PageProps<"/post/[id]">): Promise<Metadata> {
  const { id } = await params;
  const post = await getPostPreview(id);
  if (!post) return { title: "Post not found", robots: { index: false } };
  const description = excerpt(post.body, 160);
  return {
    title: post.title,
    description,
    alternates: { canonical: postUrl(id) },
    openGraph: {
      type: "article",
      siteName: "AraTalk",
      title: post.title,
      description,
      url: postUrl(id),
    },
    twitter: { card: "summary_large_image", title: post.title, description },
  };
}

export default function PostPage({ params }: PageProps<"/post/[id]">) {
  return (
    <>
      <Link
        href="/"
        className="-ml-3 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-ink-soft transition hover:bg-cream-deep hover:text-espresso"
      >
        <ArrowLeftIcon size={18} /> Back to the feed
      </Link>
      <Suspense fallback={<PostPageSkeleton />}>
        {params.then(({ id }) => (
          <PostDetail id={id} />
        ))}
      </Suspense>
    </>
  );
}

async function PostDetail({ id }: { id: string }) {
  const data = await getPostPage(id);
  if (!data) notFound();
  const { post, comments, readAt: now } = data;

  return (
    <>
      <article className="rounded-card bg-card p-5 shadow-card sm:p-7">
        <div className="mb-4 flex items-center gap-3 text-sm">
          <Avatar nickname={post.nickname} size="md" />
          <div className="min-w-0">
            <p className="truncate font-bold text-espresso">{post.nickname}</p>
            <time dateTime={post.createdAt.toISOString()} className="text-ink-soft">
              {timeAgo(post.createdAt, now)}
            </time>
          </div>
        </div>

        <h1 className="text-2xl leading-tight font-extrabold tracking-tight break-words text-ink sm:text-3xl">
          {post.title}
        </h1>
        <p className="mt-4 text-[1.05rem] leading-relaxed break-words whitespace-pre-wrap text-ink">
          {post.body}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-1 border-t border-espresso/10 pt-3">
          <div className="-ml-3 flex flex-wrap items-center gap-1">
            <LikeButton
              id={post.id}
              initialLiked={post.likedByMe}
              initialCount={post.likeCount}
              size="md"
            />
            <a
              href="#comments"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-bold text-ink-soft transition hover:bg-cream hover:text-espresso"
            >
              <ChatIcon size={22} />
              <span className="tabular-nums">{formatCount(post.commentCount)}</span>
              <span className="sr-only">comments</span>
            </a>
            <ShareButton
              postId={post.id}
              title={post.title}
              excerpt={excerpt(post.body, 140)}
              initialCount={post.shareCount}
              initialShared={post.sharedByMe}
              size="md"
            />
            <ViewCounter postId={post.id} initialCount={post.viewCount} />
          </div>
          <div className="ml-auto">
            <ReportButton targetType="POST" targetId={post.id} hiddenRedirect="/" />
          </div>
        </div>
      </article>

      <section id="comments" className="mt-8 scroll-mt-24">
        <h2 className="mb-3 text-lg font-extrabold text-espresso">
          Comments <span className="text-ink-soft">({post.commentCount})</span>
        </h2>
        <CommentForm postId={post.id} />
        <div className="mt-5">
          <CommentsSection postId={post.id} initial={comments} now={now} />
        </div>
      </section>
    </>
  );
}
