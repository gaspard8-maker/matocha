import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChannelType } from "discord.js";
import { describe, expect, it, vi } from "vitest";
import type { OutboundMessage } from "../src/bot/outbound-message.js";
import { openDatabase } from "../src/persistence/database.js";
import { TicketRepository } from "../src/persistence/ticket-repository.js";
import { DiscordTicketGateway, NotPrivateThreadError, type TicketGateway, type ThreadState } from "../src/tickets/ticket-gateway.js";
import { buildTicketMessage, buildTicketPanelComponents } from "../src/tickets/ticket-message.js";
import { TicketService } from "../src/tickets/ticket-service.js";
import { IDS, memoryDb, silentLogger, testConfig, visibleText } from "./helpers.js";

class FakeGateway implements TicketGateway {
  missing: string[] = [];
  threads = new Map<string, { state: ThreadState; members: string[]; messages: OutboundMessage[]; private: true }>();
  staff = [IDS.staff];
  publicChannelsCreated = 0;
  private next = 1;

  missingPermissions() {
    return Promise.resolve(this.missing);
  }
  createPrivateThread(_name: string) {
    const id = `30000000000000000${this.next++}`;
    this.threads.set(id, { state: "active", members: [], messages: [], private: true });
    return Promise.resolve(id);
  }
  sendInThread(threadId: string, message: OutboundMessage) {
    this.threads.get(threadId)?.messages.push(message);
    return Promise.resolve();
  }
  addMember(threadId: string, userId: string) {
    this.threads.get(threadId)?.members.push(userId);
    return Promise.resolve();
  }
  staffMemberIds() {
    return Promise.resolve(this.staff);
  }
  threadState(threadId: string) {
    return Promise.resolve(this.threads.get(threadId)?.state ?? "missing");
  }
  reopen(threadId: string) {
    const t = this.threads.get(threadId);
    if (t) t.state = "active";
    return Promise.resolve();
  }
  closeThread(threadId: string) {
    const t = this.threads.get(threadId);
    if (t) t.state = "archived";
    return Promise.resolve();
  }
}

function setup(dbPath?: string, clock = { t: new Date("2026-10-29T12:00:00Z").getTime() }) {
  const db = dbPath ? openDatabase(dbPath) : memoryDb();
  const repo = new TicketRepository(db);
  const gateway = new FakeGateway();
  const service = new TicketService(
    repo,
    gateway,
    { guildId: IDS.guild, owner: { kind: "role", id: IDS.ownerRole }, cooldownSeconds: 60, now: () => new Date(clock.t) },
    silentLogger,
  );
  return { db, repo, gateway, service, clock };
}

describe("message du ticket (capture 1)", () => {
  it("mentionne le membre puis affiche uniquement l'embed « Ton ticket privé »", () => {
    const message = buildTicketMessage(IDS.member, { kind: "role", id: IDS.ownerRole });
    expect(message.content).toBe(`<@${IDS.member}>`);
    expect(message.embeds).toHaveLength(1);
    expect(message.embeds[0]).toEqual({
      title: "Ton ticket privé",
      description: `Explique ta demande ici pour échanger avec <@&${IDS.ownerRole}>.`,
      color: 0x10b981,
    });
    expect(message.files).toBeUndefined();
    expect(visibleText(message)).toBe(
      `<@${IDS.member}>\nTon ticket privé\nExplique ta demande ici pour échanger avec <@&${IDS.ownerRole}>.`,
    );
  });

  it("utilise une vraie mention Discord pour @Owner (rôle ou utilisateur) et ne notifie que le membre", () => {
    const message = buildTicketMessage(IDS.member, { kind: "user", id: IDS.staff });
    expect(message.embeds[0]?.description).toContain(`<@${IDS.staff}>`);
    expect(message.allowedMentions).toEqual({ parse: [], users: [IDS.member] });
  });

  it("le panneau ne contient qu'un bouton, sans texte", () => {
    const rows = buildTicketPanelComponents().map((r) => r.toJSON());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.components).toHaveLength(1);
  });
});

