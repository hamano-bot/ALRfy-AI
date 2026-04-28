import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Button } from "@/app/components/ui/button";
import { PrefetchProjectManagerNew } from "./PrefetchProjectManagerNew";
import ProjectManagerList from "./ProjectManagerList";

export const metadata: Metadata = {
  title: "Project",
  description: "案件・ドキュメント管理（Project Web）",
};

function ProjectListFallback() {
  return (
    <section className="surface-card p-5" aria-busy="true" aria-label="一覧を読み込み中">
      <p className="text-sm text-[var(--muted)]">読み込み中…</p>
    </section>
  );
}

export default function ProjectManagerHomePage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden">
      <section className="surface-card pm-page-hero relative h-[3.9rem] shrink-0 overflow-hidden px-5 sm:h-[4.2rem]">
        <div className="pointer-events-none absolute -top-10 right-0 h-36 w-36 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_22%,transparent)] blur-3xl" />
        <div className="relative flex h-full min-h-0 flex-row items-center justify-between gap-3">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center">
            <h1 className="text-xl font-semibold leading-tight tracking-tight text-[var(--foreground)] sm:text-2xl">
              Project
            </h1>
          </div>
          <div className="flex shrink-0 self-center">
            <Button asChild variant="accent" size="sm" className="rounded-lg">
              <Link href="/project-list/new" prefetch>
                新規登録
              </Link>
            </Button>
          </div>
        </div>
        <PrefetchProjectManagerNew />
      </section>

      <div className="flex min-h-0 flex-1 flex-col">
        <Suspense fallback={<ProjectListFallback />}>
          <ProjectManagerList />
        </Suspense>
      </div>
    </div>
  );
}
