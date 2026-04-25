const DROP_TAGS = new Set(["script", "object", "embed", "link", "meta", "base", "form"]);
const ALLOWED_IFRAME_HOSTS = new Set([
  "xd.adobe.com",
  "www.figma.com",
  "www.youtube.com",
  "youtube.com",
  "youtu.be",
  "www.youtube-nocookie.com",
]);
const ALLOWED_IFRAME_ATTRS = new Set([
  "src",
  "style",
  "width",
  "height",
  "allow",
  "allowfullscreen",
  "loading",
  "referrerpolicy",
  "sandbox",
]);

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

function isAllowedIframeSrc(value: string): boolean {
  try {
    const u = new URL(value, window.location.origin);
    if (u.protocol !== "https:") {
      return false;
    }
    return ALLOWED_IFRAME_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Raw HTML適用用の最小サニタイズ。
 * - script 等の実行系タグを除去
 * - on* 属性を除去
 * - javascript: / data:(image以外) URLを除去
 * - iframe は許可ドメインのみ許容（属性は限定）
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

  doc.querySelectorAll("iframe").forEach((el) => {
    const src = el.getAttribute("src") ?? "";
    if (!isAllowedIframeSrc(src)) {
      el.remove();
      return;
    }
    const names = el.getAttributeNames();
    for (const name of names) {
      const lower = name.toLowerCase();
      if (!ALLOWED_IFRAME_ATTRS.has(lower)) {
        el.removeAttribute(name);
      }
    }
    if (!el.hasAttribute("loading")) {
      el.setAttribute("loading", "lazy");
    }
    if (!el.hasAttribute("referrerpolicy")) {
      el.setAttribute("referrerpolicy", "no-referrer");
    }
    if (!el.hasAttribute("sandbox")) {
      el.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
    }
  });

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

