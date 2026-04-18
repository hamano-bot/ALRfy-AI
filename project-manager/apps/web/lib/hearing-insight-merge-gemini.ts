import { GoogleGenerativeAI, type GenerationConfig } from "@google/generative-ai";
import { HEARING_GEMINI_GENERATION_CONFIG } from "@/lib/hearing-gemini-generation";
import { safeParseHearingBodyJson, type HearingSheetBodyJson } from "@/lib/hearing-sheet-body-schema";
import type { HearingTemplateId } from "@/lib/hearing-sheet-template-matrix";
import type { HearingInsightExportRow } from "@/lib/portal-hearing-insight-fetch";

/** 既存テンプレ行は削除・上書きせず、Gemini が返したうち **新規 id の行だけ** を末尾に追加する。 */
function appendOnlyMergeItems(
  baselineItems: HearingSheetBodyJson["items"],
  proposedItems: HearingSheetBodyJson["items"],
): HearingSheetBodyJson["items"] {
  const baselineIds = new Set(baselineItems.map((r) => r.id));
  const out = [...baselineItems];
  for (const p of proposedItems) {
    if (!baselineIds.has(p.id)) {
      out.push(p);
      baselineIds.add(p.id);
    }
  }
  return out;
}

function extractJsonObject(text: string): unknown {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  const raw = fence ? fence[1].trim() : t;
  return JSON.parse(raw) as unknown;
}

const DEFAULT_MODEL = "gemini-3-flash-preview";

/**
 * 解析行と既存テンプレをマージした body_json を Gemini に生成させる（非ベクトル: 入力は当該テンプレのデルタのみ）。
 */
export async function mergeHearingTemplateWithGemini(
  templateId: HearingTemplateId,
  factRows: HearingInsightExportRow[],
  currentBody: Record<string, unknown>,
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; message: string }> {
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

  const lines = factRows
    .map((r) => `- 分類:${r.category}\t見出し:${r.heading}\t確認事項:${r.question}`)
    .join("\n");

  const prompt = `あなたはヒアリングシートのテンプレートを保守するアシスタントです。
既存の body_json と、集計された確認行（分類・見出し・確認事項）を踏まえ、**汎用テンプレ**として使える items を返してください。

厳守（削除禁止・追記のみ）:
- 既存 body_json の items に含まれる **すべての行**（id 単位）を、出力の items に **必ず含める**。行の削除・省略・統合による削減は禁止。
- 既存 id の category / heading / question は **変更しない**（テンプレの固定行を維持）。
- 取り込み行を参考に **追加が妥当な行だけ** 新規で足してよい。新規行の id は row- で始まる一意な文字列。
- 出力は **JSON オブジェクトのみ**（説明・フェンス禁止）。
- 型: {"template_id":"${templateId}","items":[...]} と完全一致。template_id は必ず "${templateId}"。
- items は最大 500 行。分類・見出し・確認事項を主にし、answer / assignee / due / row_status は空文字または妥当な既定でよい。

--- 既存 body_json ---
${JSON.stringify(currentBody)}
--- 取り込み行（参考） ---
${lines}
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
    obj.template_id = templateId;
    const valid = safeParseHearingBodyJson(obj);
    if (!valid.ok) {
      return { ok: false, message: `スキーマ検証: ${valid.message}` };
    }

    const baselineParsed = safeParseHearingBodyJson(currentBody);
    const baselineItems = baselineParsed.ok ? baselineParsed.data.items : [];
    const mergedItems = appendOnlyMergeItems(baselineItems, valid.data.items);

    const mergedObj: Record<string, unknown> = {
      template_id: templateId,
      items: mergedItems,
    };
    const revalid = safeParseHearingBodyJson(mergedObj);
    if (!revalid.ok) {
      return { ok: false, message: `マージ後検証: ${revalid.message}` };
    }

    return {
      ok: true,
      data: {
        template_id: revalid.data.template_id,
        items: revalid.data.items,
      } as unknown as Record<string, unknown>,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gemini の呼び出しに失敗しました。";
    return { ok: false, message: msg };
  }
}
