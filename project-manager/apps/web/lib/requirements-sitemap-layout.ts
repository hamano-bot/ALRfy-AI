import type { SitemapNode } from "@/lib/requirements-sitemap-schema";

export type SitemapPreviewDiagramLayout = "horizontal" | "vertical";

/** 水平レイアウトのみ: ノード枠サイズは据え置き、ラベル・画面名の表示フォントを拡大 */
export const HORIZONTAL_NODE_INNER_TEXT_SCALE = 1.2;

export const A4_LANDSCAPE_CANVAS_WIDTH = 1122;
export const A4_LANDSCAPE_CANVAS_HEIGHT = 794;
const CANVAS_PADDING = 80;
export const NODE_BOX_WIDTH_VERTICAL = 240 * 3;
/** 水平レイアウトのノード幅（縦基準の 2.25 倍のさらに 120%） */
const NODE_BOX_WIDTH_HORIZONTAL = Math.round(NODE_BOX_WIDTH_VERTICAL * 1.5 * 1.5 * 1.2);
/** 水平レイアウトのノード枠の横幅のみ縮小（高さ・縦方向の積算は変更しない） */
const HORIZONTAL_NODE_BOX_WIDTH_RELATIVE = 0.9;

function horizontalLayoutNodeBoxWidthPx(horizontalNodeWidthScale: number): number {
  return Math.round(NODE_BOX_WIDTH_HORIZONTAL * horizontalNodeWidthScale * HORIZONTAL_NODE_BOX_WIDTH_RELATIVE);
}
/** Preview body: matches box div lineHeight / padding at full width (see PreviewSitemapCanvas). */
export const PREVIEW_BODY_LINE_HEIGHT = 1.25;
const PREVIEW_BODY_FONT_BASE = 14;
const PREVIEW_BODY_PAD_Y = 8;
const PREVIEW_BODY_BORDER_Y = 4;
const PREVIEW_NODE_MIN_FONT_PX = 8;
export const PREVIEW_SCREEN_BODY_MAX_LINES_HORIZONTAL = 2;
export const PREVIEW_SCREEN_BODY_MAX_LINES_VERTICAL = 3;
/** 水平レイアウトでラベル帯を下げる量（DOM・積算の両方に反映） */
export const HORIZONTAL_LABEL_OFFSET_TOP_PX = 8;
const HORIZONTAL_BOX_HEIGHT_MULTIPLIER = 2.4;
const HORIZONTAL_LEVEL_GAP_MULTIPLIER = 1.2;
const VERTICAL_BOX_HEIGHT_MULTIPLIER = 2;
const VERTICAL_LEVEL_GAP_MULTIPLIER = 1.4;

function nodeScreenBoxBorderBoxHeightPx(maxBodyLines: number): number {
  const innerText = Math.ceil(maxBodyLines * PREVIEW_BODY_FONT_BASE * PREVIEW_BODY_LINE_HEIGHT);
  return innerText + 2 * PREVIEW_BODY_PAD_Y + PREVIEW_BODY_BORDER_Y;
}

