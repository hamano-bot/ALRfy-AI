"use client";

import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Label } from "@/app/components/ui/label";
import {
  diffHearingRows,
  diffPreviewRows,
  mergeHearingItems,
  type HearingMergeMode,
  type HearingPreviewRowDiff,
} from "@/lib/hearing-import-merge";
import type { HearingSheetRow } from "@/lib/hearing-sheet-types";
import { HEARING_TEMPLATE_LABELS, type HearingTemplateId } from "@/lib/hearing-sheet-template-matrix";
import { displayText } from "@/lib/empty-display";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type HearingImportExcelDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resolvedTemplateId: HearingTemplateId;
  currentRows: HearingSheetRow[];
  canEdit: boolean;
  onApply: (rows: HearingSheetRow[]) => void;
};

const MERGE_OPTIONS: { value: HearingMergeMode; label: string; hint: string }[] = [
  {
    value: "replace",
    label: "すべて置換",
    hint: "取り込み結果で表をまるごと差し替えます。",
  },
  {
    value: "fill_empty",
    label: "空欄を埋める（推奨）",
    hint: "見出しと確認事項が一致する行同士では、空のセルのみ取り込みます。分類は照合に使いません。新規行は末尾に追加。",
  },
  {
    value: "append",
    label: "行を追加のみ",
    hint: "見出しと確認事項の組がまだ無い行だけ追加します。分類は照合に使いません。",
  },
];

function cellClass(changed: boolean): string {
  return changed
    ? "bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)] ring-1 ring-inset ring-[color:color-mix(in_srgb,var(--accent)_35%,transparent)]"
    : "";
}

function rowBadgeLabel(d: HearingPreviewRowDiff, mergeMode: HearingMergeMode): string {
  if (mergeMode === "replace") {
    return "取込";
  }
  if (d.isNew) {
    return "追加";
  }
  if (d.changedFields.length > 0) {
    return "更新";
  }
  return "—";
}