describe("TicketService", () => {
  it("crée un fil privé, envoie le message, ajoute le membre et le support, enregistre le ticket", async () => {
    const { service, gateway, repo } = setup();
    const result = await service.open(IDS.member);
    expect(result.kind).toBe("created");
    if (result.kind !== "created") return;
    const thread = gateway.threads.get(result.threadId);
    expect(thread?.private).toBe(true);
    expect(thread?.members).toEqual([IDS.member, IDS.staff]);
    expect(thread?.messages).toEqual([buildTicketMessage(IDS.member, { kind: "role", id: IDS.ownerRole })]);
    const stored = repo.findByThread(result.threadId);
    expect(stored).toMatchObject({ authorId: IDS.member, status: "open", threadId: result.threadId });
    expect(repo.history(result.ticket.id).map((a) => a.action)).toEqual(["reserved", "opened"]);
  });

  it("refuse de créer un ticket si les permissions manquent (aucun fil créé)", async () => {
    const { service, gateway, repo } = setup();
    gateway.missing = ["Créer des fils privés"];
    const result = await service.open(IDS.member);
    expect(result).toEqual({ kind: "missing_permissions", missing: ["Créer des fils privés"] });
    expect(gateway.threads.size).toBe(0);
    expect(repo.findActiveForMember(IDS.guild, IDS.member)).toBeNull();
  });

  it("n'autorise qu'un seul ticket ouvert par membre", async () => {
    const { service, gateway } = setup();
    const first = await service.open(IDS.member);
    const second = await service.open(IDS.member);
    expect(first.kind).toBe("created");
    expect(second).toEqual({ kind: "existing", threadId: first.kind === "created" ? first.threadId : "" });
    expect(gateway.threads.size).toBe(1);
  });

  it("ignore les doubles clics simultanés (anti-spam)", async () => {
    const { service, gateway } = setup();
    const results = await Promise.all([service.open(IDS.member), service.open(IDS.member), service.open(IDS.member)]);
    expect(results.filter((r) => r.kind === "created")).toHaveLength(1);
    expect(gateway.threads.size).toBe(1);
  });

  it("applique un délai entre deux créations de tickets", async () => {
    const { service, clock } = setup();
    const first = await service.open(IDS.member);
    if (first.kind !== "created") throw new Error("ticket non créé");
    await service.close(first.threadId, { id: IDS.member, isStaff: false });
    clock.t += 10_000;
    expect(await service.open(IDS.member)).toEqual({ kind: "cooldown", retryAfterSeconds: 50 });
    clock.t += 50_000;
    expect((await service.open(IDS.member)).kind).toBe("created");
  });

  it("ferme le ticket (auteur ou support) et refuse les autres membres", async () => {
    const { service, gateway, repo } = setup();
    const opened = await service.open(IDS.member);
    if (opened.kind !== "created") throw new Error("ticket non créé");
    expect(await service.close(opened.threadId, { id: IDS.otherMember, isStaff: false })).toEqual({ kind: "forbidden" });
    const closed = await service.close(opened.threadId, { id: IDS.staff, isStaff: true }, "résolu");
    expect(closed.kind).toBe("closed");
    expect(gateway.threads.get(opened.threadId)?.state).toBe("archived");
    expect(repo.findByThread(opened.threadId)).toMatchObject({ status: "closed", closedBy: IDS.staff, closeReason: "résolu" });
    expect(await service.close(opened.threadId, { id: IDS.staff, isStaff: true })).toEqual({ kind: "already_closed" });
    expect(gateway.threads.size).toBe(1); // rien n'est supprimé
  });

  it("prise en charge réservée au support", async () => {
    const { service, repo } = setup();
    const opened = await service.open(IDS.member);
    if (opened.kind !== "created") throw new Error("ticket non créé");
    expect(service.claim(opened.threadId, { id: IDS.member, isStaff: false })).toEqual({ kind: "forbidden" });
    expect(service.claim(opened.threadId, { id: IDS.staff, isStaff: true })).toEqual({ kind: "claimed" });
    expect(repo.findByThread(opened.threadId)?.assigneeId).toBe(IDS.staff);
  });

  it("rouvre le fil archivé au lieu d'en créer un nouveau", async () => {
    const { service, gateway } = setup();
    const opened = await service.open(IDS.member);
    if (opened.kind !== "created") throw new Error("ticket non créé");
    const thread = gateway.threads.get(opened.threadId);
    if (thread) thread.state = "archived";
    expect(await service.open(IDS.member)).toEqual({ kind: "existing", threadId: opened.threadId });
    expect(thread?.state).toBe("active");
  });

  it("conserve les tickets après un redémarrage et nettoie les fils supprimés", async () => {
    const dir = mkdtempSync(join(tmpdir(), "eventis-tickets-"));
    try {
      const path = join(dir, "bot.sqlite");
      const first = setup(path);
      const opened = await first.service.open(IDS.member);
      if (opened.kind !== "created") throw new Error("ticket non créé");
      first.db.close();

      const second = setup(path);
      second.gateway.threads.set(opened.threadId, { state: "active", members: [], messages: [], private: true });
      expect(await second.service.open(IDS.member)).toEqual({ kind: "existing", threadId: opened.threadId });

      second.gateway.threads.delete(opened.threadId);
      await second.service.reconcile();
      expect(second.repo.findByThread(opened.threadId)?.status).toBe("closed");
      second.db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("marque le ticket fermé si le fil est supprimé sur Discord", async () => {
    const { service, repo } = setup();
    const opened = await service.open(IDS.member);
    if (opened.kind !== "created") throw new Error("ticket non créé");
    service.handleThreadDeleted(opened.threadId);
    expect(repo.findByThread(opened.threadId)).toMatchObject({ status: "closed", closeReason: "thread_deleted" });
  });

  it("libère la réservation si Discord refuse la création", async () => {
    const { service, gateway, repo } = setup();
    vi.spyOn(gateway, "createPrivateThread").mockRejectedValueOnce(new NotPrivateThreadError());
    expect(await service.open(IDS.member)).toEqual({ kind: "error" });
    expect(repo.findActiveForMember(IDS.guild, IDS.member)).toBeNull();
  });
});

describe("DiscordTicketGateway", () => {
  function fakeClient(createdType: ChannelType) {
    const deleteThread = vi.fn(() => Promise.resolve());
    const create = vi.fn(() => Promise.resolve({ id: "300000000000000009", type: createdType, delete: deleteThread }));
    const channel = { type: ChannelType.GuildText, threads: { create } };
    const client = { channels: { fetch: vi.fn(() => Promise.resolve(channel)) } };
    return { client, create, deleteThread };
  }

  it("crée un fil privé non invitable dans le salon existant (jamais un salon)", async () => {
    const { client, create } = fakeClient(ChannelType.PrivateThread);
    const gateway = new DiscordTicketGateway(client as never, testConfig(), silentLogger);
    expect(await gateway.createPrivateThread("ticket-0001")).toBe("300000000000000009");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "ticket-0001", type: ChannelType.PrivateThread, invitable: false }),
    );
  });

  it("supprime et refuse un fil qui ne serait pas privé", async () => {
    const { client, deleteThread } = fakeClient(ChannelType.PublicThread);
    const gateway = new DiscordTicketGateway(client as never, testConfig(), silentLogger);
    await expect(gateway.createPrivateThread("ticket-0002")).rejects.toBeInstanceOf(NotPrivateThreadError);
    expect(deleteThread).toHaveBeenCalled();
  });
});