const NODE_BOX_HEIGHT_HORIZONTAL = Math.round(
  nodeScreenBoxBorderBoxHeightPx(PREVIEW_SCREEN_BODY_MAX_LINES_HORIZONTAL) * 2 * HORIZONTAL_BOX_HEIGHT_MULTIPLIER,
);
const NODE_BOX_HEIGHT_VERTICAL = Math.round(
  nodeScreenBoxBorderBoxHeightPx(PREVIEW_SCREEN_BODY_MAX_LINES_VERTICAL) * 4.25 * VERTICAL_BOX_HEIGHT_MULTIPLIER,
);
const NODE_LABEL_HEIGHT = 16;
const NODE_LABEL_GAP_PX = 10;
const NODE_AFTER_LABEL_GAP_PX = 2;
/** Extra space between the label strip and the node box in horizontal layout only (keep small). */
export const HORIZONTAL_LABEL_BOX_EXTRA_GAP_PX = 3;
/** Must match the label strip `lineHeight` in `PreviewSitemapCanvas`. */
export const PREVIEW_SITEMAP_LABEL_LINE_HEIGHT = 1.2;
/** Taller strip in vertical preview so labels can use up to 2 lines (see `PreviewSitemapCanvas`). */
const VERTICAL_LABEL_STRIP_DESIGN_PX = Math.ceil(11 * PREVIEW_SITEMAP_LABEL_LINE_HEIGHT * 2) + 6;
/** Keeps label text within the layout-reserved strip (scaled `labelHeight`); `maxLines` is for vertical 2-line strip. */
export function previewSitemapResolvedLabelFontPx(
  labelFontPx: number,
  labelHeightPx: number,
  maxLines: 1 | 2 = 1,
  minPx = PREVIEW_NODE_MIN_FONT_PX,
): number {
  const lines = maxLines;
  const maxByStrip = Math.max(
    minPx,
    (labelHeightPx - 1) / (PREVIEW_SITEMAP_LABEL_LINE_HEIGHT * lines) - 0.5,
  );
  return Math.max(minPx, Math.min(11, labelFontPx, maxByStrip));
}

export function previewLabelToBoxGapPx(direction: SitemapPreviewDiagramLayout, nodeWidthPx: number): number {
  const base = NODE_LABEL_GAP_PX * (nodeWidthPx / NODE_BOX_WIDTH_VERTICAL);
  return direction === "horizontal" ? base + HORIZONTAL_LABEL_BOX_EXTRA_GAP_PX : base;
}

/** 画面名ボックスの枠線・角丸（`RequirementsSitemapFlowCanvas` と一致） */
export function previewSitemapScreenBoxBorderPx(layoutScale: number): number {
  return Math.max(1, Math.min(3.25, 1.15 * layoutScale ** 0.55));
}

export function previewSitemapScreenBoxRadiusPx(layoutScale: number): number {
  return Math.max(5, Math.min(16, 5 + 4 * layoutScale ** 0.45));
}

/**
 * 水平レイアウトの左右辺ハンドル用: 左辺の「縦方向の中点〜下端」の間で、下端の角丸に入り込まない Y オフセット（ボックス上端からの距離）。
 * 横線が角 R の外周に沿うよう、下端の円弧手前までクランプする。
 */
export function horizontalSitemapSideHandleOffsetY(boxHeightPx: number, layoutScale: number): number {
  const r = previewSitemapScreenBoxRadiusPx(layoutScale);
  const bw = previewSitemapScreenBoxBorderPx(layoutScale);
  const yMid = boxHeightPx / 2;
  const yBottom = boxHeightPx;
  const yStraightMax = yBottom - r - bw * 0.5;
  const yPreferred = (yMid + yBottom) / 2;
  if (yStraightMax <= yMid + 2) {
    return Math.min(Math.max((yMid + yBottom) / 2, yMid + 2), Math.max(yMid + 2, yBottom - 2));
  }
  return Math.min(Math.max(yPreferred, yMid + 2), yStraightMax);
}

/** Avoids `Math.max(8px, …)` overriding scaled-down preview fonts and clipping the screen name in the box. */
export function previewSitemapResolvedScreenFontPx(
  screenFontPx: number,
  boxHeightPx: number,
  maxBodyLines: number,
  minPx = PREVIEW_NODE_MIN_FONT_PX,
): number {
  const inner = Math.max(minPx + 1, previewScreenInnerTextHeightPx(boxHeightPx));
  const maxByHeight = inner / (Math.max(1, maxBodyLines) * PREVIEW_BODY_LINE_HEIGHT) - 0.5;
  return Math.max(minPx, Math.min(14, screenFontPx, maxByHeight));
}

