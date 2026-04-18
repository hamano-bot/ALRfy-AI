import { PROJECT_DOCUMENT_TEMPLATES, type ProjectDocumentTemplateItem } from "@/lib/project-document-templates";
import type { PortalProjectDetail } from "@/lib/portal-project";

/** 本番 `PROJECT_DOCUMENT_TEMPLATES` と同一（モック用） */
export const MOCK_DOCUMENT_TEMPLATES: ProjectDocumentTemplateItem[] = PROJECT_DOCUMENT_TEMPLATES;

export const MOCK_PROJECT: PortalProjectDetail = {
  id: 5,
  name: "テストテストテスト260418",
  slug: "260418",
  client_name: "テストクライアント",
  site_type: "other",
  site_type_other: "テストテストテストテスト123456",
  is_renewal: true,
  kickoff_date: "2026-05-01",
  release_due_date: "2026-05-15",
  renewal_urls: ["https://nextjs.org/docs/messages/version-staleness"],
  redmine_links: [
    {
      redmine_project_id: 42,
      redmine_base_url: "https://redmine.example.com",
      redmine_project_name: "(社内)T2 (テスト管理システム)",
    },
  ],
  misc_links: [{ label: "link", url: "https://nextjs.org/docs/messages/version-staleness" }],
  participants: [
    { user_id: 1, role: "owner", display_name: "濱野和洋" },
    { user_id: 2, role: "editor", display_name: null },
  ],
};
