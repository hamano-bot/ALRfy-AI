"use client";

import { Button } from "@/app/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type WorkspacePanelPos = { x: number; y: number };

function clampPos(x: number, y: number, panelW: number, panelH: number): WorkspacePanelPos {
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - panelW - margin);
  const maxY = Math.max(margin, window.innerHeight - Math.min(panelH, 120) - margin);
  return {
    x: Math.min(Math.max(margin, x), maxX),
    y: Math.min(Math.max(margin, y), maxY),
  };
}

type DraggableCollapsiblePanelProps = {
  title: string;
  width: number;
  /** max height of scrollable body (CSS) */
  bodyMaxHeight: string;
  initialPosition: WorkspacePanelPos;
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  children: ReactNode;
  className?: string;
};

/**
 * 別タブサイトマップ: 階層用。ヘッダーをドラッグで移動、＜で折りたたみ、＞ストリップで再表示。
 */
export function SitemapWorkspaceDraggableHierarchyPanel({
  title,
  width,
  bodyMaxHeight,
  initialPosition,
  expanded,
  onExpandedChange,
  children,
  className,
}: DraggableCollapsiblePanelProps) {
  const [pos, setPos] = useState(initialPosition);
  const dragRef = useRef<{ startClientX: number; startClientY: number; startX: number; startY: number } | null>(null);

  const onDragPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) {
        return;
      }
      const dx = e.clientX - d.startClientX;
      const dy = e.clientY - d.startClientY;
      const next = clampPos(d.startX + dx, d.startY + dy, width, 400);
      setPos(next);
    },
    [width],
  );

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  }, []);

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) {
      return;
    }
    const t = e.target as HTMLElement;
    if (t.closest("button") || t.closest("a") || t.closest('[role="combobox"]')) {
      return;
    }
    dragRef.current = { startClientX: e.clientX, startClientY: e.clientY, startX: pos.x, startY: pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  if (!expanded) {
    return (
      <div className={cn("pointer-events-auto fixed left-2 top-1/2 z-[80] -translate-y-1/2", className)}>
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-10 w-9 border border-[color:color-mix(in_srgb,var(--border)_80%,transparent)] p-0 shadow-lg"
          aria-expanded={false}
          aria-label={`${title}を開く`}
          onClick={() => onExpandedChange(true)}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "pointer-events-auto fixed z-[80] flex flex-col overflow-hidden rounded-xl border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)] shadow-xl backdrop-blur-sm",
        className,
      )}
      style={{ left: pos.x, top: pos.y, width }}
    >
      <div
        className="flex shrink-0 cursor-grab items-center gap-1.5 border-b border-[color:color-mix(in_srgb,var(--border)_80%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_98%,transparent)] px-2 py-1.5 active:cursor-grabbing"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <GripVertical className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden />
        <span className="min-w-0 flex-1 text-xs font-semibold text-[var(--foreground)]">{title}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 p-0"
          aria-expanded
          aria-label={`${title}を折りたたむ`}
          onClick={(ev) => {
            ev.stopPropagation();
            onExpandedChange(false);
          }}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      <div className="modern-scrollbar min-h-0 overflow-y-auto p-2" style={{ maxHeight: bodyMaxHeight }}>
        {children}
      </div>
    </div>
  );
}

type DraggableToolbarPanelProps = {
  title: string;
  initialPosition: WorkspacePanelPos;
  children: ReactNode;
  className?: string;
};

/** 別タブサイトマップ: 操作ボタン用フローティングバー（ドラッグ可） */
export function SitemapWorkspaceDraggableToolbarPanel({ title, initialPosition, children, className }: DraggableToolbarPanelProps) {
  const [pos, setPos] = useState(initialPosition);
  const dragRef = useRef<{ startClientX: number; startClientY: number; startX: number; startY: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const didCenterRef = useRef(false);

  useLayoutEffect(() => {
    if (didCenterRef.current) {
      return;
    }
    didCenterRef.current = true;
    const w = ref.current?.offsetWidth ?? 400;
    setPos((p) => ({ x: Math.max(8, Math.floor((window.innerWidth - w) / 2)), y: p.y }));
  }, []);

  const onDragPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) {
      return;
    }
    const el = ref.current;
    const w = el?.offsetWidth ?? 360;
    const h = el?.offsetHeight ?? 56;
    const dx = e.clientX - d.startClientX;
    const dy = e.clientY - d.startClientY;
    setPos(clampPos(d.startX + dx, d.startY + dy, w, h));
  }, []);

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  }, []);

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) {
      return;
    }
    const t = e.target as HTMLElement;
    if (t.closest("button") || t.closest("a") || t.closest('[role="combobox"]')) {
      return;
    }
    dragRef.current = { startClientX: e.clientX, startClientY: e.clientY, startX: pos.x, startY: pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  return (
    <div
      ref={ref}
      className={cn(
        "pointer-events-auto fixed z-[80] max-w-[min(100vw-16px,36rem)] rounded-xl border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)] shadow-xl backdrop-blur-sm",
        className,
      )}
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="flex cursor-grab items-center gap-1.5 border-b border-[color:color-mix(in_srgb,var(--border)_80%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_98%,transparent)] px-2 py-1 active:cursor-grabbing"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <GripVertical className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden />
        <span className="text-xs font-semibold text-[var(--foreground)]">{title}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 p-2">{children}</div>
    </div>
  );
}
