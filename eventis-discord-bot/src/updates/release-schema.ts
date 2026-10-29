import { z } from "zod";

/** Sections affichées, dans l'ordre de la capture 2. Une section n'apparaît que si elle a des modifications. */
export const RELEASE_SECTIONS = [
  { category: "tickets", heading: "🎟️ Tickets" },
  { category: "api", heading: "🔌 API" },
] as const;

export type ReleaseCategory = (typeof RELEASE_SECTIONS)[number]["category"];

export const MAX_UPDATE_DESCRIPTION = 4000;

export const releaseChangeSchema = z
  .object({
    category: z.enum(["tickets", "api"]),
    description: z.string().trim().min(1).max(300),
  })
  .strict();

export const releaseDataSchema = z
  .object({
    release_id: z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/, "release_id invalide"),
    version: z.string().regex(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/, "version attendue au format X.Y.Z"),
    environment: z.enum(["production", "staging", "preview", "development"]),
    published_at: z.iso.datetime({ offset: true }),
    changes: z.array(releaseChangeSchema).min(1).max(25),
  })
  .strict();

export type ReleaseData = z.output<typeof releaseDataSchema>;
