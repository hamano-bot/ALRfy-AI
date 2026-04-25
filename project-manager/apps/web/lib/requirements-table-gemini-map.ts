import { GoogleGenerativeAI, type GenerationConfig } from "@google/generative-ai";
import { HEARING_GEMINI_GENERATION_CONFIG } from "@/lib/hearing-gemini-generation";
import { truncateSheetText } from "@/lib/hearing-excel-parse";
import type { RequirementsPageContentTable } from "@/lib/requirements-doc-types";

const DEFAULT_MODEL = "gemini-3-flash-preview";
const MAX_SHEET_CHARS = 120_000;
const DEFAULT_LABELS = ["項目", "内容", "備考"] as const;

function extractBalancedJsonObjects(text: string): string[] {
  const out: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
      continue;
    }
    if (ch === "}") {
      if (depth <= 0) {
        continue;
      }
      depth -= 1;
      if (depth === 0 && start >= 0) {
        out.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return out;
}

function normalizeJsonCandidate(text: string): string {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function tryParseCandidate(candidate: string): unknown {
  const normalized = normalizeJsonCandidate(candidate);
  return JSON.parse(normalized) as unknown;
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return tryParseCandidate(trimmed);
  } catch {
    /* continue */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    const fenced = fence[1].trim().replace(/^json\s*/i, "");
    try {
      return tryParseCandidate(fenced);
    } catch {
      /* continue */
    }
  }
  const candidates = extractBalancedJsonObjects(trimmed);
  for (const candidate of candidates) {
    try {
      return tryParseCandidate(candidate);
    } catch {
      /* continue */
    }
  }
  throw new Error("JSON parse failed");
}

function normalizeMappedTable(raw: unknown): RequirementsPageContentTable | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const value = raw as { columnLabels?: unknown; rows?: unknown };
  if (!Array.isArray(value.columnLabels) || !Array.isArray(value.rows)) {
    return null;
  }
  const labels = value.columnLabels
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v !== "")
    .slice(0, 6);
  const safeLabels = labels.length > 0 ? labels : [...DEFAULT_LABELS];
  const width = safeLabels.length;
  const rows = value.rows
    .map((row, idx) => {
      if (!row || typeof row !== "object") {
        return null;
      }
      const r = row as { cells?: unknown };
      if (!Array.isArray(r.cells)) {
        return null;
      }
      const sourceCells = r.cells as unknown[];
      return {
        id: `imp-${Date.now()}-${idx}`,
        cells: Array.from({ length: width }, (_, ci) => {
          const v = sourceCells[ci];
          return typeof v === "string" ? v : "";
        }),
      };
    })
    .filter((row): row is { id: string; cells: string[] } => row !== null);
  return { columnLabels: safeLabels, rows };
}

function parseSheetTextAsTable(sheetText: string): RequirementsPageContentTable {
  const lines = sheetText
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "");
  if (lines.length === 0) {
    return {
      columnLabels: [...DEFAULT_LABELS],
      rows: [],
    };
  }
  const cellsByLine = lines.map((line) => line.split("\t"));
  const headerRaw = cellsByLine[0] ?? [];
  const widthFromHeader = Math.min(6, Math.max(1, headerRaw.length));
  const width = widthFromHeader;
  const labels = Array.from({ length: width }, (_, ci) => {
    const v = headerRaw[ci];
    if (typeof v === "string" && v.trim() !== "") {
      return v.trim();
    }
    return DEFAULT_LABELS[ci] ?? `列${ci + 1}`;
  });
  const rows = cellsByLine
    .slice(1)
    .map((cols, idx) => {
      const cells = Array.from({ length: width }, (_, ci) => {
        const v = cols[ci];
        return typeof v === "string" ? v : "";
      });
      const hasAny = cells.some((cell) => cell.trim() !== "");
      if (!hasAny) {
        return null;
      }
      return {
        id: `sheet-${Date.now()}-${idx}`,
        cells,
      };
    })
    .filter((row): row is { id: string; cells: string[] } => row !== null);
  return { columnLabels: labels, rows };
}

export async function mapExcelTextToRequirementsTable(
  sheetText: string,
): Promise<{ ok: true; data: RequirementsPageContentTable; truncated: boolean } | { ok: false; message: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, message: "GEMINI_API_KEY が未設定です。.env に追加してください。" };
  }
  const { text: clipped, truncated } = truncateSheetText(sheetText, MAX_SHEET_CHARS);
  if (!clipped.trim()) {
    return { ok: false, message: "シートにデータがありません。" };
  }
  const modelName = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      ...HEARING_GEMINI_GENERATION_CONFIG,
      maxOutputTokens: 2200,
    } as GenerationConfig,
  });

  const prompt = `あなたは要件定義の表組データ抽出アシスタントです。Excel由来のタブ区切りテキストから表組JSONを作成してください。

厳守:
- 出力は JSON オブジェクトのみ（説明文禁止）。
- 型: {"columnLabels":["..."],"rows":[{"cells":["..."]}]}
- columnLabels は 1〜6列。rows の各 cells は columnLabels と同じ列数。
- 不要な空行は除外。
- 列見出しが不明なら ["項目","内容","備考"] を使う。
- 入力に複数行ある場合、要約せず可能な限り全行を rows に含める。

--- 表データ ---
${clipped}
--- 終わり ---`;

  const repairPrompt = (broken: string) => `次のテキストを、指定スキーマの正しいJSONオブジェクトに整形してください。
説明文は禁止。JSONのみ返してください。

スキーマ:
{"columnLabels":["..."],"rows":[{"cells":["..."]}]}

制約:
- columnLabels は 1〜6列
- rows の各 cells は columnLabels と同じ列数
- 値はすべて文字列
- trailing comma を除去

入力テキスト:
${broken}`;

  try {
    const result = await model.generateContent(prompt);
    const out = result.response.text();
    if (!out) {
      return { ok: false, message: "Gemini から応答がありませんでした。" };
    }
    let parsed: unknown;
    try {
      parsed = extractJsonObject(out);
    } catch {
      try {
        const repaired = await model.generateContent(repairPrompt(out));
        const repairedOut = repaired.response.text();
        if (!repairedOut) {
          return { ok: false, message: "Gemini の応答を JSON として解析できませんでした。" };
        }
        parsed = extractJsonObject(repairedOut);
      } catch {
        return { ok: false, message: "Gemini の応答を JSON として解析できませんでした。" };
      }
    }
    const normalized = normalizeMappedTable(parsed);
    const sheetParsed = parseSheetTextAsTable(clipped);
    if (!normalized) {
      if (sheetParsed.rows.length > 0) {
        return { ok: true, data: sheetParsed, truncated };
      }
      return { ok: false, message: "Gemini 応答が表組スキーマに一致しませんでした。" };
    }
    // Gemini が複数行を1行に要約してしまうケースを防ぐ。
    if (sheetParsed.rows.length > 1 && normalized.rows.length < sheetParsed.rows.length) {
      return { ok: true, data: sheetParsed, truncated };
    }
    return { ok: true, data: normalized, truncated };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini の呼び出しに失敗しました。";
    return { ok: false, message };
  }
}
