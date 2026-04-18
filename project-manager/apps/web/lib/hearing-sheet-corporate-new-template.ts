/**
 * @deprecated モジュール分割後は `@/lib/hearing-sheet-types` 等を直接 import してください。
 * 互換のため re-export を維持します。
 */
export type { HearingSheetRow } from "@/lib/hearing-sheet-types";
export {
  HEARING_TEMPLATE_IDS,
  type HearingTemplateId,
  isHearingTemplateId,
  resolveHearingTemplateId,
  shouldSeedHearingTemplate,
} from "@/lib/hearing-sheet-template-matrix";
export {
  ROWS_CORPORATE_NEW,
  ROWS_CORPORATE_NEW as CORPORATE_NEW_HEARING_TEMPLATE_ROWS,
  ROWS_CORPORATE_RENEWAL,
  ROWS_EC_NEW,
  ROWS_EC_RENEWAL,
  ROWS_GENERIC_NEW,
  ROWS_GENERIC_RENEWAL,
  getDefaultRowsForTemplate,
} from "@/lib/hearing-sheet-template-rows";
export { hearingSheetBodyJsonSchema, safeParseHearingBodyJson, type HearingSheetBodyJson } from "@/lib/hearing-sheet-body-schema";
export {
  normalizeHearingRows,
  hearingBodyFromRows,
  createEmptyHearingRow,
  parseTemplateIdFromBody,
} from "@/lib/hearing-sheet-body-utils";

/** @deprecated resolveHearingTemplateId を使う */
export const HEARING_TEMPLATE_ID_CORPORATE_NEW = "corporate_new" as const;

/** @deprecated shouldSeedHearingTemplate(project, body_json) を利用 */
import type { PortalProjectDetail } from "@/lib/portal-project";

export function shouldSeedCorporateNewTemplate(project: PortalProjectDetail): boolean {
  return project.site_type === "corporate" && !project.is_renewal;
}
