"use client";

import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Label } from "@/app/components/ui/label";
import { diffHearingRows, mergeHearingItems, type HearingMergeMode } from "@/lib/hearing-import-merge";
import type { HearingSheetRow } from "@/lib/hearing-sheet-types";
import { HEARING_TEMPLATE_LABELS, type HearingTemplateId } from "@/lib/hearing-sheet-template-matrix";
import { cn } from "@/lib/utils";
import { useCallback, useRef, useState } from "react";

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
    hint: "見出しが一致する行は空のセルのみ取り込み。新規行は末尾に追加。",
  },
  {
    value: "append",
    label: "行を追加のみ",
    hint: "見出し+分類の組がまだ無い行だけ追加します。",
  },
];

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

  const reset = useCallback(() => {
    setMergeMode("fill_empty");
    setFile(null);
    setError(null);
    setStep("pick");
    setMergedPreview(null);
    setDiffInfo(null);
    setMeta(null);
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
        return;
      }
      const imported = bodyJson.items as HearingSheetRow[];
      const merged = mergeHearingItems(currentRows, imported, mergeMode);
      const d = diffHearingRows(currentRows, merged);
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
    } catch {
      setError("取り込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [file, canEdit, resolvedTemplateId, mergeMode, currentRows]);

  const apply = useCallback(() => {
    if (!mergedPreview) {
      return;
    }
    onApply(mergedPreview);
    handleOpenChange(false);
  }, [mergedPreview, onApply, handleOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] w-[min(92vw,520px)] overflow-y-auto">
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
            <p className="text-xs text-[var(--muted)]">内容を確認し、問題なければ「表に反映」を押してください（未保存のままなので、その後「保存」で DB に書き込みます）。</p>
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
  );
}
