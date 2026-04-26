/**
 * 見積 HTML エクスポートの印刷・PDF 生成用（クライアント／サーバー共通）。
 */

/** 静的アセット `/brand/` を絶対 URL にし、Puppeteer・srcDoc・別ウィンドウでロゴ等が読み込めるようにする */
export function absolutizeEstimateHtmlAssets(html: string, origin: string): string {
  if (!origin) return html;
  return html
    .replaceAll('src="/brand/', `src="${origin}/brand/`)
    .replaceAll("src='/brand/", `src='${origin}/brand/`)
    .replaceAll("this.src='/brand/", `this.src='${origin}/brand/`)
    .replaceAll('this.src="/brand/', `this.src="${origin}/brand/`);
}

/** Puppeteer 等で setContent する際、相対 URL の解決用（WaitForOptions に url が無い版向け） */
export function injectBaseHrefForEstimateHtml(html: string, origin: string): string {
  const base = origin.replace(/\/+$/, "");
  if (!base || /<base\s+href=/i.test(html)) return html;
  const tag = `<base href="${base}/">`;
  if (html.includes("</head>")) {
    return html.replace("</head>", `${tag}</head>`);
  }
  return `${tag}${html}`;
}

/**
 * 印刷・PDF 用: 背景色を含める。旧 HTML の @page を現行余白に寄せる。
 * （帳票の正は `post_estimate_export_html.php` の @page）
 */
export function injectPrintOverridesForEstimate(html: string): string {
  let h = html
    .replace(/@page\s*\{\s*size:\s*A4\s+portrait;\s*margin:\s*10mm;\s*\}/, "@page { size: A4 portrait; margin: 1cm 8mm 6mm 8mm; }")
    .replace(
      /@page\s*\{\s*size:\s*A4\s+portrait;\s*margin:\s*1\.5cm\s+8mm\s+1cm\s+8mm;\s*\}/,
      "@page { size: A4 portrait; margin: 1cm 8mm 6mm 8mm; }",
    )
    .replace(/@page\s*\{\s*size:\s*A4\s+portrait;\s*\}/, "@page { size: A4 portrait; margin: 1cm 8mm 6mm 8mm; }");
  const inject =
    '<style id="estimate-print-pdf-override">@media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; } }</style>';
  if (h.includes("</head>")) {
    h = h.replace("</head>", `${inject}</head>`);
  }
  return h;
}
