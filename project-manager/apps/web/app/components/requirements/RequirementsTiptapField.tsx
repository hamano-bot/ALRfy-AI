"use client";



import type { JSONContent } from "@tiptap/core";

import Placeholder from "@tiptap/extension-placeholder";

import { EditorContent, useEditor } from "@tiptap/react";

import StarterKit from "@tiptap/starter-kit";

import TextAlign from "@tiptap/extension-text-align";
import { Color, FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { RequirementsTiptapBlockContextMenu } from "@/app/components/requirements/RequirementsTiptapBlockContextMenu";

import { RequirementsTiptapOutline } from "@/app/components/requirements/RequirementsTiptapOutline";

import { RequirementsTiptapSlashMenu } from "@/app/components/requirements/RequirementsTiptapSlashMenu";

import { RequirementsTiptapTableBubbleMenu } from "@/app/components/requirements/RequirementsTiptapTableBubbleMenu";

import {
  RequirementsTiptapToolbar,
  type RequirementsTiptapNoticeOptions,
  type RequirementsTiptapToolbarHandle,
} from "@/app/components/requirements/RequirementsTiptapToolbar";

import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";

import { EMPTY_TIPTAP_DOC } from "@/lib/tiptap-json";

import { uploadProjectRequirementsImage } from "@/lib/requirements-image-upload-client";

import { RequirementsDragHandle } from "@/lib/tiptap-requirements-drag-handle";

import { RequirementsSlashExtension } from "@/lib/tiptap-requirements-slash-extension";

import { RequirementsBulletList } from "@/lib/tiptap-requirements-bullet-list";

import { RequirementsOrderedList } from "@/lib/tiptap-requirements-ordered-list";

import { TableCell } from "@tiptap/extension-table-cell";

import { TableHeader } from "@tiptap/extension-table-header";

import { TableRow } from "@tiptap/extension-table-row";

import { RequirementsColumn, RequirementsColumns } from "@/lib/tiptap-requirements-columns";

import { RequirementsImage } from "@/lib/tiptap-requirements-image";

import { RequirementsTable } from "@/lib/tiptap-requirements-table";

import NodeRange from "@tiptap/extension-node-range";

import { NodeSelection } from "@tiptap/pm/state";

import { cn } from "@/lib/utils";

type RequirementsTiptapFieldProps = {

  /** 画像を S3 に配置する際のプロジェクト ID（案件フォルダ `projects/{id}/...`） */

  projectId: number;

  doc: JSONContent;

  readOnly: boolean;

  onChange: (doc: JSONContent) => void;

  placeholder?: string;

  className?: string;

  id?: string;

};



export function RequirementsTiptapField({

  projectId,

  doc,

  readOnly,

  onChange,

  placeholder = "本文を入力…",

  className,

  id,

}: RequirementsTiptapFieldProps) {

  const lastEmittedJson = useRef<string>("");

  const slashImageInputRef = useRef<HTMLInputElement>(null);

  const toolbarRef = useRef<RequirementsTiptapToolbarHandle | null>(null);

  const [slashImageBusy, setSlashImageBusy] = useState(false);

  const [notice, setNotice] = useState<{ open: boolean; title: string; message: string }>({
    open: false,
    title: "",
    message: "",
  });

  const showNotice = useCallback((message: string, options?: RequirementsTiptapNoticeOptions) => {
    setNotice({
      open: true,
      title: options?.title ?? "お知らせ",
      message,
    });
  }, []);

  const closeNotice = useCallback(() => {
    setNotice((n) => ({ ...n, open: false }));
  }, []);

  const OUTLINE_LS_KEY = "alrfy-requirements-outline-visible";

  const [showOutline, setShowOutline] = useState(false);

  useEffect(() => {
    try {
      setShowOutline(window.localStorage.getItem(OUTLINE_LS_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleOutline = useCallback(() => {
    setShowOutline((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(OUTLINE_LS_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);



  const extensions = useMemo(

    () => [

      StarterKit.configure({

        heading: { levels: [1, 2, 3] },

        bulletList: false,

        orderedList: false,

        link: {

          openOnClick: false,

          autolink: true,

          linkOnPaste: true,

          HTMLAttributes: {

            class: null,

            target: null,

            rel: null,

          },

        },

      }),

      TextStyle,

      Color.configure({ types: ["textStyle"] }),

      FontFamily.configure({ types: ["textStyle"] }),

      FontSize.configure({ types: ["textStyle"] }),

      TextAlign.configure({
        types: ["paragraph", "heading", "blockquote"],
        alignments: ["left", "center", "right", "justify"],
        defaultAlignment: null,
      }),

      RequirementsBulletList,

      RequirementsOrderedList,

      RequirementsTable.configure({
        resizable: true,
        HTMLAttributes: {
          class: "requirements-tiptap-table",
          cellSpacing: 0,
          cellPadding: 0,
        },
      }),

      TableRow,

      TableHeader.configure({
        HTMLAttributes: {
          class: "requirements-tiptap-table-header-cell",
        },
      }),

      TableCell.configure({
        HTMLAttributes: {
          class: "requirements-tiptap-table-cell",
        },
      }),

      NodeRange,

      RequirementsDragHandle,

      RequirementsSlashExtension,

      RequirementsColumn,

      RequirementsColumns,

      RequirementsImage.configure({

        inline: false,

        allowBase64: false,

        resize: {

          enabled: true,

          minWidth: 80,

          minHeight: 48,

          alwaysPreserveAspectRatio: true,

        },

        HTMLAttributes: {

          class: "requirements-tiptap-image",

        },

      }),

      Placeholder.configure({ placeholder }),

    ],

    [placeholder],

  );



  const editor = useEditor({

    extensions,

    content: doc ?? EMPTY_TIPTAP_DOC,

    editable: !readOnly,

    immediatelyRender: false,

    editorProps: {

      attributes: {

        class: "requirements-tiptap-prose focus:outline-none",

        spellCheck: "false",

      },

      handleClickOn: (_view, _pos, node, nodePos) => {

        if (!_view.editable || node.type.name !== "image") {

          return false;

        }

        const { state, dispatch } = _view;

        dispatch(state.tr.setSelection(NodeSelection.create(state.doc, nodePos)));

        return true;

      },

    },

    onUpdate: ({ editor: ed }) => {

      const json = ed.getJSON();

      lastEmittedJson.current = JSON.stringify(json);

      onChange(json);

    },

  });



  useEffect(() => {

    editor?.setEditable(!readOnly);

  }, [editor, readOnly]);



  useEffect(() => {

    if (!editor) {

      return;

    }

    const incoming = JSON.stringify(doc ?? EMPTY_TIPTAP_DOC);

    if (incoming === lastEmittedJson.current) {

      return;

    }

    const cur = JSON.stringify(editor.getJSON());

    if (incoming === cur) {

      lastEmittedJson.current = incoming;

      return;

    }

    editor.commands.setContent(doc ?? EMPTY_TIPTAP_DOC, { emitUpdate: false });

    lastEmittedJson.current = incoming;

  }, [editor, doc]);



  /** スラッシュメニュー「画像」→ ファイル選択 */

  useEffect(() => {

    const openPicker = () => {

      if (!readOnly) {

        slashImageInputRef.current?.click();

      }

    };

    window.addEventListener("alrfy-tiptap-slash-image", openPicker);

    return () => window.removeEventListener("alrfy-tiptap-slash-image", openPicker);

  }, [readOnly]);



  const onSlashImageFile = useCallback(

    async (e: ChangeEvent<HTMLInputElement>) => {

      const file = e.target.files?.[0];

      e.target.value = "";

      if (!file || !editor || readOnly) {

        return;

      }

      setSlashImageBusy(true);

      try {

        const result = await uploadProjectRequirementsImage(projectId, file);

        if (!result.ok) {

          showNotice(result.message, { title: "画像のアップロード" });

          return;

        }

        const baseName = file.name.replace(/\.[^/.]+$/, "") || "image";

        editor.chain().focus().setImage({ src: result.url, alt: baseName }).run();

      } finally {

        setSlashImageBusy(false);

      }

    },

    [editor, projectId, readOnly, showNotice],

  );



  return (

    <div

      id={id}

      className={cn(

        "requirements-tiptap overflow-hidden rounded-md border border-[color:color-mix(in_srgb,var(--border)_90%,transparent)] bg-[color:color-mix(in_srgb,var(--surface)_96%,transparent)] shadow-sm",

        readOnly && "opacity-90",

        className,

      )}

    >

      <input

        ref={slashImageInputRef}

        type="file"

        accept="image/*"

        className="hidden"

        aria-hidden

        tabIndex={-1}

        disabled={slashImageBusy || readOnly}

        onChange={onSlashImageFile}

      />

      <RequirementsTiptapToolbar
        ref={toolbarRef}
        editor={editor}
        projectId={projectId}
        readOnly={readOnly}
        showOutline={showOutline}
        onToggleOutline={toggleOutline}
        onShowNotice={showNotice}
      />

      <Dialog open={notice.open} onOpenChange={(open) => !open && closeNotice()}>
        <DialogContent
          className="z-[160] gap-4 sm:max-w-md"
          overlayClassName="z-[159]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{notice.title}</DialogTitle>
            <DialogDescription className="whitespace-pre-wrap">{notice.message}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end pt-1">
            <Button type="button" size="sm" onClick={closeNotice}>
              OK
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">

        {showOutline ? <RequirementsTiptapOutline editor={editor} /> : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">

          <RequirementsTiptapBlockContextMenu editor={editor} readOnly={readOnly} toolbarRef={toolbarRef}>

            <EditorContent
              editor={editor}
              className="requirements-tiptap-editor relative min-h-[inherit] flex-1 overflow-y-auto"
            />

          </RequirementsTiptapBlockContextMenu>

          <RequirementsTiptapTableBubbleMenu editor={editor} readOnly={readOnly} />

        </div>

      </div>

      <RequirementsTiptapSlashMenu />

    </div>

  );

}


