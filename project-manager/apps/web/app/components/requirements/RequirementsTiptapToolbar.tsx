"use client";

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import type { ChangeEvent, ReactNode } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Bold,
  Code,
  Code2,
  CornerDownLeft,
  FileCode,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  LayoutList,
  Link,
  Link2Off,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
  Upload,
  Palette,
  Circle,
  Square,
  ChevronDown,
  Table as TableIcon,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { REQUIREMENTS_IMAGE_UPLOAD_MAX_BYTES } from "@/lib/requirements-image-upload-constants";
import { uploadProjectRequirementsImage } from "@/lib/requirements-image-upload-client";
import type { RequirementsImageAlign, RequirementsImageValign } from "@/lib/tiptap-requirements-image";
import type { BulletListStyleType } from "@/lib/tiptap-requirements-bullet-list";
import type { OrderedListStyleType } from "@/lib/tiptap-requirements-ordered-list";
import { cn } from "@/lib/utils";

/** ソース表示用：タグ境界で改行しつつ簡易インデント（完全な HTML 整形ではない） */
function formatHtmlReadable(html: string): string {
  const compact = html.trim();
  if (compact === "") {
    return "";
  }
  const parts = compact.replace(/>\s*</g, ">\n<").split("\n");
  let depth = 0;
  const tab = "  ";
  const voidTags = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
  ]);
  const lines: string[] = [];
  for (const raw of parts) {
    const line = raw.trim();
    if (line === "") {
      continue;
    }
    if (!line.startsWith("<")) {
      lines.push(tab.repeat(depth) + line);
      continue;
    }
    if (line.startsWith("</")) {
      depth = Math.max(0, depth - 1);
      lines.push(tab.repeat(depth) + line);
      continue;
    }
    lines.push(tab.repeat(depth) + line);
    const open = /^<(\w+)/.exec(line);
    const tag = open?.[1]?.toLowerCase() ?? "";
    const selfClosing = line.endsWith("/>") || voidTags.has(tag);
    if (!selfClosing && line.startsWith("<")) {
      depth += 1;
    }
  }
  return lines.join("\n");
}

/**
 * 深いネスト（カラム内のカラムなど）では isActive('paragraph'|'heading'|…) が外れることがある。
 * カーソル位置の親ブロックと祖先チェーンで判定する。
 */
function getRequirementsToolbarBlockUi(ed: Editor) {
  const { $from } = ed.state.selection;
  const parent = $from.parent;

  const ancestorNames = new Set<string>();
  for (let d = 0; d <= $from.depth; d += 1) {
    ancestorNames.add($from.node(d).type.name);
  }

  const pl = parent.type.name === "heading" ? (parent.attrs.level as number) : null;

  return {
    isParagraph: parent.type.name === "paragraph",
    isH1: parent.type.name === "heading" && pl === 1,
    isH2: parent.type.name === "heading" && pl === 2,
    isH3: parent.type.name === "heading" && pl === 3,
    isBullet: ancestorNames.has("bulletList"),
    isOrdered: ancestorNames.has("orderedList"),
    isBlockquote: ancestorNames.has("blockquote"),
    isCodeBlock: parent.type.name === "codeBlock",
  };
}

function getTextAlignFromEditor(ed: Editor): "left" | "center" | "right" | "justify" | null {
  const ta = ed.state.selection.$from.parent.attrs.textAlign;
  if (ta === "left" || ta === "center" || ta === "right" || ta === "justify") {
    return ta;
  }
  return null;
}

const TEXT_COLOR_PRESETS = [
  "#0f172a",
  "#475569",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#000000",
  "#ffffff",
  "#94a3b8",
] as const;

const FONT_SIZE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "サイズ" },
  { value: "10px", label: "10" },
  { value: "12px", label: "12" },
  { value: "14px", label: "14" },
  { value: "16px", label: "16" },
  { value: "18px", label: "18" },
  { value: "20px", label: "20" },
  { value: "24px", label: "24" },
  { value: "30px", label: "30" },
  { value: "36px", label: "36" },
];

const FONT_FAMILY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Segoe UI / Meiryo UI（既定）" },
  { value: "ui-sans-serif, system-ui, sans-serif", label: "ゴシック" },
  { value: "ui-serif, Georgia, serif", label: "明朝" },
  { value: "ui-monospace, SFMono-Regular, Menlo, monospace", label: "等幅" },
  { value: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', label: "Segoe" },
  { value: '"Times New Roman", Times, serif', label: "Times" },
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: '"Courier New", Courier, monospace', label: "Courier" },
];

