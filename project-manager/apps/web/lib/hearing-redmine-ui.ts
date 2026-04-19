import type { HearingSheetRow } from "@/lib/hearing-sheet-types";

export function hearingRedmineFallbackSubject(row: HearingSheetRow): string {
  const cat = row.category.trim();
  const head = row.heading.trim();
  const q = row.question.trim();
  let s: string;
  if (cat !== "" && head !== "") {
    s = `[${cat.slice(0, 40)}] ${head.slice(0, 80)}`;
  } else if (q !== "") {
    s = q.slice(0, 120);
  } else {
    s = "ヒアリング確認事項";
  }
  return s.length > 255 ? s.slice(0, 255) : s;
}

export function hearingRedmineDueForApi(row: HearingSheetRow): string | undefined {
  const t = row.due.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    return t;
  }
  return undefined;
}

/**
 * Redmine 本文・モーダルプレビュー用。値が空（trim 後）のブロックは【ラベル】ごと出力しない。
 * ラベル行の直後に改行して値を続ける。ブロック間は空行 1 行。
 */
export function hearingRedmineDescription(row: HearingSheetRow, hearingPageUrl: string): string {
  const blocks: string[] = [];

  const pushBlock = (label: string, value: string) => {
    const t = value.trim();
    if (t === "") {
      return;
    }
    blocks.push(`【${label}】\n${t}`);
  };

  pushBlock("分類", row.category);
  pushBlock("見出し", row.heading);
  pushBlock("確認事項", row.question);
  pushBlock("回答", row.answer);

  const url = hearingPageUrl.trim();
  if (url !== "") {
    blocks.push(`【ヒアリングシート】\n${url}`);
  }

  return blocks.join("\n\n");
}

export function tokenizeAndSearch(q: string): string[] {
  return q
    .trim()
    .split(/\s+/u)
    .map((t) => t.trim())
    .filter((t) => t !== "");
}

export function matchesRedmineSearchTokens(haystack: string, tokens: string[]): boolean {
  if (tokens.length === 0) {
    return true;
  }
  const h = haystack.toLowerCase();
  return tokens.every((t) => h.includes(t.toLowerCase()));
}
