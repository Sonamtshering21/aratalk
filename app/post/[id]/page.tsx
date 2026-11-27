import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getPostPage } from "@/lib/queries";
import { timeAgo } from "@/lib/time";
import { Avatar } from "@/components/Avatar";
import { CommentForm } from "@/components/CommentForm";
import { CommentList } from "@/components/CommentList";
import { LikeButton } from "@/components/LikeButton";
import { ReportButton } from "@/components/ReportButton";
import { PostPageSkeleton } from "@/components/Skeletons";
import { ArrowLeftIcon, ChatIcon } from "@/components/icons";

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
  const { post, threads, readAt: now } = data;

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
          <div className="-ml-3 flex items-center gap-1">
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
              <span className="tabular-nums">{post.commentCount}</span>
              <span className="sr-only">comments</span>
            </a>
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
          <CommentList postId={post.id} threads={threads} now={now} />
        </div>
      </section>
    </>
  );
}
