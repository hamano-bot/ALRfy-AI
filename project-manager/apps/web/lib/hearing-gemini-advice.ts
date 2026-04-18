import { GoogleGenerativeAI, type GenerationConfig } from "@google/generative-ai";
import { hearingAdviceResultSchema, type HearingAdviceSuggestion } from "@/lib/hearing-advice-types";
import { HEARING_GEMINI_GENERATION_CONFIG } from "@/lib/hearing-gemini-generation";
import type { HearingTemplateId } from "@/lib/hearing-sheet-template-matrix";

/** 既定モデル（プレビューは変更・廃止されやすい。`GEMINI_MODEL` で上書き可） */
const DEFAULT_MODEL = "gemini-3-flash-preview";

export type HearingAdviceProjectPayload = {
  name: string;
  client_name: string | null;
  site_type: string | null;
  site_type_other: string | null;
  is_renewal: boolean;
  kickoff_date: string | null;
  release_due_date: string | null;
  renewal_urls: string[];
};

function extractJsonObject(text: string): unknown {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  const raw = fence ? fence[1].trim() : t;
  return JSON.parse(raw) as unknown;
}

export async function runHearingAdviceGemini(
  project: HearingAdviceProjectPayload,
  templateId: HearingTemplateId,
  items: Array<{
    id: string;
    category: string;
    heading: string;
    question: string;
    answer: string;
    assignee: string;
    due: string;
    row_status: string;
  }>,
): Promise<{ ok: true; suggestions: HearingAdviceSuggestion[] } | { ok: false; message: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, message: "GEMINI_API_KEY が未設定です。.env に追加してください。" };
  }

  const modelName = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: HEARING_GEMINI_GENERATION_CONFIG as GenerationConfig,
  });

  const projectJson = JSON.stringify(project, null, 0);
  const itemsJson = JSON.stringify(items, null, 0);

  const prompt = `あなたはWeb制作案件のヒアリングシートをレビューするアシスタントです。

## 案件マスタ（JSON）
${projectJson}

## 適用テンプレ ID
${templateId}

## ヒアリング表の行（JSON・items）
${itemsJson}

## タスク
次を指摘してください（該当がなければ空配列）:
1. **empty_required**: 確認事項が重要そうなのに「回答」が空、または明らかに未記入の行
2. **master_conflict**: 回答の内容が案件マスタと矛盾しそうな点（例: マスタはリニューアルなのに新規サイトのみ、キックオフ日と食い違う記述など）。推測は「〜の可能性」として短く。
3. **other**: 上記以外で改善するとよい短い注意

各行について、可能なら **items の id を row_id に**、無理なら **heading** に見出し文字列を入れて、後から行を特定できるようにしてください。

## 出力形式（JSON のみ。説明やマークダウン禁止）
{
  "suggestions": [
    { "row_id": "行のidまたはnull", "heading": "見出しまたはnull", "message": "日本語で1〜3文", "kind": "empty_required" | "master_conflict" | "other" }
  ]
}

最大 25 件まで。`;

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
    const valid = hearingAdviceResultSchema.safeParse(parsed);
    if (!valid.success) {
      const first = valid.error.issues[0];
      return {
        ok: false,
        message: first ? `応答形式: ${first.path.join(".")}: ${first.message}` : "応答形式が不正です。",
      };
    }
    return { ok: true, suggestions: valid.data.suggestions };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gemini の呼び出しに失敗しました。";
    return { ok: false, message: msg };
  }
}
