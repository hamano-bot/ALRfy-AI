import { GoogleGenerativeAI, type GenerationConfig } from "@google/generative-ai";
import { HEARING_GEMINI_GENERATION_CONFIG } from "@/lib/hearing-gemini-generation";
import type { HearingSheetBodyJson } from "@/lib/hearing-sheet-body-schema";
import { safeParseHearingBodyJson } from "@/lib/hearing-sheet-body-schema";
import type { HearingTemplateId } from "@/lib/hearing-sheet-template-matrix";
import { sanitizeHearingRowsFromExcelImport } from "@/lib/hearing-import-sanitize";
import { truncateSheetText } from "@/lib/hearing-excel-parse";

const DEFAULT_MODEL = "gemini-3-flash-preview";
const MAX_SHEET_CHARS = 120_000;

/** Excel 取り込みで資料種別が明らかに合わないときに API が返すメッセージ（UI 表示用） */
export const HEARING_EXCEL_WRONG_DOCUMENT_MESSAGE =
  "ファイルが正しくありません。ヒアリングシートや課題管理表のファイルを再度選択してください。";

function extractJsonObject(text: string): unknown {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  const raw = fence ? fence[1].trim() : t;
  return JSON.parse(raw) as unknown;
}

export async function mapExcelTextToHearingBody(
  sheetText: string,
  templateId: HearingTemplateId,
): Promise<{ ok: true; data: HearingSheetBodyJson; truncated: boolean } | { ok: false; message: string }> {
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

  const prompt = `あなたは表データを JSON に変換するアシスタントです。次の Excel 由来のテキスト（タブ区切り）を読み、ヒアリングシート形式にマッピングしてください。

**資料の適合判定（先に行う）**
- 内容が **ヒアリングシート・ヒアリング項目表・確認事項リスト・課題管理表／チケット一覧** など、列構造を持つ業務表であることが明らかな場合のみ、下記のマッピング手順に進む。
- 次のような場合は **マッピングしない**。出力は **次の1行だけ** の JSON（キーはこれのみ）:
  {"document_rejected":true}
  - 長文レポート・論文・契約書本文・議事録のナラティブのみなど、表形式の確認・課題一覧ではないもの
  - 財務諸表・在庫台帳・売上明細など、確認事項／担当／ステータス列を前提としない別業務の表
  - 表らしい列がほぼなく、タブ区切りの列が実質1〜2列の箇条書きだけなど、ヒアリング／課題管理の用途と明らかに合わないもの
- document_rejected を出す場合は template_id も items も含めない。

厳守（document_rejected でない場合のみ）:
- 出力は **JSON オブジェクトのみ**（説明文・マークダウン・コードフェンス禁止）。
- 次の型に完全一致させる:
  {"template_id":"${templateId}","items":[...]}
- template_id は必ず "${templateId}" の文字列（変更禁止）。
- items は表のデータ行ごとに1オブジェクト。ヘッダー行の列順を読み、**同じ列インデックスのセルだけ**を対応フィールドへ入れる（列を左にずらさない・結合しない）。
- 列名の対応例（ヘッダーに近い名前ならその列）:
  - 分類 / カテゴリ → category
  - 見出し / 項目 → heading
  - 確認事項 / 質問 → question
  - 回答 / 回答及び対応 → answer
  - 担当 / タスク担当者 / クライアント側担当 → assignee（**人名・会社名・「shift)名前」形式など担当者情報のみ**。状況列の値をここに入れる）
  - 期限 → due
  - 状況 / ステータス / 起票 → row_status
- **row_status は次のいずれかのみ**: 空文字 ""、または「確認中」、または「完了」。それ以外（人名・メール・括弧付き・英字・シフト表記など）は **絶対に row_status に入れず**、該当テキストは assignee に入れるか空にする。
- **assignee** はクライアント名・担当者名・会社名＋氏名などの担当情報のみ。ステータス語（確認中/完了）だけが入る列があれば row_status へ。
- 各 item の id は英数字とハイフンの一意な文字列（例: row-1, row-2）。
- 空セルは空文字列 ""。
- ヘッダー行は items に含めない。
- 最大 500 行まで。

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
      return { ok: false, message: HEARING_EXCEL_WRONG_DOCUMENT_MESSAGE };
    }

    obj.template_id = templateId;

    const valid = safeParseHearingBodyJson(obj);
    if (!valid.ok) {
      return { ok: false, message: `スキーマ検証: ${valid.message}` };
    }
    return {
      ok: true,
      data: { ...valid.data, items: sanitizeHearingRowsFromExcelImport(valid.data.items) },
      truncated,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gemini の呼び出しに失敗しました。";
    return { ok: false, message: msg };
  }
}