export function previewDensityPreset(nodeCount: number, direction: SitemapPreviewDiagramLayout): {
  minScreenFontPx: number;
  minLabelFontPx: number;
  horizontalExtraGapPx: number;
  verticalBoxScale: number;
  horizontalNodePaddingScale: number;
  verticalSiblingGapScale: number;
  horizontalSiblingGapScale: number;
  horizontalNodeWidthScale: number;
} {
  if (nodeCount <= 8) {
    return {
      minScreenFontPx: 14,
      minLabelFontPx: 14,
      horizontalExtraGapPx: 0.5,
      verticalBoxScale: 0.4,
      horizontalNodePaddingScale: 1,
      verticalSiblingGapScale: 1,
      horizontalSiblingGapScale: 1,
      horizontalNodeWidthScale: 1,
    };
  }
  if (nodeCount >= 10) {
    return {
      minScreenFontPx: PREVIEW_NODE_MIN_FONT_PX,
      minLabelFontPx: PREVIEW_NODE_MIN_FONT_PX,
      // Keep label position unchanged while pushing node box (and edge route) lower.
      horizontalExtraGapPx: 6,
      verticalBoxScale: 1.3,
      horizontalNodePaddingScale: 1.3,
      verticalSiblingGapScale: 1.2,
      horizontalSiblingGapScale: 1.3,
      horizontalNodeWidthScale: 1,
    };
  }
  return {
    minScreenFontPx: PREVIEW_NODE_MIN_FONT_PX,
    minLabelFontPx: PREVIEW_NODE_MIN_FONT_PX,
    horizontalExtraGapPx: 1,
    verticalBoxScale: 0.6,
    horizontalNodePaddingScale: 1,
    verticalSiblingGapScale: 1,
    horizontalSiblingGapScale: 1,
    horizontalNodeWidthScale: 1,
  };
}

function countSitemapNodes(root: SitemapNode): number {
  let c = 0;
  const walk = (n: SitemapNode) => {
    c += 1;
    for (const ch of n.children) {
      walk(ch);
    }
  };
  walk(root);
  return c;
}

function horizontalStackHeightPx(horizontalExtraGapPx: number, screenBoxHeightPx: number = NODE_BOX_HEIGHT_HORIZONTAL): number {
  return (
    HORIZONTAL_LABEL_OFFSET_TOP_PX +
    screenBoxHeightPx +
    NODE_LABEL_GAP_PX +
    NODE_LABEL_HEIGHT +
    NODE_AFTER_LABEL_GAP_PX +
    horizontalExtraGapPx
  );
}

/** 水平レイアウトでノード数が多いときの画面名ボックス高さ（通常の約180%） */
export function horizontalSitemapScreenBoxHeightPx(nodeCount: number): number {
  return nodeCount >= 10 ? Math.round(NODE_BOX_HEIGHT_HORIZONTAL * 1.8) : NODE_BOX_HEIGHT_HORIZONTAL;
}

/** 水平レイアウトの画面名ボックス（ノード外枠の主たる縦幅）を一様に縮小。ラベル帯・ギャップの積算は別 */
const HORIZONTAL_NODE_SCREEN_BOX_HEIGHT_RELATIVE = 0.9;

export function horizontalLayoutScreenBoxHeightPx(nodeCount: number): number {
  return Math.round(horizontalSitemapScreenBoxHeightPx(nodeCount) * HORIZONTAL_NODE_SCREEN_BOX_HEIGHT_RELATIVE);
}

function verticalStackHeightPx(verticalBoxHeightPx: number): number {
  return verticalBoxHeightPx + NODE_LABEL_GAP_PX + VERTICAL_LABEL_STRIP_DESIGN_PX + NODE_AFTER_LABEL_GAP_PX;
}

export type LayoutNode = {
  id: string;
  depth: number;
  labelText: string;
  screenName: string;
  x: number;
  y: number;
  w: number;
  h: number;
  boxHeight: number;
  labelHeight: number;
  screenFontPx: number;
  labelFontPx: number;
};

export type LayoutEdge = { id: string; points: Array<{ x: number; y: number }> };

type AxisNode = {
  id: string;
  labelText: string;
  screenName: string;
  depth: number;
  primary: number;
  crossCenter: number;
  boxHeight: number;
  labelHeight: number;
  totalHeight: number;
  screenFontPx: number;
  labelFontPx: number;
};

