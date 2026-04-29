import type { Metadata } from "next";
import { EstimateEditorClient } from "../EstimateEditorClient";

export const metadata: Metadata = {
  title: "Estimates | 新規作成",
};

export default async function NewEstimatePage({
  searchParams,
}: {
  searchParams?: Promise<{ duplicate_from?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const rawDuplicateFrom = resolvedSearchParams?.duplicate_from;
  const duplicateFromEstimateId =
    typeof rawDuplicateFrom === "string" && /^\d+$/.test(rawDuplicateFrom) ? Number.parseInt(rawDuplicateFrom, 10) : undefined;
  return <EstimateEditorClient duplicateFromEstimateId={duplicateFromEstimateId} />;
}
