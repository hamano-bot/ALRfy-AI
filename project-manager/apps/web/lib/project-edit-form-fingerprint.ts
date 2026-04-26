import type { PortalProjectDetail } from "@/lib/portal-project";

type RedminePickLike = {
  redmine_project_id: number;
  redmine_base_url: string | null;
  redmine_project_name: string;
};

type RedmineRowLike = { pick: RedminePickLike | null };

/**
 * 案件 PATCH 送信直前と同じ形に正規化し、編集モードの差分検知に使う（ProjectCreateForm と整合）。
 */
function stablePayloadFromParts(input: {
  name: string;
  clientName: string;
  siteType: string;
  siteTypeOther: string;
  projectCategory: "new" | "renewal" | "improvement";
  isRenewal: boolean;
  isReleased: boolean;
  renewalUrls: string[];
  kickoff: string;
  releaseDue: string;
  redmineRows: RedmineRowLike[];
  miscLinks: { label: string; url: string }[];
  owners: number[];
  editors: number[];
  viewers: number[];
}): string {
  const siteType = input.siteType;
  const obj = {
    name: input.name.trim(),
    client_name: input.clientName.trim() === "" ? null : input.clientName.trim(),
    site_type: siteType,
    site_type_other: siteType === "other" ? input.siteTypeOther.trim() : null,
    project_category: input.projectCategory,
    is_renewal: input.isRenewal,
    is_released: input.isReleased,
    renewal_urls: input.isRenewal ? input.renewalUrls.map((u) => u.trim()).filter(Boolean) : [],
    kickoff_date: input.kickoff.trim() === "" ? null : input.kickoff.trim(),
    release_due_date: input.releaseDue.trim() === "" ? null : input.releaseDue.trim(),
    redmine_links: input.redmineRows
      .map((row) => row.pick)
      .filter((p): p is RedminePickLike => p !== null)
      .map((p) => ({
        redmine_project_id: p.redmine_project_id,
        redmine_base_url: p.redmine_base_url,
        ...(p.redmine_project_name.trim() !== ""
          ? { redmine_project_name: p.redmine_project_name.trim() }
          : {}),
      })),
    misc_links: input.miscLinks
      .map((m) => ({ label: m.label.trim(), url: m.url.trim() }))
      .filter((m) => m.label !== "" && m.url !== ""),
    participants: [
      ...input.owners.map((user_id) => ({ user_id, role: "owner" as const })),
      ...input.editors.map((user_id) => ({ user_id, role: "editor" as const })),
      ...input.viewers.map((user_id) => ({ user_id, role: "viewer" as const })),
    ],
  };
  return JSON.stringify(obj);
}

export function projectEditFormFingerprintFromDetail(d: PortalProjectDetail): string {
  const siteType = (d.site_type ?? "") as string;
  const redmineRows: RedmineRowLike[] =
    d.redmine_links.length > 0
      ? d.redmine_links.map((r) => ({
          pick: {
            redmine_project_id: r.redmine_project_id,
            redmine_base_url: r.redmine_base_url,
            redmine_project_name: r.redmine_project_name?.trim() ?? "",
          },
        }))
      : [];
  const misc: { label: string; url: string }[] =
    d.misc_links.length > 0 ? d.misc_links.map((m) => ({ label: m.label, url: m.url })) : [{ label: "", url: "" }];
  const o: number[] = [];
  const e: number[] = [];
  const v: number[] = [];
  for (const p of d.participants) {
    if (p.role === "owner") {
      o.push(p.user_id);
    } else if (p.role === "editor") {
      e.push(p.user_id);
    } else {
      v.push(p.user_id);
    }
  }
  return stablePayloadFromParts({
    name: d.name,
    clientName: d.client_name ?? "",
    siteType,
    siteTypeOther: d.site_type_other ?? "",
    projectCategory: d.project_category,
    isRenewal: d.is_renewal,
    isReleased: d.is_released,
    renewalUrls: d.renewal_urls.length > 0 ? d.renewal_urls : [""],
    kickoff: d.kickoff_date ?? "",
    releaseDue: d.release_due_date ?? "",
    redmineRows,
    miscLinks: misc,
    owners: o,
    editors: e,
    viewers: v,
  });
}

export function projectEditFormFingerprintFromFormState(input: {
  name: string;
  clientName: string;
  siteType: string;
  siteTypeOther: string;
  projectCategory: "new" | "renewal" | "improvement";
  isRenewal: boolean;
  isReleased: boolean;
  renewalUrls: string[];
  kickoff: string;
  releaseDue: string;
  redmineRows: RedmineRowLike[];
  miscLinks: { label: string; url: string }[];
  owners: number[];
  editors: number[];
  viewers: number[];
}): string {
  return stablePayloadFromParts(input);
}
