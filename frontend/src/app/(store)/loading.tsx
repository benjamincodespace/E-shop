export default function StoreLoading() {
  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-8">
      <div className="h-6 w-44 rounded bg-neutral-100 animate-pulse" />
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-3">
            <div className="aspect-square rounded-2xl bg-neutral-100 animate-pulse" />
            <div className="h-3 w-2/3 rounded bg-neutral-100 animate-pulse" />
            <div className="h-3 w-1/3 rounded bg-neutral-100 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
