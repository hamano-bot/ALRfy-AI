/**
 * ヒアリング表のセル用 id / name（ブラウザ監査・オートフィル用。送信はしないが name を付与する）
 */
export function hearingFieldIds(rowId: string, field: string): { id: string; name: string } {
  const safeRow = rowId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeField = field.replace(/[^a-zA-Z0-9_-]/g, "_");
  const id = `hearing-${safeRow}-${safeField}`;
  return { id, name: id };
}
