import { GoogleGenerativeAI, type GenerationConfig } from "@google/generative-ai";
import { HEARING_GEMINI_GENERATION_CONFIG } from "@/lib/hearing-gemini-generation";
import type { HearingAdviceProjectPayload } from "@/lib/hearing-gemini-advice";
import type { HearingTemplateId } from "@/lib/hearing-sheet-template-matrix";
import { z } from "zod";

const DEFAULT_MODEL = "gemini-3-flash-preview";

/** モーダルに表示する既定の命名ルール（短い日本語） */
export const HEARING_AUTO_CATEGORY_DEFAULT_RULES_JA = [
  "クライアント向けの分類名として、見出しと確認事項の内容を要約する。",
  "専門用語は必要最小限にし、短く分かりやすい語にする。",
  "テンプレの分類例（プロジェクト／品質・検証／納品 など）の粒度に近づける。",
  "同じ趣旨の行は同じ系統の語を使い、表全体でぶれを抑える。",
].join("\n");

export type AutoCategoryGeminiRow = {
  id: string;
  heading: string;
  question: string;
  category: string;
};

const autoCategoryResultSchema = z.object({
  labels: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
    }),
  ),
});

export type AutoCategoryGeminiLabel = z.infer<typeof autoCategoryResultSchema>["labels"][number];

function extractJsonObject(text: string): unknown {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  const raw = fence ? fence[1].trim() : t;
  return JSON.parse(raw) as unknown;
}

export async function runAutoCategoryGemini(
  project: HearingAdviceProjectPayload,
  templateId: HearingTemplateId,
  items: AutoCategoryGeminiRow[],
  style: "indexed" | "label_only",
  extraRules: string,
  templateCategoryExamples: string[],
): Promise<{ ok: true; labels: AutoCategoryGeminiLabel[] } | { ok: false; message: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, message: "GEMINI_API_KEY が未設定です。.env に追加してください。" };
  }

  if (items.length === 0) {
    return { ok: false, message: "対象行がありません。" };
  }

  const modelName = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: HEARING_GEMINI_GENERATION_CONFIG as GenerationConfig,
  });

  const projectJson = JSON.stringify(project, null, 0);
  const itemsJson = JSON.stringify(items, null, 0);
  const examplesJson = JSON.stringify(templateCategoryExamples.slice(0, 16), null, 0);
  const extra = extraRules.trim();

  const styleBlock =
    style === "indexed"
      ? `スタイルは「連番＋分類名」用。**label には連番（先頭2桁の数字）を含めないこと。** アプリ側で 01, 02… を付与する。label は日本語の分類名のみ（例: プロジェクト全体、品質・検証）。`
      : `スタイルは「分類名のみ」。連番は付けない。label をそのまま分類列に使う。`;

  const prompt = `あなたはWeb制作案件のヒアリングシートで、各行の「分類」列に入れるクライアント向けの分類名を提案するアシスタントです。

## 案件マスタ（JSON）
${projectJson}

## 適用テンプレ ID
${templateId}

## テンプレ既定行からの分類の例（命名の参考。JSON 配列）
${examplesJson}

## 既定の命名ルール（必ず踏襲）
${HEARING_AUTO_CATEGORY_DEFAULT_RULES_JA}

${extra ? `## ユーザーからの追加ルール\n${extra}\n` : ""}

## 対象行（JSON・items）
各行について **id は必ずそのまま**返すこと。見出し（heading）・確認事項（question）・現在の分類（category）は文脈用。

${styleBlock}

## タスク
items の **各行について 1 件ずつ**、新しい分類の label を返す。items に含まれる id を漏らさず出力すること。

## 出力形式（JSON のみ。説明やマークダウン禁止）
{
  "labels": [
    { "id": "行の id と同一", "label": "日本語の分類名（連番なし）" }
  ]
}

itemsJson:
${itemsJson}`;

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
    const valid = autoCategoryResultSchema.safeParse(parsed);
    if (!valid.success) {
      const first = valid.error.issues[0];
      return {
        ok: false,
        message: first ? `応答形式: ${first.path.join(".")}: ${first.message}` : "応答形式が不正です。",
      };
    }
    return { ok: true, labels: valid.data.labels };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gemini の呼び出しに失敗しました。";
    return { ok: false, message: msg };
  }
}
