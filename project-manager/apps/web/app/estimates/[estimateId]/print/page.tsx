import type { Metadata } from "next";
import { EstimatePrintToPdfClient } from "./print-client";

export const metadata: Metadata = {
  title: "Estimates | PDF印刷",
};

type PageProps = {
  params: Promise<{ estimateId: string }>;
};

export default async function EstimatePrintPage({ params }: PageProps) {
  const { estimateId } = await params;
  const id = Number.parseInt(estimateId, 10);
  const safe = Number.isFinite(id) && id > 0 ? id : 0;
  return <EstimatePrintToPdfClient estimateId={safe} />;
}
