import { z } from "zod";
import { requirementsDocBodySchema } from "@/lib/requirements-doc-body-schema";

/** BFF が PHP `PATCH /portal/api/project-requirements` に転送する前に検証するボディ */
export const portalProjectRequirementsPatchBodySchema = z.object({
  project_id: z.number().int().positive(),
  body_json: requirementsDocBodySchema,
});

export type PortalProjectRequirementsPatchBody = z.infer<typeof portalProjectRequirementsPatchBodySchema>;
