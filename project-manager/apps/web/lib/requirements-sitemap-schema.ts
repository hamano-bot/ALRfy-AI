import { z } from "zod";
import { pruneSitemapNodePositions } from "@/lib/requirements-sitemap-positions";

/** ルートを第1階層と数えた最大深さ */
export const SITEMAP_MAX_DEPTH = 32;
/** ツリー内の総ノード数上限 */
export const SITEMAP_MAX_NODES = 200;

export type SitemapNode = {
  id: string;
  screenName: string;
  labels: string[];
  children: SitemapNode[];
};

export type SitemapNodePosition = { x: number; y: number };

/** フロー図の主軸方向（要件 JSON に保存） */
export type SitemapDiagramLayout = "horizontal" | "vertical";

export type RequirementsPageContentSitemap = {
  schemaVersion: number;
  root: SitemapNode;
  /** サイトマップ図のレイアウト。未指定時は UI 側で水平とみなす */
  diagramLayout?: SitemapDiagramLayout;
  /** React Flow 等で配置したノード左上座標（A4 プレビュー座標系）。ツリーとは別フィールド。 */
  nodePositions?: Record<string, SitemapNodePosition>;
};

const sitemapNodeSchema: z.ZodType<SitemapNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(128),
    screenName: z.string().max(128),
    labels: z.array(z.string().max(128)).max(24),
    children: z.array(sitemapNodeSchema).max(100),
  }),
);

const nodePositionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const sitemapContentSchema = z
  .object({
    schemaVersion: z.number().int().min(1).max(10).default(1),
    root: sitemapNodeSchema,
    diagramLayout: z.enum(["horizontal", "vertical"]).optional(),
    nodePositions: z.record(z.string().min(1).max(128), nodePositionSchema).optional(),
  })
  .strip()
  .superRefine((data, ctx) => {
    const { depth, count } = measureSitemapTree(data.root);
    if (depth > SITEMAP_MAX_DEPTH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `サイトマップの深さが上限（${SITEMAP_MAX_DEPTH}階層）を超えています。`,
        path: ["root"],
      });
    }
    if (count > SITEMAP_MAX_NODES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `サイトマップのノード数が上限（${SITEMAP_MAX_NODES}）を超えています。`,
        path: ["root"],
      });
    }
  });

export type SitemapContentParsed = z.infer<typeof sitemapContentSchema>;

function measureSitemapTree(root: SitemapNode): { depth: number; count: number } {
  let maxDepth = 0;
  let count = 0;
  const walk = (node: SitemapNode, level: number) => {
    count += 1;
    maxDepth = Math.max(maxDepth, level);
    for (const ch of node.children) {
      walk(ch, level + 1);
    }
  };
  walk(root, 1);
  return { depth: maxDepth, count };
}

function newNodeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 欠損 id を補填（再帰） */
export function ensureSitemapNodeIds(node: SitemapNode): SitemapNode {
  return {
    id: node.id?.trim() ? node.id : newNodeId(),
    screenName: typeof node.screenName === "string" ? node.screenName : "",
    labels: Array.isArray(node.labels) ? node.labels.map((s) => (typeof s === "string" ? s : "")) : [],
    children: (node.children ?? []).map((c) => ensureSitemapNodeIds(c)),
  };
}

export function ensureSitemapContentIds(content: RequirementsPageContentSitemap): RequirementsPageContentSitemap {
  const root = ensureSitemapNodeIds(content.root);
  const nodePositions = pruneSitemapNodePositions(root, content.nodePositions);
  return {
    schemaVersion: content.schemaVersion ?? 1,
    root,
    ...(content.diagramLayout === "horizontal" || content.diagramLayout === "vertical"
      ? { diagramLayout: content.diagramLayout }
      : {}),
    ...(nodePositions && Object.keys(nodePositions).length > 0 ? { nodePositions } : {}),
  };
}

export function safeParseSitemapContent(raw: unknown): { ok: true; data: RequirementsPageContentSitemap } | { ok: false; message: string } {
  const parsed = sitemapContentSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.errors.map((e) => e.message).join("；") || "スキーマ検証に失敗しました。";
    return { ok: false, message: msg };
  }
  return { ok: true, data: ensureSitemapContentIds(parsed.data) };
}

export function defaultSitemapContent(): RequirementsPageContentSitemap {
  return {
    schemaVersion: 1,
    root: {
      id: newNodeId(),
      screenName: "TOP",
      labels: [],
      children: [],
    },
  };
}

export type SitemapImportMergeMode = "replace" | "append";

export function mergeSitemapImport(
  mode: SitemapImportMergeMode,
  current: RequirementsPageContentSitemap,
  imported: RequirementsPageContentSitemap,
): RequirementsPageContentSitemap {
  const nextImported = ensureSitemapContentIds(imported);
  if (mode === "replace") {
    const diagramLayout = nextImported.diagramLayout ?? current.diagramLayout;
    return {
      schemaVersion: current.schemaVersion ?? 1,
      root: nextImported.root,
      ...(diagramLayout === "horizontal" || diagramLayout === "vertical" ? { diagramLayout } : {}),
      ...(nextImported.nodePositions && Object.keys(nextImported.nodePositions).length > 0
        ? { nodePositions: nextImported.nodePositions }
        : {}),
    };
  }
  const cur = ensureSitemapContentIds(current);
  const mergedRoot = {
    ...cur.root,
    children: [...cur.root.children, ...nextImported.root.children],
  };
  const nextPositions: Record<string, { x: number; y: number }> = {
    ...(cur.nodePositions ?? {}),
    ...(nextImported.nodePositions ?? {}),
  };
  const pruned = pruneSitemapNodePositions(mergedRoot, nextPositions);
  return {
    schemaVersion: cur.schemaVersion ?? 1,
    root: mergedRoot,
    ...(cur.diagramLayout === "horizontal" || cur.diagramLayout === "vertical" ? { diagramLayout: cur.diagramLayout } : {}),
    ...(pruned && Object.keys(pruned).length > 0 ? { nodePositions: pruned } : {}),
  };
}

/** 全ノードのラベル値を重複なしで収集（サジェスト用） */
export function collectSitemapLabelSuggestions(root: SitemapNode): string[] {
  const set = new Set<string>();
  const walk = (n: SitemapNode) => {
    for (const lab of n.labels) {
      const t = lab.trim();
      if (t !== "") {
        set.add(t);
      }
    }
    for (const c of n.children) {
      walk(c);
    }
  };
  walk(root);
  return [...set].sort((a, b) => a.localeCompare(b, "ja"));
}