type NodeMetric = {
  labelText: string;
  labelHeight: number;
  boxHeight: number;
  totalHeight: number;
  screenFontPx: number;
  labelFontPx: number;
};

function nodeScreenBoxTopY(
  n: LayoutNode,
  direction: SitemapPreviewDiagramLayout,
  horizontalExtraGapPx: number,
): number {
  const gapBase = previewLabelToBoxGapPx(direction, n.w);
  const gap = direction === "horizontal" ? Math.max(1, gapBase - (HORIZONTAL_LABEL_BOX_EXTRA_GAP_PX - horizontalExtraGapPx)) : gapBase;
  const labelOffset = direction === "horizontal" ? HORIZONTAL_LABEL_OFFSET_TOP_PX : 0;
  return n.y + n.labelHeight + labelOffset + gap;
}

/** 水平レイアウト: 階層間の余白（エッジが読みやすくなるようやや広め） */
const LEVEL_GAP_HORIZONTAL = 230;
const LEVEL_GAP_HORIZONTAL_SCALED = Math.round(LEVEL_GAP_HORIZONTAL * HORIZONTAL_LEVEL_GAP_MULTIPLIER);
const LEVEL_GAP_VERTICAL = 180;
const LEVEL_GAP_VERTICAL_SCALED = Math.round(LEVEL_GAP_VERTICAL * VERTICAL_LEVEL_GAP_MULTIPLIER);
const SIBLING_GAP_VERTICAL = 44;
const SIBLING_GAP_HORIZONTAL = Math.round(SIBLING_GAP_VERTICAL * 2);
export const PREVIEW_LINE_COLOR = "rgba(0, 0, 0, 0.9)";
export const PREVIEW_ZOOM_MIN = 0.4;
export const PREVIEW_ZOOM_MAX = 2;
/** Preview sitemap may scale above 1 when the tree is small so type and boxes use the canvas. */
const PREVIEW_SITEMAP_MAX_SCALE = 2.15;
/** Fine-tune for print preview visual balance: slight nudge to the left. */
const PREVIEW_SITEMAP_CENTER_OFFSET_X = -20;

function estimateLines(text: string, charsPerLine: number): number {
  if (!text.trim()) {
    return 1;
  }
  return Math.max(1, Math.ceil(text.length / Math.max(1, charsPerLine)));
}

function previewScreenInnerTextHeightPx(borderBoxHeight: number): number {
  return Math.max(8, borderBoxHeight - 2 * PREVIEW_BODY_PAD_Y - PREVIEW_BODY_BORDER_Y);
}

/** Slightly conservative for bold CJK so preview does not clip before we shrink enough. */
const PREVIEW_SCREEN_CHAR_EM = 0.55;

function fitFontSizeByTextLength(
  text: string,
  boxWidth: number,
  boxHeight: number,
  base: number,
  min: number,
  maxLines: number,
): number {
  const inner = previewScreenInnerTextHeightPx(boxHeight);
  for (let size = base; size >= min; size -= 1) {
    const charsPerLine = Math.max(4, Math.floor((boxWidth - 24) / (size * PREVIEW_SCREEN_CHAR_EM)));
    const lines = estimateLines(text, charsPerLine);
    const needed = lines * (size * PREVIEW_BODY_LINE_HEIGHT);
    if (lines <= maxLines && needed <= inner) {
      return size;
    }
  }
  return min;
}

/** Label strip uses lineHeight 1.2 and is not the padded screen-name box; keep separate from fitFontSizeByTextLength. */
function fitLabelFontSize(text: string, boxWidth: number, stripHeight: number, base: number, min: number): number {
  let size = base;
  while (size > min) {
    const charsPerLine = Math.max(4, Math.floor((boxWidth - 24) / (size * 0.62)));
    const lines = estimateLines(text, charsPerLine);
    const needed = lines * (size * 1.2);
    if (needed <= stripHeight - 4) {
      break;
    }
    size -= 1;
  }
  return Math.max(min, size);
}

