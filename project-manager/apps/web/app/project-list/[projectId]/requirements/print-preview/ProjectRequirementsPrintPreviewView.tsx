import { normalizeRequirementsDocBody } from "@/lib/requirements-doc-normalize";
import {
  fetchPortalRequirementsRaw,
  parsePortalRequirementsSuccess,
} from "@/lib/portal-requirements-fetch";
import {
  fetchPortalProjectRaw,
  parsePortalJsonMessage,
  parsePortalProjectSuccess,
} from "@/lib/portal-project";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ProjectRequirementsPrintPreviewClient } from "./ProjectRequirementsPrintPreviewClient";

type ProjectRequirementsPrintPreviewViewProps = {
  projectId: string;
  initialSelectedPageId?: string;
};

export default async function ProjectRequirementsPrintPreviewView({
  projectId,
  initialSelectedPageId,
}: ProjectRequirementsPrintPreviewViewProps) {
  const pid = Number.parseInt(projectId, 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    notFound();
  }

  const cookie = (await headers()).get("cookie");
  const [projRaw, reqRaw] = await Promise.all([
    fetchPortalProjectRaw(cookie, pid),
    fetchPortalRequirementsRaw(cookie, pid),
  ]);

  if (projRaw.ok === false || reqRaw.ok === false) {
    return (
      <section className="surface-card border border-red-500/30 p-5" role="alert">
        <p className="text-sm font-semibold text-[var(--foreground)]">プレビューを表示できません</p>
        <p className="mt-2 text-sm text-[var(--foreground)]">ポータル API に接続できませんでした。</p>
      </section>
    );
  }

  if (projRaw.status === 404) {
    notFound();
  }

  if (projRaw.status !== 200) {
    const msg = parsePortalJsonMessage(projRaw.text) ?? `取得に失敗しました（HTTP ${projRaw.status}）。`;
    return (
      <section className="surface-card border border-amber-500/35 p-5" role="status">
        <p className="text-sm text-[var(--foreground)]">{msg}</p>
      </section>
    );
  }

  const project = parsePortalProjectSuccess(projRaw.text);
  if (!project) {
    return (
      <section className="surface-card border border-amber-500/35 p-5" role="status">
        <p className="text-sm text-[var(--foreground)]">案件データの形式が想定と異なります。</p>
      </section>
    );
  }

  let initialBody = normalizeRequirementsDocBody({});
  if (reqRaw.status === 200) {
    const parsed = parsePortalRequirementsSuccess(reqRaw.text);
    if (parsed) {
      initialBody = normalizeRequirementsDocBody(parsed.body_json);
    }
  }

  return (
    <ProjectRequirementsPrintPreviewClient
      projectId={pid}
      initialBody={initialBody}
      initialSelectedPageId={initialSelectedPageId}
    />
  );
}

