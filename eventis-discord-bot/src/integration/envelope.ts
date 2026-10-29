import { z } from "zod";

/** Enveloppe commune à tous les événements envoyés par Eventis. */
export const envelopeSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/, "id invalide"),
    type: z.string().min(1).max(64),
    created_at: z.iso.datetime({ offset: true }),
    data: z.unknown(),
  })
  .strict();

export type Envelope = z.output<typeof envelopeSchema>;
