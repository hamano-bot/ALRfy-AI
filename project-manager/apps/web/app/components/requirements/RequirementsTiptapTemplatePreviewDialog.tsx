"use client";

import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { createRequirementsTiptapExtensions } from "@/lib/create-requirements-tiptap-extensions";
import { EMPTY_TIPTAP_DOC } from "@/lib/tiptap-json";

type RequirementsTiptapTemplatePreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  doc: JSONContent | null;
  onApply: () => void;
};

export function RequirementsTiptapTemplatePreviewDialog({
  open,
  onOpenChange,
  title,
  doc,
  onApply,
}: RequirementsTiptapTemplatePreviewDialogProps) {
  const editor = useEditor({
    extensions: createRequirementsTiptapExtensions(""),
    content: EMPTY_TIPTAP_DOC,
    editable: false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "requirements-tiptap-prose focus:outline-none",
        spellCheck: "false",
      },
    },
  });

  useEffect(() => {
    if (!editor || !open) {
      return;
    }
    editor.commands.setContent(doc ?? EMPTY_TIPTAP_DOC);
  }, [editor, open, doc]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(88vh,720px)] w-[min(96vw,900px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] px-6 py-4">
          <DialogHeader>
            <DialogTitle className="text-base">テンプレートのプレビュー</DialogTitle>
            <p className="text-xs font-normal text-[var(--muted)]">{title}</p>
          </DialogHeader>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-white px-6 py-4 [--background:#ffffff] [--surface:#ffffff] [--surface-soft:#f8fafc] [--foreground:#0f172a] [--muted:#475569] [--border:#cbd5e1]">
          <div className="requirements-tiptap overflow-hidden rounded-md bg-white">
            <div className="origin-top scale-[0.92] transform">
              {editor ? (
                <EditorContent editor={editor} className="requirements-tiptap-editor relative min-h-[200px]" />
              ) : (
                <p className="p-4 text-sm text-[var(--muted)]">読み込み中…</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] px-6 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            閉じる
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              onApply();
              onOpenChange(false);
            }}
          >
            適用
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
