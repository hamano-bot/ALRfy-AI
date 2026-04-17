import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Button } from "@/app/components/ui/button";
import ProjectManagerList from "./ProjectManagerList";

export const metadata: Metadata = {
  title: "Project",
  description: "案件・ドキュメント管理（Project Web）",
};

function ProjectListFallback() {
  return (
    <section className="surface-card p-5" aria-busy="true" aria-label="所属案件を読み込み中">
      <h2 className="text-lg font-semibold text-[var(--foreground)]">所属案件</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">読み込み中…</p>
    </section>
  );
}

export default function ProjectManagerHomePage() {
  return (
    <div className="space-y-5">
      <section className="surface-card relative overflow-hidden p-5">
        <div className="pointer-events-none absolute -top-10 right-0 h-36 w-36 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_22%,transparent)] blur-3xl" />
        <p className="text-sm font-medium text-[color:color-mix(in_srgb,var(--accent)_82%,white_18%)]">project-manager</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-3xl">Project</h1>
        <p className="mt-3 max-w-2xl text-sm text-[color:color-mix(in_srgb,var(--foreground)_88%,transparent)]">
          所属案件の一覧です。一覧はポータル（PHP）のセッション Cookie を BFF 経由で転送して取得しています。
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button asChild variant="accent" size="sm" className="rounded-lg">
            <Link href="/project-manager/new">新規登録</Link>
          </Button>
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">
          ドキュメント雛形:{" "}
          <code className="text-[var(--foreground)]">docs/projects/_sample</code>
          {" · "}
          <Link href="/" className="text-[color:color-mix(in_srgb,var(--accent)_82%,var(--foreground)_18%)] hover:underline">
            ダッシュボードへ
          </Link>
        </p>
      </section>

      <Suspense fallback={<ProjectListFallback />}>
        <ProjectManagerList />
      </Suspense>
    </div>
  );
}
