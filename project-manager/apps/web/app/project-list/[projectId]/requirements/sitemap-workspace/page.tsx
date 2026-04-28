import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProjectSitemapWorkspaceView from "./ProjectSitemapWorkspaceView";

type PageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ page?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { projectId } = await params;
  if (!/^\d+$/.test(projectId)) {
    return { title: "サイトマップ（別タブ）" };
  }
  return { title: `サイトマップ（別タブ） #${projectId}` };
}

export default async function ProjectSitemapWorkspacePage({ params, searchParams }: PageProps) {
  const { projectId } = await params;
  const { page: pageId } = await searchParams;
  if (!/^\d+$/.test(projectId)) {
    notFound();
  }

  return (
    <div className="h-full min-h-0 flex-1 overflow-hidden">
      <ProjectSitemapWorkspaceView projectId={projectId} targetPageId={pageId} />
    </div>
  );
}
