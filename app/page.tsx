import { Suspense } from "react";
import { getFeedPage } from "@/lib/feed";
import { parseFeedParams, type FeedTab, type TopRange } from "@/lib/feed-types";
import { FeedList } from "@/components/FeedList";
import { FeedTabs } from "@/components/FeedTabs";
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
        {searchParams.then((sp) => {
          const { tab, range } = parseFeedParams(sp);
          return <Feed tab={tab} range={range} />;
        })}
      </Suspense>
    </>
  );
}

async function Feed({ tab, range }: { tab: FeedTab; range: TopRange }) {
  const page = await getFeedPage(tab, range, null);
  return (
    <>
      <FeedTabs active={tab} range={range} />
      {/* A refresh brings a new readAt, which resets the scrolled list. */}
      <FeedList key={`${tab}:${range}:${page.readAt}`} tab={tab} range={range} initial={page} />
    </>
  );
}