export function HearingImportExcelDialog({
  open,
  onOpenChange,
  resolvedTemplateId,
  currentRows,
  canEdit,
  onApply,
}: HearingImportExcelDialogProps) {
  const [mergeMode, setMergeMode] = useState<HearingMergeMode>("fill_empty");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"pick" | "preview">("pick");
  const [mergedPreview, setMergedPreview] = useState<HearingSheetRow[] | null>(null);
  const [diffInfo, setDiffInfo] = useState<{ rowCountBefore: number; rowCountAfter: number } | null>(null);
  const [meta, setMeta] = useState<{ sheetName: string; text_truncated: boolean } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loadProgress, setLoadProgress] = useState(0);
  const [loadElapsedSec, setLoadElapsedSec] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const previewRows = useMemo((): HearingPreviewRowDiff[] => {
    if (!mergedPreview) {
      return [];
    }
    return diffPreviewRows(currentRows, mergedPreview, mergeMode);
  }, [currentRows, mergedPreview, mergeMode]);

  const reset = useCallback(() => {
    setMergeMode("fill_empty");
    setFile(null);
    setError(null);
    setStep("pick");
    setMergedPreview(null);
    setDiffInfo(null);
    setMeta(null);
    setLoadProgress(0);
    setLoadElapsedSec(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (!v) {
        reset();
      }
      onOpenChange(v);
    },
    [onOpenChange, reset],
  );

  useEffect(() => {
    if (!loading) {
      return;
    }
    const start = Date.now();
    setLoadProgress(0);
    setLoadElapsedSec(0);
    const interval = window.setInterval(() => {
      setLoadElapsedSec(Math.floor((Date.now() - start) / 1000));
      setLoadProgress((p) => {
        if (p >= 90) {
          return 90;
        }
        return Math.min(90, p + 1.5 + Math.random() * 3.5);
      });
    }, 400);
    return () => window.clearInterval(interval);
  }, [loading]);

  const runImport = useCallback(async () => {
    if (!file || !canEdit) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("template_id", resolvedTemplateId);
      const res = await fetch("/api/hearing-sheet/import-excel", {
        method: "POST",
        body: fd,
      });
      const text = await res.text();
      let msg = "取り込みに失敗しました。";
      let bodyJson: { items?: HearingSheetRow[] } | null = null;
      let metaPayload: { sheetName?: string; text_truncated?: boolean } | null = null;
      try {
        const j = JSON.parse(text) as {
          success?: boolean;
          message?: string;
          body_json?: { items?: HearingSheetRow[] };
          meta?: { sheetName?: string; text_truncated?: boolean };
        };
        if (typeof j.message === "string") {
          msg = j.message;
        }
        if (j.success && j.body_json?.items && Array.isArray(j.body_json.items)) {
          bodyJson = j.body_json;
          metaPayload = j.meta ?? null;
        }
      } catch {
        /* ignore */
      }
      if (!res.ok || !bodyJson?.items) {
        setError(msg);
        setLoading(false);
        setLoadProgress(0);
        setLoadElapsedSec(0);
        return;
      }
      const imported = bodyJson.items as HearingSheetRow[];
      const merged = mergeHearingItems(currentRows, imported, mergeMode);
      const d = diffHearingRows(currentRows, merged);
      setLoadProgress(100);
      window.setTimeout(() => {
        setMergedPreview(merged);
        setDiffInfo({ rowCountBefore: d.rowCountBefore, rowCountAfter: d.rowCountAfter });
        setMeta(
          metaPayload
            ? {
                sheetName: metaPayload.sheetName ?? "",
                text_truncated: Boolean(metaPayload.text_truncated),
              }
            : null,
        );
        setStep("preview");
        setLoading(false);
        setLoadProgress(0);
        setLoadElapsedSec(0);
      }, 150);
    } catch {
      setError("取り込みに失敗しました。");
      setLoading(false);
      setLoadProgress(0);
      setLoadElapsedSec(0);
    }
  }, [file, canEdit, resolvedTemplateId, mergeMode, currentRows]);

  const apply = useCallback(() => {
    if (!mergedPreview) {
      return;
    }
    onApply(mergedPreview);
    handleOpenChange(false);
  }, [mergedPreview, onApply, handleOpenChange]);

  const phaseLabel =
    loadElapsedSec < 3 ? "Excel のシートを読み取っています…" : "Gemini でヒアリング行にマッピングしています…";

  const showLoadingOverlay = loading && step === "pick";

  const loadingOverlay =
    portalReady && showLoadingOverlay ? (
      <div
        className="fixed inset-0 z-[151] flex flex-col items-center justify-center gap-4 bg-[color:color-mix(in_srgb,var(--background)_68%,black_32%)]/92 px-6 py-8 backdrop-blur-[3px]"
        role="status"
        aria-live="polite"
      >
        <Loader2
          className={cn("h-10 w-10 text-[var(--accent)]", !reduceMotion && "animate-spin")}
          aria-hidden
        />
        <p className="text-center text-sm font-medium text-[var(--foreground)]">{phaseLabel}</p>
        <div className="w-full max-w-sm space-y-1">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-[color:color-mix(in_srgb,var(--border)_70%,transparent)]"
            role="progressbar"
            aria-valuenow={Math.round(loadProgress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="解析の目安進捗"
          >
            <div
              className={cn(
                "h-full rounded-full bg-[color:color-mix(in_srgb,var(--accent)_85%,var(--foreground)_15%)] transition-[width] duration-300 ease-out",
                !reduceMotion && loadProgress < 100 ? "animate-pulse" : undefined,
              )}
              style={{ width: `${Math.min(100, loadProgress)}%` }}
            />
          </div>
          <p className="text-center text-[11px] leading-relaxed text-[var(--muted)]">
            目安 {Math.round(loadProgress)}%（推定）・約 {loadElapsedSec} 秒経過
            <br />
            <span className="text-[10px]">サーバーからの実進捗ではなく、完了までの目安表示です。</span>
          </p>
        </div>
      </div>
    ) : null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-busy={showLoadingOverlay}
        className={cn(
          "max-h-[90vh] overflow-y-auto",
          step === "preview" ? "w-[min(96vw,56rem)] max-w-[min(96vw,56rem)]" : "w-[min(92vw,520px)]",
        )}
      >
        <DialogHeader>
          <DialogTitle>Excel を取り込む</DialogTitle>
        </DialogHeader>

        {step === "pick" ? (
          <div className="space-y-4 text-sm">
            <p className="text-[var(--muted)]">
              {`Excel（.xlsx / .xls）の先頭シートを読み取り、Gemini で「${HEARING_TEMPLATE_LABELS[resolvedTemplateId]}」向けの行にマッピングします。`}
            </p>
            <div className="space-y-2">
              <Label htmlFor="hearing-excel-file">ファイル（.xlsx / .xls）</Label>
              <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[var(--edit-mode-surface)] p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={fileInputRef}
                    id="hearing-excel-file"
                    name="hearing-excel-file"
                    type="file"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    className="sr-only"
                    disabled={!canEdit || loading}
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <Button
                    type="button"
                    variant="accent"
                    disabled={!canEdit || loading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    ファイルを選択
                  </Button>
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm",
                      file ? "text-[var(--foreground)]" : "text-[var(--muted)]",
                    )}
                    title={file?.name}
                  >
                    {file ? file.name : "選択されていません"}
                  </span>
                </div>
              </div>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-[var(--muted)]">マージ方法</legend>
              {MERGE_OPTIONS.map((opt) => {
                const selected = mergeMode === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={cn(
                      "flex cursor-pointer gap-2 rounded-lg border p-3 transition-[border-color,background-color]",
                      selected
                        ? "border-[color:color-mix(in_srgb,var(--accent)_42%,var(--border)_58%)] bg-[color:color-mix(in_srgb,var(--accent)_9%,var(--surface)_91%)]"
                        : "border-[color:color-mix(in_srgb,var(--border)_85%,transparent)] hover:border-[color:color-mix(in_srgb,var(--border)_72%,var(--accent)_28%)]",
                    )}
                  >
                    <input
                      type="radio"
                      id={`hearing-excel-merge-${opt.value}`}
                      name="merge"
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--accent)]"
                      checked={selected}
                      disabled={!canEdit || loading}
                      onChange={() => setMergeMode(opt.value)}
                    />
                    <span>
                      <span className="font-medium text-[var(--foreground)]">{opt.label}</span>
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">{opt.hint}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
            {error ? (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="default" onClick={() => handleOpenChange(false)} disabled={loading}>
                キャンセル
              </Button>
              <Button
                type="button"
                variant="accent"
                disabled={!canEdit || !file || loading}
                onClick={() => void runImport()}
              >
                {loading ? "解析中…" : "取り込んでプレビュー"}
              </Button>
            </div>

          </div>
        ) : (
          <div className="space-y-4 text-sm">
            <p className="text-[var(--foreground)]">
              マージ結果の行数: <strong>{diffInfo?.rowCountBefore ?? 0}</strong> →{" "}
              <strong>{diffInfo?.rowCountAfter ?? 0}</strong>
            </p>
            {meta ? (
              <p className="text-xs text-[var(--muted)]">
                シート: {meta.sheetName || "（不明）"}
                {meta.text_truncated ? " / 長いため先頭のみを Gemini に渡しました" : ""}
              </p>
            ) : null}
            {mergeMode === "replace" ? (
              <p className="text-xs text-amber-800 dark:text-amber-200">
                すべて置換のため、現在の表は取り込み結果で置き換わります。
              </p>
            ) : null}
            <div className="overflow-hidden rounded-lg border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)]">
              <div
                className="max-h-[min(50vh,24rem)] overflow-auto"
                aria-label="マージ結果のプレビュー"
                role="region"
              >
                <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-[1] border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)]">
                    <tr>
                      <th className="whitespace-nowrap px-2 py-2 font-medium text-[var(--muted)]">種別</th>
                      <th className="whitespace-nowrap px-2 py-2 font-medium text-[var(--muted)]">分類</th>
                      <th className="whitespace-nowrap px-2 py-2 font-medium text-[var(--muted)]">見出し</th>
                      <th className="min-w-[8rem] px-2 py-2 font-medium text-[var(--muted)]">確認事項</th>
                      <th className="min-w-[8rem] px-2 py-2 font-medium text-[var(--muted)]">回答</th>
                      <th className="whitespace-nowrap px-2 py-2 font-medium text-[var(--muted)]">担当</th>
                      <th className="whitespace-nowrap px-2 py-2 font-medium text-[var(--muted)]">期限</th>
                      <th className="whitespace-nowrap px-2 py-2 font-medium text-[var(--muted)]">状況</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((d, i) => {
                      const { row } = d;
                      const changed = (f: keyof HearingSheetRow) =>
                        mergeMode !== "replace" && !d.isNew && d.changedFields.includes(f);
                      return (
                        <tr
                          key={`${row.id}-${i}`}
                          className="border-b border-[color:color-mix(in_srgb,var(--border)_70%,transparent)]"
                        >
                          <td className="whitespace-nowrap px-2 py-1.5 align-top text-[var(--muted)]">
                            {rowBadgeLabel(d, mergeMode)}
                          </td>
                          <td
                            className={cn(
                              "max-w-[8rem] whitespace-pre-wrap px-2 py-1.5 align-top",
                              cellClass(changed("category")),
                            )}
                          >
                            {displayText(row.category)}
                          </td>
                          <td
                            className={cn(
                              "max-w-[10rem] whitespace-pre-wrap px-2 py-1.5 align-top",
                              cellClass(changed("heading")),
                            )}
                          >
                            {displayText(row.heading)}
                          </td>
                          <td
                            className={cn(
                              "min-w-[8rem] whitespace-pre-wrap px-2 py-1.5 align-top",
                              cellClass(changed("question")),
                            )}
                          >
                            {displayText(row.question)}
                          </td>
                          <td
                            className={cn(
                              "min-w-[8rem] whitespace-pre-wrap px-2 py-1.5 align-top",
                              cellClass(changed("answer")),
                            )}
                          >
                            {displayText(row.answer)}
                          </td>
                          <td
                            className={cn(
                              "max-w-[6rem] whitespace-pre-wrap px-2 py-1.5 align-top",
                              cellClass(changed("assignee")),
                            )}
                          >
                            {displayText(row.assignee)}
                          </td>
                          <td
                            className={cn(
                              "whitespace-nowrap px-2 py-1.5 align-top font-mono tabular-nums",
                              cellClass(changed("due")),
                            )}
                          >
                            {displayText(row.due)}
                          </td>
                          <td
                            className={cn(
                              "max-w-[5rem] whitespace-pre-wrap px-2 py-1.5 align-top",
                              cellClass(changed("row_status")),
                            )}
                          >
                            {displayText(row.row_status)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-[var(--muted)]">
              内容を確認し、問題なければ「表に反映」を押してください（未保存のままなので、その後「保存」で DB に書き込みます）。
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="default" onClick={() => setStep("pick")}>
                戻る
              </Button>
              <Button type="button" variant="accent" onClick={apply}>
                表に反映
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
      {loadingOverlay ? createPortal(loadingOverlay, document.body) : null}
    </>
  );
}
