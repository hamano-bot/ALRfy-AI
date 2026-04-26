import type { Metadata } from "next";
import { EstimateEditorClient } from "../EstimateEditorClient";

export const metadata: Metadata = {
  title: "Estimates | 新規作成",
};

export default function NewEstimatePage() {
  return <EstimateEditorClient />;
}
