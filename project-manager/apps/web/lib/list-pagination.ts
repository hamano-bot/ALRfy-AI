/** 一覧画面で共通利用するページサイズ（見積・案件など） */
export const DEFAULT_LIST_PAGE_SIZE = 20;

export const LIST_PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

export type ListPageSize = (typeof LIST_PAGE_SIZE_OPTIONS)[number];

const allowed = new Set<number>(LIST_PAGE_SIZE_OPTIONS);

export function clampListPageSize(n: number): ListPageSize {
  if (!Number.isFinite(n) || n <= 0) {
    return DEFAULT_LIST_PAGE_SIZE;
  }
  const rounded = Math.trunc(n);
  return allowed.has(rounded) ? (rounded as ListPageSize) : DEFAULT_LIST_PAGE_SIZE;
}
