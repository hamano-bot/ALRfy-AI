import type { RequirementsPageContentSitemap, SitemapNode } from "@/lib/requirements-sitemap-schema";

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `sm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneNode(n: SitemapNode): SitemapNode {
  return {
    id: n.id,
    screenName: n.screenName,
    labels: [...n.labels],
    children: n.children.map(cloneNode),
  };
}

export function cloneSitemapContent(c: RequirementsPageContentSitemap): RequirementsPageContentSitemap {
  const base = {
    schemaVersion: c.schemaVersion ?? 1,
    root: cloneNode(c.root),
    ...(c.diagramLayout === "horizontal" || c.diagramLayout === "vertical" ? { diagramLayout: c.diagramLayout } : {}),
  };
  if (!c.nodePositions || Object.keys(c.nodePositions).length === 0) {
    return base;
  }
  return {
    ...base,
    nodePositions: Object.fromEntries(Object.entries(c.nodePositions).map(([k, v]) => [k, { x: v.x, y: v.y }])),
  };
}

export type SitemapFlatRow = {
  id: string;
  parentId: string | null;
  depth: number;
  screenName: string;
};

/** 先序でフラット化（各行 = 1 ノード） */
export function flattenSitemapPreorder(root: SitemapNode): SitemapFlatRow[] {
  const out: SitemapFlatRow[] = [];
  const walk = (n: SitemapNode, depth: number, parentId: string | null) => {
    out.push({
      id: n.id,
      parentId,
      depth,
      screenName: n.screenName,
    });
    for (const ch of n.children) {
      walk(ch, depth + 1, n.id);
    }
  };
  walk(root, 0, null);
  return out;
}

type Found = { parent: SitemapNode | null; index: number; node: SitemapNode };

function findInParent(parent: SitemapNode, id: string): Found | null {
  for (let i = 0; i < parent.children.length; i++) {
    if (parent.children[i].id === id) {
      return { parent, index: i, node: parent.children[i] };
    }
    const sub = findInParent(parent.children[i], id);
    if (sub) {
      return sub;
    }
  }
  return null;
}

export function findNode(root: SitemapNode, id: string): Found | null {
  if (root.id === id) {
    return { parent: null, index: -1, node: root };
  }
  return findInParent(root, id);
}

export function setNodeScreenName(root: SitemapNode, id: string, screenName: string): SitemapNode {
  const r = cloneNode(root);
  const hit = findNode(r, id);
  if (!hit) {
    return r;
  }
  hit.node.screenName = screenName;
  return r;
}

export function setNodeLabels(root: SitemapNode, id: string, labels: string[]): SitemapNode {
  const r = cloneNode(root);
  const hit = findNode(r, id);
  if (!hit) {
    return r;
  }
  hit.node.labels = [...labels];
  return r;
}

export function addChild(root: SitemapNode, parentId: string, screenName = "新規"): SitemapNode {
  return addChildReturningNewId(root, parentId, screenName).root;
}

/** 追加した子ノードの id を返す（フォーカス移動などに利用） */
export function addChildReturningNewId(
  root: SitemapNode,
  parentId: string,
  screenName = "新規",
): { root: SitemapNode; newChildId: string } {
  const r = cloneNode(root);
  const hit = findNode(r, parentId);
  if (!hit) {
    return { root: r, newChildId: "" };
  }
  const id = newId();
  hit.node.children.push({
    id,
    screenName,
    labels: [],
    children: [],
  });
  return { root: r, newChildId: id };
}

export function addSiblingAfter(root: SitemapNode, nodeId: string, screenName = "新規"): SitemapNode {
  const r = cloneNode(root);
  const hit = findNode(r, nodeId);
  if (!hit || hit.parent === null) {
    return r;
  }
  const insertAt = hit.index + 1;
  hit.parent.children.splice(insertAt, 0, {
    id: newId(),
    screenName,
    labels: [],
    children: [],
  });
  return r;
}

export function removeNode(root: SitemapNode, nodeId: string): SitemapNode {
  if (root.id === nodeId) {
    return root;
  }
  const r = cloneNode(root);
  const hit = findNode(r, nodeId);
  if (!hit || hit.parent === null) {
    return r;
  }
  hit.parent.children.splice(hit.index, 1);
  return r;
}

export function moveSibling(root: SitemapNode, nodeId: string, direction: "up" | "down"): SitemapNode {
  const r = cloneNode(root);
  const hit = findNode(r, nodeId);
  if (!hit || hit.parent === null) {
    return r;
  }
  const { parent, index } = hit;
  const j = direction === "up" ? index - 1 : index + 1;
  if (j < 0 || j >= parent.children.length) {
    return r;
  }
  const tmp = parent.children[index];
  parent.children[index] = parent.children[j];
  parent.children[j] = tmp;
  return r;
}

/**
 * 同一親の子リスト内で dragId を newIndex（drag を除いたリストでの挿入インデックス）へ移動。
 */
export function reorderSiblingToIndex(root: SitemapNode, dragId: string, parentId: string, newIndex: number): SitemapNode {
  const r = cloneNode(root);
  const parentNode = parentId === r.id ? r : findNode(r, parentId)?.node;
  if (!parentNode) {
    return r;
  }
  const dragHit = findNode(r, dragId);
  if (!dragHit || !dragHit.parent || dragHit.parent.id !== parentId) {
    return r;
  }
  const from = dragHit.index;
  const list = parentNode.children;
  const [item] = list.splice(from, 1);
  let ins = newIndex;
  if (from < ins) {
    ins -= 1;
  }
  ins = Math.max(0, Math.min(ins, list.length));
  list.splice(ins, 0, item);
  return r;
}
