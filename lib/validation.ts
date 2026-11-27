import { z } from "zod";

const trimmed = (label: string, min: number, max: number) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(min, min === 1 ? `${label} can't be empty.` : `${label} needs at least ${min} characters.`)
    .max(max, `${label} can be at most ${max} characters.`);

export const postSchema = z.object({
  title: trimmed("Title", 3, 120),
  body: trimmed("Description", 1, 2000),
});

export const commentSchema = z.object({
  body: trimmed("Comment", 1, 1000),
});

export const reportSchema = z.object({
  targetType: z.enum(["POST", "COMMENT"]),
  targetId: z.string().min(1).max(40),
  reason: z
    .string()
    .trim()
    .max(200, "Reason can be at most 200 characters.")
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export const idSchema = z.string().min(1).max(40);

export const MAX_LINKS = 2;
const LINK_RE = /\bhttps?:\/\/|\bwww\./gi;

export function countLinks(text: string): number {
  return text.match(LINK_RE)?.length ?? 0;
}

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check your input.";
}
