/** `project_members.role` / 実効ロールの共通日本語ラベル（一覧・詳細で共用） */
export const PROJECT_ROLE_LABEL_JA: Record<string, string> = {
  owner: "オーナー",
  editor: "編集",
  viewer: "参照",
};

/** API は英字のまま返す想定 */
export function formatProjectRoleLabelJa(role: string): string {
  const raw = typeof role === "string" ? role : String(role ?? "");
  const key = raw.trim().toLowerCase();
  return PROJECT_ROLE_LABEL_JA[key] ?? raw;
}
