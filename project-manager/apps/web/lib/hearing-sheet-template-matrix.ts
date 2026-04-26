import type { PortalProjectDetail } from "@/lib/portal-project";

/**
 * site_type × 新規/リニューアル で決まるテンプレ ID。
 * 未対応の site_type は generic_* にフォールバック。
 */
export const HEARING_TEMPLATE_IDS = [
  "corporate_new",
  "corporate_renewal",
  "ec_new",
  "ec_renewal",
  "generic_new",
  "generic_renewal",
] as const;

export type HearingTemplateId = (typeof HEARING_TEMPLATE_IDS)[number];

export function isHearingTemplateId(v: string): v is HearingTemplateId {
  return (HEARING_TEMPLATE_IDS as readonly string[]).includes(v);
}

/** UI 表示用ラベル */
export const HEARING_TEMPLATE_LABELS: Record<HearingTemplateId, string> = {
  corporate_new: "コーポレート・新規",
  corporate_renewal: "コーポレート・リニューアル",
  ec_new: "EC・新規",
  ec_renewal: "EC・リニューアル",
  generic_new: "一般・新規",
  generic_renewal: "一般・リニューアル",
};

export function resolveHearingTemplateId(project: PortalProjectDetail): HearingTemplateId {
  const category = project.project_category;
  const renewal = category === "renewal" || category === "improvement" || project.is_renewal;
  const st = project.site_type;

  if (st === "corporate") {
    return renewal ? "corporate_renewal" : "corporate_new";
  }
  if (st === "ec") {
    return renewal ? "ec_renewal" : "ec_new";
  }

  return renewal ? "generic_renewal" : "generic_new";
}

/** body_json が空相当のとき、案件プロファイルに合わせて初期行を出すか */
export function shouldSeedHearingTemplate(project: PortalProjectDetail, bodyJsonUnknown: unknown): boolean {
  if (!isBodyJsonEmpty(bodyJsonUnknown)) {
    return false;
  }
  return true;
}

function isBodyJsonEmpty(raw: unknown): boolean {
  if (raw === null || raw === undefined) {
    return true;
  }
  if (Array.isArray(raw)) {
    return raw.length === 0;
  }
  if (typeof raw !== "object") {
    return true;
  }
  const o = raw as Record<string, unknown>;
  const items = o.items;
  if (Array.isArray(items)) {
    return items.length === 0;
  }
  return Object.keys(o).length === 0;
}
