import { Extension } from "@tiptap/core";
import type { Range } from "@tiptap/core";
import { Suggestion } from "@tiptap/suggestion";

export const SLASH_EVENT = "alrfy-tiptap-slash";
export const SLASH_EXIT_EVENT = "alrfy-tiptap-slash-exit";

export type SlashMenuItem = {
  id: string;
  label: string;
  description: string;
  run: (args: { editor: import("@tiptap/core").Editor; range: Range }) => void;
};

function filterItems(query: string, items: SlashMenuItem[]): SlashMenuItem[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return items;
  }
  return items.filter(
    (it) =>
      it.label.toLowerCase().includes(q) ||
      it.description.toLowerCase().includes(q) ||
      it.id.includes(q),
  );
}

function allSlashItems(): SlashMenuItem[] {
  return [
    {
      id: "paragraph",
      label: "段落",
      description: "プレーンテキスト",
      run: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setParagraph().run();
      },
    },
    {
      id: "h1",
      label: "見出し1",
      description: "大見出し",
      run: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
      },
    },
    {
      id: "h2",
      label: "見出し2",
      description: "中見出し",
      run: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
      },
    },
    {
      id: "h3",
      label: "見出し3",
      description: "小見出し",
      run: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
      },
    },
    {
      id: "bullet",
      label: "箇条書き",
      description: "リスト",
      run: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run();
      },
    },
    {
      id: "ordered",
      label: "番号付きリスト",
      description: "順序付き",
      run: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run();
      },
    },
    {
      id: "quote",
      label: "引用",
      description: "",
      run: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBlockquote().run();
      },
    },
    {
      id: "code",
      label: "コードブロック",
      description: "",
      run: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
      },
    },
    {
      id: "hr",
      label: "区切り線",
      description: "",
      run: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHorizontalRule().run();
      },
    },
    {
      id: "image",
      label: "画像（アップロード）",
      description: "S3 に保存",
      run: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        window.dispatchEvent(new CustomEvent("alrfy-tiptap-slash-image"));
      },
    },
  ];
}

export const RequirementsSlashExtension = Extension.create({
  name: "requirementsSlash",

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      Suggestion<SlashMenuItem, SlashMenuItem>({
        editor,
        char: "/",
        allowSpaces: true,
        startOfLine: false,
        command: ({ editor: ed, range, props: item }) => {
          item.run({ editor: ed, range });
        },
        items: ({ query }) => filterItems(query, allSlashItems()),
        render: () => ({
          onStart: (props) => {
            window.dispatchEvent(new CustomEvent(SLASH_EVENT, { detail: props }));
          },
          onUpdate: (props) => {
            window.dispatchEvent(new CustomEvent(SLASH_EVENT, { detail: props }));
          },
          onExit: () => {
            window.dispatchEvent(new CustomEvent(SLASH_EXIT_EVENT));
          },
        }),
        shouldShow: ({ editor: ed }) => ed.isEditable,
      }),
    ];
  },
});
