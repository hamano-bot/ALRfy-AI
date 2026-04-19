import { GoogleGenerativeAI, type GenerationConfig } from "@google/generative-ai";
import type { HearingAdviceProjectPayload } from "@/lib/hearing-gemini-advice";
import { HEARING_GEMINI_GENERATION_CONFIG } from "@/lib/hearing-gemini-generation";
import type { HearingSheetRow } from "@/lib/hearing-sheet-types";
import { z } from "zod";

const DEFAULT_MODEL = "gemini-3-flash-preview";

const resultSchema = z.object({
  subject: z.string().min(1).max(255),
});

function extractJsonObject(text: string): unknown {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  const raw = fence ? fence[1].trim() : t;
  return JSON.parse(raw) as unknown;
}

export async function runRedmineSubjectGemini(
  project: HearingAdviceProjectPayload,
  row: Pick<HearingSheetRow, "category" | "heading" | "question" | "answer" | "assignee" | "due" | "row_status">,
): Promise<{ ok: true; subject: string } | { ok: false; message: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, message: "GEMINI_API_KEY が未設定です。" };
  }

  const modelName = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: HEARING_GEMINI_GENERATION_CONFIG as GenerationConfig,
  });

  const projectJson = JSON.stringify(project, null, 0);
  const rowJson = JSON.stringify(row, null, 0);

  const prompt = `あなたはWeb制作案件のヒアリング確認事項から、Redmine に登録するチケット題名（subject）を1つだけ提案するアシスタントです。

## ルール
- クライアントにも分かりやすい短い日本語の一行にする（社内コードや不要な記号は避ける）。
- 80文字以内を目安（必ず255文字以下）。
- 出力は JSON のみ: {"subject":"..."} の形式。説明文やMarkdownは禁止。

## 案件（JSON）
${projectJson}

## ヒアリング行（JSON）
${rowJson}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = extractJsonObject(text);
    const out = resultSchema.safeParse(parsed);
    if (!out.success) {
      return { ok: false, message: "題名の形式が不正です。" };
    }
    return { ok: true, subject: out.data.subject.trim() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "題名の生成に失敗しました。";
    return { ok: false, message: msg };
  }
}
