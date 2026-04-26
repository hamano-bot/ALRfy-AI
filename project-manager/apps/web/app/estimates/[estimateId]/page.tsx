import type { Metadata } from "next";
import { EstimateEditorClient } from "../EstimateEditorClient";

export const metadata: Metadata = {
  title: "Estimates | 編集",
};

type EstimatePageProps = {
  params: Promise<{ estimateId: string }>;
};

export default async function EstimateDetailPage({ params }: EstimatePageProps) {
  const { estimateId } = await params;
  const id = Number.parseInt(estimateId, 10);
  return <EstimateEditorClient estimateId={Number.isFinite(id) && id > 0 ? id : undefined} />;
}
