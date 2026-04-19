import { BulletList } from "@tiptap/extension-bullet-list";

export type BulletListStyleType = "disc" | "circle" | "square";

/**
 * 箇条書きの種類（CSS list-style-type）を ul に保持する。
 */
export const RequirementsBulletList = BulletList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      listStyleType: {
        default: "disc" as BulletListStyleType,
        parseHTML: (element) => {
          if (typeof element === "string") {
            return "disc";
          }
          const el = element as HTMLElement;
          const st = el.style?.listStyleType?.replace(/\s/g, "").toLowerCase();
          if (st === "circle" || st === "square" || st === "disc") {
            return st as BulletListStyleType;
          }
          const d = el.getAttribute("data-list-style");
          if (d === "circle" || d === "square" || d === "disc") {
            return d as BulletListStyleType;
          }
          return "disc";
        },
        renderHTML: (attributes) => {
          const t = (attributes.listStyleType as BulletListStyleType | undefined) ?? "disc";
          return {
            style: `list-style-type: ${t}`,
            ...(t === "disc" ? {} : { "data-list-style": t }),
          };
        },
      },
    };
  },
});
