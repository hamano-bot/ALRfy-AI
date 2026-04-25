/**
 * 文字列をシステムのクリップボードへ書き込む（同期的な textarea 方式）。
 * クリックハンドラなどユーザー操作と同一のコールスタックで呼ぶこと。
 * Radix Dialog 内や、非同期の await の後では失敗しやすいため、その場合は先に本関数を試す。
 */
export function copyTextToClipboardSync(text: string): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("autocomplete", "off");
    ta.readOnly = false;
    ta.style.position = "fixed";
    ta.style.left = "0";
    ta.style.top = "0";
    ta.style.width = "1px";
    ta.style.height = "1px";
    ta.style.padding = "0";
    ta.style.margin = "0";
    ta.style.border = "none";
    ta.style.outline = "none";
    ta.style.opacity = "0";
    ta.style.boxShadow = "none";
    ta.style.background = "transparent";
    ta.style.pointerEvents = "none";
    ta.style.zIndex = "-1";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const len = text.length;
    if (typeof ta.setSelectionRange === "function") {
      ta.setSelectionRange(0, len);
    }
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Clipboard API（navigator.clipboard.writeText）のみを試す。
 * ジェスチャ消費後のフォールバックや、textarea より API を優先したい場合に使う。
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
