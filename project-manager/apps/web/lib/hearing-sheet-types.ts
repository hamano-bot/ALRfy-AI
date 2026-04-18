/** DB の body_json.items と対応する1行 */
export type HearingSheetRow = {
  id: string;
  category: string;
  heading: string;
  question: string;
  answer: string;
  assignee: string;
  due: string;
  row_status: string;
};
