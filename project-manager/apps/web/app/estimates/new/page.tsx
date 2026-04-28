import type { Metadata } from "next";
import { EstimateEditorClient } from "../EstimateEditorClient";

export const metadata: Metadata = {
  title: "Estimates | 新規作成",
};

export default function NewEstimatePage({
  searchParams,
}: {
  searchParams?: { duplicate_from?: string };
}) {
  const rawDuplicateFrom = searchParams?.duplicate_from;
  const duplicateFromEstimateId =
    typeof rawDuplicateFrom === "string" && /^\d+$/.test(rawDuplicateFrom) ? Number.parseInt(rawDuplicateFrom, 10) : undefined;
  return <EstimateEditorClient duplicateFromEstimateId={duplicateFromEstimateId} />;
}
