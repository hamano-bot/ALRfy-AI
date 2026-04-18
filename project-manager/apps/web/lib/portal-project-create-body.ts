import { z } from "zod";

const siteTypeEnum = z.enum([
  "corporate",
  "ec",
  "member_portal",
  "internal_portal",
  "owned_media",
  "product_portal",
  "other",
]);

const dateOrNull = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

const redmineLinkItem = z.union([
  z.number().int().positive(),
  z.object({
    redmine_project_id: z.number().int().positive(),
    redmine_base_url: z.union([z.string().max(512), z.null()]).optional(),
    redmine_project_name: z.union([z.string().max(255), z.null()]).optional(),
  }),
  z.object({
    id: z.number().int().positive(),
    redmine_base_url: z.union([z.string().max(512), z.null()]).optional(),
    redmine_project_name: z.union([z.string().max(255), z.null()]).optional(),
  }),
]);

/**
 * BFF が PHP `POST /portal/api/projects` に転送する前に検証するボディ。
 * サーバー側でも再検証される。
 */
export const portalProjectCreateBodySchema = z
  .object({
    name: z.string().min(1).max(255),
    client_name: z.union([z.string().max(255), z.null()]).optional(),
    site_type: z.union([siteTypeEnum, z.null()]).optional(),
    site_type_other: z.union([z.string().max(255), z.null()]).optional(),
    is_renewal: z.boolean().optional(),
    renewal_urls: z.array(z.string()).optional(),
    kickoff_date: dateOrNull,
    release_due_date: dateOrNull,
    redmine_links: z.array(redmineLinkItem).optional(),
    participants: z
      .array(
        z.object({
          user_id: z.number().int().positive(),
          role: z.enum(["owner", "editor", "viewer"]),
        }),
      )
      .optional(),
    misc_links: z
      .array(
        z.object({
          label: z.string().min(1).max(255),
          url: z.string().min(1).max(2048),
        }),
      )
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.site_type === "other") {
      const o = data.site_type_other?.trim();
      if (o === undefined || o === null || o === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "site_type が other のときは site_type_other を入力してください。",
          path: ["site_type_other"],
        });
      }
    }
  });

export type PortalProjectCreateBody = z.infer<typeof portalProjectCreateBodySchema>;

/** BFF が PHP `PATCH /portal/api/project` に転送する前に検証するボディ。 */
export const portalProjectPatchBodySchema = portalProjectCreateBodySchema.and(
  z.object({
    project_id: z.number().int().positive(),
  }),
);

export type PortalProjectPatchBody = z.infer<typeof portalProjectPatchBodySchema>;
