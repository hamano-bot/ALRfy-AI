import type { RequirementsDocBody, RequirementsPage } from "@/lib/requirements-doc-types";

function mergePagesOrder(body: RequirementsDocBody, visibleOrdered: RequirementsPage[]): RequirementsDocBody {
  let k = 0;
  const pages = body.pages.map((p) => {
    if (p.deleted) {
      return p;
    }
    const replacement = visibleOrdered[k];
    k += 1;
    return replacement;
  });
  return { ...body, pages };
}

/**
 * 非削除ページ同士の順序だけを入れ替える。表紙（pageType === cover）は常に先頭のまま。
 */
export function reorderVisiblePage(
  body: RequirementsDocBody,
  pageId: string,
  direction: "up" | "down",
): RequirementsDocBody {
  const visible = body.pages.filter((p) => !p.deleted);
  const i = visible.findIndex((p) => p.id === pageId);
  if (i < 0) {
    return body;
  }
  if (visible[i].pageType === "cover") {
    return body;
  }
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= visible.length) {
    return body;
  }
  if (visible[j].pageType === "cover") {
    return body;
  }

  const nextOrder = [...visible];
  [nextOrder[i], nextOrder[j]] = [nextOrder[j], nextOrder[i]];
  return mergePagesOrder(body, nextOrder);
}

/**
 * ポインタ Y から、ドラッグ ID を除いた visible 並びでの挿入インデックス（ヒアリングシートの行 DnD と同様）。
 */
export function insertionIndexFromPointerYForStrings(
  list: string[],
  rowElements: HTMLElement[],
  clientY: number,
  dragId: string,
): number {
  if (list.length === 0) {
    return 0;
  }
  for (let i = 0; i < list.length; i++) {
    const el = rowElements[i];
    if (!el) {
      break;
    }
    const r = el.getBoundingClientRect();
    const mid = r.top + r.height / 2;
    if (clientY < mid) {
      return list.slice(0, i).filter((x) => x !== dragId).length;
    }
  }
  return list.filter((x) => x !== dragId).length;
}

/**
 * D&D: source を `newIndex` 位置へ挿入（ヒアリングの行並べ替えと同じ）。表紙は移動不可・先頭のまま。
 * `newIndex` は source を除いた visible 配列でのインデックス。表紙より前には置けない（呼び出し側で 1 以上にクランプすること）。
 */
export function reorderVisiblePageToInsertionIndex(
  body: RequirementsDocBody,
  sourceId: string,
  newIndex: number,
): RequirementsDocBody {
  const visible = body.pages.filter((p) => !p.deleted);
  const si = visible.findIndex((p) => p.id === sourceId);
  if (si < 0) {
    return body;
  }
  const row = visible[si];
  if (row.pageType === "cover") {
    return body;
  }
  const without = visible.filter((p) => p.id !== sourceId);
  const coverFirst = without[0]?.pageType === "cover";
  const minInsert = coverFirst ? 1 : 0;
  const i = Math.max(minInsert, Math.min(newIndex, without.length));
  const next = [...without.slice(0, i), row, ...without.slice(i)];
  return mergePagesOrder(body, next);
}

/**
 * D&D: source を target の位置の直前に挿入（同一 visible リスト）。表紙は移動・ドロップ先にできない。
 */
export function reorderDragBeforeTarget(body: RequirementsDocBody, sourceId: string, targetId: string): RequirementsDocBody {
  if (sourceId === targetId) {
    return body;
  }
  const visible = body.pages.filter((p) => !p.deleted);
  const si = visible.findIndex((p) => p.id === sourceId);
  const ti = visible.findIndex((p) => p.id === targetId);
  if (si < 0 || ti < 0) {
    return body;
  }
  if (visible[si].pageType === "cover") {
    return body;
  }
  if (visible[ti].pageType === "cover") {
    return body;
  }

  const next = [...visible];
  const [moved] = next.splice(si, 1);
  const ti2 = next.findIndex((p) => p.id === targetId);
  if (ti2 < 0) {
    return body;
  }
  next.splice(ti2, 0, moved);
  return mergePagesOrder(body, next);
}
