import Link from "next/link";
import { CalendarDays } from "lucide-react";

export default function MeetingsPage() {
  return (
    <section className="surface-card flex h-full min-h-0 flex-col rounded-2xl p-5 md:p-6" aria-label="Meetings">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]" lang="en" translate="no">
            meetings
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-[var(--foreground)]">
            <CalendarDays className="h-6 w-6 text-[var(--accent)]" aria-hidden />
            Meetings
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Build単位A: 受け皿実装のみ完了。次フェーズで一覧・詳細・編集を順次移植します。
          </p>
        </div>
      </header>

      <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_92%,transparent)] p-4 text-sm text-[var(--muted)]">
        API scaffold: <code>/api/portal/minutes</code>
      </div>

      <div className="mt-4">
        <Link
          href="/api/portal/minutes"
          className="inline-flex items-center rounded-lg border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] px-3 py-2 text-sm text-[var(--foreground)] transition-colors hover:border-[color:color-mix(in_srgb,var(--accent)_45%,var(--border)_55%)]"
        >
          API scaffold を確認
        </Link>
      </div>
    </section>
  );
}
