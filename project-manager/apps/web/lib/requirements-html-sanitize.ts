const DROP_TAGS = new Set(["script", "iframe", "object", "embed", "link", "meta", "base", "form"]);

function isDangerousUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v.startsWith("javascript:")) {
    return true;
  }
  if (v.startsWith("data:") && !v.startsWith("data:image/")) {
    return true;
  }
  return false;
}

/**
 * Raw HTML適用用の最小サニタイズ。
 * - script/iframe 等の実行系タグを除去
 * - on* 属性を除去
 * - javascript: / data:(image以外) URLを除去
 */
export function sanitizeRequirementsRawHtml(input: string): string {
  if (typeof window === "undefined") {
    return input;
  }
  const parser = new DOMParser();
  const doc = parser.parseFromString(input, "text/html");

  for (const tag of DROP_TAGS) {
    doc.querySelectorAll(tag).forEach((el) => el.remove());
  }

  const all = doc.querySelectorAll("*");
  all.forEach((el) => {
    const names = el.getAttributeNames();
    for (const name of names) {
      const lower = name.toLowerCase();
      if (lower.startsWith("on")) {
        el.removeAttribute(name);
        continue;
      }
      if (lower === "href" || lower === "src" || lower === "xlink:href" || lower === "formaction") {
        const val = el.getAttribute(name);
        if (val && isDangerousUrl(val)) {
          el.removeAttribute(name);
        }
      }
    }
  });
  const styles = Array.from(doc.querySelectorAll("style"))
    .map((el) => el.outerHTML)
    .join("\n");
  // style が head に移動されるケースでも保持する
  doc.querySelectorAll("style").forEach((el) => el.remove());
  const bodyHtml = doc.body.innerHTML.trim();
  if (styles !== "" && bodyHtml !== "") {
    return `${styles}\n${bodyHtml}`;
  }
  return (styles || bodyHtml).trim();
}

