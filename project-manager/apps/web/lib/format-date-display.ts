import { format, isValid, parse, parseISO } from "date-fns";

/**
 * 画面表示用の日付を **YYYY-MM-DD** に統一する。
 * API / 保存値は従来どおり ISO 日付または `yyyy-MM-dd` を想定。
 */
export function formatDateDisplayYmd(value: string | null | undefined): string {
  if (value == null) {
    return "";
  }
  const t = typeof value === "string" ? value.trim() : String(value).trim();
  if (t === "") {
    return "";
  }
  const onlyYmd = t.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (onlyYmd) {
    return onlyYmd[1];
  }
  const ymdPrefix = t.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (ymdPrefix) {
    return ymdPrefix[1];
  }
  try {
    const p = parse(t, "yyyy-MM-dd", new Date());
    if (isValid(p)) {
      return format(p, "yyyy-MM-dd");
    }
  } catch {
    /* ignore */
  }
  const iso = parseISO(t);
  if (isValid(iso)) {
    return format(iso, "yyyy-MM-dd");
  }
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) {
    return format(d, "yyyy-MM-dd");
  }
  return t;
}
