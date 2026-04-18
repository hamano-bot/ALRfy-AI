import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProjectDetailView from "./ProjectDetailView";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { projectId } = await params;
  if (!/^\d+$/.test(projectId)) {
    return { title: "案件" };
  }
  return { title: `案件 #${projectId}` };
}

export default async function ProjectManagerDetailPage({ params }: PageProps) {
  const { projectId } = await params;
  if (!/^\d+$/.test(projectId)) {
    notFound();
  }

  return (
    <div className="modern-scrollbar min-h-0 flex-1 overflow-y-auto">
      <div className="space-y-5">
      <nav className="text-xs text-[var(--muted)]">
        <Link href="/project-list" className="text-[color:color-mix(in_srgb,var(--accent)_82%,var(--foreground)_18%)] hover:underline">
          案件一覧
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-[var(--foreground)]">案件 #{projectId}</span>
      </nav>

      <ProjectDetailView projectId={projectId} />
      </div>
    </div>
  );
}
