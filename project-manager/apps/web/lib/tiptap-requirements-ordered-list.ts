import { OrderedList } from "@tiptap/extension-ordered-list";

export type OrderedListStyleType = "decimal" | "lower-alpha";

/**
 * 番号付きリストの種類（CSS list-style-type）を ol に保持する。
 * - decimal: 1. 2. 3.
 * - lower-alpha: a. b. c.
 */
export const RequirementsOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      listStyleType: {
        default: "decimal" as OrderedListStyleType,
        parseHTML: (element) => {
          if (typeof element === "string") {
            return "decimal";
          }
          const el = element as HTMLElement;
          const st = el.style?.listStyleType?.replace(/\s/g, "").toLowerCase();
          if (st === "lower-alpha" || st === "decimal") {
            return st as OrderedListStyleType;
          }
          const d = el.getAttribute("data-list-style");
          if (d === "lower-alpha" || d === "decimal") {
            return d as OrderedListStyleType;
          }
          return "decimal";
        },
        renderHTML: (attributes) => {
          const t = (attributes.listStyleType as OrderedListStyleType | undefined) ?? "decimal";
          return {
            style: `list-style-type: ${t}`,
            ...(t === "decimal" ? {} : { "data-list-style": t }),
          };
        },
      },
    };
  },
});
