import { describe, expect, it, vi } from "vitest";
import { WelcomeRepository } from "../src/persistence/welcome-repository.js";
import { BANNER_HEIGHT, BANNER_WIDTH, fetchAvatar, renderWelcomeBanner } from "../src/welcome/banner.js";
import { buildWelcomeMessage } from "../src/welcome/welcome-message.js";
import { WelcomeService, type JoiningMember } from "../src/welcome/welcome-service.js";
import { FakePublisher, IDS, memoryDb, silentLogger, visibleText } from "./helpers.js";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

describe("message de bienvenue (capture 4)", () => {
  it("contient exactement les deux lignes et la bannière", () => {
    const message = buildWelcomeMessage(IDS.member, Buffer.from("png"));
    expect(message.content).toBe(`<@${IDS.member}>`);
    expect(message.embeds).toHaveLength(1);
    expect(message.embeds[0]).toEqual({
      description: `🎉 Welcome to **EventisPro**, <@${IDS.member}>!\nGlad to have you here.`,
      color: 0x10b981,
      image: { url: "attachment://welcome.png" },
    });
    expect(message.files?.map((f) => f.name)).toEqual(["welcome.png"]);
    expect(visibleText(message)).toBe(
      `<@${IDS.member}>\n🎉 Welcome to **EventisPro**, <@${IDS.member}>!\nGlad to have you here.`,
    );
    expect(message.allowedMentions).toEqual({ parse: [], users: [IDS.member] });
  });
});

describe("bannière", () => {
  it("génère une image horizontale PNG avec ou sans avatar", async () => {
    const withoutAvatar = await renderWelcomeBanner(null);
    expect(withoutAvatar.subarray(0, 4)).toEqual(PNG_SIGNATURE);
    expect(pngSize(withoutAvatar)).toEqual({ width: BANNER_WIDTH, height: BANNER_HEIGHT });
    const withAvatar = await renderWelcomeBanner(withoutAvatar);
    expect(withAvatar.equals(withoutAvatar)).toBe(false);
    expect(await renderWelcomeBanner(Buffer.from("pas une image"))).toBeInstanceOf(Buffer);
  });

  it("ne télécharge les avatars que depuis le CDN Discord", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3]))));
    expect(await fetchAvatar("https://evil.example/a.png", fetchImpl)).toBeNull();
    expect(await fetchAvatar("http://cdn.discordapp.com/a.png", fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await fetchAvatar("https://cdn.discordapp.com/avatars/1/a.png", fetchImpl)).toEqual(Buffer.from([1, 2, 3]));
    const failing = vi.fn(() => Promise.reject(new Error("réseau")));
    expect(await fetchAvatar("https://cdn.discordapp.com/avatars/1/a.png", failing)).toBeNull();
  });
});

describe("WelcomeService", () => {
  function setup() {
    const repo = new WelcomeRepository(memoryDb());
    const publisher = new FakePublisher();
    const clock = { t: new Date("2026-10-29T12:00:00Z").getTime() };
    const renderBanner = vi.fn((avatar: Buffer | null) => Promise.resolve(Buffer.from(avatar ? "banner+avatar" : "banner")));
    const fetchAvatarMock = vi.fn((_url: string) => Promise.resolve<Buffer | null>(Buffer.from("avatar")));
    const service = new WelcomeService({
      repo,
      publisher,
      channelId: IDS.welcomeChannel,
      rejoinCooldownHours: 24,
      fetchAvatar: fetchAvatarMock,
      renderBanner,
      logger: silentLogger,
      now: () => new Date(clock.t),
    });
    return { repo, publisher, clock, renderBanner, fetchAvatarMock, service };
  }
  const member = (o: Partial<JoiningMember> = {}): JoiningMember => ({
    guildId: IDS.guild,
    userId: IDS.member,
    isBot: false,
    joinedAt: new Date("2026-10-29T11:59:59Z"),
    avatarUrl: "https://cdn.discordapp.com/avatars/1/a.png",
    ...o,
  });

  it("envoie un seul message avec la bannière de l'avatar du membre", async () => {
    const { service, publisher, renderBanner } = setup();
    expect(await service.handleMemberJoin(member())).toBe("sent");
    expect(publisher.sent).toHaveLength(1);
    expect(publisher.sent[0]?.channelId).toBe(IDS.welcomeChannel);
    expect(publisher.sent[0]?.message.files?.[0]?.data.toString()).toBe("banner+avatar");
    expect(publisher.sent[0]?.nonce).toHaveLength(25);
    expect(renderBanner).toHaveBeenCalledWith(Buffer.from("avatar"));
  });

  it("ne renvoie pas le message pour une même arrivée (doublon, redémarrage)", async () => {
    const { service, publisher } = setup();
    await service.handleMemberJoin(member());
    expect(await service.handleMemberJoin(member())).toBe("duplicate");
    expect(publisher.sent).toHaveLength(1);
  });

  it("ignore les bots et les retours rapides du même membre", async () => {
    const { service, publisher, clock } = setup();
    expect(await service.handleMemberJoin(member({ isBot: true }))).toBe("skipped_bot");
    await service.handleMemberJoin(member());
    clock.t += 3_600_000;
    expect(await service.handleMemberJoin(member({ joinedAt: new Date(clock.t) }))).toBe("skipped_recent");
    clock.t += 24 * 3_600_000;
    expect(await service.handleMemberJoin(member({ joinedAt: new Date(clock.t) }))).toBe("sent");
    expect(publisher.sent).toHaveLength(2);
  });

  it("utilise une bannière sans photo si l'avatar manque", async () => {
    const { service, fetchAvatarMock, renderBanner } = setup();
    fetchAvatarMock.mockResolvedValueOnce(null);
    expect(await service.handleMemberJoin(member())).toBe("sent");
    expect(renderBanner).toHaveBeenCalledWith(null);
  });

  it("enregistre l'échec si Discord refuse le message, sans planter", async () => {
    const { service, publisher, repo } = setup();
    publisher.failures.push(new Error("Missing Permissions"));
    expect(await service.handleMemberJoin(member())).toBe("failed");
    expect(repo.status(IDS.guild, IDS.member, "2026-10-29T11:59:59.000Z")).toBe("failed");
  });
});
