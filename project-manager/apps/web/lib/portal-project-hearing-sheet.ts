import { z } from "zod";

const hearingStatusEnum = z.enum(["draft", "finalized", "archived"]);

/** BFF が PHP `PATCH /portal/api/project-hearing-sheet` に転送する前に検証するボディ */
export const portalProjectHearingSheetPatchBodySchema = z
  .object({
    project_id: z.number().int().positive(),
    status: hearingStatusEnum.optional(),
    /** 表行の配列やネストを許容 */
    body_json: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === undefined && data.body_json === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "body_json または status のいずれかを指定してください。",
        path: ["body_json"],
      });
    }
  });

export type PortalProjectHearingSheetPatchBody = z.infer<typeof portalProjectHearingSheetPatchBodySchema>;

export const portalHearingSheetResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  hearing_sheet: z
    .object({
      project_id: z.number().int().positive(),
      status: hearingStatusEnum,
      body_json: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]),
    })
    .optional(),
});

export type PortalHearingSheetPayload = NonNullable<z.infer<typeof portalHearingSheetResponseSchema>["hearing_sheet"]>;
