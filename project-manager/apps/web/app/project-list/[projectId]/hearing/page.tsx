import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProjectHearingView from "./ProjectHearingView";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { projectId } = await params;
  if (!/^\d+$/.test(projectId)) {
    return { title: "ヒアリングシート" };
  }
  return { title: `ヒアリングシート #${projectId}` };
}

export default async function ProjectHearingPage({ params }: PageProps) {
  const { projectId } = await params;
  if (!/^\d+$/.test(projectId)) {
    notFound();
  }

  return (
    <div className="modern-scrollbar min-h-0 flex-1 overflow-y-auto">
      <ProjectHearingView projectId={projectId} />
    </div>
  );
}
