import { type NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { buildEstimatePdfExportBasename } from "@/lib/estimate-export-filename";
import {
  absolutizeEstimateHtmlAssets,
  injectBaseHrefForEstimateHtml,
  injectPrintOverridesForEstimate,
} from "@/lib/estimate-print-html";
import { fetchPortalEstimateExportHtml } from "@/lib/portal-fetch-estimate-export-html";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Puppeteer 起動・描画の余裕 */
export const maxDuration = 120;

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function publicOriginFromRequest(request: NextRequest): string {
  const env = process.env.ESTIMATE_PDF_ASSET_ORIGIN?.trim();
  if (env) return env.replace(/\/+$/, "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    const proto = (request.headers.get("x-forwarded-proto") ?? "http").split(",")[0]?.trim() || "http";
    const h = host.split(",")[0]?.trim();
    if (h) return `${proto}://${h}`;
  }
  return request.nextUrl.origin;
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
  const portalBase = trimTrailingSlashes(rawBase.trim());
  const origin = publicOriginFromRequest(request);

  const htmlPromise = fetchPortalEstimateExportHtml(portalBase, cookie, estimateId);
  const metaUrl = `${portalBase}/portal/api/estimates?id=${estimateId}`;
  const metaPromise = fetch(metaUrl, {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) },
  }).catch(() => null as Response | null);

  const [htmlRes, metaRes] = await Promise.all([htmlPromise, metaPromise]);
  if (!htmlRes.ok) {
    return NextResponse.json(
      { success: false, message: htmlRes.message },
      { status: htmlRes.status >= 400 && htmlRes.status < 600 ? htmlRes.status : 502 },
    );
  }

  let estimate: Record<string, unknown> | undefined;
  if (metaRes?.ok) {
    try {
      const meta = (await metaRes.json()) as { success?: boolean; estimate?: Record<string, unknown> };
      if (meta.success && meta.estimate) estimate = meta.estimate;
    } catch {
      /* ignore */
    }
  }

  const html = injectPrintOverridesForEstimate(
    injectBaseHrefForEstimateHtml(absolutizeEstimateHtmlAssets(htmlRes.html, origin), origin),
  );
  const filename = `${buildEstimatePdfExportBasename(estimate ?? {}, estimateId)}.pdf`;

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await new Promise((r) => setTimeout(r, 400));
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    await browser.close();
    browser = null;

    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        success: false,
        code: "pdf_render_failed",
        message: "PDF の生成に失敗しました。サーバーに Chromium が利用可能か確認してください。",
        detail: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 503 },
    );
  }
}
