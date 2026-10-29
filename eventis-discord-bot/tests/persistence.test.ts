import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../src/persistence/database.js";
import { TicketRepository } from "../src/persistence/ticket-repository.js";
import { EventRepository } from "../src/persistence/event-repository.js";
import { IDS } from "./helpers.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("persistance SQLite", () => {
  it("conserve les tickets et les événements après un redémarrage", () => {
    const dir = mkdtempSync(join(tmpdir(), "eventis-bot-"));
    dirs.push(dir);
    const path = join(dir, "bot.sqlite");
    const now = new Date("2026-10-29T12:00:00Z");

    const db1 = openDatabase(path);
    const tickets1 = new TicketRepository(db1);
    const ticket = tickets1.reserve(IDS.guild, IDS.member, now);
    if (!ticket) throw new Error("ticket non réservé");
    tickets1.attachThread(ticket.id, "300000000000000001", now);
    new EventRepository(db1).insert(
      { dedupeKey: "sale:1", envelopeId: "evt_1", type: "marketplace.sale.confirmed", payload: { a: 1 }, status: "pending" },
      now,
    );
    db1.close();

    const db2 = openDatabase(path);
    const tickets2 = new TicketRepository(db2);
    expect(tickets2.findActiveForMember(IDS.guild, IDS.member)?.threadId).toBe("300000000000000001");
    expect(tickets2.reserve(IDS.guild, IDS.member, now)).toBeNull();
    expect(new EventRepository(db2).insert(
      { dedupeKey: "sale:1", envelopeId: "evt_2", type: "marketplace.sale.confirmed", payload: {}, status: "pending" },
      now,
    )).toBe(false);
    db2.close();
  });
});
