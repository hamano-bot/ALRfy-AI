import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProjectRequirementsPrintPreviewView from "./ProjectRequirementsPrintPreviewView";

type PageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ selected_page_id?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { projectId } = await params;
  if (!/^\d+$/.test(projectId)) {
    return { title: "要件定義プレビュー" };
  }
  return { title: `要件定義プレビュー #${projectId}` };
}

export default async function ProjectRequirementsPrintPreviewPage({ params, searchParams }: PageProps) {
  const { projectId } = await params;
  const { selected_page_id } = await searchParams;
  if (!/^\d+$/.test(projectId)) {
    notFound();
  }

  return <ProjectRequirementsPrintPreviewView projectId={projectId} initialSelectedPageId={selected_page_id} />;
}

