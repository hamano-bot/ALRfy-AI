import Link from "next/link";
import type { Metadata } from "next";
import { ProjectCreateForm } from "./ProjectCreateForm";

export const metadata: Metadata = {
  title: "Project 新規登録",
  description: "案件の新規登録",
};

export default function ProjectManagerNewPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/project-manager"
          className="text-sm text-[color:color-mix(in_srgb,var(--accent)_82%,var(--foreground)_18%)] hover:underline"
        >
          ← 戻る
        </Link>
        <h1 className="text-xl font-semibold text-[var(--foreground)] md:text-2xl">Project 新規登録</h1>
      </div>
      <ProjectCreateForm />
    </div>
  );
}
