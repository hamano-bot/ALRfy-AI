import type { Metadata } from "next";
import { EstimatePreviewClient } from "./preview-client";

export const metadata: Metadata = {
  title: "Estimates | プレビュー",
};

type PageProps = {
  params: Promise<{ estimateId: string }>;
};

export default async function EstimatePreviewPage({ params }: PageProps) {
  const { estimateId } = await params;
  const id = Number.parseInt(estimateId, 10);
  return <EstimatePreviewClient estimateId={Number.isFinite(id) && id > 0 ? id : 0} />;
}
