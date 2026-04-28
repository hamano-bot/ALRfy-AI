import type { Edge, Node } from "@xyflow/react";
import type { SitemapNode, SitemapNodePosition } from "@/lib/requirements-sitemap-schema";
import {
  A4_LANDSCAPE_CANVAS_HEIGHT,
  A4_LANDSCAPE_CANVAS_WIDTH,
  buildTreeLayout,
  previewDensityPreset,
  type LayoutNode,
  type SitemapPreviewDiagramLayout,
} from "@/lib/requirements-sitemap-layout";

/** 閲覧・印刷プレビュー用: 保存済み座標が A4 外に出た場合に一様スケールして収める */
const READONLY_SNAPSHOT_FIT_PADDING_PX = 24;

function bboxOfRfNodes(nodes: Node<SitemapFlowNodeData>[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (nodes.length === 0) {
    return null;
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const n of nodes) {
    const w = typeof n.style?.width === "number" ? n.style.width : 0;
    const h = typeof n.style?.height === "number" ? n.style.height : 0;
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + w);
    maxY = Math.max(maxY, n.position.y + h);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return { minX, minY, maxX, maxY };
}

function fitReadOnlySitemapRfNodesToA4(
  rfNodes: Node<SitemapFlowNodeData>[],
  baseLayoutScale: number,
): { nodes: Node<SitemapFlowNodeData>[]; sFit: number } {
  const box = bboxOfRfNodes(rfNodes);
  if (!box) {
    return { nodes: rfNodes, sFit: 1 };
  }
  const bw = Math.max(1e-6, box.maxX - box.minX);
  const bh = Math.max(1e-6, box.maxY - box.minY);
  const innerW = A4_LANDSCAPE_CANVAS_WIDTH - READONLY_SNAPSHOT_FIT_PADDING_PX * 2;
  const innerH = A4_LANDSCAPE_CANVAS_HEIGHT - READONLY_SNAPSHOT_FIT_PADDING_PX * 2;
  const sFit = Math.min(1, innerW / bw, innerH / bh);
  const scaledBw = bw * sFit;
  const scaledBh = bh * sFit;
  const offsetX = READONLY_SNAPSHOT_FIT_PADDING_PX + (innerW - scaledBw) / 2;
  const offsetY = READONLY_SNAPSHOT_FIT_PADDING_PX + (innerH - scaledBh) / 2;

  const next = rfNodes.map((n) => {
    const w = typeof n.style?.width === "number" ? n.style.width : 0;
    const h = typeof n.style?.height === "number" ? n.style.height : 0;
    const ln = n.data.layoutNode;
    const nx = (n.position.x - box.minX) * sFit + offsetX;
    const ny = (n.position.y - box.minY) * sFit + offsetY;
    const nw = w * sFit;
    const nh = h * sFit;
    return {
      ...n,
      position: { x: nx, y: ny },
      style: { ...n.style, width: nw, height: nh },
      data: {
        ...n.data,
        scale: baseLayoutScale * sFit,
        layoutNode: {
          ...ln,
          x: nx,
          y: ny,
          w: ln.w * sFit,
          h: ln.h * sFit,
          boxHeight: ln.boxHeight * sFit,
          labelHeight: ln.labelHeight * sFit,
          screenFontPx: Math.max(6, Math.round(ln.screenFontPx * sFit)),
          labelFontPx: Math.max(6, Math.round(ln.labelFontPx * sFit)),
        },
      },
    };
  });
  return { nodes: next, sFit };
}

export function treeToFlowEdges(root: SitemapNode): Edge[] {
  const out: Edge[] = [];
  const walk = (n: SitemapNode) => {
    for (const c of n.children) {
      out.push({
        id: `e-${n.id}-${c.id}`,
        source: n.id,
        target: c.id,
      });
      walk(c);
    }
  };
  walk(root);
  return out;
}

export type SitemapFlowNodeData = {
  layoutNode: LayoutNode;
  diagramLayout: SitemapPreviewDiagramLayout;
  density: ReturnType<typeof previewDensityPreset>;
  scale: number;
};

export function buildSitemapFlowSnapshot(
  root: SitemapNode,
  diagramLayout: SitemapPreviewDiagramLayout,
  nodePositions: Record<string, SitemapNodePosition> | undefined,
  readOnly: boolean,
): { nodes: Node<SitemapFlowNodeData>[]; edges: Edge[]; scale: number } {
  const { nodes: layoutNodes, scale } = buildTreeLayout(root, diagramLayout);
  const density = previewDensityPreset(layoutNodes.length, diagramLayout);
  const stored = nodePositions ?? {};
  const positions: Record<string, { x: number; y: number }> = { ...stored };
  for (const ln of layoutNodes) {
    if (positions[ln.id] == null) {
      positions[ln.id] = { x: ln.x, y: ln.y };
    }
  }
  const rfNodes: Node<SitemapFlowNodeData>[] = layoutNodes.map((ln) => ({
    id: ln.id,
    type: "sitemapNode",
    position: positions[ln.id]!,
    style: { width: ln.w, height: ln.h },
    draggable: !readOnly,
    selectable: !readOnly,
    data: {
      layoutNode: ln,
      diagramLayout,
      density,
      scale,
    },
  }));
  const edges = treeToFlowEdges(root);

  let outNodes = rfNodes;
  let outScale = scale;
  if (readOnly) {
    const { nodes: fitted, sFit } = fitReadOnlySitemapRfNodesToA4(rfNodes, scale);
    outNodes = fitted;
    outScale = scale * sFit;
  }

  return { nodes: outNodes, edges, scale: outScale };
}

export function positionsFromRfNodes(nodes: Array<{ id: string; position: { x: number; y: number } }>): Record<string, SitemapNodePosition> {
  const out: Record<string, SitemapNodePosition> = {};
  for (const n of nodes) {
    out[n.id] = { x: n.position.x, y: n.position.y };
  }
  return out;
}
