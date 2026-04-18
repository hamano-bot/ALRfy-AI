import Link from "next/link";
import type { Metadata } from "next";

import { ProjectCreateForm } from "./ProjectCreateForm";

export const metadata: Metadata = {
  title: "Project 新規登録",
  description: "案件の新規登録",
};

export default function ProjectManagerNewPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden">
      <section className="surface-card relative shrink-0 overflow-hidden px-5 py-4">
        <div className="pointer-events-none absolute -top-10 right-0 h-36 w-36 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_22%,transparent)] blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-3">
          <Link
            href="/project-list"
            prefetch
            className="text-sm text-[color:color-mix(in_srgb,var(--accent)_82%,var(--foreground)_18%)] hover:underline"
          >
            ← 戻る
          </Link>
          <h1 className="text-xl font-semibold leading-tight tracking-tight text-[var(--foreground)] md:text-2xl">
            Project 新規登録
          </h1>
        </div>
        <p className="relative mt-2 max-w-3xl text-xs leading-snug text-[color:color-mix(in_srgb,var(--foreground)_88%,transparent)] sm:text-sm">
          案件の基本情報・日付・Redmine・各種リンク・参加者を登録します。
        </p>
      </section>

      <div className="modern-scrollbar min-h-0 flex-1 overflow-y-auto">
        <section className="surface-card p-5 md:p-6">
          <ProjectCreateForm />
        </section>
      </div>
    </div>
  );
}
