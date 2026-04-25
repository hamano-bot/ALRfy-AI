"use client";

import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect } from "react";
import { createRequirementsTiptapExtensions } from "@/lib/create-requirements-tiptap-extensions";
import { EMPTY_TIPTAP_DOC } from "@/lib/tiptap-json";

type RequirementsTiptapTemplateHoverPeekProps = {
  doc: JSONContent | null;
};

export function RequirementsTiptapTemplateHoverPeek({ doc }: RequirementsTiptapTemplateHoverPeekProps) {
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
    if (!editor) {
      return;
    }
    editor.commands.setContent(doc ?? EMPTY_TIPTAP_DOC);
  }, [editor, doc]);

  return (
    <div className="w-[min(56vw,560px)] bg-white p-3 [--background:#ffffff] [--surface:#ffffff] [--surface-soft:#f8fafc] [--foreground:#0f172a] [--muted:#475569] [--border:#cbd5e1]">
      <div className="max-h-[340px] overflow-auto rounded-md bg-white p-1">
        <div className="requirements-tiptap overflow-hidden rounded-md bg-white">
          <div className="origin-top scale-[0.84] transform">
            {editor ? (
              <EditorContent editor={editor} className="requirements-tiptap-editor relative min-h-[200px]" />
            ) : (
              <p className="p-4 text-sm text-[var(--muted)]">読み込み中…</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
