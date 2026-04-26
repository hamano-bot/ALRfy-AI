import { type NextRequest, NextResponse } from "next/server";
import { buildEstimateExportBasename } from "@/lib/estimate-export-filename";
import { buildEstimateXlsxBuffer, estimateA4OverflowFromLines, type EstimateIssuerForXlsx } from "@/lib/estimate-export-xlsx";

export const dynamic = "force-dynamic";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function defaultIssuerFromEnv(): EstimateIssuerForXlsx {
  return {
    name: process.env.ESTIMATE_ISSUER_COMPANY_NAME?.trim() || "株式会社シフト",
    addr:
      process.env.ESTIMATE_ISSUER_ADDRESS?.trim() ||
      "〒103-0012　東京都中央区日本橋堀留町2-9-8\nDaiwa日本橋堀留町ビル２F",
    tel: process.env.ESTIMATE_ISSUER_TEL?.trim() || "03-5847-1281",
    fax: process.env.ESTIMATE_ISSUER_FAX?.trim() || "03-5847-1282",
    url: process.env.ESTIMATE_ISSUER_URL?.trim() || "http://www.shift-jp.net",
  };
}

export async function POST(request: NextRequest) {
  const rawBase = process.env.PORTAL_API_BASE_URL;
  if (!rawBase || rawBase.trim() === "") {
    return NextResponse.json({ success: false, code: "missing_config", message: "PORTAL_API_BASE_URL が未設定です。" }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "JSON ボディが不正です。" }, { status: 400 });
  }
  const payload = body as { estimate_id?: unknown };
  const idRaw = payload?.estimate_id;
  const estimateId =
    typeof idRaw === "number"
      ? idRaw
      : typeof idRaw === "string" && /^\d+$/.test(idRaw)
        ? Number.parseInt(idRaw, 10)
        : NaN;
  if (!Number.isFinite(estimateId) || estimateId <= 0) {
    return NextResponse.json({ success: false, message: "estimate_id が不正です。" }, { status: 400 });
  }

  const cookie = request.headers.get("cookie");
  const base = trimTrailingSlashes(rawBase.trim());
  const url = `${base}/portal/api/estimates?id=${estimateId}`;
  try {
    const estRes = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    });
    const text = await estRes.text();
    let data: { success?: boolean; estimate?: Record<string, unknown>; message?: string };
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      return NextResponse.json({ success: false, message: "見積APIの応答が不正です。" }, { status: 502 });
    }
    if (!estRes.ok || !data.success || !data.estimate) {
      return NextResponse.json(
        { success: false, message: data.message ?? "見積の取得に失敗しました。" },
        { status: estRes.ok ? 404 : estRes.status },
      );
    }
    const estimate = data.estimate;
    const lines = Array.isArray(estimate.lines) ? estimate.lines : [];
    const a4OverflowWarning = estimateA4OverflowFromLines(lines as Record<string, unknown>[]);
    const buf = await buildEstimateXlsxBuffer(estimate, defaultIssuerFromEnv());
    const filename = `${buildEstimateExportBasename(estimate, estimateId)}.xlsx`;
    return NextResponse.json({
      success: true,
      format: "xlsx",
      filename,
      content_base64: buf.toString("base64"),
      mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      a4_overflow_warning: a4OverflowWarning,
    });
  } catch {
    return NextResponse.json({ success: false, code: "upstream_unreachable", message: "見積の取得または帳票生成に失敗しました。" }, { status: 502 });
  }
}
