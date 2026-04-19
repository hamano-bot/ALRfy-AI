/**
 * ヒアリングシートのセル本文から https URL を抽出する（表示用クリップ行のみ。保存データは変更しない）。
 */

/** 空白までを URL 候補として拾い、後段で `URL` と末尾トリムで整える */
const HTTPS_CHUNK_RE = /https:\/\/\S+/gi;

/** 末尾に付きがちな句読点・括弧を落とす */
function trimTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?)\]]+$/u, "");
}

/**
 * 出現順を保ちつつ重複を除いた https URL のリスト。
 * 正規化に `URL` を使い、`javascript:` 等は除外する。
 */
export function extractHttpsUrlsInOrder(text: string): string[] {
  if (!text || typeof text !== "string") {
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  HTTPS_CHUNK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HTTPS_CHUNK_RE.exec(text)) !== null) {
    const raw = trimTrailingPunctuation(m[0]);
    try {
      const u = new URL(raw);
      if (u.protocol !== "https:") {
        continue;
      }
      const href = u.href;
      if (seen.has(href)) {
        continue;
      }
      seen.add(href);
      out.push(href);
    } catch {
      /* ignore invalid URL */
    }
  }
  return out;
}
