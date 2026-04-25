import { z } from "zod";
import { sitemapContentSchema } from "@/lib/requirements-sitemap-schema";

const cellTriple = z.tuple([z.string().max(8192), z.string().max(8192), z.string().max(8192)]);

const tableRowSchema = z.object({
  id: z.string().min(1).max(128),
  cells: cellTriple,
});

const tableContentSchema = z.object({
  columnLabels: z.tuple([z.string().max(64), z.string().max(64), z.string().max(64)]),
  rows: z.array(tableRowSchema).max(500),
});

/** 旧プレーンテキスト保存と TipTap JSON の両方を許容（normalize で doc に統一） */
const richtextContentSchema = z.union([
  z.object({ text: z.string().max(2_000_000) }),
  z.object({ doc: z.unknown() }),
]);

const splitContentSchema = z.union([
  z.object({
    editorText: z.string().max(2_000_000),
    columnLabels: z.tuple([z.string().max(64), z.string().max(64), z.string().max(64)]),
    rows: z.array(tableRowSchema).max(500),
  }),
  z.object({
    editorDoc: z.unknown(),
    columnLabels: z.tuple([z.string().max(64), z.string().max(64), z.string().max(64)]),
    rows: z.array(tableRowSchema).max(500),
  }),
]);

const pageBaseSchema = z.object({
  id: z.string().min(1).max(128),
  pageType: z.string().min(1).max(64),
  title: z.string().min(0).max(500),
  createdOn: z.string().max(32).nullable().optional(),
  updatedOn: z.string().max(32).nullable().optional(),
  is_fixed: z.boolean(),
  deleted: z.boolean(),
});

export const requirementsPageSchema = z.discriminatedUnion("inputMode", [
  pageBaseSchema.extend({
    inputMode: z.literal("richtext"),
    content: richtextContentSchema,
  }),
  pageBaseSchema.extend({
    inputMode: z.literal("table"),
    content: tableContentSchema,
  }),
  pageBaseSchema.extend({
    inputMode: z.literal("split_editor_table"),
    content: splitContentSchema,
  }),
  pageBaseSchema.extend({
    inputMode: z.literal("sitemap"),
    content: sitemapContentSchema,
  }),
]);

export const requirementsDocBodySchema = z.object({
  schema_version: z.number().int().positive().optional(),
  pages: z.array(requirementsPageSchema).min(1).max(200),
});

export type RequirementsDocBodyParsed = z.infer<typeof requirementsDocBodySchema>;
