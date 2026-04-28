import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function publicOriginFromRequest(request: NextRequest): string {
  const env = process.env.ESTIMATE_PDF_ASSET_ORIGIN?.trim() ?? process.env.REQUIREMENTS_PDF_PAGE_ORIGIN?.trim();
  if (env) return env.replace(/\/+$/, "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    const proto = (request.headers.get("x-forwarded-proto") ?? "http").split(",")[0]?.trim() || "http";
    const h = host.split(",")[0]?.trim();
    if (h) return `${proto}://${h}`;
  }
  return request.nextUrl.origin;
}

function requirementsPdfFilename(projectId: number): string {
  return `要件定義プレビュー_#${projectId}.pdf`.replace(/[/\\?%*:|"<>]/g, "_");
}

function resolvePdfChildScriptPath(): string {
  const candidates = [
    join(process.cwd(), "scripts", "requirements-pdf-render.mjs"),
    join(process.cwd(), "apps", "web", "scripts", "requirements-pdf-render.mjs"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      return p;
    }
  }
  return candidates[0];
}

function renderPdfInChildProcess(args: { origin: string; printUrl: string; cookie: string | null }): Promise<Buffer> {
  const scriptPath = resolvePdfChildScriptPath();
  if (!existsSync(scriptPath)) {
    return Promise.reject(new Error(`PDF 子スクリプトが見つかりません: ${scriptPath}`));
  }

  const payload = JSON.stringify({
    origin: args.origin,
    printUrl: args.printUrl,
    cookie: args.cookie ?? "",
  });

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    child.stdin?.write(payload, "utf8");
    child.stdin?.end();

    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout?.on("data", (c: Buffer) => out.push(c));
    child.stderr?.on("data", (c: Buffer) => err.push(c));

    const killTimer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("PDF 生成がタイムアウトしました。"));
    }, 110_000);

    child.on("error", (e) => {
      clearTimeout(killTimer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(killTimer);
      if (code === 0) {
        resolve(Buffer.concat(out));
      } else {
        const errText = err.length ? Buffer.concat(err).toString("utf8") : `exit ${code}`;
        reject(new Error(errText));
      }
    });
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "JSON ボディが不正です。" }, { status: 400 });
  }
  const payload = body as { project_id?: unknown };
  const idRaw = payload?.project_id;
  const projectId =
    typeof idRaw === "number"
      ? idRaw
      : typeof idRaw === "string" && /^\d+$/.test(idRaw)
        ? Number.parseInt(idRaw, 10)
        : NaN;
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return NextResponse.json({ success: false, message: "project_id が不正です。" }, { status: 400 });
  }

  const origin = trimTrailingSlashes(publicOriginFromRequest(request));
  const printUrl = `${origin}/project-list/${projectId}/requirements/print-preview`;
  const cookie = request.headers.get("cookie");

  try {
    const pdfBuffer = await renderPdfInChildProcess({ origin, printUrl, cookie });
    if (!pdfBuffer.length) {
      return NextResponse.json(
        { success: false, code: "pdf_empty", message: "PDF データが空です。" },
        { status: 503 },
      );
    }

    const filename = requirementsPdfFilename(projectId);
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        success: false,
        code: "pdf_render_failed",
        message: "PDF の生成に失敗しました。ブラウザの印刷プレビューで保存するか、しばらくしてから再度お試しください。",
        detail: process.env.NODE_ENV === "development" ? msg : undefined,
      },
      { status: 503 },
    );
  }
}
