import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProjectHearingPrintPreviewView from "./ProjectHearingPrintPreviewView";

type PageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ hide_completed?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { projectId } = await params;
  if (!/^\d+$/.test(projectId)) {
    return { title: "ヒアリングシートプレビュー" };
  }
  return { title: `ヒアリングシートプレビュー #${projectId}` };
}

export default async function ProjectHearingPrintPreviewPage({ params, searchParams }: PageProps) {
  const { projectId } = await params;
  const { hide_completed } = await searchParams;
  if (!/^\d+$/.test(projectId)) {
    notFound();
  }

  return <ProjectHearingPrintPreviewView projectId={projectId} initialHideCompleted={hide_completed === "1"} />;
}

