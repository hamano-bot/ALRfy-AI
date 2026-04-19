"use client";

import type { Editor } from "@tiptap/core";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  ArrowDown,
  ArrowUp,
  Columns2,
  Columns3,
  Copy,
  ImagePlus,
  Link,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import type { MutableRefObject, ReactNode } from "react";

import type { RequirementsTiptapToolbarHandle } from "@/app/components/requirements/RequirementsTiptapToolbar";
import {
  deleteBlock,
  duplicateBlock,
  insertParagraphAfter,
  insertParagraphBefore,
} from "@/lib/tiptap-block-ops";
import { moveBlockVertically } from "@/lib/tiptap-block-move";
import { insertRequirementsColumns } from "@/lib/tiptap-requirements-columns";
import { cn } from "@/lib/utils";

function Item({
  action,
  disabled,
  children,
  destructive,
}: {
  action: () => void;
  disabled?: boolean;
  children: ReactNode;
  destructive?: boolean;
}) {
  return (
    <ContextMenu.Item
      disabled={disabled}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs outline-none",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
        "data-[highlighted]:bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)]",
        destructive && "data-[highlighted]:text-red-400",
        !destructive && "text-[var(--foreground)]",
      )}
      onSelect={() => action()}
    >
      {children}
    </ContextMenu.Item>
  );
}

export function RequirementsTiptapBlockContextMenu({
  editor,
  readOnly,
  toolbarRef,
  children,
}: {
  editor: Editor | null;
  readOnly: boolean;
  /** ツールバーと同じ画像 URL / アップロード / リンク操作 */
  toolbarRef: MutableRefObject<RequirementsTiptapToolbarHandle | null>;
  children: ReactNode;
}) {
  if (!editor) {
    return <>{children}</>;
  }

  const run = (fn: () => boolean | void) => {
    if (readOnly) {
      return;
    }
    fn();
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          className="min-h-0 flex-1 outline-none"
          onContextMenu={(e) => {
            if (readOnly) {
              return;
            }
            const coords = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
            if (coords) {
              editor.chain().focus().setTextSelection(coords.pos).run();
            }
          }}
        >
          {children}
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="z-[210] min-w-[240px] rounded-lg border border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[var(--surface)] p-1 text-[var(--foreground)] shadow-lg ring-1 ring-[color:color-mix(in_srgb,var(--accent)_22%,transparent)]"
          alignOffset={4}
        >
          <Item
            disabled={readOnly}
            action={() => run(() => insertParagraphBefore(editor))}
          >
            <Plus className="h-3.5 w-3.5 opacity-80" />
            上に段落を挿入
          </Item>
          <Item
            disabled={readOnly}
            action={() => run(() => insertParagraphAfter(editor))}
          >
            <Plus className="h-3.5 w-3.5 opacity-80" />
            下に段落を挿入
          </Item>
          <ContextMenu.Separator className="my-1 h-px bg-[color:color-mix(in_srgb,var(--border)_75%,transparent)]" />
          <Item
            disabled={readOnly}
            action={() => run(() => toolbarRef.current?.openImageUrlDialog())}
          >
            <ImagePlus className="h-3.5 w-3.5 opacity-80" />
            画像を挿入（URL）
          </Item>
          <Item
            disabled={readOnly}
            action={() => run(() => toolbarRef.current?.triggerImageUpload())}
          >
            <Upload className="h-3.5 w-3.5 opacity-80" />
            画像アップロード
          </Item>
          <Item
            disabled={readOnly}
            action={() => run(() => toolbarRef.current?.openLinkPrompt())}
          >
            <Link className="h-3.5 w-3.5 opacity-80" />
            リンク
          </Item>
          <ContextMenu.Separator className="my-1 h-px bg-[color:color-mix(in_srgb,var(--border)_75%,transparent)]" />
          <Item
            disabled={readOnly}
            action={() => run(() => insertRequirementsColumns(editor, 2))}
          >
            <Columns2 className="h-3.5 w-3.5 opacity-80" />
            2カラムを挿入
          </Item>
          <Item
            disabled={readOnly}
            action={() => run(() => insertRequirementsColumns(editor, 3))}
          >
            <Columns3 className="h-3.5 w-3.5 opacity-80" />
            3カラムを挿入
          </Item>
          <ContextMenu.Separator className="my-1 h-px bg-[color:color-mix(in_srgb,var(--border)_75%,transparent)]" />
          <Item
            disabled={readOnly}
            action={() => run(() => moveBlockVertically(editor, "up"))}
          >
            <ArrowUp className="h-3.5 w-3.5 opacity-80" />
            ブロックを上へ（並べ替え）
          </Item>
          <Item
            disabled={readOnly}
            action={() => run(() => moveBlockVertically(editor, "down"))}
          >
            <ArrowDown className="h-3.5 w-3.5 opacity-80" />
            ブロックを下へ（並べ替え）
          </Item>
          <ContextMenu.Separator className="my-1 h-px bg-[color:color-mix(in_srgb,var(--border)_75%,transparent)]" />
          <Item
            disabled={readOnly}
            action={() => run(() => duplicateBlock(editor))}
          >
            <Copy className="h-3.5 w-3.5 opacity-80" />
            ブロックを複製
          </Item>
          <Item
            destructive
            disabled={readOnly}
            action={() => run(() => deleteBlock(editor))}
          >
            <Trash2 className="h-3.5 w-3.5" />
            ブロックを削除
          </Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
