"use client";

import { RequirementsSitemapGeminiChatSheet } from "@/app/components/requirements/RequirementsSitemapGeminiChatSheet";
import { RequirementsSitemapImportExcelDialog } from "@/app/components/requirements/RequirementsSitemapImportExcelDialog";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Popover, PopoverAnchor, PopoverContent } from "@/app/components/ui/popover";
import { GeminiMarkIcon } from "@/app/project-list/[projectId]/hearing/GeminiMarkIcon";
import { insertionIndexFromPointerYForStrings } from "@/lib/requirements-doc-reorder";
import {
  addChildReturningNewId,
  addSiblingAfter,
  flattenSitemapPreorder,
  removeNode,
  reorderSiblingToIndex,
  setNodeLabels,
  setNodeScreenName,
} from "@/lib/requirements-sitemap-mutate";
import {
  collectSitemapLabelSuggestions,
  type RequirementsPageContentSitemap,
  type SitemapNode,
} from "@/lib/requirements-sitemap-schema";
import { cn } from "@/lib/utils";
import { toPng } from "html-to-image";
import { GripVertical, Loader2, Maximize2, Plus, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const DND_MIME = "application/x-alrfy-sitemap-node";

export type SitemapPreviewDiagramLayout = "horizontal" | "vertical";

type Props = {
  content: RequirementsPageContentSitemap;
  readOnly: boolean;
  onChange: (next: RequirementsPageContentSitemap) => void;
};

function waitNextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

const A4_LANDSCAPE_CANVAS_WIDTH = 1122;
const A4_LANDSCAPE_CANVAS_HEIGHT = 794;
const CANVAS_PADDING = 80;
const NODE_BOX_WIDTH_VERTICAL = 240 * 3;
const NODE_BOX_WIDTH_HORIZONTAL = Math.round(NODE_BOX_WIDTH_VERTICAL * 1.5);
/** Preview body: matches box div lineHeight / padding at full width (see PreviewSitemapCanvas). */
const PREVIEW_BODY_LINE_HEIGHT = 1.25;
const PREVIEW_BODY_FONT_BASE = 14;
const PREVIEW_BODY_PAD_Y = 8;
const PREVIEW_BODY_BORDER_Y = 4;
const PREVIEW_SCREEN_BODY_MAX_LINES_HORIZONTAL = 2;
const PREVIEW_SCREEN_BODY_MAX_LINES_VERTICAL = 3;
const HORIZONTAL_LABEL_OFFSET_TOP_PX = 2;
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
  nodeScreenBoxBorderBoxHeightPx(PREVIEW_SCREEN_BODY_MAX_LINES_VERTICAL) * 4 * VERTICAL_BOX_HEIGHT_MULTIPLIER,
);
const NODE_LABEL_HEIGHT = 16;
const NODE_LABEL_GAP_PX = 10;
const NODE_AFTER_LABEL_GAP_PX = 2;
const NODE_STACK_HEIGHT_HORIZONTAL =
  NODE_BOX_HEIGHT_HORIZONTAL + NODE_LABEL_GAP_PX + NODE_LABEL_HEIGHT + NODE_AFTER_LABEL_GAP_PX;
const NODE_STACK_HEIGHT_VERTICAL =
  NODE_BOX_HEIGHT_VERTICAL + NODE_LABEL_GAP_PX + NODE_LABEL_HEIGHT + NODE_AFTER_LABEL_GAP_PX;
function nodeScreenBoxTopY(n: LayoutNode, direction: SitemapPreviewDiagramLayout): number {
  const gap = NODE_LABEL_GAP_PX * (n.w / NODE_BOX_WIDTH_VERTICAL);
  const labelOffset = direction === "horizontal" ? HORIZONTAL_LABEL_OFFSET_TOP_PX : 0;
  return n.y + n.labelHeight + labelOffset + gap;
}

