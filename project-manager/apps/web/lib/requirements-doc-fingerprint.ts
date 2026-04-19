import type { RequirementsDocBody } from "@/lib/requirements-doc-types";

/** 未保存検出用（ヒアリングの fingerprint と同様に JSON 文字列比較） */
export function requirementsDocFingerprint(body: RequirementsDocBody): string {
  return JSON.stringify(body);
}
