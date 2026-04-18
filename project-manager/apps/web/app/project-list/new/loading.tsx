export default function ProjectManagerNewLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="新規登録ページを読み込み中">
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-4 w-16 animate-pulse rounded bg-[color:color-mix(in_srgb,var(--foreground)_12%,transparent)]" />
        <div className="h-7 w-48 animate-pulse rounded bg-[color:color-mix(in_srgb,var(--foreground)_12%,transparent)] md:w-64" />
      </div>
      <div className="surface-card space-y-4 p-5">
        <div className="h-4 w-40 animate-pulse rounded bg-[color:color-mix(in_srgb,var(--foreground)_10%,transparent)]" />
        <div className="h-10 w-full max-w-md animate-pulse rounded-md bg-[color:color-mix(in_srgb,var(--foreground)_8%,transparent)]" />
        <div className="h-4 w-32 animate-pulse rounded bg-[color:color-mix(in_srgb,var(--foreground)_10%,transparent)]" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-10 animate-pulse rounded-md bg-[color:color-mix(in_srgb,var(--foreground)_8%,transparent)]" />
          <div className="h-10 animate-pulse rounded-md bg-[color:color-mix(in_srgb,var(--foreground)_8%,transparent)]" />
        </div>
        <div className="h-32 animate-pulse rounded-lg bg-[color:color-mix(in_srgb,var(--foreground)_6%,transparent)]" />
      </div>
    </div>
  );
}
