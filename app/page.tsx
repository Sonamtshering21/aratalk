import Link from "next/link";
import { Suspense } from "react";
import { getFeed, type FeedTab } from "@/lib/queries";
import { FeedTabs } from "@/components/FeedTabs";
import { PostCard } from "@/components/PostCard";
import { EmptyState } from "@/components/EmptyState";
import { FeedSkeleton } from "@/components/Skeletons";

export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <>
      <section className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-espresso sm:text-3xl">
          Pull up a seat. 🍶
        </h1>
        <p className="mt-1 text-ink-soft">
          Share what&apos;s on your mind, like friends chatting over a cup of Ara.
        </p>
      </section>

      <Suspense
        fallback={
          <>
            <FeedTabs active={null} />
            <FeedSkeleton />
          </>
        }
      >
        {searchParams.then((sp) => (
          <Feed tab={sp.tab === "trending" ? "trending" : "newest"} />
        ))}
      </Suspense>
    </>
  );
}

async function Feed({ tab }: { tab: FeedTab }) {
  const { posts, readAt } = await getFeed(tab);

  return (
    <>
      <FeedTabs active={tab} />
      {posts.length === 0 ? (
        <EmptyState emoji="🫖" title="It's quiet around the fire">
          <p>
            No one has spoken up yet.{" "}
            <Link href="/new" className="font-bold text-gold-deep underline underline-offset-2">
              Start the first conversation
            </Link>
            .
          </p>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} now={readAt} />
          ))}
        </div>
      )}
    </>
  );
}
