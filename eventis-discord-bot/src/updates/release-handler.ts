import { logoPng } from "../branding/logo.js";
import type { EventHandler, PreparedPublication } from "../integration/handler.js";
import type { EventRepository } from "../persistence/event-repository.js";
import { MAX_UPDATE_DESCRIPTION, releaseDataSchema, type ReleaseData } from "./release-schema.js";
import { buildUpdateMessage, renderUpdateDescription } from "./update-message.js";

export const RELEASE_EVENT_TYPE = "site.release.published";

export function parseRelease(data: unknown): ReleaseData {
  const release = releaseDataSchema.parse(data);
  if (renderUpdateDescription(release.changes).length > MAX_UPDATE_DESCRIPTION) {
    throw new Error(`Annonce trop longue pour un seul embed (${MAX_UPDATE_DESCRIPTION} caractères max).`);
  }
  return release;
}

export class ReleaseHandler implements EventHandler<ReleaseData> {
  readonly type = RELEASE_EVENT_TYPE;

  constructor(
    private readonly options: { channelId: string; showLogo: boolean },
    private readonly events: EventRepository,
    private readonly loadLogo: () => Promise<Buffer> = () => logoPng(256),
  ) {}

  parse(data: unknown): ReleaseData {
    return parseRelease(data);
  }

  dedupeKey(release: ReleaseData): string {
    return `release:${release.release_id}`;
  }

  rejectionReason(release: ReleaseData): string | null {
    // Seule une version réellement mise en ligne est annoncée (ni staging, ni preview, ni local).
    return release.environment === "production" ? null : "not_production";
  }

  async prepare(release: ReleaseData): Promise<PreparedPublication> {
    if (this.events.isReleaseVersionPublished(release.version)) return { ignore: "version_already_announced" };
    const logo = this.options.showLogo ? await this.loadLogo() : null;
    return { channelId: this.options.channelId, message: buildUpdateMessage(release, logo) };
  }
}
