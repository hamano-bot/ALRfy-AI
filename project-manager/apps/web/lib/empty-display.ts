/**
 * 値が無いときの表示ルール（アプリ全体共通）
 * - ダッシュ「—」は使わない（空文字で統一）
 */
export const EMPTY_VALUE_DISPLAY = "";

/** null / undefined / 空文字列のときは空表示、それ以外はそのまま（trim のみ） */
export function displayText(value: string | null | undefined): string {
  if (value == null) {
    return EMPTY_VALUE_DISPLAY;
  }
  const s = typeof value === "string" ? value : String(value);
  const t = s.trim();
  return t === "" ? EMPTY_VALUE_DISPLAY : t;
}
