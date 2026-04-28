"use client";

import {
  Background,
  Handle,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ZoomIn, ZoomOut } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, type CSSProperties, type MutableRefObject } from "react";
import { Button } from "@/app/components/ui/button";
import type { SitemapNode, SitemapNodePosition } from "@/lib/requirements-sitemap-schema";
import {
  A4_LANDSCAPE_CANVAS_HEIGHT,
  A4_LANDSCAPE_CANVAS_WIDTH,
  HORIZONTAL_LABEL_BOX_EXTRA_GAP_PX,
  HORIZONTAL_LABEL_OFFSET_TOP_PX,
  HORIZONTAL_NODE_INNER_TEXT_SCALE,
  horizontalSitemapSideHandleOffsetY,
  NODE_BOX_WIDTH_VERTICAL,
  previewSitemapScreenBoxBorderPx,
  previewSitemapScreenBoxRadiusPx,
  PREVIEW_BODY_LINE_HEIGHT,
  PREVIEW_SCREEN_BODY_MAX_LINES_HORIZONTAL,
  PREVIEW_SCREEN_BODY_MAX_LINES_VERTICAL,
  PREVIEW_SITEMAP_LABEL_LINE_HEIGHT,
  previewLabelToBoxGapPx,
  previewSitemapResolvedLabelFontPx,
  previewSitemapResolvedScreenFontPx,
  type SitemapPreviewDiagramLayout,
} from "@/lib/requirements-sitemap-layout";
import {
  buildSitemapFlowSnapshot,
  positionsFromRfNodes,
  type SitemapFlowNodeData,
} from "@/lib/requirements-sitemap-flow-graph";
import { cn } from "@/lib/utils";

const handleStyle: CSSProperties = {
  opacity: 0,
  width: 14,
  height: 14,
  border: "none",
  background: "transparent",
};

