import { GoogleGenerativeAI, type GenerationConfig } from "@google/generative-ai";
import { HEARING_GEMINI_GENERATION_CONFIG } from "@/lib/hearing-gemini-generation";
import { truncateSheetText } from "@/lib/hearing-excel-parse";
import {
  type RequirementsPageContentSitemap,
  safeParseSitemapContent,
} from "@/lib/requirements-sitemap-schema";

const DEFAULT_MODEL = "gemini-3-flash-preview";
const MAX_SHEET_CHARS = 120_000;
const MAX_CONTEXT_JSON_CHARS = 120_000;
const MAX_CHAT_HISTORY_MESSAGES = 4;
const MAX_SUBTREE_JSON_CHARS = 80_000;
const SITEMAP_CHAT_GENERATION_CONFIG = {
  ...HEARING_GEMINI_GENERATION_CONFIG,
  maxOutputTokens: 2500,
  thinkingConfig: {
    thinkingLevel: "LOW",
  },
} as GenerationConfig;

function compactNode(node: RequirementsPageContentSitemap["root"]): RequirementsPageContentSitemap["root"] {
  return {
    id: node.id,
    screenName: node.screenName,
    labels: node.labels,
    children: node.children.map(compactNode),
  };
}

function compactSitemapContent(content: RequirementsPageContentSitemap): RequirementsPageContentSitemap {
  return {
    schemaVersion: 1,
    root: compactNode(content.root),
  };
}

function extractJsonObject(text: string): unknown {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  const raw = fence ? fence[1].trim() : t;
  return JSON.parse(raw) as unknown;
}

export async function mapExcelTextToSitemapContent(
  sheetText: string,
): Promise<{ ok: true; data: RequirementsPageContentSitemap; truncated: boolean } | { ok: false; message: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, message: "GEMINI_API_KEY が未設定です。.env に追加してください。" };
  }
  const { text: clipped, truncated } = truncateSheetText(sheetText, MAX_SHEET_CHARS);
  if (clipped.trim() === "") {
    return { ok: false, message: "シートにデータがありません。" };
  }

  const modelName = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: HEARING_GEMINI_GENERATION_CONFIG as GenerationConfig,
  });

  const prompt = `あなたはサイトマップ（画面遷移図）を JSON に変換するアシスタントです。次の Excel 由来のテキスト（タブ区切り）を読み、サイトマップツリーにマッピングしてください。

**資料の適合判定**
- サイトマップ・画面一覧・遷移図・メニュー階層など、画面名や階層が読み取れる表であることが明らかな場合のみマッピングする。
- 次の場合はマッピングしない。出力は次の1行だけの JSON:
  {"document_rejected":true}
  - ヒアリングシート・課題管理のみの表で画面階層が読み取れない
  - 長文レポートのみなど表構造がない

厳守（document_rejected でない場合のみ）:
- 出力は **JSON オブジェクトのみ**（説明文・マークダウン・コードフェンス禁止）。
- 型: {"schemaVersion":1,"root":{"id":"...","screenName":"...","labels":["..."],"children":[...]}}
- root はルート画面（例: TOP）。各ノード: id は一意の英数字とハイフン、screenName は画面名、labels は画面上部のタグ（無ければ []）、children は子画面。
- 深さは最大32階層、総ノード数は最大200。
- 空セルは空文字列。分からない列は無視して階層を推定してよい。

--- 表データ ---
${clipped}
--- 終わり ---`;

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
      return { ok: false, message: "Gemini の応答を JSON として解析できませんでした。" };
    }
    const obj = parsed as Record<string, unknown>;
    if (obj.document_rejected === true) {
      return { ok: false, message: "ファイルがサイトマップとして解釈できませんでした。画面一覧や遷移図のファイルを選び直してください。" };
    }
    const valid = safeParseSitemapContent(obj);
    if (!valid.ok) {
      return { ok: false, message: valid.message };
    }
    return { ok: true, data: valid.data, truncated };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gemini の呼び出しに失敗しました。";
    return { ok: false, message: msg };
  }
}

export type SitemapChatMessage = { role: "user" | "model"; text: string };

export async function mapSitemapGeminiChat(params: {
  current: RequirementsPageContentSitemap;
  messages: SitemapChatMessage[];
  lastUserMessage: string;
}): Promise<{ ok: true; data: RequirementsPageContentSitemap } | { ok: false; message: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, message: "GEMINI_API_KEY が未設定です。.env に追加してください。" };
  }
  let compactJson = JSON.stringify(compactSitemapContent(params.current));
  if (compactJson.length > MAX_CONTEXT_JSON_CHARS) {
    compactJson = `${compactJson.slice(0, MAX_CONTEXT_JSON_CHARS)}\n…(truncated)`;
  }
  let subtreesJson = JSON.stringify(params.current.root.children.map(compactNode));
  if (subtreesJson.length > MAX_SUBTREE_JSON_CHARS) {
    subtreesJson = `${subtreesJson.slice(0, MAX_SUBTREE_JSON_CHARS)}\n…(truncated)`;
  }
  const history = params.messages
    .slice(-MAX_CHAT_HISTORY_MESSAGES)
    .map((m) => `${m.role === "user" ? "ユーザー" : "アシスタント"}: ${m.text}`)
    .join("\n");

  const modelName = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: SITEMAP_CHAT_GENERATION_CONFIG,
  });

  const prompt = `あなたは要件定義のサイトマップ JSON を編集するアシスタントです。

現在のサイトマップ（圧縮JSON）:
${compactJson}

ルート直下サブツリー（圧縮JSON）:
${subtreesJson}

直近の会話:
${history || "(なし)"}

ユーザーの最新指示:
${params.lastUserMessage}

厳守:
- 出力は **JSON オブジェクトのみ**（説明文禁止）。
- 型は現在と同じ: {"schemaVersion":1,"root":{ "id","screenName","labels","children" }}
- **完全な**サイトマップを返す（差分ではなく丸ごと）。schemaVersion は 1。
- 深さ最大32階層、ノード数最大200。日本語の画面名を維持・修正してよい。
`;

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
      return { ok: false, message: "Gemini の応答を JSON として解析できませんでした。" };
    }
    const valid = safeParseSitemapContent(parsed);
    if (!valid.ok) {
      return { ok: false, message: valid.message };
    }
    return { ok: true, data: valid.data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gemini の呼び出しに失敗しました。";
    return { ok: false, message: msg };
  }
}
