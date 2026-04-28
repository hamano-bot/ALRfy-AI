/**
 * 要件定義印刷プレビュー URL を PDF 化する子プロセス用スクリプト。
 * Next の API ルートから spawn し、親プロセスと HTTP サーバを共有しないことで
 * dev 環境での自己参照デッドロック・全タブ待ちを避ける。
 *
 * stdin: JSON 1 行 { "origin": string, "printUrl": string, "cookie": string }
 * stdout: PDF バイナリ
 * stderr: エラー文言（終了コード非 0）
 */
import { stdin } from "node:process";
import puppeteer from "puppeteer";

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of stdin) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    throw new Error("stdin が空です。");
  }
  return JSON.parse(text);
}

async function setCookiesFromHeader(page, cookieHeader, baseUrl) {
  if (!cookieHeader?.trim()) {
    return;
  }
  for (const pair of cookieHeader.split(";").map((c) => c.trim()).filter(Boolean)) {
    const i = pair.indexOf("=");
    const name = i >= 0 ? pair.slice(0, i).trim() : pair;
    const value = i >= 0 ? pair.slice(i + 1).trim() : "";
    if (!name) {
      continue;
    }
    try {
      await page.setCookie({ name, value, url: baseUrl });
    } catch {
      /* ignore */
    }
  }
}

try {
  const { origin, printUrl, cookie } = await readStdinJson();
  if (typeof origin !== "string" || typeof printUrl !== "string") {
    throw new Error("origin / printUrl が不正です。");
  }
  const cookieHeader = typeof cookie === "string" ? cookie : "";

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await setCookiesFromHeader(page, cookieHeader, origin);
  await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
  await page.goto(printUrl, { waitUntil: "load", timeout: 90_000 });
  await page.waitForSelector(".requirements-print-sitemap-png-img", { timeout: 12_000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 800));

  const pdf = await page.pdf({
    format: "A4",
    landscape: true,
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });
  await browser.close();
  process.stdout.write(Buffer.from(pdf));
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(msg);
  process.exit(1);
}
