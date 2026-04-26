/**
 * ProjectCreateForm の ParticipantAddInput / RedmineSuggestRow と同系統のサジェスト UI。
 * ネイティブ datalist では OS テーマ固定のため、ポータルテーマに合わせたパネルを使う。
 */
export const PORTAL_THEMED_SUGGEST_PANEL =
  "absolute left-0 right-0 top-full z-[120] mt-1 max-h-56 overflow-y-auto rounded-lg border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[var(--surface)] shadow-lg";

export const PORTAL_THEMED_SUGGEST_ROW =
  "block w-full px-3 py-2 text-left hover:bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)]";

export const PORTAL_THEMED_SUGGEST_MUTED = "px-3 py-2 text-xs text-[var(--muted)]";
