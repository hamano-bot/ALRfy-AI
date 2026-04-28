import type { RequirementsPageContentSitemap, SitemapNode, SitemapNodePosition } from "@/lib/requirements-sitemap-schema";

export type { SitemapNodePosition };

/** ツリーに存在するノード id を収集 */
export function collectSitemapNodeIds(root: SitemapNode): Set<string> {
  const ids = new Set<string>();
  const walk = (n: SitemapNode) => {
    ids.add(n.id);
    for (const c of n.children) {
      walk(c);
    }
  };
  walk(root);
  return ids;
}

/** ツリーに存在しない id の座標を削除 */
export function pruneSitemapNodePositions(
  root: SitemapNode,
  positions: Record<string, SitemapNodePosition> | undefined,
): Record<string, SitemapNodePosition> | undefined {
  if (!positions || Object.keys(positions).length === 0) {
    return undefined;
  }
  const valid = collectSitemapNodeIds(root);
  const next: Record<string, SitemapNodePosition> = {};
  for (const [id, p] of Object.entries(positions)) {
    if (!valid.has(id)) {
      continue;
    }
    if (typeof p?.x === "number" && Number.isFinite(p.x) && typeof p?.y === "number" && Number.isFinite(p.y)) {
      next[id] = { x: p.x, y: p.y };
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function withPrunedSitemapPositions(content: RequirementsPageContentSitemap): RequirementsPageContentSitemap {
  const pruned = pruneSitemapNodePositions(content.root, content.nodePositions);
  if (pruned === content.nodePositions) {
    return content;
  }
  return { ...content, nodePositions: pruned };
}
