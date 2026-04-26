"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type RefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, accentButtonSurfaceBaseClassName } from "@/app/components/ui/button";
import { Input, inputBaseClassName } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Card, CardContent } from "@/app/components/ui/card";
import { ScrollPanel } from "@/app/components/ui/scroll-panel";
import { AccessControlTable, type AccessControlRow } from "@/app/components/AccessControlTable";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/app/components/ui/dropdown-menu";
import { BookTemplate, ChevronLeft, FileText, GripVertical, Lock, LockOpen, Redo2, Trash2, Undo2, X } from "lucide-react";
import { PortalAppIcon } from "@/app/lib/portal-app-icons";
import { ThemeDateField } from "@/app/components/ThemeDateField";
import { buildEstimateExportBasename } from "@/lib/estimate-export-filename";
import {
  computeEstimateLineAmount,
  countEstimateHtmlExportRowBudget,
  ESTIMATE_A4_HTML_EXPORT_ROW_BUDGET,
} from "@/lib/portal-estimate";
import {
  detailIndicesInSameMajorBlock,
  getLinePriceCalcKind,
  sumCodingLineAmountsInIndices,
} from "@/lib/estimate-line-price-calc";
import { readEstimateTotalsDockCookie, writeEstimateTotalsDockCookie } from "@/lib/estimate-totals-dock-cookie";
import { estimatePrintPreviewChannelName } from "@/lib/estimate-print-preview-channel";
import {
  findOtherMajorBlock,
  segmentVisibleMajorBlocksForProgressFee,
  sumCheckedDetailLineAmounts,
} from "@/lib/estimate-progress-fee-modal";
import { trashDeleteIconButtonClassName } from "@/lib/trash-delete-icon-button-class";
import { cn } from "@/lib/utils";
import { HearingAutoTextarea } from "@/app/project-list/[projectId]/hearing/HearingAutoTextarea";
import {
  PORTAL_THEMED_SUGGEST_MUTED,
  PORTAL_THEMED_SUGGEST_PANEL,
  PORTAL_THEMED_SUGGEST_ROW,
} from "@/lib/portal-themed-suggest-classes";

type EstimateLine = {
  id?: number;
  sort_order?: number;
  major_category?: string | null;
  category?: string | null;
  item_code?: string | null;
  item_name: string;
  quantity: number;
  unit_type: "person_month" | "person_day" | "set" | "page" | "times" | "percent" | "monthly_fee" | "annual_fee";
  unit_price: number;
  factor: number;
  line_amount?: number;
};

type EstimateEditorClientProps = {
  estimateId?: number;
};

/** Phase1 設計の大項目候補（大項目行の見出し・明細の major_category の初期値に使用） */
const ESTIMATE_MAJOR_CATEGORIES = [
  "要件定義/設計",
  "SITEMANAGEライセンス",
  "公開側制作",
  "開発",
  "その他",
] as const;

/** DB/Zod 上は通常行だが、UI では1セル見出しの親行として扱う（item_name は見出しと同一文字列を保持） */
const ESTIMATE_MAJOR_LINE_ITEM_CODE = "__ESTIMATE_MAJOR__";

/** 行追加で作る空明細。大項目と区別するため item_name が空でも legacy 見出し行にしない */
const ESTIMATE_MANUAL_DETAIL_LINE_ITEM_CODE = "__ESTIMATE_MANUAL_DETAIL__";

const ESTIMATE_OTHER_MAJOR_LABEL = "その他";
const PROGRESS_FEE_ITEM_NAME = "進行管理費";

function downloadFilenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*UTF-8''([^;\s]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].replace(/^"+|"+$/g, ""));
    } catch {
      return star[1];
    }
  }
  const q = /filename\s*=\s*"([^"]+)"/i.exec(header);
  if (q?.[1]) return q[1];
  const plain = /filename\s*=\s*([^;\s]+)/i.exec(header);
  return plain?.[1]?.replace(/^"+|"+$/g, "") ?? null;
}

/** 新規見積の備考欄初期値（編集時は API 取得値で上書き） */
const DEFAULT_NEW_ESTIMATE_REMARKS = [
  "・当御見積書の有効期限は、発行日より1ヶ月間です。",
  "・当御見積書に記載のない作業、および仕様の変更が発生した場合は、内容を協議の上、別途御見積書いたします。",
  "・サーバー費用、および納品後の保守・運用費用は当御見積書には含まれておりません。",
  "・有料素材は原則としてAdobe Stockより選定いたします。他のサービスをご希望の場合は、別途費用が発生することがございます。",
  "・納品物の契約不適合責任（瑕疵担保責任）期間は、検収完了日から6ヶ月間といたします。",
].join("\n");

/** 左ペイン縦スクロール（ScrollPanel）に対して明細 thead を固定。横スクロール専用ラッパーは overflow-y:visible で縦スクロール祖先を切らない */
const estimateLinesStickyThClass =
  "sticky top-0 z-[30] bg-[var(--surface)] shadow-[0_1px_0_0_color-mix(in_srgb,var(--border)_88%,transparent)]";

/** 日本語入力を想定（IME オン・全角ひらがな寄りは OS/IME 依存。lang + ime-mode が一般的なヒント） */
const estimateJapaneseLineTextFieldClass = "[ime-mode:active]";

function isMajorHeadingLine(line: Pick<EstimateLine, "item_code" | "item_name" | "major_category">): boolean {
  if (line.item_code === ESTIMATE_MAJOR_LINE_ITEM_CODE) return true;
  if (line.item_code === ESTIMATE_MANUAL_DETAIL_LINE_ITEM_CODE) return false;
  const major = String(line.major_category ?? "").trim();
  if (!major) return false;
  return String(line.item_name ?? "").trim() === "" && (line.item_code == null || line.item_code === "");
}

