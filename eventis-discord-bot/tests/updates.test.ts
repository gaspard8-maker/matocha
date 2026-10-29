import { describe, expect, it } from "vitest";
import { EventRepository } from "../src/persistence/event-repository.js";
import { ReleaseHandler, parseRelease } from "../src/updates/release-handler.js";
import { buildUpdateMessage, renderUpdateDescription } from "../src/updates/update-message.js";
import { parseChangeLines, releaseFromForm, UpdateDrafts } from "../src/updates/update-interactions.js";
import { IDS, memoryDb, visibleText } from "./helpers.js";

const LOGO = Buffer.from("logo");

export function sampleRelease(overrides: Record<string, unknown> = {}) {
  return {
    release_id: "rel_2026_10_29_01",
    version: "6.4.2",
    environment: "production",
    published_at: "2026-10-29T12:38:00+01:00",
    changes: [
      { category: "tickets", description: "Alertes de ventes : suivi de 10 événements." },
      { category: "tickets", description: "Recherche dans les dossiers du stock." },
      { category: "api", description: "Fix et améliorations générales de l'API." },
      { category: "tickets", description: "Fix Multi Delisting." },
    ],
    ...overrides,
  };
}

describe("embed de mise à jour (capture 2)", () => {
  it("reproduit la structure : titre UPDATE X.Y.Z, sections, puces, ligne vide entre sections", () => {
    const release = parseRelease(sampleRelease());
    const message = buildUpdateMessage(release, LOGO);
    expect(message.content).toBeUndefined();
    expect(message.embeds).toHaveLength(1);
    const embed = message.embeds[0];
    expect(embed?.title).toBe("UPDATE 6.4.2");
    expect(embed?.color).toBe(0x10b981);
    expect(embed?.description).toBe(
      [
        "🎟️ Tickets",
        "• Alertes de ventes : suivi de 10 événements.",
        "• Recherche dans les dossiers du stock.",
        "• Fix Multi Delisting.",
        "",
        "🔌 API",
        "• Fix et améliorations générales de l'API.",
      ].join("\n"),
    );
    expect(embed?.thumbnail?.url).toBe("attachment://eventispro.png");
    expect(embed?.url).toBeUndefined();
    expect(embed?.footer).toBeUndefined();
    expect(message.allowedMentions).toEqual({ parse: [] });
  });

  it("n'affiche la section API que si la mise à jour concerne l'API", () => {
    const description = renderUpdateDescription([{ category: "tickets", description: "Ajout." }]);
    expect(description).toBe("🎟️ Tickets\n• Ajout.");
    expect(description).not.toContain("API");
  });

  it("n'ajoute aucun texte (intro, conclusion, lien, mention)", () => {
    const text = visibleText(buildUpdateMessage(parseRelease(sampleRelease()), null));
    expect(text).not.toMatch(/https?:\/\/|@everyone|@here|<@/);
    expect(text.split("\n")[0]).toBe("UPDATE 6.4.2");
  });

  it("le logo est facultatif", () => {
    const message = buildUpdateMessage(parseRelease(sampleRelease()), null);
    expect(message.embeds[0]?.thumbnail).toBeUndefined();
    expect(message.files).toBeUndefined();
  });

  it("refuse une version mal formée, une catégorie inconnue ou un champ inattendu", () => {
    expect(() => parseRelease(sampleRelease({ version: "6.4" }))).toThrow();
    expect(() => parseRelease(sampleRelease({ changes: [{ category: "marketing", description: "x" }] }))).toThrow();
    expect(() => parseRelease(sampleRelease({ changes: [] }))).toThrow();
    expect(() => parseRelease(sampleRelease({ link: "https://example.com" }))).toThrow();
  });
});

describe("ReleaseHandler", () => {
  it("n'annonce que les publications de production et une seule fois par version", async () => {
    const events = new EventRepository(memoryDb());
    const handler = new ReleaseHandler({ channelId: IDS.updatesChannel, showLogo: true }, events, () => Promise.resolve(LOGO));
    const release = handler.parse(sampleRelease());
    expect(handler.dedupeKey(release)).toBe("release:rel_2026_10_29_01");
    expect(handler.rejectionReason(release)).toBeNull();
    expect(handler.rejectionReason(handler.parse(sampleRelease({ environment: "staging" })))).toBe("not_production");

    const prepared = await handler.prepare(release);
    expect(prepared).toMatchObject({ channelId: IDS.updatesChannel });

    const now = new Date();
    events.insert({ dedupeKey: "release:a", envelopeId: "e", type: handler.type, payload: release, status: "pending" }, now);
    events.markPublished("release:a", "1", now);
    expect(await handler.prepare(handler.parse(sampleRelease({ release_id: "other" })))).toEqual({
      ignore: "version_already_announced",
    });
  });
});

describe("publication manuelle (prévisualisation)", () => {
  it("transforme le formulaire en mise à jour (une ligne = une modification)", () => {
    expect(parseChangeLines("• Premier\n\n- Deuxième\n  * Troisième  ")).toEqual(["Premier", "Deuxième", "Troisième"]);
    const release = releaseFromForm({ version: "v6.4.3", tickets: "Ajout A\nAjout B", api: "" }, new Date());
    expect(release.version).toBe("6.4.3");
    expect(release.environment).toBe("production");
    expect(renderUpdateDescription(release.changes)).toBe("🎟️ Tickets\n• Ajout A\n• Ajout B");
  });

  it("refuse une annonce vide", () => {
    expect(() => releaseFromForm({ version: "6.4.3", tickets: " ", api: "" }, new Date())).toThrow();
  });

  it("un brouillon ne peut être publié que par son auteur, une seule fois, avant expiration", () => {
    let t = 0;
    const drafts = new UpdateDrafts(() => t);
    const release = releaseFromForm({ version: "1.0.0", tickets: "A", api: "" }, new Date());
    const id = drafts.create(release, IDS.staff);
    expect(drafts.take(id, IDS.member)).toBeNull();
    expect(drafts.take(id, IDS.staff)).toEqual(release);
    expect(drafts.take(id, IDS.staff)).toBeNull();
    const expired = drafts.create(release, IDS.staff);
    t += 16 * 60 * 1000;
    expect(drafts.take(expired, IDS.staff)).toBeNull();
  });
});