function collectNodeMetrics(
  root: SitemapNode,
  direction: SitemapPreviewDiagramLayout,
  nodeCount: number,
): Map<string, NodeMetric> {
  const density = previewDensityPreset(nodeCount, direction);
  const boxWidth =
    direction === "horizontal" ? horizontalLayoutNodeBoxWidthPx(density.horizontalNodeWidthScale) : NODE_BOX_WIDTH_VERTICAL;
  const verticalBoxHeight = Math.round(NODE_BOX_HEIGHT_VERTICAL * density.verticalBoxScale);
  const horizontalBoxH = horizontalLayoutScreenBoxHeightPx(nodeCount);
  const boxHeight = direction === "horizontal" ? horizontalBoxH : verticalBoxHeight;
  const totalHeight =
    direction === "horizontal"
      ? horizontalStackHeightPx(density.horizontalExtraGapPx, horizontalBoxH)
      : verticalStackHeightPx(verticalBoxHeight);
  const maxLines = direction === "horizontal" ? PREVIEW_SCREEN_BODY_MAX_LINES_HORIZONTAL : PREVIEW_SCREEN_BODY_MAX_LINES_VERTICAL;
  const m = new Map<string, NodeMetric>();
  const walk = (n: SitemapNode) => {
    const labelText = n.labels.map((l) => l.trim()).filter(Boolean).join("  ");
    const labelStripDesign =
      direction === "vertical" ? VERTICAL_LABEL_STRIP_DESIGN_PX : NODE_LABEL_HEIGHT;
    const labelHeight = labelStripDesign;
    const screenFontPx = fitFontSizeByTextLength(n.screenName, boxWidth, boxHeight, 14, 8, maxLines);
    const labelFontPx = fitLabelFontSize(labelText || " ", boxWidth, labelStripDesign, 11, 9);
    m.set(n.id, {
      labelText,
      labelHeight,
      boxHeight,
      totalHeight,
      screenFontPx,
      labelFontPx,
    });
    for (const c of n.children) {
      walk(c);
    }
  };
  walk(root);
  return m;
}