const SitemapFlowRfNode = memo(function SitemapFlowRfNode({ data }: NodeProps<Node<SitemapFlowNodeData>>) {
  const n = data.layoutNode;
  const diagramLayout = data.diagramLayout;
  const density = data.density;
  const labelOffsetTop = diagramLayout === "horizontal" ? HORIZONTAL_LABEL_OFFSET_TOP_PX : 0;
  const previewBoxBorderPx = previewSitemapScreenBoxBorderPx(data.scale);
  const previewBoxRadiusPx = previewSitemapScreenBoxRadiusPx(data.scale);
  const horizontalGapReduced =
    previewLabelToBoxGapPx(diagramLayout, n.w) -
    (diagramLayout === "horizontal" ? HORIZONTAL_LABEL_BOX_EXTRA_GAP_PX - density.horizontalExtraGapPx : 0);
  const labelToBoxGapPx = diagramLayout === "horizontal" ? Math.max(0, horizontalGapReduced) : Math.max(1, horizontalGapReduced);
  const resolvedLabelFontPx = previewSitemapResolvedLabelFontPx(
    n.labelFontPx,
    n.labelHeight,
    diagramLayout === "vertical" ? 2 : 1,
    density.minLabelFontPx,
  );
  const resolvedScreenFontPx = previewSitemapResolvedScreenFontPx(
    n.screenFontPx,
    n.boxHeight,
    diagramLayout === "vertical" ? PREVIEW_SCREEN_BODY_MAX_LINES_VERTICAL : PREVIEW_SCREEN_BODY_MAX_LINES_HORIZONTAL,
    density.minScreenFontPx,
  );
  const labelFontRenderPx =
    diagramLayout === "horizontal" ? Math.round(resolvedLabelFontPx * HORIZONTAL_NODE_INNER_TEXT_SCALE * 10) / 10 : resolvedLabelFontPx;
  const screenFontRenderPx =
    diagramLayout === "horizontal" ? Math.round(resolvedScreenFontPx * HORIZONTAL_NODE_INNER_TEXT_SCALE * 10) / 10 : resolvedScreenFontPx;
  const basePadY = Math.max(6, 8 * (n.w / NODE_BOX_WIDTH_VERTICAL));
  const basePadX = Math.max(8, 12 * (n.w / NODE_BOX_WIDTH_VERTICAL));
  const horizontalPaddingScale = diagramLayout === "horizontal" ? density.horizontalNodePaddingScale : 1;

  /** ラベル帯の下辺までの高さ（画面名ボックスの上辺＝外枠の起点） */
  const labelBlockHeight = n.labelHeight + labelOffsetTop + labelToBoxGapPx;
  const screenBoxTop = labelBlockHeight;
  const screenBoxBottom = labelBlockHeight + n.boxHeight;
  const screenBoxCenterX = n.w / 2;

  /**
   * 水平ツリー: target＝左辺の「縦の中点〜下端」の間、source＝右辺の同じ高さ。
   * 角丸下端の手前まで Y をクランプし、横線と枠の隙間を抑える。
   */
  const horizontalHandleY = screenBoxTop + horizontalSitemapSideHandleOffsetY(n.boxHeight, data.scale);
  const handleHorizontal = (
    <>
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        style={{
          ...handleStyle,
          left: 0,
          top: horizontalHandleY,
          transform: "translate(-50%, -50%)",
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={{
          ...handleStyle,
          right: 0,
          left: "auto",
          top: horizontalHandleY,
          transform: "translate(50%, -50%)",
        }}
      />
    </>
  );

  const handleVertical = (
    <>
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        style={{
          ...handleStyle,
          left: screenBoxCenterX,
          top: screenBoxTop,
          transform: "translate(-50%, -50%)",
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        style={{
          ...handleStyle,
          left: screenBoxCenterX,
          top: screenBoxBottom,
          transform: "translate(-50%, -50%)",
        }}
      />
    </>
  );

  return (
    <div className="sitemap-rf-node-inner" style={{ width: n.w, height: n.h, position: "relative" }}>
      {diagramLayout === "horizontal" ? handleHorizontal : handleVertical}
      {n.labelText ? (
        <div
          className="px-1 text-slate-500"
          style={{
            fontSize: `${labelFontRenderPx}px`,
            lineHeight: `${PREVIEW_SITEMAP_LABEL_LINE_HEIGHT}`,
            minHeight: `${n.labelHeight}px`,
            marginTop: `${labelOffsetTop}px`,
            marginBottom: `${labelToBoxGapPx}px`,
            maxWidth: "100%",
            overflow: "hidden",
            ...(diagramLayout === "vertical"
              ? {
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical" as const,
                  whiteSpace: "normal",
                  overflowWrap: "anywhere" as const,
                  wordBreak: "break-word" as const,
                  textOverflow: "clip",
                }
              : {
                  display: "block",
                  color: "#475569",
                  position: "relative",
                  zIndex: 2,
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }),
          }}
        >
          {n.labelText}
        </div>
      ) : (
        <div
          style={{
            minHeight: `${n.labelHeight + labelOffsetTop + labelToBoxGapPx}px`,
          }}
        />
      )}
      <div
        style={{
          borderRadius: `${previewBoxRadiusPx}px`,
          border: `${previewBoxBorderPx}px solid #1f2937`,
          boxSizing: "border-box",
          background: "#ffffff",
          color: "#0f172a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          fontWeight: 600,
          padding: `${Math.round(basePadY * horizontalPaddingScale)}px ${Math.round(basePadX * horizontalPaddingScale)}px`,
          height: `${n.boxHeight}px`,
          minHeight: `${n.boxHeight}px`,
          maxHeight: `${n.boxHeight}px`,
          fontSize: `${screenFontRenderPx}px`,
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
  );
});

const nodeTypes = { sitemapNode: SitemapFlowRfNode };

export type RequirementsSitemapFlowCanvasProps = {
  root: SitemapNode;
  diagramLayout: SitemapPreviewDiagramLayout;
  nodePositions?: Record<string, SitemapNodePosition>;
  readOnly: boolean;
  /** Persisted after user finishes dragging a node */
  onNodePositionsCommit?: (next: Record<string, SitemapNodePosition>) => void;
  /** 別タブ編集などで React Flow 右上の ± ズームツールを出さない */
  showRfZoomToolbar?: boolean;
  /** 背景ドットグリッドの表示切替（print-preview では false を推奨） */
  showDotGrid?: boolean;
  className?: string;
};

function SitemapFlowToolbar() {
  const { zoomIn, zoomOut } = useReactFlow();
  return (
    <Panel position="top-right" className="requirements-sitemap-no-print sitemap-flow-toolbar-panel m-2">
      <div
        className="sitemap-flow-toolbar-panel flex items-center gap-0.5 rounded-lg border border-slate-300/90 bg-white/95 p-1 shadow-md backdrop-blur-sm dark:border-slate-600 dark:bg-slate-900/90"
        role="toolbar"
        aria-label="サイトマップ図の操作"
      >
        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => zoomIn()} aria-label="ズームイン">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => zoomOut()} aria-label="ズームアウト">
          <ZoomOut className="h-4 w-4" />
        </Button>
      </div>
    </Panel>
  );
}

function SitemapDragCommitBridge({
  dragStopRef,
  onNodePositionsCommit,
  readOnly,
}: {
  dragStopRef: MutableRefObject<() => void>;
  onNodePositionsCommit?: (next: Record<string, SitemapNodePosition>) => void;
  readOnly: boolean;
}) {
  const { getNodes } = useReactFlow();
  useEffect(() => {
    dragStopRef.current = () => {
      if (readOnly || !onNodePositionsCommit) {
        return;
      }
      onNodePositionsCommit(positionsFromRfNodes(getNodes()));
    };
  }, [dragStopRef, getNodes, onNodePositionsCommit, readOnly]);
  return null;
}

function RequirementsSitemapFlowCanvasInner({
  root,
  diagramLayout,
  nodePositions,
  readOnly,
  onNodePositionsCommit,
  showRfZoomToolbar = true,
  showDotGrid = !readOnly,
  className,
}: RequirementsSitemapFlowCanvasProps) {
  const snapshot = useMemo(
    () => buildSitemapFlowSnapshot(root, diagramLayout, nodePositions, readOnly),
    [root, diagramLayout, nodePositions, readOnly],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(snapshot.nodes);
  const [edges, setEdges] = useEdgesState(snapshot.edges);
  const dragStopRef = useRef<() => void>(() => {});

  useEffect(() => {
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
  }, [snapshot, setNodes, setEdges]);

  const onNodeDragStop = useCallback(() => {
    dragStopRef.current();
  }, []);

  return (
    <div
      className={cn("sitemap-flow-canvas-host", className)}
      data-sitemap-flow-export
      style={{
        width: A4_LANDSCAPE_CANVAS_WIDTH,
        height: A4_LANDSCAPE_CANVAS_HEIGHT,
        background: "#ffffff",
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        nodesConnectable={false}
        nodesDraggable={!readOnly}
        elementsSelectable={!readOnly}
        edgesFocusable={false}
        defaultEdgeOptions={{
          type: "smoothstep",
          style: { stroke: "#475569", strokeWidth: 1 },
          interactionWidth: 20,
        }}
        panOnScroll
        zoomOnScroll
        zoomOnPinch
        snapToGrid={!readOnly}
        snapGrid={[16, 16]}
        minZoom={0.25}
        maxZoom={2}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        proOptions={{ hideAttribution: true }}
        fitView={false}
        elevateEdgesOnSelect
        style={{ width: "100%", height: "100%" }}
      >
        <SitemapDragCommitBridge
          dragStopRef={dragStopRef}
          onNodePositionsCommit={onNodePositionsCommit}
          readOnly={readOnly}
        />
        {showDotGrid ? <Background gap={16} color="#e2e8f0" /> : null}
        {!readOnly && showRfZoomToolbar ? <SitemapFlowToolbar /> : null}
      </ReactFlow>
    </div>
  );
}

export function RequirementsSitemapFlowCanvas(props: RequirementsSitemapFlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <RequirementsSitemapFlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
