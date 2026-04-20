"use client";

import type { Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";
import { PluginKey } from "@tiptap/pm/state";
import { useEditorState } from "@tiptap/react";
import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { inputBaseClassName } from "@/app/components/ui/input";
import { cn } from "@/lib/utils";
import {
  getTableBorderPresetFromEditor,
  REQUIREMENTS_TABLE_BORDER_PRESETS,
  type RequirementsTableBorderPreset,
  runSetTableBorderPreset,
} from "@/lib/tiptap-requirements-table";

const tableBubblePluginKey = new PluginKey("requirementsTiptapTableBubble");

const BORDER_PRESET_LABEL: Record<RequirementsTableBorderPreset, string> = {
  default: "標準（実線）",
  none: "なし",
  dashed: "点線",
  thick: "太線",
  header_double: "タイトル下・二重＋実線",
  row_col_double: "タイトル下＋先頭列右・二重＋実線",
};

function sep() {
  return <div className="mx-0.5 h-5 w-px shrink-0 self-center bg-[color:color-mix(in_srgb,var(--border)_85%,transparent)]" aria-hidden />;
}

type TableBubbleUi = {
  inTable: boolean;
  borderPreset: RequirementsTableBorderPreset | null;
  canAddRowBefore: boolean;
  canAddRowAfter: boolean;
  canDeleteRow: boolean;
  canAddColumnBefore: boolean;
  canAddColumnAfter: boolean;
  canDeleteColumn: boolean;
  canMergeCells: boolean;
  canSplitCell: boolean;
  canToggleHeaderRow: boolean;
  canDeleteTable: boolean;
};

function getTableBubbleUi(ed: Editor): TableBubbleUi {
  const inTable = ed.isActive("table");
  if (!inTable) {
    return {
      inTable: false,
      borderPreset: null,
      canAddRowBefore: false,
      canAddRowAfter: false,
      canDeleteRow: false,
      canAddColumnBefore: false,
      canAddColumnAfter: false,
      canDeleteColumn: false,
      canMergeCells: false,
      canSplitCell: false,
      canToggleHeaderRow: false,
      canDeleteTable: false,
    };
  }
  const can = ed.can();
  return {
    inTable: true,
    borderPreset: getTableBorderPresetFromEditor(ed),
    canAddRowBefore: can.addRowBefore(),
    canAddRowAfter: can.addRowAfter(),
    canDeleteRow: can.deleteRow(),
    canAddColumnBefore: can.addColumnBefore(),
    canAddColumnAfter: can.addColumnAfter(),
    canDeleteColumn: can.deleteColumn(),
    canMergeCells: can.mergeCells(),
    canSplitCell: can.splitCell(),
    canToggleHeaderRow: can.toggleHeaderRow(),
    canDeleteTable: can.deleteTable(),
  };
}

type RequirementsTiptapTableBubbleMenuProps = {
  editor: Editor | null;
  readOnly: boolean;
};

/**
 * 表内の選択・キャレット時に表示するフローティング操作バー。
 * TipTap Pro の table-node と同等の導線をオープンソースの Table コマンドで提供する。
 */
export function RequirementsTiptapTableBubbleMenu({ editor, readOnly }: RequirementsTiptapTableBubbleMenuProps) {
  const [deleteTableDialogOpen, setDeleteTableDialogOpen] = useState(false);

  const ui = useEditorState({
    editor,
    selector: ({ editor: ed }) => (ed ? getTableBubbleUi(ed) : null),
  });

  if (!editor || readOnly) {
    return null;
  }

  const t = ui ?? getTableBubbleUi(editor);

  const confirmDeleteTable = () => {
    editor.chain().focus().deleteTable().run();
    setDeleteTableDialogOpen(false);
  };

  return (
    <>
    <BubbleMenu
      editor={editor}
      pluginKey={tableBubblePluginKey}
      shouldShow={({ editor: ed }) => !!ed && ed.isEditable && ed.isActive("table")}
      options={{
        placement: "top",
        offset: 8,
        flip: true,
        shift: { padding: 8 },
      }}
      className={cn(
        "z-[140] flex max-w-[min(100vw-1rem,42rem)] flex-wrap items-center gap-0.5 rounded-lg border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)]",
        "bg-[var(--surface)] px-1.5 py-1 text-[var(--foreground)] shadow-lg ring-1 ring-[color:color-mix(in_srgb,var(--accent)_22%,transparent)]",
      )}
    >
      <span className="mr-0.5 shrink-0 text-[10px] text-[var(--muted)]" title="表全体の罫線プリセット">
        罫線
      </span>
      {/*
        Radix Select は BubbleMenu（transform 付き浮遊 UI）内だとポップオーバー位置が (0,0) にずれることがある。
        ブラウザ標準の select はレイアウトに追従するためここではネイティブを使う。
      */}
      <select
        className={cn(
          inputBaseClassName,
          "h-7 w-[min(9.5rem,36vw)] shrink-0 cursor-pointer px-2 py-0 text-[11px] text-[var(--foreground)]",
        )}
        aria-label="表の罫線スタイル"
        value={t.borderPreset ?? "default"}
        onChange={(e) => {
          runSetTableBorderPreset(editor, e.target.value as RequirementsTableBorderPreset);
        }}
      >
        {REQUIREMENTS_TABLE_BORDER_PRESETS.map((preset) => (
          <option key={preset} value={preset}>
            {BORDER_PRESET_LABEL[preset]}
          </option>
        ))}
      </select>
      {sep()}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-1.5 text-[11px]"
        title="行を上に追加"
        disabled={!t.canAddRowBefore}
        onClick={() => editor.chain().focus().addRowBefore().run()}
      >
        行↑
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-1.5 text-[11px]"
        title="行を下に追加"
        disabled={!t.canAddRowAfter}
        onClick={() => editor.chain().focus().addRowAfter().run()}
      >
        行↓
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-1.5 text-[11px]"
        title="行を削除"
        disabled={!t.canDeleteRow}
        onClick={() => editor.chain().focus().deleteRow().run()}
      >
        行−
      </Button>
      {sep()}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-1.5 text-[11px]"
        title="列を左に追加"
        disabled={!t.canAddColumnBefore}
        onClick={() => editor.chain().focus().addColumnBefore().run()}
      >
        列←
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-1.5 text-[11px]"
        title="列を右に追加"
        disabled={!t.canAddColumnAfter}
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      >
        列→
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-1.5 text-[11px]"
        title="列を削除"
        disabled={!t.canDeleteColumn}
        onClick={() => editor.chain().focus().deleteColumn().run()}
      >
        列−
      </Button>
      {sep()}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-1.5 text-[11px]"
        title="セルを結合"
        disabled={!t.canMergeCells}
        onClick={() => editor.chain().focus().mergeCells().run()}
      >
        結合
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-1.5 text-[11px]"
        title="セルを分割"
        disabled={!t.canSplitCell}
        onClick={() => editor.chain().focus().splitCell().run()}
      >
        分割
      </Button>
      {sep()}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-1.5 text-[11px]"
        title="先頭行をヘッダーに切替"
        disabled={!t.canToggleHeaderRow}
        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
      >
        Hdr
      </Button>
      {sep()}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-1.5 text-[11px] text-red-500 hover:text-red-400"
        title="表を削除"
        disabled={!t.canDeleteTable}
        onClick={() => setDeleteTableDialogOpen(true)}
      >
        表削除
      </Button>
    </BubbleMenu>

    <Dialog open={deleteTableDialogOpen} onOpenChange={setDeleteTableDialogOpen}>
      <DialogContent
        className="w-[min(92vw,22rem)] gap-4 p-5 sm:max-w-[22rem]"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          editor.chain().focus().run();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-base">表を削除しますか？</DialogTitle>
          <DialogDescription>
            この操作は取り消せません。表とその中の内容がすべて削除されます。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="default" size="sm" className="rounded-lg" onClick={() => setDeleteTableDialogOpen(false)}>
            キャンセル
          </Button>
          <Button type="button" variant="destructive" size="sm" className="rounded-lg" onClick={confirmDeleteTable}>
            削除する
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