type RequirementsTiptapToolbarProps = {
  editor: Editor | null;
  projectId: number;
  readOnly: boolean;
  showOutline: boolean;
  onToggleOutline: () => void;
};

/** 右クリックメニューなどツールバー外から同じ操作を呼ぶ用 */
export type RequirementsTiptapToolbarHandle = {
  openImageUrlDialog: () => void;
  triggerImageUpload: () => void;
  openLinkPrompt: () => void;
};

function ToolbarButton({
  onClick,
  disabled,
  active,
  title,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  active?: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        "h-8 w-8 shrink-0 gap-0 p-0 text-[var(--muted)]",
        active && "bg-[color:color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--foreground)]",
      )}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function ToolbarSep() {
  return <div className="mx-0.5 h-6 w-px shrink-0 self-center bg-[color:color-mix(in_srgb,var(--border)_85%,transparent)]" aria-hidden />;
}

export const RequirementsTiptapToolbar = forwardRef<RequirementsTiptapToolbarHandle, RequirementsTiptapToolbarProps>(function RequirementsTiptapToolbar(
  { editor, projectId, readOnly, showOutline, onToggleOutline },
  ref,
) {
  const ui = useEditorState({
    editor,
    selector: ({ editor: ed, transactionNumber }) => {
      if (!ed) {
        return null;
      }
      const blockUi = getRequirementsToolbarBlockUi(ed);

      const ts = ed.getAttributes("textStyle") as { color?: string; fontSize?: string; fontFamily?: string };
      const textColor = typeof ts.color === "string" ? ts.color : "";
      const fontSize = typeof ts.fontSize === "string" ? ts.fontSize : "";
      const fontFamily = typeof ts.fontFamily === "string" ? ts.fontFamily : "";

      let bulletListStyle: BulletListStyleType = "disc";
      if (blockUi.isBullet) {
        const bl = ed.getAttributes("bulletList") as { listStyleType?: string };
        if (bl.listStyleType === "circle" || bl.listStyleType === "square") {
          bulletListStyle = bl.listStyleType;
        } else {
          bulletListStyle = "disc";
        }
      }

      let orderedListStyle: OrderedListStyleType = "decimal";
      if (blockUi.isOrdered) {
        const ol = ed.getAttributes("orderedList") as { listStyleType?: string };
        if (ol.listStyleType === "lower-alpha") {
          orderedListStyle = "lower-alpha";
        } else {
          orderedListStyle = "decimal";
        }
      }

      return {
        transactionNumber,
        isBold: ed.isActive("bold"),
        isItalic: ed.isActive("italic"),
        isStrike: ed.isActive("strike"),
        isCode: ed.isActive("code"),
        isUnderline: ed.isActive("underline"),
        isH1: blockUi.isH1,
        isH2: blockUi.isH2,
        isH3: blockUi.isH3,
        isParagraph: blockUi.isParagraph,
        isBullet: blockUi.isBullet,
        isOrdered: blockUi.isOrdered,
        isBlockquote: blockUi.isBlockquote,
        isCodeBlock: blockUi.isCodeBlock,
        isLink: ed.isActive("link"),
        canUndo: ed.can().undo(),
        canRedo: ed.can().redo(),
        isImage: ed.isActive("image"),
        imageDataAlign: (ed.getAttributes("image").dataAlign as RequirementsImageAlign | undefined) ?? "left",
        imageDataValign: (ed.getAttributes("image").dataValign as RequirementsImageValign | undefined) ?? "top",
        textAlign: getTextAlignFromEditor(ed),
        textColor,
        fontSize,
        fontFamily,
        bulletListStyle,
        orderedListStyle,
      };
    },
  });

  const [imageUrlOpen, setImageUrlOpen] = useState(false);
  const [imageUrlValue, setImageUrlValue] = useState("");
  const [imageAltValue, setImageAltValue] = useState("");
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkOpenSameTab, setLinkOpenSameTab] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceTab, setSourceTab] = useState<"html" | "json">("html");
  const [sourceDraftHtml, setSourceDraftHtml] = useState("");
  const [sourceDraftJson, setSourceDraftJson] = useState("");

  const closeImageUrlDialog = useCallback(() => {
    setImageUrlOpen(false);
    setImageUrlValue("");
    setImageAltValue("");
  }, []);

  const onImageUrlOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        closeImageUrlDialog();
      }
    },
    [closeImageUrlDialog],
  );

  const applyImageFromUrl = useCallback(() => {
    if (!editor) {
      return;
    }
    const trimmed = imageUrlValue.trim();
    if (trimmed === "") {
      return;
    }
    editor
      .chain()
      .focus()
      .setImage({ src: trimmed, alt: imageAltValue.trim() || undefined })
      .run();
    closeImageUrlDialog();
  }, [editor, imageUrlValue, imageAltValue, closeImageUrlDialog]);

  const closeLinkDialog = useCallback(() => {
    setLinkDialogOpen(false);
    setLinkUrl("");
    setLinkOpenSameTab(true);
  }, []);

  const onLinkDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        closeLinkDialog();
      }
    },
    [closeLinkDialog],
  );

  const openLinkDialog = useCallback(() => {
    if (!editor || readOnly || !editor.isEditable) {
      return;
    }
    const prev = editor.getAttributes("link") as { href?: string | null; target?: string | null };
    setLinkUrl(prev.href != null ? String(prev.href).trim() : "");
    setLinkOpenSameTab(prev.target !== "_blank");
    setLinkDialogOpen(true);
  }, [editor, readOnly]);

  const applyLinkFromDialog = useCallback(() => {
    if (!editor) {
      return;
    }
    const trimmed = linkUrl.trim();
    if (trimmed === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      closeLinkDialog();
      return;
    }
    if (linkOpenSameTab) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
    } else {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: trimmed, target: "_blank", rel: "noopener noreferrer nofollow" })
        .run();
    }
    closeLinkDialog();
  }, [editor, linkUrl, linkOpenSameTab, closeLinkDialog]);

  useImperativeHandle(
    ref,
    () => ({
      openImageUrlDialog: () => {
        if (!readOnly && editor?.isEditable) {
          setImageUrlOpen(true);
        }
      },
      triggerImageUpload: () => {
        if (!readOnly && editor?.isEditable && !uploadingImage) {
          fileInputRef.current?.click();
        }
      },
      openLinkPrompt: openLinkDialog,
    }),
    [readOnly, editor, uploadingImage, openLinkDialog],
  );

  const applyBulletListStyle = useCallback(
    (style: BulletListStyleType) => {
      if (!editor) {
        return;
      }
      if (editor.isActive("orderedList")) {
        editor.chain().focus().toggleOrderedList().run();
      }
      if (editor.isActive("bulletList")) {
        editor.chain().focus().updateAttributes("bulletList", { listStyleType: style }).run();
      } else {
        editor.chain().focus().toggleBulletList().updateAttributes("bulletList", { listStyleType: style }).run();
      }
    },
    [editor],
  );

  const applyOrderedListStyle = useCallback(
    (style: OrderedListStyleType) => {
      if (!editor) {
        return;
      }
      if (editor.isActive("bulletList")) {
        editor.chain().focus().toggleBulletList().run();
      }
      if (editor.isActive("orderedList")) {
        editor.chain().focus().updateAttributes("orderedList", { listStyleType: style }).run();
      } else {
        editor.chain().focus().toggleOrderedList().updateAttributes("orderedList", { listStyleType: style }).run();
      }
    },
    [editor],
  );

  const openSourceEditor = useCallback(() => {
    if (!editor) {
      return;
    }
    setSourceDraftHtml(formatHtmlReadable(editor.getHTML()));
    setSourceDraftJson(JSON.stringify(editor.getJSON(), null, 2));
    setSourceTab("html");
    setSourceOpen(true);
  }, [editor]);

  const applySourceDraft = useCallback(() => {
    if (!editor) {
      return;
    }
    try {
      if (sourceTab === "html") {
        editor.chain().focus().setContent(sourceDraftHtml).run();
      } else {
        editor.chain().focus().setContent(JSON.parse(sourceDraftJson)).run();
      }
      setSourceOpen(false);
    } catch {
      window.alert("HTML / JSON を解析できません。記述を確認してください。");
    }
  }, [editor, sourceTab, sourceDraftHtml, sourceDraftJson]);

  const onToolbarImageFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !editor || readOnly) {
        return;
      }
      if (!file.type.startsWith("image/")) {
        return;
      }
      if (file.size > REQUIREMENTS_IMAGE_UPLOAD_MAX_BYTES) {
        window.alert(`画像は ${REQUIREMENTS_IMAGE_UPLOAD_MAX_BYTES / 1024 / 1024}MB 以下にしてください。`);
        return;
      }
      setUploadingImage(true);
      try {
        const result = await uploadProjectRequirementsImage(projectId, file);
        if (!result.ok) {
          window.alert(result.message);
          return;
        }
        const baseName = file.name.replace(/\.[^/.]+$/, "") || "image";
        editor.chain().focus().setImage({ src: result.url, alt: baseName }).run();
      } finally {
        setUploadingImage(false);
      }
    },
    [editor, projectId, readOnly],
  );

  if (!editor || ui === null) {
    return null;
  }

  const disabled = readOnly || !editor.isEditable;
  const chain = () => editor.chain().focus();

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        disabled={uploadingImage || disabled}
        onChange={onToolbarImageFile}
      />

      <Dialog open={linkDialogOpen} onOpenChange={onLinkDialogOpenChange}>
        <DialogContent className="gap-4">
          <DialogHeader>
            <DialogTitle>リンク</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="requirements-link-url">URL</Label>
              <Input
                id="requirements-link-url"
                type="url"
                autoComplete="off"
                placeholder="https://"
                autoFocus
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyLinkFromDialog();
                  }
                }}
              />
            </div>
            <fieldset className="flex flex-col gap-2 border-0 p-0">
              <legend className="mb-0.5 text-sm font-medium text-[var(--foreground)]">開き方</legend>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--foreground)]">
                <input
                  type="radio"
                  name="requirements-link-target"
                  className="h-4 w-4 accent-[var(--accent)]"
                  checked={linkOpenSameTab}
                  onChange={() => setLinkOpenSameTab(true)}
                />
                同じタブで開く
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--foreground)]">
                <input
                  type="radio"
                  name="requirements-link-target"
                  className="h-4 w-4 accent-[var(--accent)]"
                  checked={!linkOpenSameTab}
                  onChange={() => setLinkOpenSameTab(false)}
                />
                別タブで開く
              </label>
            </fieldset>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={closeLinkDialog}>
              キャンセル
            </Button>
            <Button type="button" size="sm" onClick={applyLinkFromDialog}>
              適用
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={imageUrlOpen} onOpenChange={onImageUrlOpenChange}>
        <DialogContent className="gap-4" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>画像を挿入（URL）</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="requirements-image-url">画像の URL</Label>
              <Input
                id="requirements-image-url"
                type="url"
                autoComplete="off"
                placeholder="https://..."
                value={imageUrlValue}
                onChange={(e) => setImageUrlValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyImageFromUrl();
                  }
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="requirements-image-alt">代替テキスト（任意）</Label>
              <Input
                id="requirements-image-alt"
                type="text"
                autoComplete="off"
                value={imageAltValue}
                onChange={(e) => setImageAltValue(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={closeImageUrlDialog}>
              キャンセル
            </Button>
            <Button type="button" size="sm" onClick={applyImageFromUrl}>
              挿入
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sourceOpen} onOpenChange={setSourceOpen}>
        <DialogContent
          className="flex h-[min(92vh,900px)] w-[min(96vw,1320px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex shrink-0 flex-col gap-3 border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] px-6 py-4">
            <DialogHeader className="space-y-1">
              <DialogTitle className="text-base">ソースコード</DialogTitle>
              <p className="text-xs font-normal text-[var(--muted)]">
                編集後「適用」でエディタに反映します。表示はインデント付きです（HTML は簡易整形）。
              </p>
            </DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={sourceTab === "html" ? "default" : "ghost"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setSourceTab("html")}
              >
                HTML
              </Button>
              <Button
                type="button"
                variant={sourceTab === "json" ? "default" : "ghost"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setSourceTab("json")}
              >
                JSON
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-8 text-xs"
                onClick={async () => {
                  const text = sourceTab === "html" ? sourceDraftHtml : sourceDraftJson;
                  try {
                    await navigator.clipboard.writeText(text);
                  } catch {
                    window.alert("コピーに失敗しました。");
                  }
                }}
              >
                コピー
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 px-6 pb-4 pt-4">
            <textarea
              spellCheck={false}
              value={sourceTab === "html" ? sourceDraftHtml : sourceDraftJson}
              onChange={(e) => {
                if (sourceTab === "html") {
                  setSourceDraftHtml(e.target.value);
                } else {
                  setSourceDraftJson(e.target.value);
                }
              }}
              className="h-full max-h-[calc(92vh-16rem)] min-h-[320px] w-full resize-y overflow-auto rounded-xl border border-[color:color-mix(in_srgb,var(--border)_85%,transparent)] bg-[color:color-mix(in_srgb,var(--background)_50%,var(--surface)_50%)] p-4 font-mono text-[13px] leading-[1.65] text-[var(--foreground)] [tab-size:2]"
            />
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] px-6 py-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setSourceOpen(false)}>
              閉じる
            </Button>
            <Button type="button" size="sm" onClick={applySourceDraft}>
              適用
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div
        role="toolbar"
        aria-label="リッチテキスト"
        className="flex flex-wrap items-center gap-0.5 border-b border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface-soft)_40%,transparent)] px-1.5 py-1"
      >
        <ToolbarButton
          title="元に戻す"
          disabled={disabled || !ui.canUndo}
          onClick={() => chain().undo().run()}
        >
          <Undo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="やり直す"
          disabled={disabled || !ui.canRedo}
          onClick={() => chain().redo().run()}
        >
          <Redo2 className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarSep />

        <ToolbarButton
          title={showOutline ? "目次を隠す" : "目次を表示"}
          active={showOutline}
          disabled={disabled}
          onClick={onToggleOutline}
        >
          <LayoutList className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="画像（URL）を挿入"
          disabled={disabled}
          onClick={() => setImageUrlOpen(true)}
        >
          <ImagePlus className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title={uploadingImage ? "アップロード中…" : "画像アップロード"}
          disabled={disabled || uploadingImage}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarSep />

        <ToolbarButton
          title={ui.isImage ? "画像：左揃え" : "左揃え"}
          active={
            ui.isImage ? ui.imageDataAlign === "left" : ui.textAlign === "left" || ui.textAlign === null
          }
          disabled={disabled || (!ui.isImage && ui.isCodeBlock)}
          onClick={() => {
            if (ui.isImage) {
              chain().updateAttributes("image", { dataAlign: "left" }).run();
            } else {
              chain().setTextAlign("left").run();
            }
          }}
        >
          <AlignLeft className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title={ui.isImage ? "画像：中央揃え（横）" : "中央揃え"}
          active={ui.isImage ? ui.imageDataAlign === "center" : ui.textAlign === "center"}
          disabled={disabled || (!ui.isImage && ui.isCodeBlock)}
          onClick={() => {
            if (ui.isImage) {
              chain().updateAttributes("image", { dataAlign: "center" }).run();
            } else {
              chain().setTextAlign("center").run();
            }
          }}
        >
          <AlignCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title={ui.isImage ? "画像：右揃え" : "右揃え"}
          active={ui.isImage ? ui.imageDataAlign === "right" : ui.textAlign === "right"}
          disabled={disabled || (!ui.isImage && ui.isCodeBlock)}
          onClick={() => {
            if (ui.isImage) {
              chain().updateAttributes("image", { dataAlign: "right" }).run();
            } else {
              chain().setTextAlign("right").run();
            }
          }}
        >
          <AlignRight className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="画像：上揃え（縦）"
          active={ui.isImage && ui.imageDataValign === "top"}
          disabled={disabled || !ui.isImage}
          onClick={() => chain().updateAttributes("image", { dataValign: "top" }).run()}
        >
          <AlignVerticalJustifyStart className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="画像：中央揃え（縦）"
          active={ui.isImage && ui.imageDataValign === "middle"}
          disabled={disabled || !ui.isImage}
          onClick={() => chain().updateAttributes("image", { dataValign: "middle" }).run()}
        >
          <AlignVerticalJustifyCenter className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="画像：下揃え（縦）"
          active={ui.isImage && ui.imageDataValign === "bottom"}
          disabled={disabled || !ui.isImage}
          onClick={() => chain().updateAttributes("image", { dataValign: "bottom" }).run()}
        >
          <AlignVerticalJustifyEnd className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarSep />

        <Select
          value={ui.fontFamily === "" ? "__font_default__" : ui.fontFamily}
          disabled={disabled || ui.isCodeBlock}
          onValueChange={(v) => {
            if (v === "__font_default__") {
              chain().unsetFontFamily().run();
            } else {
              chain().setFontFamily(v).run();
            }
          }}
        >
          <SelectTrigger
            className="h-8 w-[min(9.5rem,28vw)] shrink-0 gap-1 border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface-soft)_55%,transparent)] px-2 text-xs text-[var(--foreground)]"
            aria-label="フォント"
          >
            <SelectValue placeholder="メイリオ" />
          </SelectTrigger>
          <SelectContent>
            {FONT_FAMILY_OPTIONS.map((o) => (
              <SelectItem key={o.value || "__font_default__"} value={o.value === "" ? "__font_default__" : o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={ui.fontSize === "" ? "__size_default__" : ui.fontSize}
          disabled={disabled || ui.isCodeBlock}
          onValueChange={(v) => {
            if (v === "__size_default__") {
              chain().unsetFontSize().run();
            } else {
              chain().setFontSize(v).run();
            }
          }}
        >
          <SelectTrigger
            className="h-8 w-[4.25rem] shrink-0 gap-1 border-[color:color-mix(in_srgb,var(--border)_88%,transparent)] bg-[color:color-mix(in_srgb,var(--surface-soft)_55%,transparent)] px-2 text-xs text-[var(--foreground)]"
            aria-label="文字サイズ"
          >
            <SelectValue placeholder="サイズ" />
          </SelectTrigger>
          <SelectContent>
            {FONT_SIZE_OPTIONS.map((o) => (
              <SelectItem key={o.value || "__size_default__"} value={o.value === "" ? "__size_default__" : o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 w-8 shrink-0 gap-0 p-0 text-[var(--muted)]",
                ui.textColor && "bg-[color:color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--foreground)]",
              )}
              disabled={disabled || ui.isCodeBlock}
              title="文字色"
              aria-label="文字色"
            >
              <span className="relative flex h-4 w-4 items-center justify-center">
                <Palette className="h-4 w-4 opacity-90" />
                <span
                  className="pointer-events-none absolute bottom-0 left-0 right-0 mx-auto h-[3px] max-w-[14px] rounded-sm border border-[color:color-mix(in_srgb,var(--border)_70%,transparent)]"
                  style={{ backgroundColor: ui.textColor || "transparent" }}
                />
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(18rem,92vw)] space-y-3 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs text-[var(--muted)]">カスタム</Label>
              <input
                type="color"
                className="h-9 w-12 cursor-pointer rounded border border-[color:color-mix(in_srgb,var(--border)_85%,transparent)] bg-transparent p-0"
                value={ui.textColor && /^#[0-9a-fA-F]{6}$/.test(ui.textColor) ? ui.textColor : "#111827"}
                onChange={(e) => chain().setColor(e.target.value).run()}
                aria-label="カラーピッカー"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                disabled={disabled || !ui.textColor}
                onClick={() => chain().unsetColor().run()}
              >
                色をクリア
              </Button>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-[var(--muted)]">プリセット</p>
              <div className="grid grid-cols-6 gap-1.5">
                {TEXT_COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={cn(
                      "h-7 w-full rounded-md border border-[color:color-mix(in_srgb,var(--border)_80%,transparent)] shadow-sm",
                      ui.textColor?.toLowerCase() === c.toLowerCase() && "ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--background)]",
                    )}
                    style={{ backgroundColor: c }}
                    title={c}
                    onClick={() => chain().setColor(c).run()}
                  />
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <ToolbarSep />

        <ToolbarButton title="太字" active={ui.isBold} disabled={disabled} onClick={() => chain().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="斜体" active={ui.isItalic} disabled={disabled} onClick={() => chain().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="下線"
          active={ui.isUnderline}
          disabled={disabled}
          onClick={() => chain().toggleUnderline().run()}
        >
          <Underline className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="取り消し線" active={ui.isStrike} disabled={disabled} onClick={() => chain().toggleStrike().run()}>
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="インラインコード" active={ui.isCode} disabled={disabled} onClick={() => chain().toggleCode().run()}>
          <Code className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="書式をクリア（装飾のみ）"
          disabled={disabled}
          onClick={() => chain().unsetAllMarks().run()}
        >
          <RemoveFormatting className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarSep />

        <ToolbarButton
          title="段落"
          active={ui.isParagraph}
          disabled={disabled}
          onClick={() => chain().setParagraph().run()}
        >
          <Pilcrow className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="見出し1" active={ui.isH1} disabled={disabled} onClick={() => chain().toggleHeading({ level: 1 }).run()}>
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="見出し2" active={ui.isH2} disabled={disabled} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="見出し3" active={ui.isH3} disabled={disabled} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarSep />

        <ToolbarButton
          title="箇条書き"
          active={ui.isBullet}
          disabled={disabled}
          onClick={() => chain().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="○箇条書き"
          active={ui.isBullet && ui.bulletListStyle === "circle"}
          disabled={disabled}
          onClick={() => applyBulletListStyle("circle")}
        >
          <Circle className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="■箇条書き"
          active={ui.isBullet && ui.bulletListStyle === "square"}
          disabled={disabled}
          onClick={() => applyBulletListStyle("square")}
        >
          <Square className="h-3.5 w-3.5" />
        </ToolbarButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 min-w-[2.75rem] shrink-0 gap-0.5 px-1.5 text-[var(--muted)]",
                ui.isOrdered && "bg-[color:color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--foreground)]",
              )}
              disabled={disabled}
              title="番号付きリスト"
              aria-label="番号付きリスト"
            >
              <ListOrdered className="h-4 w-4" />
              <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[240px]">
            <DropdownMenuItem
              className="flex-col items-stretch gap-1.5 py-2"
              onSelect={() => {
                applyOrderedListStyle("decimal");
              }}
            >
              <span className="text-[11px] text-[var(--muted)]">1. 2. 3.</span>
              <span className="flex items-center gap-1.5 font-mono text-sm text-[var(--foreground)]">
                <span>1.</span>
                <span>2.</span>
                <span>3.</span>
                <span className="ml-1 h-2 flex-1 rounded-sm bg-[color:color-mix(in_srgb,var(--border)_50%,transparent)]" />
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="flex-col items-stretch gap-1.5 py-2"
              onSelect={() => {
                applyOrderedListStyle("lower-alpha");
              }}
            >
              <span className="text-[11px] text-[var(--muted)]">a. b. c.</span>
              <span className="flex items-center gap-1.5 font-mono text-sm text-[var(--foreground)]">
                <span>a.</span>
                <span>b.</span>
                <span>c.</span>
                <span className="ml-1 h-2 flex-1 rounded-sm bg-[color:color-mix(in_srgb,var(--border)_50%,transparent)]" />
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 min-w-[2.75rem] shrink-0 gap-0.5 px-1.5 text-[var(--muted)]"
              disabled={disabled}
              title="表"
              aria-label="表"
            >
              <TableIcon className="h-4 w-4" />
              <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[220px]">
            <DropdownMenuItem
              onSelect={() => {
                editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
              }}
            >
              表を挿入（3×3・先頭行ヘッダー）
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ToolbarSep />

        <ToolbarButton
          title="引用"
          active={ui.isBlockquote}
          disabled={disabled}
          onClick={() => chain().toggleBlockquote().run()}
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          title="コードブロック"
          active={ui.isCodeBlock}
          disabled={disabled}
          onClick={() => chain().toggleCodeBlock().run()}
        >
          <Code2 className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarSep />

        <ToolbarButton title="区切り線" disabled={disabled} onClick={() => chain().setHorizontalRule().run()}>
          <Minus className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="改行（ソフト改行）" disabled={disabled} onClick={() => chain().setHardBreak().run()}>
          <CornerDownLeft className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarSep />

        <ToolbarButton title="リンクを挿入・編集" active={ui.isLink} disabled={disabled} onClick={openLinkDialog}>
          <Link className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton title="リンクを外す" disabled={disabled || !ui.isLink} onClick={() => chain().extendMarkRange("link").unsetLink().run()}>
          <Link2Off className="h-4 w-4" />
        </ToolbarButton>

        <ToolbarSep />

        <ToolbarButton
          title="HTML / JSON ソースを編集"
          disabled={!editor}
          onClick={openSourceEditor}
        >
          <FileCode className="h-4 w-4" />
        </ToolbarButton>
      </div>
    </>
  );
});

RequirementsTiptapToolbar.displayName = "RequirementsTiptapToolbar";
