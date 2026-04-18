import { z } from "zod";

export const hearingAdviceSuggestionSchema = z.object({
  row_id: z.string().max(128).nullable().optional(),
  heading: z.string().max(512).nullable().optional(),
  message: z.string().max(2000),
  kind: z.enum(["empty_required", "master_conflict", "other"]),
});

export const hearingAdviceResultSchema = z.object({
  suggestions: z.array(hearingAdviceSuggestionSchema).max(30),
});

export type HearingAdviceSuggestion = z.infer<typeof hearingAdviceSuggestionSchema>;
