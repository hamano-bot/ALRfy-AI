import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProjectRequirementsView from "./ProjectRequirementsView";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { projectId } = await params;
  if (!/^\d+$/.test(projectId)) {
    return { title: "要件定義" };
  }
  return { title: `要件定義 #${projectId}` };
}

export default async function ProjectRequirementsPage({ params }: PageProps) {
  const { projectId } = await params;
  if (!/^\d+$/.test(projectId)) {
    notFound();
  }

  return (
    <div className="modern-scrollbar min-h-0 flex-1 overflow-y-auto">
      <ProjectRequirementsView projectId={projectId} />
    </div>
  );
}