/** ヒアリングシートの並び替えと同じ挿入インデックス（ドラッグ行を除いた配列上の位置） */
function insertionIndexFromPointerYForStrings(
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

function reorderEstimateLinesByInsertion(lines: EstimateLine[], fromIndex: number, newIndex: number): EstimateLine[] {
  const moved = lines[fromIndex];
  if (!moved) {
    return lines;
  }
  const without = [...lines.slice(0, fromIndex), ...lines.slice(fromIndex + 1)];
  const i = Math.max(0, Math.min(newIndex, without.length));
  return [...without.slice(0, i), moved, ...without.slice(i)];
}

/** ネイティブ number の上下スピナーを非表示（手入力のみ） */
const noNumberInputSpinnerClass =
  "[appearance:textfield] [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

function normalizeLoadedEstimateLine(line: any): EstimateLine {
  const majorRaw = line.major_category != null ? String(line.major_category).trim() : "";
  const major = majorRaw !== "" ? majorRaw : null;
  const rawCode = line.item_code != null && String(line.item_code).trim() !== "" ? String(line.item_code).trim() : null;
  const itemName = String(line.item_name ?? "");
  const legacyMajor = major != null && itemName.trim() === "" && (rawCode == null || rawCode === "");
  const item_code = legacyMajor || rawCode === ESTIMATE_MAJOR_LINE_ITEM_CODE ? ESTIMATE_MAJOR_LINE_ITEM_CODE : rawCode;
  const resolvedName =
    item_code === ESTIMATE_MAJOR_LINE_ITEM_CODE ? (itemName.trim() !== "" ? itemName.trim() : major ?? "大項目") : itemName;
  const isMajorRow = item_code === ESTIMATE_MAJOR_LINE_ITEM_CODE;
  const major_category = isMajorRow ? major ?? resolvedName : major;
  const catTrim = line.category != null ? String(line.category).trim() : "";
  const category = isMajorRow ? (catTrim !== "" ? catTrim : major_category) : catTrim !== "" ? catTrim : null;
  return {
    id: line.id != null ? Number(line.id) : undefined,
    sort_order: line.sort_order != null ? Number(line.sort_order) : undefined,
    major_category,
    category,
    item_code,
    item_name: resolvedName,
    quantity: Number(line.quantity ?? 0),
    unit_type: (line.unit_type as EstimateLine["unit_type"]) ?? "set",
    unit_price: Number(line.unit_price ?? 0),
    factor: Number(line.factor ?? 1),
    line_amount: line.line_amount != null ? Number(line.line_amount) : undefined,
  };
}

function emptyLine(): EstimateLine {
  return {
    item_name: "",
    quantity: 0,
    unit_type: "set",
    unit_price: 0,
    factor: 1,
  };
}

function snapshotLineForPersist(l: EstimateLine) {
  return {
    id: l.id,
    sort_order: l.sort_order,
    major_category: l.major_category,
    category: l.category,
    item_code: l.item_code,
    item_name: l.item_name,
    quantity: l.quantity,
    unit_type: l.unit_type,
    unit_price: l.unit_price,
    factor: l.factor,
    line_amount: l.line_amount,
  };
}

function estimatePersistSnapshotJson(input: {
  title: string;
  estimate_status: string;
  client_name: string | null;
  client_abbr: string | null;
  recipient_text: string | null;
  remarks: string | null;
  issue_date: string;
  delivery_due_text: string | null;
  internal_memo: string | null;
  is_rough_estimate: boolean;
  applied_tax_rate_percent: number;
  sales_user_id: number | null;
  lines: EstimateLine[];
}): string {
  return JSON.stringify({
    title: input.title,
    estimate_status: input.estimate_status,
    client_name: input.client_name,
    client_abbr: input.client_abbr,
    recipient_text: input.recipient_text,
    remarks: input.remarks,
    issue_date: input.issue_date,
    delivery_due_text: input.delivery_due_text,
    internal_memo: input.internal_memo,
    is_rough_estimate: input.is_rough_estimate,
    applied_tax_rate_percent: input.applied_tax_rate_percent,
    sales_user_id: input.sales_user_id,
    lines: input.lines.map(snapshotLineForPersist),
  });
}

function estimatePersistSnapshotFromLoadedApi(e: Record<string, unknown>): string {
  const lines =
    Array.isArray(e.lines) && e.lines.length > 0
      ? (e.lines as unknown[]).map((line) => normalizeLoadedEstimateLine(line))
      : [emptyLine()];
  const rawSid = e.sales_user_id;
  const sid =
    rawSid != null && rawSid !== "" && Number.isFinite(Number(rawSid)) && Number(rawSid) > 0 ? Number(rawSid) : null;
  const st = e.estimate_status;
  const estimateStatus =
    typeof st === "string" && (st === "draft" || st === "submitted" || st === "won" || st === "lost")
      ? (st as "draft" | "submitted" | "won" | "lost")
      : "draft";
  const cabRaw = e.client_abbr;
  const clientAbbr =
    typeof cabRaw === "string" && cabRaw.trim() !== "" ? cabRaw.trim().slice(0, 64) : null;
  return estimatePersistSnapshotJson({
    title: String(e.title ?? ""),
    estimate_status: estimateStatus,
    client_name: typeof e.client_name === "string" && e.client_name.trim() !== "" ? e.client_name.trim() : null,
    client_abbr: clientAbbr,
    recipient_text: typeof e.recipient_text === "string" && e.recipient_text.trim() !== "" ? e.recipient_text : null,
    remarks: typeof e.remarks === "string" && e.remarks.trim() !== "" ? e.remarks : null,
    issue_date: String(e.issue_date ?? "").slice(0, 10),
    delivery_due_text: (() => {
      const raw = String(e.delivery_due_text ?? "").trim();
      const display = raw !== "" ? raw : "要相談";
      return display.trim() !== "" ? display.trim() : null;
    })(),
    internal_memo: typeof e.internal_memo === "string" && e.internal_memo.trim() !== "" ? e.internal_memo : null,
    is_rough_estimate: Number(e.is_rough_estimate ?? 0) === 1,
    applied_tax_rate_percent: Number(e.applied_tax_rate_percent ?? 10),
    sales_user_id: sid,
    lines,
  });
}

function pingEstimatePrintPreview(estimateId: number): void {
  try {
    const c = new BroadcastChannel(estimatePrintPreviewChannelName(estimateId));
    c.postMessage({ type: "refresh" as const });
    c.close();
  } catch {
    /* BroadcastChannel 非対応環境 */
  }
}

function buildAssigneeLabelFromUserParts(id: number, displayName?: string | null, email?: string | null): string {
  const dn = typeof displayName === "string" ? displayName.trim() : "";
  const em = typeof email === "string" ? email.trim() : "";
  const base = dn !== "" ? dn : em !== "" ? em : `user#${id}`;
  return `${base} (user#${id})`;
}

function parseAssigneeInputToUserId(raw: string, rows: Array<{ id: number; label: string }>): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const m = t.match(/\(user#(\d+)\)\s*$/);
  if (m) {
    const id = Number(m[1]);
    if (Number.isFinite(id) && id > 0) return id;
  }
  const exact = rows.find((r) => r.label === t);
  if (exact) return exact.id;
  const byPrefix = rows.find((r) => r.label.startsWith(t + " (user#"));
  if (byPrefix) return byPrefix.id;
  return null;
}

function splitAssigneeLabelForSuggest(label: string): { primary: string; secondary: string } {
  const m = label.match(/^(.*)\s*\(user#(\d+)\)\s*$/);
  if (m) {
    return { primary: m[1].trim() || label, secondary: `(user#${m[2]})` };
  }
  return { primary: label, secondary: "" };
}

function useMousedownOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        onOutside();
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [active, onOutside, ref]);
}

function filterItemNameSuggestions(
  items: Array<{ value: string; from: "standard" | "history" }>,
  query: string,
): Array<{ value: string; from: "standard" | "history"; display: string }> {
  const q = query.trim().toLowerCase();
  const out: Array<{ value: string; from: "standard" | "history"; display: string }> = [];
  for (const s of items) {
    const display = s.value.trim();
    if (q === "" || display.toLowerCase().includes(q)) {
      out.push({ ...s, display });
      if (out.length >= 50) break;
    }
  }
  return out;
}

type EstimateTemplateListRow = {
  id: string;
  name: string;
  scope: string;
  created_by_user_id: number;
  locked: boolean;
  header_json: string;
  lines_json: string;
  created_at: string;
  updated_at: string;
  creator_email: string;
  creator_display_name: string | null;
};

function findEstimateTemplateDuplicate(
  templates: EstimateTemplateListRow[],
  name: string,
  scope: "private" | "shared",
  currentUserId: number | null,
): EstimateTemplateListRow | undefined {
  const n = name.trim();
  if (!n) return undefined;
  return templates.find((t) => {
    if (t.name.trim() !== n) return false;
    if (scope === "private") {
      return t.scope === "private" && currentUserId != null && t.created_by_user_id === currentUserId;
    }
    return t.scope === "shared";
  });
}

function EstimateTemplateDropdownCard({
  t,
  loading,
  disableTemplateLoad,
  currentUserId,
  isAdminMe,
  templateActionBusyId,
  templateDeleteBusy,
  showScopeChip,
  onDelete,
  onLoad,
  onToggleLock,
}: {
  t: EstimateTemplateListRow;
  loading: boolean;
  /** 見積が下書き以外のときテンプレ読込で本文を上書きしない */
  disableTemplateLoad?: boolean;
  currentUserId: number | null;
  isAdminMe: boolean;
  templateActionBusyId: string | null;
  templateDeleteBusy: boolean;
  showScopeChip: boolean;
  onDelete: (id: string, name: string) => void;
  onLoad: (id: string) => void;
  onToggleLock: () => void;
}) {
  const badge = t.scope === "shared" ? "全体" : "自分";
  const isCreator = currentUserId !== null && t.created_by_user_id === currentUserId;
  const busy = templateActionBusyId === t.id;
  const creatorName = (t.creator_display_name ?? "").trim() || t.creator_email;
  const meta = `${creatorName} · ${(t.updated_at || "").slice(0, 10)}`;
  const canManageRow = t.scope === "shared" ? isAdminMe : isCreator;
  return (
    <div className="rounded-lg border border-[color:color-mix(in_srgb,var(--border)_80%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_94%,transparent)] p-2">
      <div className="rounded-md border border-transparent px-1 py-1 text-left text-[11px] leading-tight text-[var(--muted)]">
        <span className="font-medium text-[var(--foreground)]">{t.name}</span>
        {showScopeChip ? (
          <span className="ml-1 rounded bg-[color:color-mix(in_srgb,var(--surface-soft)_90%,transparent)] px-1">{badge}</span>
        ) : null}
        {t.locked ? <Lock className="ml-1 inline h-3 w-3 align-middle text-[var(--muted)]" aria-label="ロック済み" /> : null}
        <br />
        <span className="break-all">{meta}</span>
      </div>
      <div className="mt-1 flex items-center gap-1">
        {canManageRow ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-red-600 hover:text-red-500"
              title={t.locked ? "ロック中は削除できません" : "削除"}
              disabled={busy || templateDeleteBusy || t.locked}
              onClick={() => onDelete(t.id, t.name)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" title={t.locked ? "ロック解除" : "ロックする"} disabled={busy} onClick={onToggleLock}>
              {t.locked ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </Button>
          </>
        ) : null}
        <Button
          type="button"
          size="sm"
          className="ml-auto h-7 px-2"
          disabled={loading || busy || disableTemplateLoad}
          onClick={() => onLoad(t.id)}
        >
          読込
        </Button>
      </div>
    </div>
  );
}

const ESTIMATE_STATUSES = new Set(["draft", "submitted", "won", "lost"]);

/** 見積番号末尾の 4 桁連番（例: …_0002） */
function estimateNumberTailSequence(estimateNumber: string): string | null {
  const m = estimateNumber.trim().match(/_(\d{4})$/);
  return m ? m[1] : null;
}

function deliveryDueTextFromRaw(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim();
  return t !== "" ? t : "要相談";
}

function applyHeaderJsonToEstimateFields(
  header: unknown,
  apply: {
    setTitle: (v: string) => void;
    setEstimateStatus: (v: "draft" | "submitted" | "won" | "lost") => void;
    setClientName: (v: string) => void;
    setClientAbbr?: (v: string) => void;
    setRecipientText: (v: string) => void;
    setRemarks: (v: string) => void;
    setIssueDate: (v: string) => void;
    setSalesUserId?: (v: number | null) => void;
    setSalesAssigneeInput?: (v: string) => void;
    applyDeliveryDueRaw?: (raw: string | null | undefined) => void;
  },
) {
  if (!header || typeof header !== "object") return;
  const h = header as Record<string, unknown>;
  if (typeof h.title === "string") apply.setTitle(h.title);
  const st = h.estimate_status;
  if (typeof st === "string" && ESTIMATE_STATUSES.has(st)) {
    apply.setEstimateStatus(st as "draft" | "submitted" | "won" | "lost");
  }
  if (typeof h.client_name === "string") apply.setClientName(h.client_name);
  else if (h.client_name === null) apply.setClientName("");
  if (apply.setClientAbbr) {
    if (Object.prototype.hasOwnProperty.call(h, "client_abbr")) {
      if (typeof h.client_abbr === "string") apply.setClientAbbr(h.client_abbr);
      else if (h.client_abbr === null) apply.setClientAbbr("");
    } else {
      apply.setClientAbbr("");
    }
  }
  if (typeof h.recipient_text === "string") apply.setRecipientText(h.recipient_text);
  else if (h.recipient_text === null) apply.setRecipientText("");
  if (typeof h.remarks === "string") apply.setRemarks(h.remarks);
  else if (h.remarks === null) apply.setRemarks("");
  if (typeof h.issue_date === "string" && /^\d{4}-\d{2}-\d{2}/.test(h.issue_date)) {
    apply.setIssueDate(h.issue_date.slice(0, 10));
  }
  if (apply.applyDeliveryDueRaw && Object.prototype.hasOwnProperty.call(h, "delivery_due_text")) {
    const d = h.delivery_due_text;
    apply.applyDeliveryDueRaw(typeof d === "string" || d === null ? (d as string | null) : undefined);
  }
  if (apply.setSalesUserId && Object.prototype.hasOwnProperty.call(h, "sales_user_id")) {
    const raw = h.sales_user_id;
    if (raw === null || raw === undefined || raw === "") {
      apply.setSalesUserId(null);
      apply.setSalesAssigneeInput?.("");
    } else {
      const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
      if (Number.isFinite(n) && n > 0) {
        apply.setSalesUserId(n);
      } else {
        apply.setSalesUserId(null);
        apply.setSalesAssigneeInput?.("");
      }
    }
  }
}

function estimateLineHasMeaningfulContent(line: EstimateLine): boolean {
  if (isMajorHeadingLine(line)) return true;
  if (line.item_name.trim() !== "") return true;
  if (line.quantity !== 0) return true;
  if (line.unit_price !== 0) return true;
  if ((line.factor ?? 1) !== 1) return true;
  return false;
}

function estimateEditorShouldWarnBeforeTemplateLoad(input: {
  estimateId?: number;
  lines: EstimateLine[];
  title: string;
  clientName: string;
  clientAbbr: string;
  recipientText: string;
  internalMemo: string;
  remarks: string;
  defaultNewRemarks: string;
}): boolean {
  if (input.lines.length > 1) return true;
  if (input.lines.some(estimateLineHasMeaningfulContent)) return true;
  if (
    input.clientName.trim() !== "" ||
    input.clientAbbr.trim() !== "" ||
    input.recipientText.trim() !== "" ||
    input.internalMemo.trim() !== ""
  )
    return true;
  if (input.estimateId) {
    if (input.title.trim() !== "") return true;
    if (input.remarks.trim() !== "") return true;
  } else {
    if (input.title.trim() !== "" && input.title.trim() !== "新規見積") return true;
    if (input.remarks.trim() !== input.defaultNewRemarks.trim()) return true;
  }
  return false;
}

export function EstimateEditorClient({ estimateId }: EstimateEditorClientProps) {
  const router = useRouter();
  const [title, setTitle] = useState("新規見積");
  const [estimateStatus, setEstimateStatus] = useState<"draft" | "submitted" | "won" | "lost">("draft");
  const [clientName, setClientName] = useState("");
  const [clientAbbr, setClientAbbr] = useState("");
  /** 略称をクライアント名からのルックアップで上書きしてよいとき true（略称を手入力したら false。空に戻すと再び true） */
  const abbrLinkedToNameRef = useRef(true);
  const clientAbbrLookupGenRef = useRef(0);
  /** 最後に保存済みとみなすスナップショット（空文字は未ロード。ロード後に設定） */
  const savedPersistSnapshotJsonRef = useRef("");
  const persistLockRef = useRef(false);
  const persistEstimateRef = useRef<(opts?: { silent?: boolean }) => Promise<number | null>>(async () => null);
  /** DB の estimate_number（ヘッダー連番・プレビューと整合） */
  const [estimateNumberFromApi, setEstimateNumberFromApi] = useState("");
  const [recipientText, setRecipientText] = useState("");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  /** 納入予定（自由文言。YYYY-MM-DD を入れた場合もそのまま保存・帳票で日付表示） */
  const [deliveryDueText, setDeliveryDueText] = useState("要相談");
  const [remarks, setRemarks] = useState(() => (estimateId ? "" : DEFAULT_NEW_ESTIMATE_REMARKS));
  const [internalMemo, setInternalMemo] = useState("");
  const [isRoughEstimate, setIsRoughEstimate] = useState(false);
  const [taxRatePercent, setTaxRatePercent] = useState(10);
  const [lines, setLines] = useState<EstimateLine[]>([emptyLine()]);
  const [loading, setLoading] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [templates, setTemplates] = useState<EstimateTemplateListRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  /** ログインユーザを担当者サジェストと同形式で表示するラベル */
  const [meUserLabel, setMeUserLabel] = useState("");
  const [salesUserId, setSalesUserId] = useState<number | null>(null);
  const [salesAssigneeInput, setSalesAssigneeInput] = useState("");
  const [assigneeSuggestRows, setAssigneeSuggestRows] = useState<Array<{ id: number; label: string }>>([]);
  const salesDefaultAppliedRef = useRef(false);
  const [isAdminMe, setIsAdminMe] = useState(false);
  const [templateLoadDialogOpen, setTemplateLoadDialogOpen] = useState(false);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [deleteTemplateDialog, setDeleteTemplateDialog] = useState<{ id: string; name: string } | null>(null);
  const [templateActionBusyId, setTemplateActionBusyId] = useState<string | null>(null);
  const [templateDeleteBusy, setTemplateDeleteBusy] = useState(false);
  /** 読込クリック後にドロップダウンを閉じる（Radix はカスタム Button では自動クローズしない） */
  const [estimateTemplateMenuOpen, setEstimateTemplateMenuOpen] = useState(false);
  const [estimateTemplateSaveOpen, setEstimateTemplateSaveOpen] = useState(false);
  const [estimateTemplateSaveScope, setEstimateTemplateSaveScope] = useState<"private" | "shared">("private");
  const [estimateTemplateName, setEstimateTemplateName] = useState("");
  const [estimateTemplateSaving, setEstimateTemplateSaving] = useState(false);
  const [estimateTemplateOverwriteOpen, setEstimateTemplateOverwriteOpen] = useState(false);
  const [estimateTemplateOverwriteId, setEstimateTemplateOverwriteId] = useState<string | null>(null);
  /** 上書き対象がロック済みのとき、文言を切り替える */
  const [estimateTemplateOverwriteTargetLocked, setEstimateTemplateOverwriteTargetLocked] = useState(false);
  const [visibilityScope, setVisibilityScope] = useState<"public_all_users" | "restricted">("public_all_users");
  const [permissionRows, setPermissionRows] = useState<AccessControlRow[]>([]);
  const [linkedProjectsText, setLinkedProjectsText] = useState("");
  const [taxRateChoices, setTaxRateChoices] = useState<Array<{ rate: number; effectiveFrom: string }>>([]);
  const [selectedTaxEffectiveFrom, setSelectedTaxEffectiveFrom] = useState("");
  const [historyStack, setHistoryStack] = useState<EstimateLine[][]>([]);
  const [futureStack, setFutureStack] = useState<EstimateLine[][]>([]);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropIndicatorIndex, setDropIndicatorIndex] = useState<number | null>(null);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const draggingIndexRef = useRef<number | null>(null);
  const [itemSuggestions, setItemSuggestions] = useState<Array<{ value: string; from: "standard" | "history" }>>([]);
  const [operationLogs, setOperationLogs] = useState<Array<{ id: number; operation_type: string; operator_user_id: number; created_at: string }>>([]);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [userSuggestRows, setUserSuggestRows] = useState<Array<{ id: number; label: string }>>([]);
  const [projectSuggestRows, setProjectSuggestRows] = useState<Array<{ id: number; name: string; client_name: string | null }>>([]);
  const [projectSuggestInput, setProjectSuggestInput] = useState("");
  const [majorCategoryToAdd, setMajorCategoryToAdd] = useState<string>(ESTIMATE_MAJOR_CATEGORIES[0]);
  const [bulkPasteOpen, setBulkPasteOpen] = useState(false);
  const [bulkPasteDraft, setBulkPasteDraft] = useState("");
  const [progressFeeOpen, setProgressFeeOpen] = useState(false);
  const [progressFeeMode, setProgressFeeMode] = useState<"under_major" | "other">("other");
  const [progressFeeQtyPercent, setProgressFeeQtyPercent] = useState(10);
  const [progressFeeCheckedDetailIndices, setProgressFeeCheckedDetailIndices] = useState<Set<number>>(() => new Set());
  /** 下部固定の税合計バー。Cookie と同期（マウント後に読取） */
  const [totalsDockVisible, setTotalsDockVisible] = useState(true);

  const allAssigneeRows = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of userSuggestRows) {
      m.set(r.id, r.label);
    }
    for (const r of assigneeSuggestRows) {
      if (!m.has(r.id)) m.set(r.id, r.label);
    }
    return Array.from(m.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.id - b.id);
  }, [userSuggestRows, assigneeSuggestRows]);

  const filteredAssigneeSuggestRows = useMemo(() => {
    const q = salesAssigneeInput.trim().toLowerCase();
    if (q === "") return allAssigneeRows.slice(0, 48);
    return allAssigneeRows.filter((r) => r.label.toLowerCase().includes(q)).slice(0, 60);
  }, [allAssigneeRows, salesAssigneeInput]);

  const filteredProjectSuggestRows = useMemo(() => {
    const q = projectSuggestInput.trim().toLowerCase();
    if (q === "") return projectSuggestRows.slice(0, 32);
    return projectSuggestRows
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.client_name != null && p.client_name.toLowerCase().includes(q)) ||
          String(p.id).includes(q),
      )
      .slice(0, 40);
  }, [projectSuggestRows, projectSuggestInput]);

  const canEditEstimateBody = estimateStatus === "draft";
  const bodyFieldDisabled = loading || !canEditEstimateBody;

  const currentPersistSnapshotJson = useMemo(() => {
    const resolvedSalesUserId =
      !estimateId
        ? salesUserId != null && salesUserId > 0
          ? salesUserId
          : currentUserId != null && currentUserId > 0
            ? currentUserId
            : null
        : salesUserId != null && salesUserId > 0
          ? salesUserId
          : null;
    const deliveryDuePayload = deliveryDueText.trim() !== "" ? deliveryDueText.trim() : null;
    const clientAbbrPayload = clientAbbr.trim() !== "" ? clientAbbr.trim().slice(0, 64) : null;
    return estimatePersistSnapshotJson({
      title,
      estimate_status: estimateStatus,
      client_name: clientName || null,
      client_abbr: clientAbbrPayload,
      recipient_text: recipientText || null,
      remarks: remarks || null,
      issue_date: issueDate,
      delivery_due_text: deliveryDuePayload,
      internal_memo: internalMemo || null,
      is_rough_estimate: isRoughEstimate,
      applied_tax_rate_percent: taxRatePercent,
      sales_user_id: resolvedSalesUserId,
      lines,
    });
  }, [
    estimateId,
    salesUserId,
    currentUserId,
    title,
    estimateStatus,
    clientName,
    clientAbbr,
    recipientText,
    remarks,
    issueDate,
    deliveryDueText,
    internalMemo,
    isRoughEstimate,
    taxRatePercent,
    lines,
  ]);

  const assigneeSuggestWrapRef = useRef<HTMLDivElement | null>(null);
  const clientAbbrInputRef = useRef<HTMLInputElement | null>(null);
  const [assigneeSuggestOpen, setAssigneeSuggestOpen] = useState(false);
  const projectSuggestWrapRef = useRef<HTMLDivElement | null>(null);
  const [projectSuggestOpen, setProjectSuggestOpen] = useState(false);
  const itemSuggestWrapRef = useRef<HTMLDivElement | null>(null);
  const [itemSuggestOpenIndex, setItemSuggestOpenIndex] = useState<number | null>(null);

  const closeAssigneeSuggest = useCallback(() => setAssigneeSuggestOpen(false), []);
  const closeProjectSuggest = useCallback(() => setProjectSuggestOpen(false), []);
  const closeItemSuggest = useCallback(() => setItemSuggestOpenIndex(null), []);

  useMousedownOutside(assigneeSuggestWrapRef, closeAssigneeSuggest, assigneeSuggestOpen);
  useMousedownOutside(projectSuggestWrapRef, closeProjectSuggest, projectSuggestOpen);
  useMousedownOutside(itemSuggestWrapRef, closeItemSuggest, itemSuggestOpenIndex !== null);

  useEffect(() => {
    setTotalsDockVisible(readEstimateTotalsDockCookie() === "visible");
  }, []);

  const hydrateAssigneeByUserId = useCallback(async (userId: number) => {
    if (!Number.isFinite(userId) || userId <= 0) return;
    try {
      const uRes = await fetch(`/api/portal/user-suggest?q=${encodeURIComponent(String(userId))}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!uRes.ok) return;
      const uData = (await uRes.json()) as {
        success?: boolean;
        users?: Array<{ id?: unknown; display_name?: unknown; email?: unknown }>;
      };
      if (!uData.success || !Array.isArray(uData.users) || uData.users.length === 0) return;
      const u = uData.users[0];
      const uid = Number(u.id);
      if (!Number.isFinite(uid) || uid <= 0) return;
      const lab = buildAssigneeLabelFromUserParts(uid, u.display_name as string | null | undefined, u.email as string | null | undefined);
      setSalesAssigneeInput(lab);
      setAssigneeSuggestRows((prev) => {
        if (prev.some((r) => r.id === uid)) return prev;
        return [...prev, { id: uid, label: lab }];
      });
    } catch {
      // ignore
    }
  }, []);

  const commitAssigneeFromInput = useCallback(() => {
    const parsed = parseAssigneeInputToUserId(salesAssigneeInput, allAssigneeRows);
    if (parsed != null) {
      setSalesUserId(parsed);
      const row = allAssigneeRows.find((r) => r.id === parsed);
      if (row) setSalesAssigneeInput(row.label);
      return;
    }
    if (salesAssigneeInput.trim() === "") {
      if (!estimateId) {
        if (currentUserId != null && meUserLabel !== "") {
          setSalesUserId(currentUserId);
          setSalesAssigneeInput(meUserLabel);
        } else {
          setSalesUserId(null);
          setSalesAssigneeInput("");
        }
      } else {
        setSalesUserId(null);
        setSalesAssigneeInput("");
      }
      return;
    }
    const rowPrev = salesUserId != null ? allAssigneeRows.find((r) => r.id === salesUserId) : null;
    if (rowPrev) setSalesAssigneeInput(rowPrev.label);
    else if (salesUserId === currentUserId && meUserLabel !== "") setSalesAssigneeInput(meUserLabel);
  }, [salesAssigneeInput, allAssigneeRows, estimateId, currentUserId, meUserLabel, salesUserId]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/portal/me", { credentials: "include", cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          success?: boolean;
          user?: { id?: number; is_admin?: boolean; display_name?: string; email?: string };
        };
        if (data.success && data.user && typeof data.user.id === "number") {
          setCurrentUserId(data.user.id);
          setIsAdminMe(Boolean(data.user.is_admin));
          setMeUserLabel(
            buildAssigneeLabelFromUserParts(data.user.id, data.user.display_name ?? null, data.user.email ?? null),
          );
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    if (estimateId != null) {
      salesDefaultAppliedRef.current = false;
      return;
    }
    if (currentUserId == null || meUserLabel === "") return;
    if (salesDefaultAppliedRef.current) return;
    setSalesUserId(currentUserId);
    setSalesAssigneeInput(meUserLabel);
    salesDefaultAppliedRef.current = true;
  }, [estimateId, currentUserId, meUserLabel]);

  useEffect(() => {
    const q = salesAssigneeInput.trim();
    if (q.length < 2) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/portal/user-suggest?q=${encodeURIComponent(q)}`, {
            credentials: "include",
            cache: "no-store",
          });
          if (!res.ok) return;
          const data = (await res.json()) as {
            success?: boolean;
            users?: Array<{ id?: unknown; display_name?: unknown; email?: unknown }>;
          };
          if (!data.success || !Array.isArray(data.users)) return;
          const mapped = data.users
            .map((u) => {
              const id = Number(u.id);
              if (!Number.isFinite(id) || id <= 0) return null;
              return {
                id,
                label: buildAssigneeLabelFromUserParts(id, u.display_name as string | null | undefined, u.email as string | null | undefined),
              };
            })
            .filter((x): x is { id: number; label: string } => x !== null);
          if (mapped.length === 0) return;
          setAssigneeSuggestRows((prev) => {
            const next = new Map<number, string>(prev.map((r) => [r.id, r.label]));
            for (const row of mapped) {
              if (!next.has(row.id)) next.set(row.id, row.label);
            }
            return Array.from(next.entries()).map(([id, label]) => ({ id, label }));
          });
        } catch {
          // ignore
        }
      })();
    }, 320);
    return () => window.clearTimeout(timer);
  }, [salesAssigneeInput]);

  const refreshTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/estimate-templates", { credentials: "include", cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { templates?: EstimateTemplateListRow[] };
      if (Array.isArray(data.templates)) {
        setTemplates(data.templates);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refreshTemplates();
  }, [refreshTemplates]);

  const privateEstimateTemplates = useMemo(
    () => templates.filter((t) => t.scope === "private"),
    [templates],
  );
  const sharedEstimateTemplates = useMemo(
    () => templates.filter((t) => t.scope === "shared"),
    [templates],
  );

  const estimateEditHeroTitle = useMemo(() => {
    if (!estimateId) return "見積作成";
    const seq = estimateNumberTailSequence(estimateNumberFromApi);
    const abbrDisp = clientAbbr.trim() !== "" ? clientAbbr.trim() : "—";
    const seqDisp = seq ?? `#${estimateId}`;
    return `見積編集 ${abbrDisp} ${seqDisp}`;
  }, [estimateId, estimateNumberFromApi, clientAbbr]);

  useEffect(() => {
    if (!estimateId) return;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/portal/estimates?id=${estimateId}`, { credentials: "include", cache: "no-store" });
        const data = (await res.json()) as { success?: boolean; estimate?: any };
        if (!res.ok || !data.success || !data.estimate) {
          setMessage("見積の取得に失敗しました。");
          return;
        }
        const e = data.estimate;
        const cnLoad = String(e.client_name ?? "").trim();
        const cabLoad = String(e.client_abbr ?? "").trim();
        abbrLinkedToNameRef.current = cnLoad === "" || cabLoad === "";
        setTitle(String(e.title ?? ""));
        setEstimateStatus((e.estimate_status as any) ?? "draft");
        setClientName(String(e.client_name ?? ""));
        setClientAbbr(String(e.client_abbr ?? ""));
        setEstimateNumberFromApi(String(e.estimate_number ?? ""));
        setRecipientText(String(e.recipient_text ?? ""));
        setRemarks(String(e.remarks ?? ""));
        setIssueDate(String(e.issue_date ?? "").slice(0, 10));
        setDeliveryDueText(deliveryDueTextFromRaw(e.delivery_due_text));
        setInternalMemo(String(e.internal_memo ?? ""));
        setIsRoughEstimate(Number(e.is_rough_estimate ?? 0) === 1);
        setTaxRatePercent(Number(e.applied_tax_rate_percent ?? 10));
        const rawSid = e.sales_user_id;
        const sid =
          rawSid != null && rawSid !== "" && Number.isFinite(Number(rawSid)) && Number(rawSid) > 0
            ? Number(rawSid)
            : null;
        setSalesUserId(sid);
        if (sid != null) {
          void hydrateAssigneeByUserId(sid);
        } else {
          setSalesAssigneeInput("");
        }
        if (Array.isArray(e.lines) && e.lines.length > 0) {
          setLines(e.lines.map((line: any) => normalizeLoadedEstimateLine(line)));
        }
        savedPersistSnapshotJsonRef.current = estimatePersistSnapshotFromLoadedApi(e as Record<string, unknown>);
      } catch {
        setMessage("見積の取得に失敗しました。");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [estimateId, hydrateAssigneeByUserId]);

  useEffect(() => {
    const name = clientName.trim();
    if (name === "" || !abbrLinkedToNameRef.current) {
      return;
    }
    const gen = ++clientAbbrLookupGenRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/portal/estimate-client-abbr?client_name=${encodeURIComponent(name)}`,
            { credentials: "include", cache: "no-store" },
          );
          if (gen !== clientAbbrLookupGenRef.current) return;
          if (!abbrLinkedToNameRef.current) return;
          if (!res.ok) return;
          const data = (await res.json()) as { success?: boolean; client_abbr?: string | null };
          if (gen !== clientAbbrLookupGenRef.current) return;
          if (!data.success || !abbrLinkedToNameRef.current) return;
          const s = typeof data.client_abbr === "string" ? data.client_abbr.trim() : "";
          if (s !== "") setClientAbbr(s);
        } catch {
          // ignore
        }
      })();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [clientName]);

  useEffect(() => {
    if (!estimateId) {
      setOperationLogs([]);
      return;
    }
    const loadLogs = async () => {
      try {
        const res = await fetch(`/api/portal/estimate-operation-logs?estimate_id=${estimateId}`, { credentials: "include", cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          success?: boolean;
          logs?: Array<{ id: number; operation_type: string; operator_user_id: number; created_at: string }>;
        };
        if (data.success && Array.isArray(data.logs)) {
          setOperationLogs(data.logs);
        }
      } catch {
        // ignore
      }
    };
    void loadLogs();
  }, [estimateId, message]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [usersRes, projectsRes] = await Promise.all([
          fetch("/api/portal/admin/users", { credentials: "include", cache: "no-store" }),
          fetch("/api/portal/my-projects", { credentials: "include", cache: "no-store" }),
        ]);
        if (!cancelled && usersRes.ok) {
          const usersData = (await usersRes.json()) as {
            success?: boolean;
            users?: Array<{ id?: unknown; display_name?: unknown; email?: unknown }>;
          };
          if (usersData.success && Array.isArray(usersData.users)) {
            setUserSuggestRows(
              usersData.users
                .map((u) => {
                  const id = Number(u.id);
                  const displayName = typeof u.display_name === "string" ? u.display_name.trim() : "";
                  const email = typeof u.email === "string" ? u.email.trim() : "";
                  if (!Number.isFinite(id) || id <= 0) return null;
                  const labelBase = displayName !== "" ? displayName : email !== "" ? email : `user#${id}`;
                  return { id, label: `${labelBase} (user#${id})` };
                })
                .filter((v): v is { id: number; label: string } => v !== null),
            );
          }
        }
        if (!cancelled && projectsRes.ok) {
          const projectsData = (await projectsRes.json()) as {
            success?: boolean;
            projects?: Array<{ id?: unknown; name?: unknown; client_name?: unknown }>;
          };
          if (projectsData.success && Array.isArray(projectsData.projects)) {
            setProjectSuggestRows(
              projectsData.projects
                .map((p) => {
                  const id = Number(p.id);
                  const name = typeof p.name === "string" ? p.name.trim() : "";
                  const client_name = typeof p.client_name === "string" && p.client_name.trim() !== "" ? p.client_name.trim() : null;
                  if (!Number.isFinite(id) || id <= 0 || name === "") return null;
                  return { id, name, client_name };
                })
                .filter((v): v is { id: number; name: string; client_name: string | null } => v !== null),
            );
          }
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const loadTaxRates = async () => {
      try {
        const res = await fetch("/api/portal/tax-rates", { credentials: "include", cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { success?: boolean; tax_rates?: Array<{ tax_rate_percent: number; effective_from: string; is_active: number }> };
        if (!data.success || !Array.isArray(data.tax_rates)) return;
        const active = data.tax_rates
          .filter((row) => Number(row.is_active) === 1)
          .map((row) => ({ rate: Number(row.tax_rate_percent), effectiveFrom: String(row.effective_from) }))
          .sort((a, b) => (a.effectiveFrom > b.effectiveFrom ? -1 : 1));
        setTaxRateChoices(active);
        if (active.length > 0 && selectedTaxEffectiveFrom === "") {
          setSelectedTaxEffectiveFrom(active[0].effectiveFrom);
          setTaxRatePercent(active[0].rate);
        }
      } catch {
        // ignore
      }
    };
    void loadTaxRates();
  }, [selectedTaxEffectiveFrom]);

  useEffect(() => {
    if (!estimateId) return;
    const loadAccessAndLinks = async () => {
      try {
        const [vRes, lRes] = await Promise.all([
          fetch(`/api/portal/estimate-visibility?estimate_id=${estimateId}`, { credentials: "include", cache: "no-store" }),
          fetch(`/api/portal/estimate-project-links?estimate_id=${estimateId}`, { credentials: "include", cache: "no-store" }),
        ]);
        if (vRes.ok) {
          const vData = (await vRes.json()) as {
            success?: boolean;
            visibility_scope?: "public_all_users" | "restricted";
            team_permissions?: Array<{ team_tag: string; role: "owner" | "editor" | "viewer" }>;
            user_permissions?: Array<{ user_id: number; role: "owner" | "editor" | "viewer" }>;
          };
          if (vData.success) {
            setVisibilityScope(vData.visibility_scope ?? "public_all_users");
            const rows: AccessControlRow[] = [];
            if (Array.isArray(vData.team_permissions)) {
              rows.push(
                ...vData.team_permissions.map((row, idx) => ({
                  key: `team-${idx}-${row.team_tag}`,
                  subjectType: "team" as const,
                  subject: row.team_tag,
                  role: row.role,
                })),
              );
            }
            if (Array.isArray(vData.user_permissions)) {
              rows.push(
                ...vData.user_permissions.map((row, idx) => ({
                  key: `user-${idx}-${row.user_id}`,
                  subjectType: "user" as const,
                  subject: String(row.user_id),
                  role: row.role,
                })),
              );
            }
            setPermissionRows(rows);
          }
        }
        if (lRes.ok) {
          const lData = (await lRes.json()) as { success?: boolean; links?: Array<{ project_id: number }> };
          if (lData.success && Array.isArray(lData.links)) {
            setLinkedProjectsText(lData.links.map((row) => String(row.project_id)).join(","));
          }
        }
      } catch {
        // ignore
      }
    };
    void loadAccessAndLinks();
  }, [estimateId]);

  const subtotal = useMemo(
    () =>
      lines.reduce(
        (sum, line) =>
          sum +
          computeEstimateLineAmount({
            quantity: line.quantity,
            unit_price: line.unit_price,
            factor: line.factor,
            unit_type: line.unit_type,
          }),
        0,
      ),
    [lines],
  );
  const taxAmount = useMemo(() => Math.floor((subtotal * taxRatePercent) / 100), [subtotal, taxRatePercent]);
  const total = useMemo(() => subtotal + taxAmount, [subtotal, taxAmount]);

  const progressFeeVisibleBlocks = useMemo(
    () => segmentVisibleMajorBlocksForProgressFee(lines, isMajorHeadingLine),
    [lines],
  );

  const progressFeeActiveBlockListIndex = useMemo(() => {
    if (progressFeeMode !== "under_major") return null;
    for (let b = 0; b < progressFeeVisibleBlocks.length; b++) {
      const blk = progressFeeVisibleBlocks[b];
      if (blk?.detailLineIndices.some((i) => progressFeeCheckedDetailIndices.has(i))) return b;
    }
    return null;
  }, [progressFeeMode, progressFeeVisibleBlocks, progressFeeCheckedDetailIndices]);

  const progressFeeBaseSum = useMemo(
    () => sumCheckedDetailLineAmounts(lines, progressFeeCheckedDetailIndices, isMajorHeadingLine),
    [lines, progressFeeCheckedDetailIndices],
  );

  const progressFeeComputedAmount = useMemo(() => {
    const q = Number.isFinite(progressFeeQtyPercent) ? progressFeeQtyPercent : 10;
    return computeEstimateLineAmount({
      quantity: q,
      unit_price: progressFeeBaseSum,
      factor: 1,
      unit_type: "percent",
    });
  }, [progressFeeQtyPercent, progressFeeBaseSum]);

  const updateLine = (index: number, patch: Partial<EstimateLine>) => {
    setHistoryStack((prev) => [...prev, lines]);
    setFutureStack([]);
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        if (next.item_code === ESTIMATE_MANUAL_DETAIL_LINE_ITEM_CODE && String(next.item_name ?? "").trim() !== "") {
          next.item_code = null;
        }
        if (next.item_code !== ESTIMATE_MAJOR_LINE_ITEM_CODE && String(next.item_name ?? "").trim() === "") {
          next.item_code = ESTIMATE_MANUAL_DETAIL_LINE_ITEM_CODE;
        }
        return next;
      }),
    );
  };

  const nearestMajorCategoryAbove = (list: EstimateLine[], endExclusive: number): string | null => {
    for (let i = endExclusive - 1; i >= 0; i--) {
      const row = list[i];
      if (row && isMajorHeadingLine(row)) {
        const m = String(row.major_category ?? row.item_name ?? "").trim();
        return m !== "" ? m : null;
      }
    }
    return null;
  };

  const addLine = () => {
    setHistoryStack((prev) => [...prev, lines]);
    setFutureStack([]);
    setLines((prev) => {
      const parentMajor = nearestMajorCategoryAbove(prev, prev.length);
      return [
        ...prev,
        {
          ...emptyLine(),
          quantity: 1,
          unit_type: "set",
          item_code: ESTIMATE_MANUAL_DETAIL_LINE_ITEM_CODE,
          major_category: parentMajor,
          category: null,
        },
      ];
    });
  };

  const addMajorCategoryLine = () => {
    const majors = ESTIMATE_MAJOR_CATEGORIES as readonly string[];
    const major = majors.includes(majorCategoryToAdd) ? majorCategoryToAdd : ESTIMATE_MAJOR_CATEGORIES[0];
    setHistoryStack((prev) => [...prev, lines]);
    setFutureStack([]);
    setLines((prev) => [
      ...prev,
      {
        ...emptyLine(),
        item_code: ESTIMATE_MAJOR_LINE_ITEM_CODE,
        item_name: major,
        major_category: major,
        category: major,
        quantity: 0,
        unit_price: 0,
        factor: 1,
        unit_type: "set",
      },
    ]);
  };

  const applyBulkPasteLines = () => {
    if (estimateStatus !== "draft") return;
    const majors = ESTIMATE_MAJOR_CATEGORIES as readonly string[];
    const major = majors.includes(majorCategoryToAdd) ? majorCategoryToAdd : ESTIMATE_MAJOR_CATEGORIES[0];
    const names = bulkPasteDraft
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (names.length === 0) {
      setBulkPasteOpen(false);
      return;
    }
    setHistoryStack((prev) => [...prev, lines]);
    setFutureStack([]);
    setLines((prev) => [
      ...prev,
      ...names.map((item_name) => ({
        ...emptyLine(),
        item_name,
        major_category: major,
        category: major,
      })),
    ]);
    setBulkPasteDraft("");
    setBulkPasteOpen(false);
    setMessage(`${names.length}行を追加しました。`);
  };

  const resetProgressFeeModalState = () => {
    setProgressFeeCheckedDetailIndices(new Set());
    setProgressFeeQtyPercent(10);
    setProgressFeeMode("other");
  };

  const resetProgressFeeModal = () => {
    setProgressFeeOpen(false);
    resetProgressFeeModalState();
  };

  const openProgressFeeModal = () => {
    setProgressFeeQtyPercent(10);
    setProgressFeeMode("other");
    setProgressFeeCheckedDetailIndices(new Set());
    setProgressFeeOpen(true);
  };

  const toggleProgressFeeParentBlock = (blockListIdx: number, wantChecked: boolean) => {
    const blk = progressFeeVisibleBlocks[blockListIdx];
    if (!blk || blk.detailLineIndices.length === 0) return;
    if (progressFeeMode === "under_major") {
      let locked: number | null = null;
      for (let b = 0; b < progressFeeVisibleBlocks.length; b++) {
        const bblk = progressFeeVisibleBlocks[b];
        if (bblk?.detailLineIndices.some((i) => progressFeeCheckedDetailIndices.has(i))) {
          locked = b;
          break;
        }
      }
      if (wantChecked && locked !== null && locked !== blockListIdx) {
        setProgressFeeCheckedDetailIndices(new Set(blk.detailLineIndices));
        return;
      }
    }
    setProgressFeeCheckedDetailIndices((prev) => {
      const next = new Set(prev);
      for (const i of blk.detailLineIndices) {
        if (wantChecked) next.add(i);
        else next.delete(i);
      }
      return next;
    });
  };

  const toggleProgressFeeDetailLine = (blockListIdx: number, lineIndex: number, wantChecked: boolean) => {
    const blk = progressFeeVisibleBlocks[blockListIdx];
    if (!blk) return;
    if (progressFeeMode === "under_major") {
      const foreign = [...progressFeeCheckedDetailIndices].some((i) => !blk.detailLineIndices.includes(i));
      if (foreign && wantChecked) {
        setProgressFeeCheckedDetailIndices(new Set([lineIndex]));
        return;
      }
    }
    setProgressFeeCheckedDetailIndices((prev) => {
      const next = new Set(prev);
      if (wantChecked) next.add(lineIndex);
      else next.delete(lineIndex);
      return next;
    });
  };

  const applyProgressFeeFromModal = () => {
    if (estimateStatus !== "draft") return;
    if (progressFeeCheckedDetailIndices.size === 0) {
      setMessage("チェックする明細を選択してください。");
      return;
    }
    const qty = Number.isFinite(progressFeeQtyPercent) ? progressFeeQtyPercent : 10;

    setHistoryStack((prev) => [...prev, lines]);
    setFutureStack([]);
    setLines((prev) => {
      const blocks = segmentVisibleMajorBlocksForProgressFee(prev, isMajorHeadingLine);
      const baseSum = sumCheckedDetailLineAmounts(prev, progressFeeCheckedDetailIndices, isMajorHeadingLine);
      const childLine: EstimateLine = {
        ...emptyLine(),
        item_name: PROGRESS_FEE_ITEM_NAME,
        quantity: qty,
        unit_type: "percent",
        unit_price: baseSum,
        factor: 1,
        item_code: undefined,
      };

      if (progressFeeMode === "under_major") {
        let activeBi: number | null = null;
        for (let b = 0; b < blocks.length; b++) {
          const bb = blocks[b];
          if (bb?.detailLineIndices.some((i) => progressFeeCheckedDetailIndices.has(i))) {
            activeBi = b;
            break;
          }
        }
        if (activeBi === null) return prev;
        const b = blocks[activeBi]!;
        const mc = b.majorHeading.trim();
        childLine.major_category = mc;
        childLine.category = mc;
        const insertAt =
          b.detailLineIndices.length > 0 ? Math.max(...b.detailLineIndices) + 1 : b.majorLineIndex + 1;
        return [...prev.slice(0, insertAt), childLine, ...prev.slice(insertAt)];
      }

      const isOther = (h: string) => h.trim() === ESTIMATE_OTHER_MAJOR_LABEL;
      const otherBlock = findOtherMajorBlock(blocks, isOther);
      childLine.major_category = ESTIMATE_OTHER_MAJOR_LABEL;
      childLine.category = ESTIMATE_OTHER_MAJOR_LABEL;
      if (otherBlock) {
        const insertAt =
          otherBlock.detailLineIndices.length > 0
            ? Math.max(...otherBlock.detailLineIndices) + 1
            : otherBlock.majorLineIndex + 1;
        return [...prev.slice(0, insertAt), childLine, ...prev.slice(insertAt)];
      }
      const majorLine: EstimateLine = {
        ...emptyLine(),
        item_code: ESTIMATE_MAJOR_LINE_ITEM_CODE,
        item_name: ESTIMATE_OTHER_MAJOR_LABEL,
        major_category: ESTIMATE_OTHER_MAJOR_LABEL,
        category: ESTIMATE_OTHER_MAJOR_LABEL,
        quantity: 0,
        unit_price: 0,
        factor: 1,
        unit_type: "set",
      };
      return [...prev, majorLine, childLine];
    });
    setMessage("進行管理費行を追加しました。");
    resetProgressFeeModal();
  };

  const removeLine = (index: number) => {
    setHistoryStack((prev) => [...prev, lines]);
    setFutureStack([]);
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const duplicateLine = async (index: number) => {
    const line = lines[index];
    if (!line) return;
    if (line.id) {
      try {
        await fetch("/api/portal/estimate-line-duplicate", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ line_id: line.id }),
        });
      } catch {
        // ignore, local fallback below
      }
    }
    setHistoryStack((prev) => [...prev, lines]);
    setFutureStack([]);
    setLines((prev) => [...prev, { ...line, id: undefined }]);
  };

  const undo = () => {
    if (historyStack.length === 0) return;
    const previous = historyStack[historyStack.length - 1]!;
    setHistoryStack((prev) => prev.slice(0, prev.length - 1));
    setFutureStack((prev) => [lines, ...prev]);
    setLines(previous);
  };

  const redo = () => {
    if (futureStack.length === 0) return;
    const next = futureStack[0]!;
    setFutureStack((prev) => prev.slice(1));
    setHistoryStack((prev) => [...prev, lines]);
    setLines(next);
  };

  const applyUnitConversionAll = (target: "person_day" | "person_month") => {
    setHistoryStack((prev) => [...prev, lines]);
    setFutureStack([]);
    setLines((prev) =>
      prev.map((line) => {
        if (isMajorHeadingLine(line)) return line;
        if (target === "person_day" && line.unit_type !== "person_month") {
          return line;
        }
        if (target === "person_month" && line.unit_type !== "person_day") {
          return line;
        }
        const hasQuantity = Number.isFinite(line.quantity) && line.quantity !== 0;
        const hasUnitPrice = Number.isFinite(line.unit_price) && line.unit_price !== 0;
        const quantityRatio = target === "person_day" ? 20 : 1 / 20;
        const unitPriceRatio = target === "person_day" ? 20 : 1 / 20;
        return {
          ...line,
          unit_type: target,
          quantity: hasQuantity ? Number((line.quantity * quantityRatio).toFixed(4)) : line.quantity,
          unit_price: hasUnitPrice ? Number((line.unit_price * unitPriceRatio).toFixed(4)) : line.unit_price,
        };
      }),
    );
  };

  const clearLineDrag = useCallback(() => {
    draggingIndexRef.current = null;
    setDraggingIndex(null);
    setDropIndicatorIndex(null);
  }, []);

  const updateEstimateDropIndicator = useCallback((clientY: number) => {
    const dragId = draggingIndexRef.current;
    if (dragId === null || !tbodyRef.current) {
      return;
    }
    const prevLines = linesRef.current;
    const list = prevLines.map((_, i) => String(i));
    const rowEls = [...tbodyRef.current.querySelectorAll<HTMLElement>("tr[data-estimate-line-row]")];
    const idx = insertionIndexFromPointerYForStrings(list, rowEls, clientY, String(dragId));
    setDropIndicatorIndex((prev) => (prev === idx ? prev : idx));
  }, []);

  const onTbodyDragOver = useCallback(
    (e: React.DragEvent) => {
      if (draggingIndexRef.current === null) {
        return;
      }
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      updateEstimateDropIndicator(e.clientY);
    },
    [updateEstimateDropIndicator],
  );

  const onTbodyDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const fromIndex = draggingIndexRef.current;
      if (fromIndex === null || !tbodyRef.current) {
        clearLineDrag();
        return;
      }
      const tbody = tbodyRef.current;
      setHistoryStack((prev) => [...prev, linesRef.current]);
      setFutureStack([]);
      setLines((prev) => {
        const list = prev.map((_, i) => String(i));
        const rowEls = [...tbody.querySelectorAll<HTMLElement>("tr[data-estimate-line-row]")];
        const idx = insertionIndexFromPointerYForStrings(list, rowEls, e.clientY, String(fromIndex));
        return reorderEstimateLinesByInsertion(prev, fromIndex, idx);
      });
      clearLineDrag();
    },
    [clearLineDrag],
  );

  useEffect(() => {
    const loadSuggestions = async () => {
      try {
        const itemRes = await fetch("/api/portal/estimate-suggestions?field_type=item_name", {
          credentials: "include",
          cache: "no-store",
        });
        if (itemRes.ok) {
          const data = (await itemRes.json()) as { standard?: string[]; history?: string[] };
          const standard = Array.isArray(data.standard) ? data.standard.map((value) => ({ value, from: "standard" as const })) : [];
          const history = Array.isArray(data.history) ? data.history.map((value) => ({ value, from: "history" as const })) : [];
          setItemSuggestions([...standard, ...history]);
        }
      } catch {
        // ignore
      }
    };
    void loadSuggestions();
  }, []);

  const applyTemplateFromRow = (tpl: EstimateTemplateListRow) => {
    let headerParsed: unknown = null;
    try {
      headerParsed = JSON.parse(String(tpl.header_json ?? "{}"));
    } catch {
      headerParsed = null;
    }
    applyHeaderJsonToEstimateFields(headerParsed, {
      setTitle,
      setEstimateStatus,
      setClientName,
      setClientAbbr,
      setRecipientText,
      setRemarks,
      setIssueDate,
      setSalesUserId,
      setSalesAssigneeInput,
      applyDeliveryDueRaw: (raw) => setDeliveryDueText(deliveryDueTextFromRaw(raw)),
    });
    const hParsed = headerParsed && typeof headerParsed === "object" ? (headerParsed as Record<string, unknown>) : null;
    {
      const cnTpl = hParsed != null && typeof hParsed.client_name === "string" ? hParsed.client_name.trim() : "";
      let cabTpl = "";
      if (hParsed != null && Object.prototype.hasOwnProperty.call(hParsed, "client_abbr")) {
        cabTpl = typeof hParsed.client_abbr === "string" ? hParsed.client_abbr.trim() : "";
      }
      abbrLinkedToNameRef.current = cnTpl === "" || cabTpl === "";
    }
    if (hParsed && Object.prototype.hasOwnProperty.call(hParsed, "sales_user_id")) {
      const raw = hParsed.sales_user_id;
      if (raw !== null && raw !== undefined && raw !== "") {
        const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
        if (Number.isFinite(n) && n > 0) {
          void hydrateAssigneeByUserId(n);
        }
      }
    }
    let parsedLines: unknown;
    try {
      parsedLines = JSON.parse(String(tpl.lines_json ?? "[]"));
    } catch {
      parsedLines = [];
    }
    if (Array.isArray(parsedLines) && parsedLines.length > 0) {
      setLines(parsedLines.map((line: any) => normalizeLoadedEstimateLine(line)));
    } else {
      setLines([emptyLine()]);
    }
    setHistoryStack([]);
    setFutureStack([]);
    setMessage(`テンプレート「${tpl.name}」を読み込みました。`);
  };

  const runApplyTemplateById = (id: string) => {
    if (estimateStatus !== "draft") return;
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    applyTemplateFromRow(tpl);
    setTemplateLoadDialogOpen(false);
    setPendingTemplateId(null);
  };

  const requestApplyTemplateById = (id: string) => {
    if (estimateStatus !== "draft") return;
    setEstimateTemplateMenuOpen(false);
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    const warn = estimateEditorShouldWarnBeforeTemplateLoad({
      estimateId,
      lines,
      title,
      clientName,
      clientAbbr,
      recipientText,
      internalMemo,
      remarks,
      defaultNewRemarks: DEFAULT_NEW_ESTIMATE_REMARKS,
    });
    if (warn) {
      setPendingTemplateId(id);
      setTemplateLoadDialogOpen(true);
      return;
    }
    runApplyTemplateById(id);
  };

  const confirmTemplateLoadDialog = () => {
    if (estimateStatus !== "draft") {
      setTemplateLoadDialogOpen(false);
      setPendingTemplateId(null);
      return;
    }
    if (pendingTemplateId) {
      runApplyTemplateById(pendingTemplateId);
    }
  };

  const setEstimateTemplateLocked = useCallback(
    async (id: string, locked: boolean) => {
      setTemplateActionBusyId(id);
      try {
        const res = await fetch("/api/portal/estimate-templates", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, locked }),
        });
        const raw = await res.text();
        let msg = "ロックの更新に失敗しました。";
        try {
          const j = JSON.parse(raw) as { message?: string };
          if (typeof j.message === "string") msg = j.message;
        } catch {
          /* ignore */
        }
        if (!res.ok) {
          setMessage(msg);
          return;
        }
        await refreshTemplates();
      } catch {
        setMessage("ロックの更新に失敗しました。");
      } finally {
        setTemplateActionBusyId(null);
      }
    },
    [refreshTemplates],
  );

  const confirmDeleteEstimateTemplate = useCallback(async () => {
    if (!deleteTemplateDialog) return;
    const targetId = deleteTemplateDialog.id;
    const targetName = deleteTemplateDialog.name;
    setTemplateDeleteBusy(true);
    try {
      const res = await fetch(`/api/portal/estimate-templates?id=${encodeURIComponent(targetId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const raw = await res.text();
      let msg = "テンプレートの削除に失敗しました。";
      try {
        const j = JSON.parse(raw) as { message?: string };
        if (typeof j.message === "string") msg = j.message;
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        setMessage(msg);
        return;
      }
      setDeleteTemplateDialog(null);
      await refreshTemplates();
      setMessage(`テンプレート「${targetName}」を削除しました。`);
    } catch {
      setMessage("テンプレートの削除に失敗しました。");
    } finally {
      setTemplateDeleteBusy(false);
    }
  }, [deleteTemplateDialog, refreshTemplates]);

  const closeEstimateTemplateSaveDialog = useCallback(() => {
    setEstimateTemplateSaveOpen(false);
    setEstimateTemplateName("");
    setEstimateTemplateOverwriteOpen(false);
    setEstimateTemplateOverwriteId(null);
    setEstimateTemplateOverwriteTargetLocked(false);
  }, []);

  const openEstimateTemplateSaveDialog = useCallback(
    (scope: "private" | "shared") => {
      if (scope === "shared" && !isAdminMe) {
        setMessage("全体テンプレートの保存には管理者権限が必要です。");
        return;
      }
      setEstimateTemplateMenuOpen(false);
      setEstimateTemplateSaveScope(scope);
      setEstimateTemplateName("");
      setEstimateTemplateOverwriteOpen(false);
      setEstimateTemplateOverwriteId(null);
      setEstimateTemplateOverwriteTargetLocked(false);
      setEstimateTemplateSaveOpen(true);
    },
    [isAdminMe],
  );

  const buildEstimateTemplatePayload = useCallback(
    (name: string, scope: "private" | "shared") => ({
      name: name.trim(),
      scope,
      header: {
        title,
        estimate_status: estimateStatus,
        client_name: clientName,
        client_abbr: clientAbbr.trim() !== "" ? clientAbbr.trim() : null,
        recipient_text: recipientText,
        remarks,
        issue_date: issueDate,
        delivery_due_text: deliveryDueText.trim() !== "" ? deliveryDueText.trim() : null,
        sales_user_id: salesUserId != null && salesUserId > 0 ? salesUserId : null,
      },
      lines,
    }),
    [
      title,
      estimateStatus,
      clientName,
      clientAbbr,
      recipientText,
      remarks,
      issueDate,
      deliveryDueText,
      lines,
      salesUserId,
    ],
  );

  const saveEstimateTemplateFromDialog = useCallback(async () => {
    if (currentUserId == null) {
      setMessage("ログイン情報が取得できません。ページを再読み込みしてください。");
      return;
    }
    const trimmed = estimateTemplateName.trim();
    if (trimmed === "") {
      setMessage("テンプレート名を入力してください。");
      return;
    }
    const dup = findEstimateTemplateDuplicate(templates, trimmed, estimateTemplateSaveScope, currentUserId);
    if (dup) {
      setEstimateTemplateOverwriteId(dup.id);
      setEstimateTemplateOverwriteTargetLocked(Boolean(dup.locked));
      setEstimateTemplateOverwriteOpen(true);
      return;
    }
    setEstimateTemplateSaving(true);
    try {
      let body: string;
      try {
        body = JSON.stringify(buildEstimateTemplatePayload(trimmed, estimateTemplateSaveScope));
      } catch {
        setMessage("テンプレート用データの生成に失敗しました。明細に不正な値が含まれている可能性があります。");
        return;
      }
      const res = await fetch("/api/portal/estimate-templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const rawText = await res.text();
      let data: { success?: boolean; message?: string } | null = null;
      try {
        data = JSON.parse(rawText) as { success?: boolean; message?: string };
      } catch {
        data = null;
      }
      if (!res.ok) {
        const reason = data?.message ?? (rawText.trim() !== "" ? rawText.slice(0, 200) : "") ?? "";
        setMessage(
          reason !== ""
            ? `テンプレート保存に失敗しました（${res.status}）。${reason}`
            : `テンプレート保存に失敗しました（${res.status}）。`,
        );
        return;
      }
      if (data && data.success === false) {
        setMessage(data.message ? `テンプレート保存に失敗しました。${data.message}` : "テンプレート保存に失敗しました。");
        return;
      }
      setMessage("テンプレートを保存しました。");
      await refreshTemplates();
      closeEstimateTemplateSaveDialog();
    } catch {
      setMessage("テンプレート保存に失敗しました（通信エラー）。");
    } finally {
      setEstimateTemplateSaving(false);
    }
  }, [
    currentUserId,
    estimateTemplateName,
    estimateTemplateSaveScope,
    templates,
    buildEstimateTemplatePayload,
    refreshTemplates,
    closeEstimateTemplateSaveDialog,
  ]);

  const confirmOverwriteEstimateTemplate = useCallback(async () => {
    if (!estimateTemplateOverwriteId) return;
    const trimmed = estimateTemplateName.trim();
    if (trimmed === "") {
      setMessage("テンプレート名を入力してください。");
      return;
    }
    setEstimateTemplateSaving(true);
    try {
      const payload = {
        id: estimateTemplateOverwriteId,
        ...buildEstimateTemplatePayload(trimmed, estimateTemplateSaveScope),
      };
      let body: string;
      try {
        body = JSON.stringify(payload);
      } catch {
        setMessage("テンプレート用データの生成に失敗しました。明細に不正な値が含まれている可能性があります。");
        return;
      }
      const res = await fetch("/api/portal/estimate-templates", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const rawText = await res.text();
      let data: { success?: boolean; message?: string } | null = null;
      try {
        data = JSON.parse(rawText) as { success?: boolean; message?: string };
      } catch {
        data = null;
      }
      if (!res.ok) {
        const reason = data?.message ?? (rawText.trim() !== "" ? rawText.slice(0, 200) : "") ?? "";
        setMessage(
          reason !== ""
            ? `テンプレートの上書きに失敗しました（${res.status}）。${reason}`
            : `テンプレートの上書きに失敗しました（${res.status}）。`,
        );
        return;
      }
      if (data && data.success === false) {
        setMessage(data.message ? `テンプレートの上書きに失敗しました。${data.message}` : "テンプレートの上書きに失敗しました。");
        return;
      }
      setMessage("テンプレートを上書き保存しました。");
      setEstimateTemplateOverwriteOpen(false);
      setEstimateTemplateOverwriteId(null);
      setEstimateTemplateOverwriteTargetLocked(false);
      await refreshTemplates();
      closeEstimateTemplateSaveDialog();
    } catch {
      setMessage("テンプレートの上書きに失敗しました（通信エラー）。");
    } finally {
      setEstimateTemplateSaving(false);
    }
  }, [
    estimateTemplateOverwriteId,
    estimateTemplateName,
    estimateTemplateSaveScope,
    buildEstimateTemplatePayload,
    refreshTemplates,
    closeEstimateTemplateSaveDialog,
  ]);

  const persistEstimate = async (opts?: { silent?: boolean }): Promise<number | null> => {
    const silent = opts?.silent ?? false;
    if (clientAbbr.trim() === "") {
      if (!silent) {
        window.alert("略称（見積用）を入力してください。");
        queueMicrotask(() => clientAbbrInputRef.current?.focus());
      }
      return null;
    }
    if (persistLockRef.current) {
      if (!silent) {
        setMessage("保存処理中です。完了してから再度お試しください。");
      }
      return null;
    }
    persistLockRef.current = true;
    if (!silent) {
      setLoading(true);
      setMessage(null);
    }
    const resolvedSalesUserId = !estimateId
      ? salesUserId != null && salesUserId > 0
        ? salesUserId
        : currentUserId != null && currentUserId > 0
          ? currentUserId
          : undefined
      : salesUserId != null && salesUserId > 0
        ? salesUserId
        : null;
    const deliveryDuePayload = deliveryDueText.trim() !== "" ? deliveryDueText.trim() : null;
    const clientAbbrPayload = clientAbbr.trim() !== "" ? clientAbbr.trim().slice(0, 64) : null;
    const payload = {
      ...(estimateId ? { id: estimateId } : {}),
      title,
      estimate_status: estimateStatus,
      client_name: clientName || null,
      client_abbr: clientAbbrPayload,
      recipient_text: recipientText || null,
      remarks: remarks || null,
      issue_date: issueDate,
      delivery_due_text: deliveryDuePayload,
      internal_memo: internalMemo || null,
      is_rough_estimate: isRoughEstimate,
      applied_tax_rate_percent: taxRatePercent,
      ...(!estimateId
        ? resolvedSalesUserId !== undefined
          ? { sales_user_id: resolvedSalesUserId }
          : {}
        : { sales_user_id: resolvedSalesUserId }),
      lines,
    };
    try {
      const res = await fetch("/api/portal/estimates", {
        method: estimateId ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const rawText = await res.text();
      let data: { success?: boolean; id?: number | string; estimate_number?: string; message?: string } | null = null;
      try {
        data = JSON.parse(rawText) as { success?: boolean; id?: number | string; estimate_number?: string; message?: string };
      } catch {
        data = null;
      }
      if (!res.ok || !data?.success) {
        const reason =
          data?.message ??
          (rawText.trim() !== "" ? rawText.slice(0, 200) : "") ??
          "保存に失敗しました。";
        if (!silent) {
          setMessage(`保存に失敗しました（${res.status}）。${reason}`);
        }
        return null;
      }
      const createdId = Number(data.id);
      if (typeof data.estimate_number === "string" && data.estimate_number.trim() !== "") {
        setEstimateNumberFromApi(data.estimate_number.trim());
      }
      const resolvedSalesForSnapshot =
        !estimateId
          ? salesUserId != null && salesUserId > 0
            ? salesUserId
            : currentUserId != null && currentUserId > 0
              ? currentUserId
              : null
          : salesUserId != null && salesUserId > 0
            ? salesUserId
            : null;
      const outId = estimateId ?? (Number.isFinite(createdId) && createdId > 0 ? createdId : null);
      if (outId != null && outId > 0) {
        savedPersistSnapshotJsonRef.current = estimatePersistSnapshotJson({
          title,
          estimate_status: estimateStatus,
          client_name: clientName || null,
          client_abbr: clientAbbrPayload,
          recipient_text: recipientText || null,
          remarks: remarks || null,
          issue_date: issueDate,
          delivery_due_text: deliveryDuePayload,
          internal_memo: internalMemo || null,
          is_rough_estimate: isRoughEstimate,
          applied_tax_rate_percent: taxRatePercent,
          sales_user_id: resolvedSalesForSnapshot,
          lines,
        });
        pingEstimatePrintPreview(outId);
      }
      if (!silent) {
        if (estimateId) {
          setMessage("保存しました。");
        } else if (data?.success) {
          setMessage(`作成しました（${data.estimate_number ?? ""}）。公開範囲/権限は作成後に設定してください。`);
        }
      }
      if (!estimateId && data?.success) {
        if (Number.isFinite(createdId) && createdId > 0) {
          router.replace(`/estimates/${createdId}`);
          return createdId;
        }
        if (!silent) {
          setMessage("作成は成功しましたが見積IDを取得できませんでした。一覧で作成結果を確認してください。");
        }
      }
      return estimateId ?? (Number.isFinite(createdId) && createdId > 0 ? createdId : null);
    } catch {
      if (!silent) {
        setMessage("保存に失敗しました。");
      }
      return null;
    } finally {
      persistLockRef.current = false;
      if (!silent) {
        setLoading(false);
      }
    }
  };

  persistEstimateRef.current = persistEstimate;

  useEffect(() => {
    if (!estimateId || loading || !canEditEstimateBody) {
      return;
    }
    if (clientAbbr.trim() === "") {
      return;
    }
    if (savedPersistSnapshotJsonRef.current === "") {
      return;
    }
    if (currentPersistSnapshotJson === savedPersistSnapshotJsonRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      void persistEstimateRef.current({ silent: true });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [currentPersistSnapshotJson, estimateId, loading, canEditEstimateBody, clientAbbr]);

  const saveEstimate = async () => {
    await persistEstimate();
  };

  const openPreview = async () => {
    const savedId = await persistEstimate();
    if (!savedId || savedId <= 0) {
      return;
    }
    window.open(`/estimates/${savedId}/preview`, "_blank", "noopener,noreferrer");
  };

  const saveVisibility = async () => {
    if (!estimateId) {
      setMessage("見積作成後に公開範囲を設定できます。");
      return;
    }
    try {
      const payload = {
        estimate_id: estimateId,
        visibility_scope: visibilityScope,
        team_permissions: permissionRows
          .filter((row) => row.subjectType === "team" && row.subject.trim() !== "")
          .map((row) => ({ team_tag: row.subject.trim(), role: row.role })),
        user_permissions: permissionRows
          .filter((row) => row.subjectType === "user" && row.subject.trim() !== "")
          .map((row) => ({ user_id: Number(row.subject), role: row.role }))
          .filter((row) => Number.isFinite(row.user_id) && row.user_id > 0),
      };
      const res = await fetch("/api/portal/estimate-visibility", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { success?: boolean; message?: string };
      if (!res.ok || !data.success) {
        setMessage(data.message ?? "公開範囲の保存に失敗しました。");
        return;
      }
      setMessage("公開範囲と権限を保存しました。");
    } catch {
      setMessage("公開範囲の保存に失敗しました。");
    }
  };

  const saveLinkedProjects = async () => {
    if (!estimateId) {
      setMessage("見積作成後に案件紐づけを設定できます。");
      return;
    }
    const projectIds = linkedProjectsText
      .split(",")
      .map((v) => Number.parseInt(v.trim(), 10))
      .filter((v) => Number.isFinite(v) && v > 0);
    try {
      const res = await fetch("/api/portal/estimate-project-links", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimate_id: estimateId,
          links: projectIds.map((projectId, idx) => ({ project_id: projectId, link_type: idx === 0 ? "primary" : "related" })),
        }),
      });
      const data = (await res.json()) as { success?: boolean; message?: string };
      if (!res.ok || !data.success) {
        setMessage(data.message ?? "案件紐づけの保存に失敗しました。");
        return;
      }
      setMessage("案件紐づけを保存しました。");
    } catch {
      setMessage("案件紐づけの保存に失敗しました。");
    }
  };

  const { a4ExportRowCount, previewOverflowsA4 } = useMemo(() => {
    const n = countEstimateHtmlExportRowBudget(lines);
    return { a4ExportRowCount: n, previewOverflowsA4: n > ESTIMATE_A4_HTML_EXPORT_ROW_BUDGET };
  }, [lines]);
  const linkedProjectIds = useMemo(
    () =>
      linkedProjectsText
        .split(",")
        .map((v) => Number.parseInt(v.trim(), 10))
        .filter((v) => Number.isFinite(v) && v > 0),
    [linkedProjectsText],
  );

  const applyLinkedProjectIds = (ids: number[]) => {
    const uniq = Array.from(new Set(ids.filter((v) => Number.isFinite(v) && v > 0)));
    setLinkedProjectsText(uniq.join(","));
  };

  const addLinkedProjectBySuggest = () => {
    const raw = projectSuggestInput.trim();
    if (raw === "") return;
    const byIdMatch = raw.match(/#(\d+)\)?$/);
    let targetId = byIdMatch?.[1] ? Number.parseInt(byIdMatch[1], 10) : NaN;
    if (!Number.isFinite(targetId)) {
      const byName = projectSuggestRows.find((p) => `${p.name} (#${p.id})` === raw || p.name === raw);
      targetId = byName ? byName.id : NaN;
    }
    if (!Number.isFinite(targetId) || targetId <= 0) {
      setMessage("Project候補から選択してください。");
      return;
    }
    applyLinkedProjectIds([...linkedProjectIds, targetId]);
    setProjectSuggestInput("");
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <ScrollPanel
        className={cn("min-h-0 w-full flex-1 space-y-4 pr-1", totalsDockVisible ? "pb-24" : "pb-20")}
      >
      <section className="surface-card pm-page-hero relative shrink-0 overflow-hidden px-5">
        <div className="pointer-events-none absolute -top-10 right-0 h-36 w-36 rounded-full bg-[color:color-mix(in_srgb,var(--accent)_22%,transparent)] blur-3xl" />
        <div className="relative flex h-full min-h-0 items-center justify-between gap-3">
          <div className="flex min-h-0 min-w-0 flex-1 items-start gap-3">
            <Link
              href="/estimates"
              prefetch
              className="shrink-0 pt-0.5 text-sm text-[color:color-mix(in_srgb,var(--accent)_82%,var(--foreground)_18%)] hover:underline"
            >
              ←戻る
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-semibold leading-tight tracking-tight text-[var(--foreground)] md:text-2xl">
                {estimateEditHeroTitle}
              </h1>
              <p className="mt-1 min-w-0 truncate text-sm leading-relaxed text-[var(--foreground)]">
                {clientName.trim() !== "" ? clientName.trim() : "クライアント名未設定"} {recipientText.replace(/\s+/g, " ").trim() !== "" ? recipientText.replace(/\s+/g, " ").trim() : "見積先未設定"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-nowrap items-center gap-2 sm:gap-3">
            <Button
              type="button"
              variant="default"
              size="sm"
              className="inline-flex shrink-0 items-center gap-1.5 self-center rounded-lg"
              disabled={loading || pdfDownloading}
              onClick={async () => {
                if (!estimateId) {
                  setMessage("作成後に出力できます。");
                  return;
                }
                setPdfDownloading(true);
                setMessage(null);
                try {
                  const savedId = await persistEstimate();
                  if (!savedId || savedId <= 0) {
                    return;
                  }
                  const res = await fetch("/api/portal/estimate-export-pdf", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ estimate_id: savedId }),
                  });
                  const ct = res.headers.get("content-type") ?? "";
                  if (!res.ok) {
                    if (ct.includes("application/json")) {
                      const data = (await res.json()) as { message?: string };
                      setMessage(data.message ?? "PDF出力に失敗しました。");
                    } else {
                      setMessage("PDF出力に失敗しました。");
                    }
                    return;
                  }
                  if (!ct.includes("application/pdf")) {
                    setMessage("PDF出力の応答が不正です。");
                    return;
                  }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download =
                    downloadFilenameFromContentDisposition(res.headers.get("content-disposition")) ??
                    `${buildEstimateExportBasename(
                      {
                        estimate_number: estimateNumberFromApi,
                        client_abbr: clientAbbr.trim() !== "" ? clientAbbr.trim() : null,
                      },
                      estimateId ?? 0,
                    )}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                  setMessage("PDFをダウンロードしました。");
                } catch {
                  setMessage("PDF出力に失敗しました。");
                } finally {
                  setPdfDownloading(false);
                }
              }}
            >
              <FileText className="h-4 w-4 shrink-0 text-red-600" aria-hidden />
              {pdfDownloading ? "PDF生成中…" : "PDF出力"}
            </Button>
            {/*
            <Button
              type="button"
              variant="default"
              size="sm"
              className="inline-flex shrink-0 items-center gap-1.5 self-center rounded-lg"
              onClick={async () => {
                if (!estimateId) {
                  setMessage("作成後に出力できます。");
                  return;
                }
                const res = await fetch("/api/portal/estimate-export-xlsx", {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ estimate_id: estimateId }),
                });
                const data = (await res.json()) as {
                  success?: boolean;
                  content_base64?: string;
                  filename?: string;
                  mime_type?: string;
                  a4_overflow_warning?: boolean;
                  message?: string;
                };
                if (!res.ok || !data.success || !data.content_base64) {
                  setMessage(data.message ?? "Excel出力に失敗しました。");
                  return;
                }
                const bin = atob(data.content_base64);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) {
                  bytes[i] = bin.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: data.mime_type ?? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = data.filename ?? "estimate.xlsx";
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                if (data.a4_overflow_warning) {
                  setMessage("Excel（.xlsx）を出力しました。A4 1ページ超過の可能性があります。");
                } else {
                  setMessage("Excel（.xlsx）を出力しました。");
                }
              }}
              disabled={loading}
            >
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-500" />
              Excel出力
            </Button>
            */}
            <Button
              type="button"
              variant="default"
              size="sm"
              className="shrink-0 self-center rounded-lg"
              onClick={undo}
              title="やり直し"
              disabled={historyStack.length === 0 || loading || !canEditEstimateBody}
            >
              <Undo2 className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="shrink-0 self-center rounded-lg"
              onClick={redo}
              title="すすむ"
              disabled={futureStack.length === 0 || loading || !canEditEstimateBody}
            >
              <Redo2 className="h-4 w-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="shrink-0 self-center rounded-lg"
              onClick={() => void openPreview()}
              disabled={loading || pdfDownloading}
            >
              プレビュー
            </Button>
            <Button
              type="button"
              variant="accent"
              size="sm"
              className="shrink-0 self-center rounded-lg"
              onClick={saveEstimate}
              disabled={loading || pdfDownloading}
            >
              {loading ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </section>

      {message ? (
        <section className="surface-card shrink-0 px-4 py-2">
          <p className="text-sm text-[var(--foreground)]">{message}</p>
        </section>
      ) : null}
      {loading ? (
        <section className="surface-card shrink-0 px-4 py-2">
          <p className="text-sm text-[var(--muted)]">処理中…</p>
        </section>
      ) : null}

      <div className="flex min-h-0 flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <div className="min-w-0 w-full flex-1 space-y-4">
      <section className="surface-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <DropdownMenu open={estimateTemplateMenuOpen} onOpenChange={setEstimateTemplateMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={loading}
                className="h-8 shrink-0 gap-1 px-2"
                title="テンプレート"
              >
                <BookTemplate className="h-4 w-4" />
                <span className="text-[11px]">テンプレ</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[min(96vw,720px)] max-w-[720px] overflow-hidden p-0"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <div className="grid max-h-[min(72vh,560px)] grid-cols-2 divide-x divide-[color:color-mix(in_srgb,var(--border)_88%,transparent)]">
                <div className="flex min-h-0 min-w-0 flex-col bg-[color:color-mix(in_srgb,var(--surface)_98%,transparent)]">
                  <div className="shrink-0 border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] p-2">
                    <p className="mb-1 text-xs font-semibold text-[var(--foreground)]">個人</p>
                    <div className="rounded-lg border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)] p-2.5">
                      <p className="mb-2 text-[10px] leading-snug text-[var(--muted)]">自分だけが編集・削除・ロックできます</p>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="h-8 w-full border-[color:color-mix(in_srgb,var(--border)_92%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_88%,black_12%)] text-[var(--foreground)] hover:bg-[color:color-mix(in_srgb,var(--surface)_82%,black_18%)]"
                        disabled={loading || bodyFieldDisabled}
                        onClick={() => openEstimateTemplateSaveDialog("private")}
                      >
                        現在の内容を保存…
                      </Button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    {privateEstimateTemplates.length === 0 ? (
                      <p className="py-6 text-center text-[11px] text-[var(--muted)]">個人テンプレはありません</p>
                    ) : (
                      <div className="space-y-2">
                        {privateEstimateTemplates.map((t) => (
                          <EstimateTemplateDropdownCard
                            key={t.id}
                            t={t}
                            loading={loading}
                            disableTemplateLoad={bodyFieldDisabled}
                            currentUserId={currentUserId}
                            isAdminMe={isAdminMe}
                            templateActionBusyId={templateActionBusyId}
                            templateDeleteBusy={templateDeleteBusy}
                            showScopeChip={false}
                            onDelete={(id, name) => setDeleteTemplateDialog({ id, name })}
                            onLoad={(id) => requestApplyTemplateById(id)}
                            onToggleLock={() => void setEstimateTemplateLocked(t.id, !t.locked)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex min-h-0 min-w-0 flex-col bg-[color:color-mix(in_srgb,var(--accent)_6%,var(--surface)_94%)]">
                  <div className="shrink-0 border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] p-2">
                    <p className="mb-1 text-xs font-semibold text-[color:color-mix(in_srgb,var(--foreground)_82%,var(--accent)_18%)]">全体</p>
                    {isAdminMe ? (
                      <div className="rounded-lg border border-[color:color-mix(in_srgb,var(--accent)_50%,var(--border)_50%)] bg-[color:color-mix(in_srgb,var(--accent)_12%,var(--surface)_88%)] p-2.5 shadow-[inset_0_1px_0_0_color-mix(in_srgb,var(--accent)_22%,transparent)]">
                        <p className="mb-2 text-[10px] leading-snug text-[var(--muted)]">全員が読み込み可。保存・削除・ロックは管理者のみ</p>
                        <Button
                          type="button"
                          variant="accent"
                          size="sm"
                          className="h-8 w-full"
                          disabled={loading || bodyFieldDisabled}
                          onClick={() => openEstimateTemplateSaveDialog("shared")}
                        >
                          現在の内容を保存…
                        </Button>
                      </div>
                    ) : (
                      <p className="rounded-md border border-[color:color-mix(in_srgb,var(--border)_85%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_92%,transparent)] px-2 py-2 text-[10px] leading-snug text-[var(--muted)]">
                        全体テンプレの新規保存・更新は管理者のみです。下の一覧から読み込みできます。
                      </p>
                    )}
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    {sharedEstimateTemplates.length === 0 ? (
                      <p className="py-6 text-center text-[11px] text-[var(--muted)]">全体テンプレはありません</p>
                    ) : (
                      <div className="space-y-2">
                        {sharedEstimateTemplates.map((t) => (
                          <EstimateTemplateDropdownCard
                            key={t.id}
                            t={t}
                            loading={loading}
                            disableTemplateLoad={bodyFieldDisabled}
                            currentUserId={currentUserId}
                            isAdminMe={isAdminMe}
                            templateActionBusyId={templateActionBusyId}
                            templateDeleteBusy={templateDeleteBusy}
                            showScopeChip={false}
                            onDelete={(id, name) => setDeleteTemplateDialog({ id, name })}
                            onLoad={(id) => requestApplyTemplateById(id)}
                            onToggleLock={() => void setEstimateTemplateLocked(t.id, !t.locked)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-3 md:col-span-2 md:grid-cols-[2fr_1fr_1fr] md:items-end">
            <div className="min-w-0 space-y-1">
              <Label htmlFor="estimate-client-name">クライアント名</Label>
              <div className="flex min-w-0 flex-row flex-nowrap items-end gap-2">
                <Input
                  id="estimate-client-name"
                  className="min-w-0 flex-1"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  disabled={bodyFieldDisabled}
                />
                <Input
                  ref={clientAbbrInputRef}
                  id="estimate-client-abbr"
                  className="h-9 w-[6.25rem] shrink-0 sm:w-28"
                  value={clientAbbr}
                  onChange={(e) => {
                    const v = e.target.value;
                    setClientAbbr(v);
                    abbrLinkedToNameRef.current = v.trim() === "";
                  }}
                  disabled={bodyFieldDisabled}
                  placeholder="略称（見積用）"
                  maxLength={64}
                  aria-label="略称（見積用）"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor="estimate-sales-assignee">担当者</Label>
              <div ref={assigneeSuggestWrapRef} className="relative min-w-0">
                <Input
                  id="estimate-sales-assignee"
                  value={salesAssigneeInput}
                  onChange={(e) => {
                    setSalesAssigneeInput(e.target.value);
                    setAssigneeSuggestOpen(true);
                  }}
                  onFocus={() => setAssigneeSuggestOpen(true)}
                  onBlur={() => {
                    commitAssigneeFromInput();
                  }}
                  placeholder="氏名・メールの一部で検索"
                  autoComplete="off"
                  disabled={bodyFieldDisabled}
                />
                {assigneeSuggestOpen ? (
                  <div className={PORTAL_THEMED_SUGGEST_PANEL} role="listbox" aria-label="担当者候補">
                    {filteredAssigneeSuggestRows.length === 0 ? (
                      <p className={PORTAL_THEMED_SUGGEST_MUTED}>候補がありません</p>
                    ) : (
                      filteredAssigneeSuggestRows.map((r) => {
                        const { primary, secondary } = splitAssigneeLabelForSuggest(r.label);
                        return (
                          <button
                            key={r.id}
                            type="button"
                            role="option"
                            className={PORTAL_THEMED_SUGGEST_ROW}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setSalesUserId(r.id);
                              setSalesAssigneeInput(r.label);
                              setAssigneeSuggestOpen(false);
                            }}
                          >
                            <span className="block text-sm font-medium text-[var(--foreground)]">{primary}</span>
                            {secondary !== "" ? (
                              <span className="block truncate text-xs text-[var(--muted)]">{secondary}</span>
                            ) : null}
                          </button>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor="estimate-status">ステータス</Label>
              <Select value={estimateStatus} onValueChange={(value) => setEstimateStatus(value as typeof estimateStatus)} disabled={loading}>
                <SelectTrigger id="estimate-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">下書き</SelectItem>
                  <SelectItem value="submitted">提出済み</SelectItem>
                  <SelectItem value="won">受注</SelectItem>
                  <SelectItem value="lost">失注</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 md:col-span-2 md:grid-cols-[2fr_1fr_1fr] md:items-end">
            <div className="min-w-0 space-y-1">
              <Label htmlFor="estimate-title">件名</Label>
              <Input id="estimate-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={bodyFieldDisabled} />
            </div>
            <div className="min-w-0">
              <ThemeDateField label="発行日" value={issueDate} onChange={setIssueDate} required disabled={bodyFieldDisabled} />
            </div>
            <div className="min-w-0 space-y-1">
              <Label htmlFor="estimate-delivery-due">納入予定</Label>
              <Input
                id="estimate-delivery-due"
                value={deliveryDueText}
                onChange={(e) => setDeliveryDueText(e.target.value)}
                placeholder="要相談"
                disabled={bodyFieldDisabled}
                className="h-9"
                maxLength={255}
              />
            </div>
          </div>
          <div className="space-y-1 md:col-span-2 md:grid md:grid-cols-[2fr_1fr_1fr] md:items-start md:gap-3">
            <div className="min-w-0 space-y-1">
              <Label htmlFor="estimate-recipient-text">見積先（2行程度）</Label>
              <textarea
                id="estimate-recipient-text"
                className={cn(inputBaseClassName, "h-auto min-h-16 resize-y py-2")}
                rows={2}
                value={recipientText}
                onChange={(e) => setRecipientText(e.target.value)}
                disabled={bodyFieldDisabled}
              />
            </div>
            {taxRateChoices.length > 1 ? (
              <div className="min-w-0 space-y-1">
                <Label htmlFor="estimate-tax-choice">消費税率(%)</Label>
                <Select
                  value={selectedTaxEffectiveFrom}
                  disabled={bodyFieldDisabled}
                  onValueChange={(value) => {
                    const target = taxRateChoices.find((row) => row.effectiveFrom === value);
                    setSelectedTaxEffectiveFrom(value);
                    if (target) setTaxRatePercent(target.rate);
                  }}
                >
                  <SelectTrigger id="estimate-tax-choice">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {taxRateChoices.map((choice) => (
                      <SelectItem key={`tax-${choice.effectiveFrom}-${choice.rate}`} value={choice.effectiveFrom}>
                        {choice.effectiveFrom} ({choice.rate}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="min-w-0 space-y-1">
                <Label htmlFor="estimate-tax-rate-readonly">消費税率(%)</Label>
                <Input id="estimate-tax-rate-readonly" value={`${taxRatePercent}%`} disabled readOnly />
              </div>
            )}
            <div className="flex min-w-0 flex-col gap-1.5" role="group" aria-labelledby="estimate-rough-heading">
              <span
                id="estimate-rough-heading"
                className="block text-xs font-medium leading-none text-[var(--muted)]"
              >
                概算表記
              </span>
              <label
                htmlFor="estimate-is-rough"
                className={cn(
                  "flex min-h-9 items-start gap-2 text-sm leading-snug text-[var(--foreground)]",
                  bodyFieldDisabled ? "cursor-not-allowed opacity-80" : "cursor-pointer",
                )}
              >
                <input
                  id="estimate-is-rough"
                  type="checkbox"
                  checked={isRoughEstimate}
                  onChange={(e) => setIsRoughEstimate(e.target.checked)}
                  disabled={bodyFieldDisabled}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[var(--background)] accent-[color:color-mix(in_srgb,var(--accent)_78%,var(--foreground)_22%)]"
                />
                <span className="min-w-0 pt-px">タイトルを概算御見積書にする</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-card p-4">
        <div className="mb-2 flex min-h-9 flex-nowrap items-center justify-between gap-2 overflow-x-auto pb-0.5">
          <div className="flex shrink-0 items-center gap-2">
            <h2 className="shrink-0 text-sm font-semibold">明細行</h2>
            <div className="w-[min(100%,220px)] shrink-0">
              <Select value={majorCategoryToAdd} onValueChange={setMajorCategoryToAdd} disabled={bodyFieldDisabled}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTIMATE_MAJOR_CATEGORIES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" variant="default" size="sm" onClick={addMajorCategoryLine} disabled={loading || bodyFieldDisabled}>
              大項目追加
            </Button>
          </div>
          <div className="flex shrink-0 flex-nowrap items-center justify-end gap-1">
            <Button
              type="button"
              variant="default"
              size="sm"
              className="shrink-0 whitespace-nowrap"
              onClick={openProgressFeeModal}
              disabled={loading || bodyFieldDisabled}
            >
              進行管理費追加
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="shrink-0 whitespace-nowrap"
              onClick={() => {
                setBulkPasteDraft("");
                setBulkPasteOpen(true);
              }}
              disabled={loading || bodyFieldDisabled}
            >
              テキスト一括貼付
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="shrink-0 whitespace-nowrap"
              onClick={() => applyUnitConversionAll("person_day")}
              disabled={loading || bodyFieldDisabled}
            >
              全行: 人月→人日
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="shrink-0 whitespace-nowrap"
              onClick={() => applyUnitConversionAll("person_month")}
              disabled={loading || bodyFieldDisabled}
            >
              全行: 人日→人月
            </Button>
            <Button type="button" variant="default" size="sm" className="shrink-0 whitespace-nowrap" onClick={addLine} disabled={loading || bodyFieldDisabled}>
              行追加
            </Button>
          </div>
        </div>
        <div className="min-w-0 overflow-x-auto overflow-y-visible">
          <table className="w-full min-w-[800px] table-fixed border-collapse text-sm">
            <caption className="sr-only">大項目行の直下に、子となる明細行を追加できます。</caption>
            <colgroup>
              <col style={{ width: "2.25rem" }} />
              {/* 項目名: 残り幅（他列の % / rem を除いた領域。単位・金額を縮めた分がここに配分される） */}
              <col />
              <col style={{ width: "8%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "15%" }} />
              {/* 行複製＋削除アイコン用の固定幅（親行・子行でセル境界を揃える） */}
              <col style={{ width: "10rem" }} />
            </colgroup>
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs font-semibold text-[var(--foreground)]">
                <th className={cn(estimateLinesStickyThClass, "px-0.5 py-1.5 align-middle")} scope="col">
                  <span className="sr-only">行の並び替え</span>
                </th>
                <th className={cn(estimateLinesStickyThClass, "px-2 py-1.5 align-middle")}>項目名</th>
                <th className={cn(estimateLinesStickyThClass, "px-2 py-1.5 text-right align-middle")}>数量</th>
                <th className={cn(estimateLinesStickyThClass, "px-2 py-1.5 align-middle")}>単位</th>
                <th className={cn(estimateLinesStickyThClass, "px-2 py-1.5 text-right align-middle")}>単価</th>
                <th
                  className={cn(estimateLinesStickyThClass, "px-2 py-1.5 text-right align-middle")}
                  title="行金額は 数量×単価×係数（単位が%のときは (数量÷100)×単価×係数。数量はパーセント値）。係数は既定1（保存済みの値があればそのまま計算に使用）"
                >
                  金額
                </th>
                <th className={cn(estimateLinesStickyThClass, "px-1 py-1.5 align-middle")} scope="col">
                  <div className="flex h-8 min-h-8 min-w-0 flex-nowrap items-center justify-end gap-0.5">
                    <div className="relative inline-flex h-8 shrink-0 items-center">
                      <Button type="button" variant="default" size="sm" className="pointer-events-none opacity-0" tabIndex={-1} aria-hidden>
                        行複製
                      </Button>
                      <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--foreground)]">
                        操作
                      </span>
                    </div>
                    <span className="h-8 w-8 shrink-0" aria-hidden />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody
              ref={tbodyRef}
              onDragOver={canEditEstimateBody ? onTbodyDragOver : undefined}
              onDrop={canEditEstimateBody ? onTbodyDrop : undefined}
            >
              {lines.map((line, index) => {
                const majorRow = isMajorHeadingLine(line);
                const lineAmount = computeEstimateLineAmount({
                  quantity: line.quantity,
                  unit_price: line.unit_price,
                  factor: line.factor,
                  unit_type: line.unit_type,
                });
                const lineCalcKind = majorRow ? null : getLinePriceCalcKind(line.item_name);
                const isLastLineRow = index === lines.length - 1;
                const insertAfter =
                  dropIndicatorIndex !== null &&
                  isLastLineRow &&
                  (dropIndicatorIndex === lines.length || dropIndicatorIndex === lines.length - 1);
                const insertBefore = dropIndicatorIndex !== null && dropIndicatorIndex === index && !insertAfter;
                const lineDragRowProps = canEditEstimateBody
                  ? {
                      draggable: true as const,
                      "data-estimate-line-row": true as const,
                      onDragStart: (e: DragEvent<HTMLTableRowElement>) => {
                        draggingIndexRef.current = index;
                        setDraggingIndex(index);
                        setDropIndicatorIndex(null);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(index));
                      },
                      onDragEnd: clearLineDrag,
                    }
                  : { "data-estimate-line-row": true as const };
                const itemNameFiltered = majorRow ? [] : filterItemNameSuggestions(itemSuggestions, line.item_name);
                const insertIndicatorClass =
                  insertBefore &&
                  "before:pointer-events-none before:absolute before:inset-x-1 before:top-0 before:z-[1] before:h-[3px] before:-translate-y-1/2 before:rounded-full before:bg-[color:color-mix(in_srgb,var(--accent)_90%,transparent)] before:shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_30%,transparent)]";
                const insertIndicatorAfterClass =
                  insertAfter &&
                  "after:pointer-events-none after:absolute after:inset-x-1 after:bottom-0 after:z-[1] after:h-[3px] after:translate-y-1/2 after:rounded-full after:bg-[color:color-mix(in_srgb,var(--accent)_90%,transparent)] after:shadow-[0_0_0_1px_color-mix(in_srgb,var(--accent)_30%,transparent)]";
                if (majorRow) {
                  const heading = String(line.major_category ?? line.item_name ?? "");
                  const majorLineActions = (
                    <div className="flex h-8 min-h-8 min-w-0 flex-nowrap items-center justify-end gap-0.5">
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="shrink-0"
                        disabled={bodyFieldDisabled}
                        onClick={() => void duplicateLine(index)}
                      >
                        行複製
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className={cn(trashDeleteIconButtonClassName, "shrink-0")}
                        disabled={bodyFieldDisabled}
                        onClick={() => removeLine(index)}
                        aria-label="行を削除"
                        title="行を削除"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                      </Button>
                    </div>
                  );
                  return (
                    <tr
                      key={`line-${index}-${line.id ?? "n"}-major`}
                      className={cn(
                        "relative border-b border-[color:color-mix(in_srgb,var(--border)_85%,transparent)]",
                        "bg-[color:color-mix(in_srgb,var(--accent)_10%,var(--surface)_90%)]",
                        draggingIndex === index && "opacity-60",
                        insertIndicatorClass,
                        insertIndicatorAfterClass,
                      )}
                      {...lineDragRowProps}
                    >
                      <td
                        className={cn(
                          "border-l-[3px] border-l-[color:color-mix(in_srgb,var(--accent)_50%,transparent)] px-0.5 py-1.5 align-middle",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-flex h-8 w-9 touch-none select-none items-center justify-center rounded px-0.5 text-[color:color-mix(in_srgb,var(--muted)_95%,transparent)]",
                            canEditEstimateBody ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed opacity-60",
                          )}
                          title={canEditEstimateBody ? "ドラッグして並び替え" : "下書きのときのみ並び替えできます"}
                        >
                          <GripVertical className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                        </span>
                      </td>
                      <td colSpan={3} className="min-w-0 px-2 py-1.5 align-middle">
                        <Input
                          className={cn("h-8 min-w-0 w-full font-semibold", estimateJapaneseLineTextFieldClass)}
                          lang="ja"
                          inputMode="text"
                          autoCapitalize="none"
                          value={heading}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateLine(index, { major_category: v, category: v, item_name: v });
                          }}
                          placeholder="大項目"
                          aria-label="セクション見出し"
                          disabled={bodyFieldDisabled}
                        />
                      </td>
                      <td className="px-2 py-1.5 align-middle" aria-hidden>
                        <span className="block h-8 min-h-8" />
                      </td>
                      <td className="min-w-0 whitespace-nowrap px-2 py-1.5 text-right align-middle tabular-nums" aria-hidden>
                        <span className="block h-8 min-h-8" />
                      </td>
                      <td className="px-1 py-1.5 align-middle">{majorLineActions}</td>
                    </tr>
                  );
                }
                return (
                  <tr
                    key={`line-${index}-${line.id ?? "n"}-detail`}
                    className={cn(
                      "relative border-b border-[color:color-mix(in_srgb,var(--border)_80%,transparent)]",
                      index % 2 === 1
                        ? "bg-[color:color-mix(in_srgb,var(--surface)_94%,var(--background)_6%)]"
                        : "bg-[var(--background)]",
                      draggingIndex === index && "opacity-60",
                      insertIndicatorClass,
                      insertIndicatorAfterClass,
                    )}
                    {...lineDragRowProps}
                  >
                    <td
                      className={cn(
                        "border-l-[3px] border-l-[color:color-mix(in_srgb,var(--accent)_50%,transparent)] px-0.5 py-1.5 align-middle",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex h-8 w-9 touch-none select-none items-center justify-center rounded px-0.5 text-[color:color-mix(in_srgb,var(--muted)_95%,transparent)]",
                          canEditEstimateBody ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed opacity-60",
                        )}
                        title={canEditEstimateBody ? "ドラッグして並び替え" : "下書きのときのみ並び替えできます"}
                      >
                        <GripVertical className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                      </span>
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <div className="relative min-w-0" ref={itemSuggestOpenIndex === index ? itemSuggestWrapRef : undefined}>
                        <Input
                          className={cn("h-8 bg-[var(--surface)]", estimateJapaneseLineTextFieldClass)}
                          lang="ja"
                          inputMode="text"
                          autoCapitalize="none"
                          value={line.item_name}
                          onChange={(e) => {
                            updateLine(index, { item_name: e.target.value });
                            setItemSuggestOpenIndex(index);
                          }}
                          onFocus={() => setItemSuggestOpenIndex(index)}
                          placeholder="項目名"
                          autoComplete="off"
                          disabled={bodyFieldDisabled}
                        />
                        {itemSuggestOpenIndex === index ? (
                          <div className={PORTAL_THEMED_SUGGEST_PANEL} role="listbox" aria-label="項目名候補">
                            {itemNameFiltered.length === 0 ? (
                              <p className={PORTAL_THEMED_SUGGEST_MUTED}>候補がありません</p>
                            ) : (
                              itemNameFiltered.map((suggestion, suggestionIdx) => (
                                <button
                                  key={`item-${index}-${suggestionIdx}-${suggestion.display}-${suggestion.from}`}
                                  type="button"
                                  role="option"
                                  className={PORTAL_THEMED_SUGGEST_ROW}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    updateLine(index, { item_name: suggestion.display });
                                    setItemSuggestOpenIndex(null);
                                  }}
                                >
                                  <span className="block text-sm font-medium text-[var(--foreground)]">{suggestion.display}</span>
                                  {suggestion.from === "history" ? (
                                    <span className="block text-xs text-[var(--muted)]">履歴</span>
                                  ) : null}
                                </button>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <Input
                        type="number"
                        step="0.01"
                        className={cn("h-8 bg-[var(--surface)] text-right tabular-nums", noNumberInputSpinnerClass)}
                        value={line.quantity}
                        onChange={(e) => updateLine(index, { quantity: Number(e.target.value) })}
                        disabled={bodyFieldDisabled}
                      />
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <Select
                        value={line.unit_type}
                        disabled={bodyFieldDisabled}
                        onValueChange={(value) => updateLine(index, { unit_type: value as EstimateLine["unit_type"] })}
                      >
                        <SelectTrigger className="h-8 bg-[var(--surface)]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="person_month">人月</SelectItem>
                          <SelectItem value="person_day">人日</SelectItem>
                          <SelectItem value="set">式</SelectItem>
                          <SelectItem value="page">頁</SelectItem>
                          <SelectItem value="times">回</SelectItem>
                          <SelectItem value="percent">%</SelectItem>
                          <SelectItem value="monthly_fee">月額</SelectItem>
                          <SelectItem value="annual_fee">年額</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <div className="flex min-w-0 items-center gap-1">
                        {lineCalcKind != null && !bodyFieldDisabled ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 shrink-0 whitespace-nowrap border border-[var(--border)] bg-[var(--surface)] px-2 text-xs hover:bg-[color:color-mix(in_srgb,var(--surface)_88%,var(--accent)_12%)]"
                            onClick={() => {
                              const indices = detailIndicesInSameMajorBlock(lines, index, isMajorHeadingLine);
                              const sum = sumCodingLineAmountsInIndices(lines, indices, index, isMajorHeadingLine);
                              const mult = lineCalcKind === "liquid" ? 2 : 0.5;
                              const unit_price = Number((sum * mult).toFixed(2));
                              updateLine(index, { unit_price, unit_type: "set", quantity: 1 });
                            }}
                          >
                            計算
                          </Button>
                        ) : null}
                        <Input
                          type="number"
                          step="1"
                          className={cn(
                            "h-8 min-w-0 flex-1 bg-[var(--surface)] text-right tabular-nums",
                            noNumberInputSpinnerClass,
                          )}
                          value={line.unit_price}
                          onChange={(e) => updateLine(index, { unit_price: Number(e.target.value) })}
                          disabled={bodyFieldDisabled}
                        />
                      </div>
                    </td>
                    <td className="min-w-0 whitespace-nowrap px-2 py-1.5 text-right align-middle tabular-nums text-[var(--foreground)]">
                      {lineAmount.toLocaleString("ja-JP")}
                    </td>
                    <td className="px-1 py-1.5 align-middle">
                      <div className="flex h-8 min-h-8 min-w-0 flex-nowrap items-center justify-end gap-0.5">
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          className="shrink-0"
                          disabled={bodyFieldDisabled}
                          onClick={() => void duplicateLine(index)}
                        >
                          行複製
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className={cn(trashDeleteIconButtonClassName, "shrink-0")}
                          disabled={bodyFieldDisabled}
                          onClick={() => removeLine(index)}
                          aria-label="行を削除"
                          title="行を削除"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr className="border-b border-[color:color-mix(in_srgb,var(--border)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_98%,transparent)]">
                <td colSpan={7} className="px-2 py-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <div className="w-[min(100%,220px)] shrink-0">
                      <Select value={majorCategoryToAdd} onValueChange={setMajorCategoryToAdd} disabled={bodyFieldDisabled}>
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ESTIMATE_MAJOR_CATEGORIES.map((m) => (
                            <SelectItem key={`foot-${m}`} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="button" variant="default" size="sm" className="shrink-0" onClick={addMajorCategoryLine} disabled={loading || bodyFieldDisabled}>
                      大項目追加
                    </Button>
                    <Button type="button" variant="default" size="sm" className="shrink-0" onClick={addLine} disabled={loading || bodyFieldDisabled}>
                      行追加
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface-card p-4">
        <p className={cn("text-xs leading-relaxed", previewOverflowsA4 ? "text-amber-600" : "text-[var(--muted)]")}>
          {previewOverflowsA4 ? <span className="font-medium">警告: A4縦1ページを超える可能性があります。</span> : null}
          {previewOverflowsA4 ? " " : null}
          プレビュー帳票では各大項目ブロックごとに「見出し1行＋明細各行＋小計1行」を数え、合計が
          <strong className="mx-0.5 text-[var(--foreground)]">{ESTIMATE_A4_HTML_EXPORT_ROW_BUDGET}</strong>
          行相当を超えると超過警告になります（現在
          <strong className="mx-0.5 text-[var(--foreground)]">{a4ExportRowCount}</strong> 行相当）。
        </p>
      </section>

      <section className="surface-card p-4">
        <div className="space-y-1">
          <Label htmlFor="estimate-remarks">備考（御見積書のプレビュー・HTML 出力に表示されます）</Label>
          <HearingAutoTextarea
            id="estimate-remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            disabled={bodyFieldDisabled}
            className="text-sm leading-snug py-2"
          />
        </div>
      </section>

      <section className="surface-card p-4">
        <div className="space-y-1">
          <Label htmlFor="estimate-internal-memo">社内メモ（見積単位で1か所のみ。顧客向け出力には非表示）</Label>
          <HearingAutoTextarea
            id="estimate-internal-memo"
            value={internalMemo}
            onChange={(e) => setInternalMemo(e.target.value)}
            readOnly={bodyFieldDisabled}
            className="text-sm leading-snug py-2"
          />
        </div>
      </section>

        </div>

      <aside
        className={cn(
          "relative mt-0 flex min-w-0 flex-col gap-3 lg:mt-0 lg:shrink-0 lg:self-start lg:sticky lg:top-4",
          "w-full",
          "motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-out",
          rightSidebarCollapsed ? "lg:w-11 lg:overflow-hidden" : "lg:w-[320px]",
        )}
      >
        {rightSidebarCollapsed ? (
          <div className="relative flex h-8 w-full items-start justify-center">
            <Button
              type="button"
              variant="default"
              size="sm"
              className="group h-8 w-8 shrink-0 p-0 shadow-sm"
              onClick={() => setRightSidebarCollapsed(false)}
              aria-expanded={!rightSidebarCollapsed}
              aria-label="右ペインを展開"
            >
              <ChevronLeft className="h-3.5 w-3.5 rotate-0 text-[var(--foreground)]" aria-hidden strokeWidth={2.25} />
            </Button>
          </div>
        ) : (
          <section className="surface-card flex min-h-0 flex-col p-0 lg:min-h-0">
            <div className="space-y-4 p-4 pb-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">関連設定 / 権限</h2>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="group h-8 w-8 shrink-0 p-0 shadow-sm"
                onClick={() => setRightSidebarCollapsed(true)}
                aria-expanded={!rightSidebarCollapsed}
                aria-label="右ペインを折りたたむ"
              >
                <ChevronLeft className="h-3.5 w-3.5 rotate-180 text-[var(--foreground)]" aria-hidden strokeWidth={2.25} />
              </Button>
            </div>

            <div className="mb-4 space-y-2 rounded border border-[var(--border)] p-3">
              <p className="text-sm font-medium">対象 / 遷移</p>
              <Link
                href="/estimates"
                className="flex items-center gap-2 rounded border border-[var(--border)] px-2 py-1.5 text-sm hover:bg-[color:color-mix(in_srgb,var(--surface)_88%,transparent)]"
              >
                <PortalAppIcon appKey="estimate-manager" className="h-4 w-4" />
                見積一覧へ
              </Link>
              <Link
                href="/project-list"
                className="flex items-center gap-2 rounded border border-[var(--border)] px-2 py-1.5 text-sm hover:bg-[color:color-mix(in_srgb,var(--surface)_88%,transparent)]"
              >
                <PortalAppIcon appKey="project-manager" className="h-4 w-4" />
                Project一覧へ
              </Link>
            </div>

            <div className="space-y-4">
          <div>
            <div className="space-y-1">
              <Label htmlFor="estimate-visibility-scope">公開範囲</Label>
              <Select value={visibilityScope} onValueChange={(value) => setVisibilityScope(value as "public_all_users" | "restricted")}>
                <SelectTrigger id="estimate-visibility-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public_all_users">全ユーザー参照可</SelectItem>
                  <SelectItem value="restricted">個別制限</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm">アクセス設定（owner / editor / viewer）</p>
            <AccessControlTable rows={permissionRows} onChange={setPermissionRows} readOnly={visibilityScope !== "restricted"} userSuggestions={userSuggestRows} />
            <div className="mt-2">
              <Button type="button" variant="default" size="sm" onClick={saveVisibility}>
                権限保存
              </Button>
            </div>
          </div>

          <div>
            <div className="space-y-1">
              <Label htmlFor="estimate-linked-projects">紐づけProject（名称サジェスト）</Label>
              <div ref={projectSuggestWrapRef} className="relative min-w-0">
                <Input
                  id="estimate-linked-projects"
                  value={projectSuggestInput}
                  onChange={(event) => {
                    setProjectSuggestInput(event.target.value);
                    setProjectSuggestOpen(true);
                  }}
                  onFocus={() => setProjectSuggestOpen(true)}
                  placeholder="Project名を入力"
                  autoComplete="off"
                />
                {projectSuggestOpen ? (
                  <div className={PORTAL_THEMED_SUGGEST_PANEL} role="listbox" aria-label="Project候補">
                    {filteredProjectSuggestRows.length === 0 ? (
                      <p className={PORTAL_THEMED_SUGGEST_MUTED}>候補がありません</p>
                    ) : (
                      filteredProjectSuggestRows.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          role="option"
                          className={PORTAL_THEMED_SUGGEST_ROW}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setProjectSuggestInput(`${p.name} (#${p.id})`);
                            setProjectSuggestOpen(false);
                          }}
                        >
                          <span className="block text-sm font-medium text-[var(--foreground)]">{p.name}</span>
                          <span className="block truncate text-xs text-[var(--muted)]">
                            {p.client_name != null && p.client_name.trim() !== ""
                              ? `${p.client_name} · #${p.id}`
                              : `#${p.id}`}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <Button type="button" variant="default" size="sm" onClick={addLinkedProjectBySuggest}>
                追加
              </Button>
              <Button type="button" variant="default" size="sm" onClick={saveLinkedProjects}>
                紐づけ保存
              </Button>
              {estimateId ? (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={async () => {
                    const projectIds = linkedProjectsText
                      .split(",")
                      .map((v) => Number.parseInt(v.trim(), 10))
                      .filter((v) => Number.isFinite(v) && v > 0);
                    if (projectIds.length === 0) {
                      setMessage("Project ID を入力してください。");
                      return;
                    }
                    const projectId = projectIds[0]!;
                    await fetch("/api/portal/project-estimates", {
                      method: "PATCH",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ project_id: projectId, estimate_ids: [estimateId] }),
                    });
                    setMessage(`Project #${projectId} からも見積紐づけを更新しました。`);
                  }}
                >
                  Project基点で更新
                </Button>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {linkedProjectIds.map((projectId) => {
                const row = projectSuggestRows.find((p) => p.id === projectId);
                const label = row ? `${row.name} (#${row.id})` : `#${projectId}`;
                return (
                  <button
                    key={`linked-project-chip-${projectId}`}
                    type="button"
                    className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[color:color-mix(in_srgb,var(--surface)_88%,transparent)]"
                    onClick={() => applyLinkedProjectIds(linkedProjectIds.filter((id) => id !== projectId))}
                    title="クリックで削除"
                  >
                    {label} ×
                  </button>
                );
              })}
              {linkedProjectIds.length === 0 ? <p className="text-xs text-[var(--muted)]">紐づけProject未選択</p> : null}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm">変更履歴（監査ログ）</p>
            <div className="max-h-48 overflow-auto rounded border border-[var(--border)]">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    <th className="px-2 py-1">日時</th>
                    <th className="px-2 py-1">操作</th>
                    <th className="px-2 py-1">実行者</th>
                  </tr>
                </thead>
                <tbody>
                  {operationLogs.slice(0, 50).map((log) => (
                    <tr key={`estimate-log-${log.id}`} className="border-b border-[var(--border)]">
                      <td className="px-2 py-1">{String(log.created_at).replace("T", " ").slice(0, 19)}</td>
                      <td className="px-2 py-1">{log.operation_type}</td>
                      <td className="px-2 py-1">user#{log.operator_user_id}</td>
                    </tr>
                  ))}
                  {operationLogs.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-2 py-2 text-center text-[var(--muted)]">
                        履歴がありません。
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
            </div>
            </div>
          </section>
        )}
      </aside>
      </div>
      </ScrollPanel>

      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[40] flex justify-center px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        role="region"
        aria-label="税抜・消費税・税込合計"
      >
        {totalsDockVisible ? (
          <Card
            className={cn(
              "pointer-events-auto w-fit max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg shadow-lg",
              accentButtonSurfaceBaseClassName,
            )}
          >
            <CardContent className="flex items-center gap-2 p-0 px-3 py-2.5">
              <div className="grid min-w-0 shrink grid-cols-3 gap-x-3 text-sm tabular-nums sm:gap-x-4">
                <div className="min-w-0 text-center text-[var(--accent-contrast)]">
                  税抜: <span className="font-medium">{subtotal.toLocaleString("ja-JP")}</span>
                </div>
                <div className="min-w-0 text-center text-[var(--accent-contrast)]">
                  消費税: <span className="font-medium">{taxAmount.toLocaleString("ja-JP")}</span>
                </div>
                <div className="min-w-0 text-center text-[var(--accent-contrast)]">
                  税込合計: <span className="font-semibold">{total.toLocaleString("ja-JP")}</span>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-[var(--accent-contrast)] hover:bg-[color:color-mix(in_srgb,white_14%,transparent)] hover:text-[var(--accent-contrast)]"
                aria-label="合計バーを閉じる"
                onClick={() => {
                  setTotalsDockVisible(false);
                  writeEstimateTotalsDockCookie("hidden");
                }}
              >
                <X className="h-4 w-4" strokeWidth={2} aria-hidden />
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Button
            type="button"
            variant="default"
            size="sm"
            className="pointer-events-auto shadow-md"
            aria-label="税抜・消費税・税込合計を表示"
            onClick={() => {
              setTotalsDockVisible(true);
              writeEstimateTotalsDockCookie("visible");
            }}
          >
            合計を表示
          </Button>
        )}
      </div>

      <Dialog open={estimateTemplateSaveOpen} onOpenChange={(open) => !open && closeEstimateTemplateSaveDialog()}>
        <DialogContent
          className="z-[260] gap-4 sm:max-w-md"
          overlayClassName="z-[259]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>テンプレートとして保存</DialogTitle>
          </DialogHeader>
          <p className="rounded-md border border-[color:color-mix(in_srgb,var(--border)_85%,transparent)] bg-[color:color-mix(in_srgb,var(--surface-soft)_55%,transparent)] px-2.5 py-2 text-xs leading-relaxed text-[var(--foreground)]">
            {estimateTemplateSaveScope === "private" ? (
              <>
                保存先: <span className="font-semibold">個人テンプレ</span>
                <span className="text-[var(--muted)]">（自分のみが編集・削除・ロックできます）</span>
              </>
            ) : (
              <>
                保存先: <span className="font-semibold">全体テンプレ</span>
                <span className="text-[var(--muted)]">（全員が読み込み可。更新は管理者のみ）</span>
              </>
            )}
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="estimate-template-name">テンプレート名</Label>
            <Input
              id="estimate-template-name"
              type="text"
              autoComplete="off"
              placeholder="例: 標準見積レイアウト"
              value={estimateTemplateName}
              onChange={(e) => setEstimateTemplateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveEstimateTemplateFromDialog();
                }
              }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={closeEstimateTemplateSaveDialog} disabled={estimateTemplateSaving}>
              キャンセル
            </Button>
            <Button type="button" variant="accent" size="sm" onClick={() => void saveEstimateTemplateFromDialog()} disabled={estimateTemplateSaving}>
              {estimateTemplateSaving ? "保存中…" : "保存"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={estimateTemplateOverwriteOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEstimateTemplateOverwriteOpen(false);
            setEstimateTemplateOverwriteId(null);
            setEstimateTemplateOverwriteTargetLocked(false);
          }
        }}
      >
        <DialogContent
          className="z-[262] gap-4 sm:max-w-md"
          overlayClassName="z-[261]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>テンプレートの上書き</DialogTitle>
            {estimateTemplateOverwriteTargetLocked ? (
              <DialogDescription className="text-base font-medium text-red-500 dark:text-red-400">
                ロック中ですが、上書きしますか？
              </DialogDescription>
            ) : (
              <DialogDescription>同じ名前のテンプレートが既にあります。上書きしてよいですか？</DialogDescription>
            )}
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEstimateTemplateOverwriteOpen(false);
                setEstimateTemplateOverwriteId(null);
                setEstimateTemplateOverwriteTargetLocked(false);
              }}
              disabled={estimateTemplateSaving}
            >
              キャンセル
            </Button>
            <Button type="button" variant="accent" size="sm" onClick={() => void confirmOverwriteEstimateTemplate()} disabled={estimateTemplateSaving}>
              {estimateTemplateSaving ? "保存中…" : "上書きする"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={templateLoadDialogOpen}
        onOpenChange={(open) => {
          setTemplateLoadDialogOpen(open);
          if (!open) setPendingTemplateId(null);
        }}
      >
        <DialogContent
          className={cn(
            "z-[260] max-w-md border-red-500/40 bg-[color:color-mix(in_srgb,color-mix(in_srgb,var(--surface)_92%,black_8%)_94%,rgb(239_68_68)_6%)] text-[var(--foreground)]",
            "shadow-[inset_0_1px_0_0_rgba(239,68,68,0.2)]",
          )}
          overlayClassName="z-[259]"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-red-500 dark:text-red-400">テンプレを読み込む</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-[var(--foreground)]">
            すでに入力されている値はすべてリセットされます。続行しますか？
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => {
                setTemplateLoadDialogOpen(false);
                setPendingTemplateId(null);
              }}
            >
              キャンセル
            </Button>
            <Button type="button" variant="accent" size="sm" onClick={confirmTemplateLoadDialog}>
              はい
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTemplateDialog !== null} onOpenChange={(open) => !open && setDeleteTemplateDialog(null)}>
        <DialogContent className="z-[260] max-w-md" overlayClassName="z-[259]" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>テンプレートを削除</DialogTitle>
            <DialogDescription>
              {deleteTemplateDialog ? `「${deleteTemplateDialog.name}」を削除します。よろしいですか？` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setDeleteTemplateDialog(null)} disabled={templateDeleteBusy}>
              キャンセル
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => void confirmDeleteEstimateTemplate()} disabled={templateDeleteBusy}>
              {templateDeleteBusy ? "削除中…" : "削除"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={progressFeeOpen}
        onOpenChange={(open) => {
          setProgressFeeOpen(open);
          if (!open) resetProgressFeeModalState();
        }}
      >
        <DialogContent
          className={cn(
            "z-[260] flex max-h-[min(96dvh,960px)] w-[min(96vw,56rem)] max-w-[56rem] flex-col gap-0 overflow-hidden p-0",
            "border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[var(--surface)]",
          )}
          overlayClassName="z-[259]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="shrink-0 border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] px-6 pb-3 pt-4">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="text-lg">進行管理費の追加</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed text-[var(--muted)]">
                チェックした明細の金額合計に対し、数量（%）を掛けた金額を確認してから反映します。（補助ツール）
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] divide-y divide-[color:color-mix(in_srgb,var(--border)_85%,transparent)] overflow-hidden lg:grid-cols-[minmax(272px,22rem)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:divide-x lg:divide-y-0">
            <Card className="min-h-0 min-w-0 self-start rounded-none border-0 bg-transparent shadow-none lg:max-w-sm">
              <CardContent className="flex flex-col gap-3 px-5 py-3 sm:gap-3 sm:py-4 lg:pb-6 lg:pt-4">
                <fieldset className="min-w-0 space-y-2.5">
                  <legend className="mb-0.5 text-sm font-semibold text-[var(--foreground)]">反映先</legend>
                  <div className="space-y-2.5 rounded-xl border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface-soft)_55%,transparent)] p-2.5 sm:p-3">
                    <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug text-[var(--foreground)]">
                      <input
                        type="radio"
                        name="progress-fee-dest"
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[color:color-mix(in_srgb,var(--accent)_78%,var(--foreground)_22%)]"
                        checked={progressFeeMode === "under_major"}
                        disabled={bodyFieldDisabled}
                        onChange={() => {
                          setProgressFeeMode("under_major");
                          setProgressFeeCheckedDetailIndices(new Set());
                        }}
                      />
                      <span>
                        チェックした親行（大項目）ブロック内の最下行に1行入れる
                        <span className="mt-1 block text-xs font-normal leading-relaxed text-[var(--muted)]">
                          あるブロックの子にチェックしたら、他ブロックの子は選べません。
                        </span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-snug text-[var(--foreground)]">
                      <input
                        type="radio"
                        name="progress-fee-dest"
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[color:color-mix(in_srgb,var(--accent)_78%,var(--foreground)_22%)]"
                        checked={progressFeeMode === "other"}
                        disabled={bodyFieldDisabled}
                        onChange={() => {
                          setProgressFeeMode("other");
                          setProgressFeeCheckedDetailIndices(new Set());
                        }}
                      />
                      <span>
                        大項目「{ESTIMATE_OTHER_MAJOR_LABEL}」のブロックの最下行に1行入れる
                        <span className="mt-1 block text-xs font-normal leading-relaxed text-[var(--muted)]">
                          「{ESTIMATE_OTHER_MAJOR_LABEL}」親行が無いときは反映時に親行を自動追加します。
                        </span>
                      </span>
                    </label>
                  </div>
                </fieldset>

                <div className="space-y-1.5">
                  <Label htmlFor="progress-fee-qty" className="text-sm font-medium">
                    数量（%）
                  </Label>
                  <Input
                    id="progress-fee-qty"
                    type="number"
                    className={cn(noNumberInputSpinnerClass, "tabular-nums")}
                    min={0}
                    step={0.01}
                    value={Number.isFinite(progressFeeQtyPercent) ? progressFeeQtyPercent : 10}
                    disabled={bodyFieldDisabled}
                    onChange={(e) => {
                      const v = Number.parseFloat(e.target.value);
                      setProgressFeeQtyPercent(Number.isFinite(v) ? v : 10);
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="text-sm font-medium text-[var(--foreground)]">単位</span>
                  <div
                    className={cn(
                      inputBaseClassName,
                      "h-9 cursor-default select-none items-center bg-[color:color-mix(in_srgb,var(--surface-soft)_70%,var(--background)_30%)] text-[var(--foreground)] shadow-none",
                    )}
                    aria-readonly
                  >
                    ％
                  </div>
                </div>

                <div className="space-y-1.5 pb-0.5">
                  <span className="text-sm font-medium text-[var(--foreground)]">金額（計算）</span>
                  <div
                    id="progress-fee-amt-display"
                    className={cn(
                      inputBaseClassName,
                      "h-auto min-h-9 cursor-default select-none items-center justify-end bg-[color:color-mix(in_srgb,var(--surface-soft)_70%,var(--background)_30%)] py-2 text-right text-sm font-medium tabular-nums text-[var(--foreground)] shadow-none",
                    )}
                    aria-live="polite"
                    aria-readonly
                  >
                    {progressFeeComputedAmount.toLocaleString("ja-JP")}
                  </div>
                  <p className="pb-0.5 text-xs leading-snug text-[var(--muted)] sm:leading-relaxed">
                    チェックONの明細金額合計 × 数量%（表示のみ）
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="flex min-h-0 min-w-0 flex-1 flex-col rounded-none border-0 bg-transparent shadow-none">
              <CardContent className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-5 py-3 sm:py-4">
                <Label className="shrink-0 text-sm font-semibold text-[var(--foreground)]">対象明細（チェック）</Label>
                {progressFeeVisibleBlocks.length === 0 ? (
                  <p className="text-sm leading-relaxed text-[var(--muted)]">表示する大項目がありません。</p>
                ) : (
                  <div className="modern-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--background)_88%,var(--surface)_12%)] p-2.5 pr-1.5">
                    <div className="space-y-3">
                      {progressFeeVisibleBlocks.map((block, blockIdx) => {
                        const otherBlockDimmed =
                          progressFeeMode === "under_major" &&
                          progressFeeActiveBlockListIndex !== null &&
                          progressFeeActiveBlockListIndex !== blockIdx;
                        const allDetailsChecked =
                          block.detailLineIndices.length > 0 &&
                          block.detailLineIndices.every((i) => progressFeeCheckedDetailIndices.has(i));
                        const someDetailsChecked = block.detailLineIndices.some((i) => progressFeeCheckedDetailIndices.has(i));
                        return (
                          <div key={`pf-block-${block.majorLineIndex}`} className="space-y-1">
                            <label
                              className={cn(
                                "flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--accent)_8%,transparent)]",
                                otherBlockDimmed && "opacity-55",
                              )}
                            >
                              <input
                                type="checkbox"
                                className="h-4 w-4 shrink-0 accent-[color:color-mix(in_srgb,var(--accent)_78%,var(--foreground)_22%)]"
                                ref={(el) => {
                                  if (!el) return;
                                  el.indeterminate = someDetailsChecked && !allDetailsChecked;
                                }}
                                checked={allDetailsChecked}
                                disabled={bodyFieldDisabled || block.detailLineIndices.length === 0}
                                onChange={(e) => toggleProgressFeeParentBlock(blockIdx, e.target.checked)}
                              />
                              <span className="min-w-0 truncate">{block.majorHeading}</span>
                              <span className="shrink-0 text-xs font-normal text-[var(--muted)]">（大項目）</span>
                            </label>
                            <div className="space-y-0.5 border-l-2 border-[color:color-mix(in_srgb,var(--accent)_35%,transparent)] pl-3">
                              {block.detailLineIndices.map((lineIndex) => {
                                const line = lines[lineIndex];
                                if (!line) return null;
                                const amt = computeEstimateLineAmount({
                                  quantity: line.quantity,
                                  unit_price: line.unit_price,
                                  factor: line.factor,
                                  unit_type: line.unit_type,
                                });
                                return (
                                  <label
                                    key={`pf-detail-${lineIndex}`}
                                    className={cn(
                                      "flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-sm text-[var(--foreground)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--accent)_6%,transparent)]",
                                      otherBlockDimmed && "opacity-55",
                                    )}
                                  >
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 shrink-0 accent-[color:color-mix(in_srgb,var(--accent)_78%,var(--foreground)_22%)]"
                                      checked={progressFeeCheckedDetailIndices.has(lineIndex)}
                                      disabled={bodyFieldDisabled}
                                      onChange={(e) => toggleProgressFeeDetailLine(blockIdx, lineIndex, e.target.checked)}
                                    />
                                    <span className="min-w-0 flex-1 truncate">{line.item_name || "（項目名なし）"}</span>
                                    <span className="shrink-0 tabular-nums text-xs text-[var(--muted)]">{amt.toLocaleString("ja-JP")}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_96%,black_4%)] px-5 py-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setProgressFeeOpen(false)}>
              キャンセル
            </Button>
            <Button
              type="button"
              variant="accent"
              size="sm"
              disabled={progressFeeCheckedDetailIndices.size === 0 || bodyFieldDisabled}
              onClick={applyProgressFeeFromModal}
            >
              反映する
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkPasteOpen}
        onOpenChange={(open) => {
          setBulkPasteOpen(open);
          if (!open) setBulkPasteDraft("");
        }}
      >
        <DialogContent className="max-h-[min(90vh,640px)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>テキスト一括貼付</DialogTitle>
            <DialogDescription>
              1行につき1明細行として追加します。明細ツールバーで選んでいる大項目を、各行の大項目・区分にセットし、貼り付けた文字列を項目名にします。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="bulk-paste-text">貼り付けテキスト</Label>
              <textarea
                id="bulk-paste-text"
                className={cn(inputBaseClassName, "h-48 w-full resize-y py-2")}
                value={bulkPasteDraft}
                onChange={(e) => setBulkPasteDraft(e.target.value)}
                placeholder={"例:\n項目A\n項目B"}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="default" size="sm" onClick={() => setBulkPasteOpen(false)}>
                キャンセル
              </Button>
              <Button type="button" variant="accent" size="sm" onClick={applyBulkPasteLines}>
                追加
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
