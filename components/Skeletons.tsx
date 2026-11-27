function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-full bg-cream-deep ${className}`} />;
}

export function PostCardSkeleton() {
  return (
    <div className="rounded-card bg-card p-5 shadow-card" aria-hidden="true">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="size-8 animate-pulse rounded-full bg-cream-deep" />
        <Bar className="h-3.5 w-32" />
      </div>
      <Bar className="h-5 w-3/4" />
      <Bar className="mt-3 h-3.5 w-full" />
      <Bar className="mt-2 h-3.5 w-5/6" />
      <div className="mt-5 flex gap-3">
        <Bar className="h-7 w-14" />
        <Bar className="h-7 w-14" />
      </div>
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading posts">
      <PostCardSkeleton />
      <PostCardSkeleton />
      <PostCardSkeleton />
    </div>
  );
}

export function PostPageSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading post">
      <div className="rounded-card bg-card p-6 shadow-card">
        <div className="mb-5 flex items-center gap-3">
          <div className="size-10 animate-pulse rounded-full bg-cream-deep" />
          <Bar className="h-4 w-36" />
        </div>
        <Bar className="h-7 w-4/5" />
        <Bar className="mt-5 h-4 w-full" />
        <Bar className="mt-2.5 h-4 w-full" />
        <Bar className="mt-2.5 h-4 w-2/3" />
      </div>
      <div className="h-28 animate-pulse rounded-card bg-card/70" />
    </div>
  );
}
