import { createHmac, timingSafeEqual } from "node:crypto";

export const TIMESTAMP_HEADER = "x-eventis-timestamp";
export const SIGNATURE_HEADER = "x-eventis-signature";

/** Signature v1 : HMAC-SHA256(secret, "<timestamp>.<corps brut>") en hexadécimal. */
export function computeSignature(secret: string, timestamp: string, rawBody: string | Buffer): string {
  return createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex");
}

export function signatureHeader(secret: string, timestamp: string, rawBody: string | Buffer): string {
  return `v1=${computeSignature(secret, timestamp, rawBody)}`;
}

export type SignatureCheck = { ok: true } | { ok: false; reason: "missing_headers" | "stale_timestamp" | "invalid_signature" };

export function verifySignature(input: {
  secrets: string[];
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: Buffer;
  nowSeconds: number;
  toleranceSeconds: number;
}): SignatureCheck {
  const { timestamp, signature } = input;
  if (!timestamp || !signature) return { ok: false, reason: "missing_headers" };
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: "stale_timestamp" };
  // Protection contre le rejeu : la signature couvre l'horodatage, qui doit être récent.
  if (Math.abs(input.nowSeconds - Number(timestamp)) > input.toleranceSeconds) {
    return { ok: false, reason: "stale_timestamp" };
  }
  const provided = signature
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1="))
    .map((part) => Buffer.from(part.slice(3), "hex"));
  for (const secret of input.secrets) {
    const expected = Buffer.from(computeSignature(secret, timestamp, input.rawBody), "hex");
    if (provided.some((p) => p.length === expected.length && timingSafeEqual(p, expected))) return { ok: true };
  }
  return { ok: false, reason: "invalid_signature" };
}
