import { describe, expect, it } from "vitest";
import { PermanentPublishError } from "../src/bot/outbound-message.js";
import { INVITE_PERMISSIONS } from "../src/bot/permissions.js";
import { EventProcessor } from "../src/integration/event-processor.js";
import type { EventHandler } from "../src/integration/handler.js";
import { EventRepository } from "../src/persistence/event-repository.js";
import { StateRepository } from "../src/persistence/state-repository.js";
import { assignJoinRole } from "../src/roles/join-role.js";
import { PRO_EVENT_TYPE, ProRoleHandler } from "../src/roles/pro-handler.js";
import type { RoleGateway } from "../src/roles/role-gateway.js";
import { FakePublisher, IDS, memoryDb, silentLogger } from "./helpers.js";

const MEMBER_ROLE = "1564433473547014234";
const PRO_ROLE = "1564433547119562905";

class FakeRoles implements RoleGateway {
  roles = new Map<string, Set<string>>([[IDS.member, new Set()]]);
  failure: Error | null = null;
  setRole(userId: string, roleId: string, present: boolean): Promise<boolean> {
    if (this.failure) return Promise.reject(this.failure);
    const set = this.roles.get(userId);
    if (!set) return Promise.resolve(false);
    if (present) set.add(roleId);
    else set.delete(roleId);
    return Promise.resolve(true);
  }
}

describe("rôle Membre à l'arrivée", () => {
  it("attribue le rôle aux nouveaux membres, pas aux bots", async () => {
    const roles = new FakeRoles();
    expect(await assignJoinRole({ userId: IDS.member, isBot: false }, MEMBER_ROLE, roles, silentLogger)).toBe("assigned");
    expect(roles.roles.get(IDS.member)?.has(MEMBER_ROLE)).toBe(true);
    expect(await assignJoinRole({ userId: IDS.member, isBot: true }, MEMBER_ROLE, roles, silentLogger)).toBe("skipped");
    expect(await assignJoinRole({ userId: IDS.member, isBot: false }, undefined, roles, silentLogger)).toBe("skipped");
  });

  it("n'interrompt rien si Discord refuse (permissions)", async () => {
    const roles = new FakeRoles();
    roles.failure = new PermanentPublishError("Missing Permissions");
    expect(await assignJoinRole({ userId: IDS.member, isBot: false }, MEMBER_ROLE, roles, silentLogger)).toBe("failed");
  });

  it("le lien d'invitation inclut « Gérer les rôles »", () => {
    expect(INVITE_PERMISSIONS.toArray()).toContain("ManageRoles");
  });
});

describe("rôle Pro piloté par le site", () => {
  function setup(proRoleId: string | null = PRO_ROLE) {
    const db = memoryDb();
    const roles = new FakeRoles();
    const repo = new EventRepository(db);
    const processor = new EventProcessor(
      repo,
      [new ProRoleHandler(proRoleId ?? undefined, roles, new StateRepository(db))] as EventHandler<unknown>[],
      new FakePublisher(),
      silentLogger,
    );
    return { roles, repo, processor };
  }
  const update = (o: Record<string, unknown> = {}) => ({
    change_id: "chg_1",
    discord_user_id: IDS.member,
    is_pro: true,
    changed_at: "2026-11-01T10:00:00Z",
    ...o,
  });

  it("ajoute puis retire le rôle Pro, une seule fois par changement", async () => {
    const { roles, processor } = setup();
    expect(await processor.publishNow("e1", PRO_EVENT_TYPE, update())).toEqual({ status: "published", messageId: "pro_role_added" });
    expect(roles.roles.get(IDS.member)?.has(PRO_ROLE)).toBe(true);
    expect(await processor.publishNow("e1b", PRO_EVENT_TYPE, update())).toEqual({ status: "duplicate" });
    await processor.publishNow("e2", PRO_EVENT_TYPE, update({ change_id: "chg_2", is_pro: false, changed_at: "2026-11-02T10:00:00Z" }));
    expect(roles.roles.get(IDS.member)?.has(PRO_ROLE)).toBe(false);
  });

  it("ignore un changement plus ancien arrivé en retard", async () => {
    const { roles, processor } = setup();
    await processor.publishNow("e2", PRO_EVENT_TYPE, update({ change_id: "chg_2", is_pro: false, changed_at: "2026-11-02T10:00:00Z" }));
    expect(await processor.publishNow("e1", PRO_EVENT_TYPE, update())).toEqual({ status: "ignored", reason: "outdated_change" });
    expect(roles.roles.get(IDS.member)?.has(PRO_ROLE)).toBe(false);
  });

  it("gère un membre absent du serveur et un rôle non configuré", async () => {
    const { processor } = setup();
    expect(await processor.publishNow("e3", PRO_EVENT_TYPE, update({ change_id: "c3", discord_user_id: IDS.otherMember }))).toEqual({
      status: "published",
      messageId: "member_not_in_guild",
    });
    const unconfigured = setup(null);
    expect(await unconfigured.processor.publishNow("e4", PRO_EVENT_TYPE, update())).toEqual({
      status: "ignored",
      reason: "pro_role_not_configured",
    });
  });

  it("refuse les données inattendues", () => {
    const { processor } = setup();
    expect(() => processor.receive("e5", PRO_EVENT_TYPE, update({ email: "a@b.c" }))).toThrow();
    expect(() => processor.receive("e6", PRO_EVENT_TYPE, update({ discord_user_id: "mlab07" }))).toThrow();
  });
});