const LEVEL_GAP_HORIZONTAL = 170;
const LEVEL_GAP_HORIZONTAL_SCALED = Math.round(LEVEL_GAP_HORIZONTAL * HORIZONTAL_LEVEL_GAP_MULTIPLIER);
const LEVEL_GAP_VERTICAL = 180;
const LEVEL_GAP_VERTICAL_SCALED = Math.round(LEVEL_GAP_VERTICAL * VERTICAL_LEVEL_GAP_MULTIPLIER);
const SIBLING_GAP_VERTICAL = 36;
const SIBLING_GAP_HORIZONTAL = Math.round(SIBLING_GAP_VERTICAL * 2);
const PREVIEW_LINE_COLOR = "rgba(0, 0, 0, 0.9)";
const PREVIEW_ZOOM_MIN = 0.4;
const PREVIEW_ZOOM_MAX = 2;

function collectExpandedDefault(root: SitemapNode): Set<string> {
  const s = new Set<string>();
  const walk = (n: SitemapNode) => {
    if (n.children.length > 0) {
      s.add(n.id);
    }
    for (const c of n.children) {
      walk(c);
    }
  };
  walk(root);
  return s;
}

function SitemapLabelInput({
  value,
  suggestions,
  readOnly,
  onChange,
}: {
  value: string;
  suggestions: string[];
  readOnly: boolean;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const filtered = useMemo(() => {
    const list = suggestions.filter((s) => {
      const t = s.trim();
      if (!t) {
        return false;
      }
      if (q === "") {
        return true;
      }
      return t.toLowerCase().includes(q);
    });
    return list.slice(0, 40);
  }, [suggestions, q]);

  return (
    <Popover open={open && filtered.length > 0 && !readOnly} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          value={value}
          readOnly={readOnly}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (suggestions.length > 0) {
              setOpen(true);
            }
          }}
          className="h-8 text-xs"
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={4}
        className="max-h-48 min-w-[12rem] max-w-[min(24rem,calc(100vw-2rem))] overflow-y-auto p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <ul className="space-y-0.5">
          {filtered.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="w-full rounded px-2 py-1.5 text-left text-xs leading-snug hover:bg-[color:color-mix(in_srgb,var(--foreground)_8%,transparent)]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

type LayoutNode = {
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

type LayoutEdge = { id: string; points: Array<{ x: number; y: number }> };

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

function collectNodeMetrics(root: SitemapNode, direction: SitemapPreviewDiagramLayout): Map<string, NodeMetric> {
  const boxWidth = direction === "horizontal" ? NODE_BOX_WIDTH_HORIZONTAL : NODE_BOX_WIDTH_VERTICAL;
  const boxHeight = direction === "horizontal" ? NODE_BOX_HEIGHT_HORIZONTAL : NODE_BOX_HEIGHT_VERTICAL;
  const totalHeight = direction === "horizontal" ? NODE_STACK_HEIGHT_HORIZONTAL : NODE_STACK_HEIGHT_VERTICAL;
  const maxLines = direction === "horizontal" ? PREVIEW_SCREEN_BODY_MAX_LINES_HORIZONTAL : PREVIEW_SCREEN_BODY_MAX_LINES_VERTICAL;
  const m = new Map<string, NodeMetric>();
  const walk = (n: SitemapNode) => {
    const labelText = n.labels.map((l) => l.trim()).filter(Boolean).join("  ");
    const labelHeight = NODE_LABEL_HEIGHT;
    const screenFontPx = fitFontSizeByTextLength(n.screenName, boxWidth, boxHeight, 14, 8, maxLines);
    const labelFontPx = fitLabelFontSize(labelText || " ", boxWidth, NODE_LABEL_HEIGHT, 11, 9);
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

function buildTreeLayout(root: SitemapNode, direction: SitemapPreviewDiagramLayout): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const metrics = collectNodeMetrics(root, direction);
  const axisNodes = new Map<string, AxisNode>();
  const edgesAxis: Array<{ from: string; to: string }> = [];
  const nodeBoxWidth = direction === "horizontal" ? NODE_BOX_WIDTH_HORIZONTAL : NODE_BOX_WIDTH_VERTICAL;
  const siblingGap = direction === "horizontal" ? SIBLING_GAP_HORIZONTAL : SIBLING_GAP_VERTICAL;
  const levelGap = direction === "horizontal" ? LEVEL_GAP_HORIZONTAL_SCALED : LEVEL_GAP_VERTICAL_SCALED;
  const maxNodeTotalHeight = direction === "horizontal" ? NODE_STACK_HEIGHT_HORIZONTAL : NODE_STACK_HEIGHT_VERTICAL;
  const defaultBoxHeight = direction === "horizontal" ? NODE_BOX_HEIGHT_HORIZONTAL : NODE_BOX_HEIGHT_VERTICAL;
  const defaultStackHeight = direction === "horizontal" ? NODE_STACK_HEIGHT_HORIZONTAL : NODE_STACK_HEIGHT_VERTICAL;
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
      labelHeight: NODE_LABEL_HEIGHT,
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

  const scale = Math.min(
    (A4_LANDSCAPE_CANVAS_WIDTH - CANVAS_PADDING * 2) / (direction === "horizontal" ? maxPrimary : maxCross),
    (A4_LANDSCAPE_CANVAS_HEIGHT - CANVAS_PADDING * 2) / (direction === "horizontal" ? maxCross : maxPrimary),
    1,
  );

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
        const fromBoxTop = nodeScreenBoxTopY(from, direction);
        const toBoxTop = nodeScreenBoxTopY(to, direction);
        const sx = from.x + from.w;
        const sy = Math.round(fromBoxTop + from.boxHeight / 2);
        const ex = to.x;
        const ey = Math.round(toBoxTop + to.boxHeight / 2);
        const mx = Math.round((sx + ex) / 2);
        return { id: `e-${idx}`, points: [{ x: sx, y: sy }, { x: mx, y: sy }, { x: mx, y: ey }, { x: ex, y: ey }] };
      }
      const fromBoxTop = nodeScreenBoxTopY(from, direction);
      const toBoxTop = nodeScreenBoxTopY(to, direction);
      const sx = Math.round(from.x + from.w / 2);
      const sy = Math.round(fromBoxTop + from.boxHeight);
      const ex = Math.round(to.x + to.w / 2);
      const ey = Math.round(toBoxTop);
      const my = Math.round((sy + ey) / 2);
      return { id: `e-${idx}`, points: [{ x: sx, y: sy }, { x: sx, y: my }, { x: ex, y: my }, { x: ex, y: ey }] };
    })
    .filter((v): v is LayoutEdge => v !== null);

  return { nodes, edges };
}

export function PreviewSitemapCanvas({ root, diagramLayout }: { root: SitemapNode; diagramLayout: SitemapPreviewDiagramLayout }) {
  const { nodes, edges } = useMemo(() => buildTreeLayout(root, diagramLayout), [root, diagramLayout]);
  const labelOffsetTop = diagramLayout === "horizontal" ? HORIZONTAL_LABEL_OFFSET_TOP_PX : 0;
  return (
    <div
      style={{
        position: "relative",
        background: "#ffffff",
        width: `${A4_LANDSCAPE_CANVAS_WIDTH}px`,
        height: `${A4_LANDSCAPE_CANVAS_HEIGHT}px`,
      }}
    >
      <svg
        width={A4_LANDSCAPE_CANVAS_WIDTH}
        height={A4_LANDSCAPE_CANVAS_HEIGHT}
        style={{ position: "absolute", inset: 0 }}
        shapeRendering="geometricPrecision"
      >
        {edges.map((e) => (
          <path
            key={e.id}
            fill="none"
            stroke={PREVIEW_LINE_COLOR}
            strokeWidth={1.2}
            strokeLinejoin="round"
            strokeLinecap="round"
            d={e.points
              .map((p, i) => `${i === 0 ? "M" : "L"} ${Math.round(p.x)} ${Math.round(p.y)}`)
              .join(" ")}
          />
        ))}
      </svg>
      {nodes.map((n) => (
        <div
          key={n.id}
          style={{
            position: "absolute",
            left: `${n.x}px`,
            top: `${n.y}px`,
            width: `${n.w}px`,
          }}
        >
          {n.labelText ? (
            <div
              className="px-1 text-slate-500"
              style={{
                fontSize: `${Math.max(9, Math.min(11, n.labelFontPx))}px`,
                lineHeight: "1.2",
                minHeight: `${n.labelHeight}px`,
                marginTop: `${labelOffsetTop}px`,
                marginBottom: `${NODE_LABEL_GAP_PX * (n.w / NODE_BOX_WIDTH_VERTICAL)}px`,
              }}
            >
              {n.labelText}
            </div>
          ) : (
            <div style={{ minHeight: `${n.labelHeight + labelOffsetTop + NODE_LABEL_GAP_PX * (n.w / NODE_BOX_WIDTH_VERTICAL)}px` }} />
          )}
          <div
            style={{
              borderRadius: "8px",
              border: "2px solid #1f2937",
              boxSizing: "border-box",
              background: "#ffffff",
              color: "#0f172a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              fontWeight: 600,
              padding: `${Math.max(6, 8 * (n.w / NODE_BOX_WIDTH_VERTICAL))}px ${Math.max(8, 12 * (n.w / NODE_BOX_WIDTH_VERTICAL))}px`,
              height: `${n.boxHeight}px`,
              minHeight: `${n.boxHeight}px`,
              maxHeight: `${n.boxHeight}px`,
              fontSize: `${Math.max(8, Math.min(14, n.screenFontPx))}px`,
              lineHeight: PREVIEW_BODY_LINE_HEIGHT,
              overflow: "hidden",
              overflowWrap: "anywhere",
              wordBreak: "break-all",
              whiteSpace: "pre-wrap",
            }}
          >
            {n.screenName}
          </div>
        </div>
      ))}
    </div>
  );
}

type TreeRowProps = {
  node: SitemapNode;
  root: SitemapNode;
  depth: number;
  selectedId: string | null;
  readOnly: boolean;
  suggestions: string[];
  onPatchRoot: (nextRoot: SitemapNode) => void;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  insertBefore?: boolean;
};

function TreeRow({
  node,
  root,
  depth,
  selectedId,
  readOnly,
  suggestions,
  onPatchRoot,
  onSelect,
  onAddChild,
  onDragStart,
  onDragEnd,
  insertBefore,
}: TreeRowProps) {
  const isRoot = node.id === root.id;
  const isSelected = selectedId === node.id;

  const patchLabels = (labels: string[]) => {
    onPatchRoot(setNodeLabels(root, node.id, labels));
  };

  return (
    <div
      data-sitemap-row
      draggable={!readOnly && !isRoot}
      onDragStart={(e) => {
        if (!isRoot) {
          onDragStart(e, node.id);
        }
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "relative flex flex-wrap items-center gap-2 rounded-md border p-1",
        "border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[var(--surface)]",
        isSelected && "ring-2 ring-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]",
        insertBefore &&
          "before:pointer-events-none before:absolute before:inset-x-1 before:top-0 before:z-[1] before:h-[3px] before:-translate-y-1/2 before:rounded-full before:bg-[color:color-mix(in_srgb,var(--accent)_90%,transparent)]",
      )}
      style={{ marginLeft: depth > 0 ? Math.min(depth * 4, 48) : 0 }}
    >
      {!isRoot ? (
        <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-[var(--muted)]" aria-hidden />
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <span className="w-4 shrink-0" aria-hidden />
      <Input
        data-sitemap-screen-input={node.id}
        value={node.screenName}
        readOnly={readOnly}
        onChange={(e) => onPatchRoot(setNodeScreenName(root, node.id, e.target.value))}
        onClick={() => onSelect(node.id)}
        className="h-8 min-w-[6rem] max-w-[14rem] flex-1 text-sm font-medium"
      />
      {isSelected ? (
        <div className="flex w-full basis-full flex-col gap-2 border-t border-[color:color-mix(in_srgb,var(--border)_80%,transparent)] pt-2 pl-6">
          <Label className="text-xs text-[var(--muted)]">ラベル</Label>
          {!readOnly ? (
            <>
              {node.labels.map((lab, li) => (
                <div key={`${node.id}-lab-${li}`} className="flex items-center gap-1">
                  <SitemapLabelInput
                    value={lab}
                    suggestions={suggestions}
                    readOnly={readOnly}
                    onChange={(v) => {
                      const next = [...node.labels];
                      next[li] = v;
                      patchLabels(next);
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 px-2"
                    onClick={() => patchLabels(node.labels.filter((_, i) => i !== li))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" className="h-7 w-fit gap-1 text-xs" onClick={() => patchLabels([...node.labels, ""])}>
                <Plus className="h-3.5 w-3.5" />
                ラベルを追加
              </Button>
            </>
          ) : (
            <p className="text-xs text-[var(--muted)]">{node.labels.length ? node.labels.join(" / ") : "—"}</p>
          )}
          {!readOnly ? (
            <div className="flex flex-wrap gap-1">
              <Button type="button" variant="default" size="sm" className="h-7 text-xs" onClick={() => onAddChild(node.id)}>
                子を追加
              </Button>
              {!isRoot ? (
                <>
                  <Button type="button" variant="default" size="sm" className="h-7 text-xs" onClick={() => onPatchRoot(addSiblingAfter(root, node.id))}>
                    同階層に追加
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-red-600" onClick={() => onPatchRoot(removeNode(root, node.id))}>
                    削除
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type ChildUlProps = {
  parent: SitemapNode;
  root: SitemapNode;
  depth: number;
  expanded: Set<string>;
  selectedId: string | null;
  readOnly: boolean;
  suggestions: string[];
  onPatchRoot: (nextRoot: SitemapNode) => void;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
};

function ChildUl({ parent, root, depth, expanded, selectedId, readOnly, suggestions, onPatchRoot, onSelect, onAddChild }: ChildUlProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const dragIdRef = useRef<string | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);

  const clearDrag = () => {
    dragIdRef.current = null;
    setDropIdx(null);
  };

  const onDragStart = (e: React.DragEvent, id: string) => {
    if (readOnly) {
      return;
    }
    dragIdRef.current = id;
    e.dataTransfer.setData(DND_MIME, id);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (e: React.DragEvent) => {
    if (dragIdRef.current === null || !listRef.current) {
      return;
    }
    const hit = flattenSitemapPreorder(root).find((r) => r.id === dragIdRef.current);
    if (!hit || hit.parentId !== parent.id) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const ids = parent.children.map((c) => c.id);
    const rowEls = [...listRef.current.querySelectorAll<HTMLElement>(":scope > li > div[data-sitemap-row]")];
    const idx = insertionIndexFromPointerYForStrings(ids, rowEls, e.clientY, dragIdRef.current);
    setDropIdx((p) => (p === idx ? p : idx));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dragId = dragIdRef.current ?? e.dataTransfer.getData(DND_MIME);
    if (!dragId || !listRef.current) {
      clearDrag();
      return;
    }
    const hit = flattenSitemapPreorder(root).find((r) => r.id === dragId);
    if (!hit || hit.parentId !== parent.id) {
      clearDrag();
      return;
    }
    const ids = parent.children.map((c) => c.id);
    const rowEls = [...listRef.current.querySelectorAll<HTMLElement>(":scope > li > div[data-sitemap-row]")];
    const newIndex = insertionIndexFromPointerYForStrings(ids, rowEls, e.clientY, dragId);
    onPatchRoot(reorderSiblingToIndex(root, dragId, parent.id, newIndex));
    clearDrag();
  };

  if (parent.children.length === 0) {
    return null;
  }

  return (
    <ul
      ref={listRef}
      className="ml-1 flex flex-col gap-1 border-l border-[color:color-mix(in_srgb,var(--border)_70%,transparent)] pl-2"
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={(ev) => {
        const rel = ev.relatedTarget as Node | null;
        if (rel && ev.currentTarget.contains(rel)) {
          return;
        }
        setDropIdx(null);
      }}
    >
      {parent.children.map((child, ci) => (
        <li key={child.id} className="relative p-1">
          <TreeRow
            node={child}
            root={root}
            depth={depth}
            selectedId={selectedId}
            readOnly={readOnly}
            suggestions={suggestions}
            onPatchRoot={onPatchRoot}
            onSelect={onSelect}
            onAddChild={onAddChild}
            onDragStart={onDragStart}
            onDragEnd={clearDrag}
            insertBefore={dropIdx === ci}
          />
          {expanded.has(child.id) ? (
            <ChildUl
              parent={child}
              root={root}
              depth={depth + 1}
              expanded={expanded}
              selectedId={selectedId}
              readOnly={readOnly}
              suggestions={suggestions}
              onPatchRoot={onPatchRoot}
              onSelect={onSelect}
              onAddChild={onAddChild}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function RequirementsSitemapEditor({ content, readOnly, onChange }: Props) {
  const [expanded, setExpanded] = useState(() => collectExpandedDefault(content.root));
  const [selectedId, setSelectedId] = useState<string | null>(content.root.id);
  const [importOpen, setImportOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [pngBusy, setPngBusy] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [isPanningPreview, setIsPanningPreview] = useState(false);
  const [pendingFocusNodeId, setPendingFocusNodeId] = useState<string | null>(null);
  const [previewDiagramLayout, setPreviewDiagramLayout] = useState<SitemapPreviewDiagramLayout>("horizontal");
  const previewBodyRef = useRef<HTMLDivElement>(null);
  const previewViewportRef = useRef<HTMLDivElement>(null);
  const previewPanRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);

  useEffect(() => {
    setExpanded((prev) => {
      if (prev.has(content.root.id)) {
        return prev;
      }
      const n = new Set(prev);
      n.add(content.root.id);
      return n;
    });
  }, [content.root.id]);

  useEffect(() => {
    const viewport = previewViewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }, [previewDiagramLayout]);

  useEffect(() => {
    const exists = flattenSitemapPreorder(content.root).some((r) => r.id === selectedId);
    if (!exists) {
      setSelectedId(content.root.id);
    }
  }, [content.root, selectedId]);

  useLayoutEffect(() => {
    if (!pendingFocusNodeId) {
      return;
    }
    const exists = flattenSitemapPreorder(content.root).some((r) => r.id === pendingFocusNodeId);
    if (!exists) {
      return;
    }
    const el = document.querySelector<HTMLInputElement>(`[data-sitemap-screen-input="${CSS.escape(pendingFocusNodeId)}"]`);
    el?.focus();
    el?.select?.();
    setPendingFocusNodeId(null);
  }, [pendingFocusNodeId, content.root]);

  const suggestions = useMemo(() => collectSitemapLabelSuggestions(content.root), [content.root]);

  const onPatchRoot = useCallback(
    (nextRoot: SitemapNode) => {
      onChange({ ...content, schemaVersion: content.schemaVersion ?? 1, root: nextRoot });
    },
    [content, onChange],
  );

  const onAddChild = useCallback(
    (parentId: string) => {
      if (readOnly) {
        return;
      }
      const { root: next, newChildId } = addChildReturningNewId(content.root, parentId);
      if (!newChildId) {
        return;
      }
      onChange({ ...content, schemaVersion: content.schemaVersion ?? 1, root: next });
      setPendingFocusNodeId(newChildId);
      setExpanded((prev) => {
        const n = new Set(prev);
        n.add(parentId);
        return n;
      });
    },
    [content, onChange, readOnly],
  );

  const collapseThirdLevel = useCallback(() => {
    setExpanded((prev) => {
      const n = new Set(prev);
      n.add(content.root.id);
      for (const c of content.root.children) {
        n.delete(c.id);
      }
      return n;
    });
  }, [content.root.children, content.root.id]);

  const expandAll = useCallback(() => {
    setExpanded(collectExpandedDefault(content.root));
  }, [content.root]);

  const buildPreviewStandaloneHtml = (el: HTMLElement, title: string, forPrint: boolean) => `<!doctype html><html><head><meta charset="utf-8" /><title>${title}</title><style>
      @page { size: A4 landscape; margin: ${forPrint ? "0" : "12mm"}; }
      html, body { margin: 0; min-height: 100vh; padding: 12px; box-sizing: border-box; background: ${forPrint ? "#ffffff" : "#f8fafc"}; }
      body { display: flex; align-items: center; justify-content: center; }
      .preview-wrap { width: fit-content; border: ${forPrint ? "0" : "1px solid #cbd5e1"}; background: #fff; }
      @media print {
        html, body { min-height: auto; padding: 0; background: #fff; }
        .preview-wrap { width: 297mm; height: 210mm; overflow: hidden; border: 0; }
      }
    </style></head><body><div class="preview-wrap">${el.outerHTML}</div></body></html>`;

  const printPreview = () => {
    const el = previewBodyRef.current;
    if (!el) {
      return;
    }
    const html = buildPreviewStandaloneHtml(el, "Sitemap Print", true);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (!w) {
      URL.revokeObjectURL(url);
      return;
    }
    const onLoaded = () => {
      try {
        w.focus();
        w.print();
      } finally {
        w.removeEventListener("load", onLoaded);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    };
    w.addEventListener("load", onLoaded);
  };

  const openPreviewInNewTab = () => {
    const el = previewBodyRef.current;
    if (!el) {
      return;
    }
    const html = buildPreviewStandaloneHtml(el, "Sitemap Preview", false);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (!w) {
      URL.revokeObjectURL(url);
      return;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const zoomOut = () => setPreviewZoom((z) => Math.max(PREVIEW_ZOOM_MIN, Math.round((z - 0.1) * 10) / 10));
  const zoomIn = () => setPreviewZoom((z) => Math.min(PREVIEW_ZOOM_MAX, Math.round((z + 0.1) * 10) / 10));
  const zoomFitAll = () => {
    const viewport = previewViewportRef.current;
    if (!viewport) {
      setPreviewZoom(1);
      return;
    }
    const w = Math.max(1, viewport.clientWidth - 32);
    const h = Math.max(1, viewport.clientHeight - 32);
    const fit = Math.min(w / A4_LANDSCAPE_CANVAS_WIDTH, h / A4_LANDSCAPE_CANVAS_HEIGHT);
    const clamped = Math.max(PREVIEW_ZOOM_MIN, Math.min(PREVIEW_ZOOM_MAX, fit));
    setPreviewZoom(Math.round(clamped * 100) / 100);
  };

  const stopPreviewPanning = useCallback(() => {
    previewPanRef.current = null;
    setIsPanningPreview(false);
  }, []);

  const onPreviewPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) {
      return;
    }
    const viewport = previewViewportRef.current;
    if (!viewport) {
      return;
    }
    previewPanRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    setIsPanningPreview(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, []);

  const onPreviewPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const viewport = previewViewportRef.current;
    const pan = previewPanRef.current;
    if (!viewport || !pan) {
      return;
    }
    const dx = e.clientX - pan.startX;
    const dy = e.clientY - pan.startY;
    viewport.scrollLeft = pan.scrollLeft - dx;
    viewport.scrollTop = pan.scrollTop - dy;
  }, []);

  const onPreviewPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    stopPreviewPanning();
  }, [stopPreviewPanning]);

  const downloadPng = async () => {
    const el = previewBodyRef.current;
    if (!el) {
      return;
    }
    setPngBusy(true);
    try {
      if (typeof document !== "undefined" && "fonts" in document) {
        try {
          await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
        } catch {
          /* ignore */
        }
      }
      await waitNextFrame();
      await waitNextFrame();
      const dataUrl = await toPng(el, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#ffffff",
        width: el.scrollWidth,
        height: el.scrollHeight,
        style: {
          width: `${el.scrollWidth}px`,
          height: `${el.scrollHeight}px`,
          overflow: "visible",
        },
        filter: (node) => !node.classList?.contains("requirements-sitemap-page-break-guide"),
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "sitemap.png";
      a.click();
    } catch {
      /* ignore */
    } finally {
      setPngBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <RequirementsSitemapImportExcelDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        current={content}
        readOnly={readOnly}
        onApply={(next) => onChange(next)}
      />
      <RequirementsSitemapGeminiChatSheet
        open={chatOpen}
        onOpenChange={setChatOpen}
        current={content}
        readOnly={readOnly}
        onApply={(next) => onChange(next)}
      />

      <div className="requirements-sitemap-no-print flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm font-medium text-[var(--foreground)]">サイトマップ</p>
        <Button
          type="button"
          variant="default"
          size="sm"
          className="inline-flex items-center gap-1.5"
          disabled={readOnly}
          onClick={() => setImportOpen(true)}
        >
          <GeminiMarkIcon className="h-4 w-4 shrink-0" />
          Excel を取り込む
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          className="inline-flex items-center gap-1.5"
          disabled={readOnly}
          onClick={() => setChatOpen(true)}
        >
          <GeminiMarkIcon className="h-4 w-4 shrink-0" />
          Gemini で編集
        </Button>
        <Button type="button" variant="default" size="sm" onClick={printPreview}>
          印刷
        </Button>
        <Button type="button" variant="default" size="sm" disabled={pngBusy} onClick={() => void downloadPng()}>
          {pngBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "PNG"}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="requirements-sitemap-no-print space-y-2 rounded-lg border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] p-3">
          <Label>構造</Label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" disabled={readOnly} onClick={collapseThirdLevel}>
              3階層目を閉じる
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" disabled={readOnly} onClick={expandAll}>
              すべて開く
            </Button>
          </div>
          <div className="rounded-md border border-[color:color-mix(in_srgb,var(--border)_85%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)] p-2">
            <TreeRow
              node={content.root}
              root={content.root}
              depth={0}
              selectedId={selectedId}
              readOnly={readOnly}
              suggestions={suggestions}
              onPatchRoot={onPatchRoot}
              onSelect={setSelectedId}
              onAddChild={onAddChild}
              onDragStart={() => {}}
              onDragEnd={() => {}}
            />
            {expanded.has(content.root.id) ? (
              <ChildUl
                parent={content.root}
                root={content.root}
                depth={1}
                expanded={expanded}
                selectedId={selectedId}
                readOnly={readOnly}
                suggestions={suggestions}
                onPatchRoot={onPatchRoot}
                onSelect={setSelectedId}
                onAddChild={onAddChild}
              />
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <div className="requirements-sitemap-no-print flex min-w-0 flex-col gap-2">
            <Label className="text-sm font-medium leading-snug">プレビュー（印刷・PNG）</Label>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-[3.8rem] text-left text-xs text-[var(--muted)]">{Math.round(previewZoom * 100)}%</span>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={zoomOut} aria-label="縮小">
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={zoomIn} aria-label="拡大">
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={zoomFitAll}>
                全体
              </Button>
              <Label htmlFor="sitemap-preview-diagram-layout" className="text-xs text-[var(--muted)]">
                レイアウト
              </Label>
              <Select
                value={previewDiagramLayout}
                onValueChange={(v) => setPreviewDiagramLayout(v as SitemapPreviewDiagramLayout)}
              >
                <SelectTrigger id="sitemap-preview-diagram-layout" className="h-8 w-[min(100%,11rem)] max-w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="horizontal">水平（右方向）</SelectItem>
                  <SelectItem value="vertical">垂直（下方向）</SelectItem>
                </SelectContent>
              </Select>
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1" onClick={openPreviewInNewTab}>
                <Maximize2 className="h-3.5 w-3.5" />
                最大化
              </Button>
            </div>
          </div>
          <div
            ref={previewViewportRef}
            className="requirements-sitemap-print-root overflow-auto rounded-lg border border-slate-300 bg-slate-100/80 shadow-sm dark:bg-slate-900/40"
            onPointerDown={onPreviewPointerDown}
            onPointerMove={onPreviewPointerMove}
            onPointerUp={onPreviewPointerUp}
            onPointerCancel={stopPreviewPanning}
            onPointerLeave={stopPreviewPanning}
            style={{
              cursor: isPanningPreview ? "grabbing" : "grab",
              userSelect: isPanningPreview ? "none" : "auto",
              touchAction: "none",
            }}
          >
            <div className="box-border flex min-h-[32rem] w-full items-start justify-start p-4">
              <div style={{ width: `${A4_LANDSCAPE_CANVAS_WIDTH * previewZoom}px`, height: `${A4_LANDSCAPE_CANVAS_HEIGHT * previewZoom}px` }}>
                <div
                  style={{
                    width: `${A4_LANDSCAPE_CANVAS_WIDTH}px`,
                    height: `${A4_LANDSCAPE_CANVAS_HEIGHT}px`,
                    transform: `scale(${previewZoom})`,
                    transformOrigin: "top left",
                  }}
                >
                  <div
                    ref={previewBodyRef}
                    className="relative bg-white shadow-sm"
                    style={{
                      width: `${A4_LANDSCAPE_CANVAS_WIDTH}px`,
                      height: `${A4_LANDSCAPE_CANVAS_HEIGHT}px`,
                      overflow: "hidden",
                      border: "1px solid #cbd5e1",
                      boxSizing: "border-box",
                    }}
                  >
                    <PreviewSitemapCanvas root={content.root} diagramLayout={previewDiagramLayout} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
