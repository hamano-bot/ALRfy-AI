/**
 * 行削除など「ゴミ箱アイコンのみ」のボタン用クラス。
 * `Button` の `variant="destructive"` と併用し、デフォルトの枠線・面を打ち消す。
 * （例: 要件表の行削除、見積明細の行削除）
 */
export const trashDeleteIconButtonClassName =
  "h-8 w-8 border-0 bg-transparent p-0 text-red-600 shadow-none hover:bg-[color:color-mix(in_srgb,rgb(239_68_68)_12%,transparent)] hover:text-red-700";