export function buildTreeLayout(
  root: SitemapNode,
  direction: SitemapPreviewDiagramLayout,
): { nodes: LayoutNode[]; edges: LayoutEdge[]; scale: number } {
  const nodeCount = countSitemapNodes(root);
  const density = previewDensityPreset(nodeCount, direction);
  const verticalBoxHeight = Math.round(NODE_BOX_HEIGHT_VERTICAL * density.verticalBoxScale);
  const horizontalBoxH = horizontalLayoutScreenBoxHeightPx(nodeCount);
  const metrics = collectNodeMetrics(root, direction, nodeCount);
  const axisNodes = new Map<string, AxisNode>();
  const edgesAxis: Array<{ from: string; to: string }> = [];
  const nodeBoxWidth =
    direction === "horizontal" ? horizontalLayoutNodeBoxWidthPx(density.horizontalNodeWidthScale) : NODE_BOX_WIDTH_VERTICAL;
  const siblingGap =
    direction === "horizontal"
      ? Math.round(SIBLING_GAP_HORIZONTAL * density.horizontalSiblingGapScale)
      : Math.round(SIBLING_GAP_VERTICAL * density.verticalSiblingGapScale);
  const levelGap = direction === "horizontal" ? LEVEL_GAP_HORIZONTAL_SCALED : LEVEL_GAP_VERTICAL_SCALED;
  const maxNodeTotalHeight =
    direction === "horizontal"
      ? horizontalStackHeightPx(density.horizontalExtraGapPx, horizontalBoxH)
      : verticalStackHeightPx(verticalBoxHeight);
  const defaultBoxHeight = direction === "horizontal" ? horizontalBoxH : verticalBoxHeight;
  const defaultStackHeight =
    direction === "horizontal"
      ? horizontalStackHeightPx(density.horizontalExtraGapPx, horizontalBoxH)
      : verticalStackHeightPx(verticalBoxHeight);
  const minPrimary = CANVAS_PADDING;
  const primaryStep = direction === "horizontal" ? nodeBoxWidth + levelGap : maxNodeTotalHeight + levelGap;

  const place = (
    node: SitemapNode,
    depth: number,
    startCross: number,
    parentPrimary: number | null,
    parentTotalHeight: number | null,
  ): { span: number; center: number } => {
    const metric = metrics.get(node.id) ?? {
      labelText: "",
      labelHeight: direction === "vertical" ? VERTICAL_LABEL_STRIP_DESIGN_PX : NODE_LABEL_HEIGHT,
      boxHeight: defaultBoxHeight,
      totalHeight: defaultStackHeight,
      screenFontPx: 14,
      labelFontPx: 11,
    };
    const crossSize = direction === "horizontal" ? metric.totalHeight : nodeBoxWidth;
    if (node.children.length === 0) {
      const center = startCross + crossSize / 2;
      const primary =
        direction === "horizontal"
          ? minPrimary + depth * primaryStep
          : parentPrimary === null
            ? minPrimary
            : parentPrimary + (parentTotalHeight ?? maxNodeTotalHeight) + levelGap;
      axisNodes.set(node.id, {
        id: node.id,
        labelText: metric.labelText,
        screenName: node.screenName,
        depth,
        primary,
        crossCenter: center,
        boxHeight: metric.boxHeight,
        labelHeight: metric.labelHeight,
        totalHeight: metric.totalHeight,
        screenFontPx: metric.screenFontPx,
        labelFontPx: metric.labelFontPx,
      });
      return { span: crossSize, center };
    }
    let cursor = startCross;
    let totalSpan = 0;
    const childCenters: number[] = [];
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const primaryForNode =
        direction === "horizontal"
          ? minPrimary + depth * primaryStep
          : parentPrimary === null
            ? minPrimary
            : parentPrimary + (parentTotalHeight ?? maxNodeTotalHeight) + levelGap;
      const childPlaced = place(child, depth + 1, cursor, primaryForNode, metric.totalHeight);
      childCenters.push(childPlaced.center);
      edgesAxis.push({ from: node.id, to: child.id });
      cursor += childPlaced.span + siblingGap;
      totalSpan += childPlaced.span;
      if (i < node.children.length - 1) {
        totalSpan += siblingGap;
      }
    }
    totalSpan = Math.max(totalSpan, crossSize);
    const center = startCross + totalSpan / 2;
    const primary =
      direction === "horizontal"
        ? minPrimary + depth * primaryStep
        : parentPrimary === null
          ? minPrimary
          : parentPrimary + (parentTotalHeight ?? maxNodeTotalHeight) + levelGap;
    axisNodes.set(node.id, {
      id: node.id,
      labelText: metric.labelText,
      screenName: node.screenName,
      depth,
      primary,
      crossCenter: center,
      boxHeight: metric.boxHeight,
      labelHeight: metric.labelHeight,
      totalHeight: metric.totalHeight,
      screenFontPx: metric.screenFontPx,
      labelFontPx: metric.labelFontPx,
    });
    return { span: totalSpan, center };
  };

  const placed = place(root, 0, CANVAS_PADDING, null, null);
  const maxCross = placed.span + CANVAS_PADDING * 2;
  const maxDepth = Math.max(...[...axisNodes.values()].map((n) => n.depth));
  const maxPrimary =
    direction === "horizontal"
      ? minPrimary + maxDepth * primaryStep + nodeBoxWidth + CANVAS_PADDING
      : Math.max(...[...axisNodes.values()].map((n) => n.primary + n.totalHeight), minPrimary + maxNodeTotalHeight) + CANVAS_PADDING;

  const innerW = A4_LANDSCAPE_CANVAS_WIDTH - CANVAS_PADDING * 2;
  const innerH = A4_LANDSCAPE_CANVAS_HEIGHT - CANVAS_PADDING * 2;
  const extentPrimary = direction === "horizontal" ? maxPrimary : maxCross;
  const extentCross = direction === "horizontal" ? maxCross : maxPrimary;
  const rawFitScale = Math.min(innerW / Math.max(1, extentPrimary), innerH / Math.max(1, extentCross));
  const scale = Math.min(PREVIEW_SITEMAP_MAX_SCALE, rawFitScale);

  const nodes: LayoutNode[] = [];
  for (const n of axisNodes.values()) {
    if (direction === "horizontal") {
      nodes.push({
        id: n.id,
        depth: n.depth,
        labelText: n.labelText,
        screenName: n.screenName,
        x: n.primary * scale,
        y: (n.crossCenter - n.totalHeight / 2) * scale,
        w: nodeBoxWidth * scale,
        h: n.totalHeight * scale,
        boxHeight: n.boxHeight * scale,
        labelHeight: n.labelHeight * scale,
        screenFontPx: n.screenFontPx * scale,
        labelFontPx: n.labelFontPx * scale,
      });
    } else {
      nodes.push({
        id: n.id,
        depth: n.depth,
        labelText: n.labelText,
        screenName: n.screenName,
        x: (n.crossCenter - nodeBoxWidth / 2) * scale,
        y: n.primary * scale,
        w: nodeBoxWidth * scale,
        h: n.totalHeight * scale,
        boxHeight: n.boxHeight * scale,
        labelHeight: n.labelHeight * scale,
        screenFontPx: n.screenFontPx * scale,
        labelFontPx: n.labelFontPx * scale,
      });
    }
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edges: LayoutEdge[] = edgesAxis
    .map((e, idx) => {
      const from = nodeById.get(e.from);
      const to = nodeById.get(e.to);
      if (!from || !to) {
        return null;
      }
      if (direction === "horizontal") {
        const fromBoxTop = nodeScreenBoxTopY(from, direction, density.horizontalExtraGapPx);
        const toBoxTop = nodeScreenBoxTopY(to, direction, density.horizontalExtraGapPx);
        const sx = from.x + from.w;
        const sy = Math.round(fromBoxTop + horizontalSitemapSideHandleOffsetY(from.boxHeight, scale));
        const ex = to.x;
        const ey = Math.round(toBoxTop + horizontalSitemapSideHandleOffsetY(to.boxHeight, scale));
        const mx = Math.round((sx + ex) / 2);
        return { id: `e-${idx}`, points: [{ x: sx, y: sy }, { x: mx, y: sy }, { x: mx, y: ey }, { x: ex, y: ey }] };
      }
      const fromBoxTop = nodeScreenBoxTopY(from, direction, density.horizontalExtraGapPx);
      const toBoxTop = nodeScreenBoxTopY(to, direction, density.horizontalExtraGapPx);
      const sx = Math.round(from.x + from.w / 2);
      const sy = Math.round(fromBoxTop + from.boxHeight);
      const ex = Math.round(to.x + to.w / 2);
      const ey = Math.round(toBoxTop);
      const my = Math.round((sy + ey) / 2);
      return { id: `e-${idx}`, points: [{ x: sx, y: sy }, { x: sx, y: my }, { x: ex, y: my }, { x: ex, y: ey }] };
    })
    .filter((v): v is LayoutEdge => v !== null);

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
  }
  for (const e of edges) {
    for (const p of e.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { nodes, edges, scale };
  }

  const contentWidth = Math.max(1, maxX - minX);
  const contentHeight = Math.max(1, maxY - minY);
  const offsetX = (A4_LANDSCAPE_CANVAS_WIDTH - contentWidth) / 2 - minX + PREVIEW_SITEMAP_CENTER_OFFSET_X;
  const offsetY = (A4_LANDSCAPE_CANVAS_HEIGHT - contentHeight) / 2 - minY;

  const centeredNodes = nodes.map((n) => ({
    ...n,
    x: n.x + offsetX,
    y: n.y + offsetY,
  }));
  const centeredEdges = edges.map((e) => ({
    ...e,
    points: e.points.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY })),
  }));

  return { nodes: centeredNodes, edges: centeredEdges, scale };
}
