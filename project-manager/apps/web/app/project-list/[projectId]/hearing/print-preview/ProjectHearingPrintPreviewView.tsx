import { normalizeHearingRows } from "@/lib/hearing-sheet-body-utils";
import { fetchPortalHearingSheetRaw, parsePortalHearingSheetSuccess } from "@/lib/portal-hearing-sheet-fetch";
import {
  fetchPortalProjectRaw,
  parsePortalJsonMessage,
  parsePortalProjectSuccess,
} from "@/lib/portal-project";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ProjectHearingPrintPreviewClient } from "./ProjectHearingPrintPreviewClient";

type ProjectHearingPrintPreviewViewProps = {
  projectId: string;
  initialHideCompleted: boolean;
};

export default async function ProjectHearingPrintPreviewView({
  projectId,
  initialHideCompleted,
}: ProjectHearingPrintPreviewViewProps) {
  const pid = Number.parseInt(projectId, 10);
  if (!Number.isFinite(pid) || pid <= 0) {
    notFound();
  }

  const cookie = (await headers()).get("cookie");
  const [projRaw, hearingRaw] = await Promise.all([
    fetchPortalProjectRaw(cookie, pid),
    fetchPortalHearingSheetRaw(cookie, pid),
  ]);

  if (projRaw.ok === false || hearingRaw.ok === false) {
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

  const initialRows =
    hearingRaw.status === 200 ? normalizeHearingRows(parsePortalHearingSheetSuccess(hearingRaw.text)?.body_json ?? null) : [];

  return (
    <ProjectHearingPrintPreviewClient
      projectId={pid}
      projectName={project.name}
      initialRows={initialRows}
      initialHideCompleted={initialHideCompleted}
    />
  );
}

