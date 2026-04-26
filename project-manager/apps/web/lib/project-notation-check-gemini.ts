import { GoogleGenerativeAI, type GenerationConfig } from "@google/generative-ai";
import { z } from "zod";

type NotationCheckInput = {
  project_name: string;
  client_name: string | null;
  misc_links: Array<{ label: string; url: string }>;
};

const resultSchema = z.object({
  blockingIssues: z.array(z.object({ message: z.string().min(1).max(300) })).default([]),
  warnings: z.array(z.object({ message: z.string().min(1).max(300) })).default([]),
});

const FAST_GENERATION_CONFIG: GenerationConfig & {
  thinkingConfig?: { thinkingLevel?: "HIGH" | "MEDIUM" | "LOW" | "MINIMAL" };
} = {
  temperature: 0.2,
  topP: 0.8,
  maxOutputTokens: 512,
  thinkingConfig: { thinkingLevel: "MINIMAL" },
};

const DEFAULT_MODEL = "gemini-3-flash-preview";

function extractJsonObject(text: string): unknown {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  const raw = fence ? fence[1].trim() : t;
  return JSON.parse(raw) as unknown;
}

function pickOfficialSiteUrl(miscLinks: Array<{ label: string; url: string }>): string | null {
  const officialLabelRe = /(公式|コーポレート|会社|企業|home|homepage)/i;
  for (const row of miscLinks) {
    const label = row.label.trim();
    const url = row.url.trim();
    if (label !== "" && officialLabelRe.test(label) && /^https?:\/\//i.test(url)) {
      return url;
    }
  }
  for (const row of miscLinks) {
    const url = row.url.trim();
    if (/^https?:\/\//i.test(url)) {
      return url;
    }
  }
  return null;
}

async function fetchOfficialPageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    if (!res.ok) {
      return null;
    }
    const html = await res.text();
    const noScript = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ");
    const text = noScript.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return text.slice(0, 12000);
  } catch {
    return null;
  }
}

export async function runProjectNotationCheckGemini(
  input: NotationCheckInput,
): Promise<{ ok: true; blockingIssues: string[]; warnings: string[] } | { ok: false; message: string }> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, message: "GEMINI_API_KEY が未設定です。" };
  }

  const officialSiteUrl = pickOfficialSiteUrl(input.misc_links);
  const officialPageText = officialSiteUrl ? await fetchOfficialPageText(officialSiteUrl) : null;

  const modelName = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: FAST_GENERATION_CONFIG as GenerationConfig,
  });

  const prompt = `あなたは日本語案件名の表記ゆれチェッカーです。
JSON以外を返さないでください。

入力:
${JSON.stringify(
  {
    project_name: input.project_name,
    client_name: input.client_name,
    official_site_url: officialSiteUrl,
    official_page_text: officialPageText,
  },
  null,
  0,
)}

判定ルール:
1) client_name 内の明確な表記ゆれ（全角半角や記号差だけではなく、語の欠落/余計な語/別法人名の混在）は blockingIssues に入れる。
2) 公式サイト本文から読み取れる法人名と client_name が不一致の可能性がある場合は warnings に入れる。
3) 情報不足や判定不能なら配列は空にする。過剰検出しない。

出力形式:
{
  "blockingIssues": [{"message":"..."}],
  "warnings": [{"message":"..."}]
}`;

  try {
    const result = await model.generateContent(prompt);
    const out = result.response.text();
    if (!out) {
      return { ok: false, message: "Gemini の応答が空です。" };
    }
    const parsed = extractJsonObject(out);
    const valid = resultSchema.safeParse(parsed);
    if (!valid.success) {
      return { ok: false, message: "Gemini 応答形式が不正です。" };
    }
    return {
      ok: true,
      blockingIssues: valid.data.blockingIssues.map((i) => i.message),
      warnings: valid.data.warnings.map((w) => w.message),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gemini 呼び出しに失敗しました。";
    return { ok: false, message: msg };
  }
}
