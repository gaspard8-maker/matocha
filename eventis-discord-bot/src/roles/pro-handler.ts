import { z } from "zod";
import type { EventHandler, PreparedPublication } from "../integration/handler.js";
import type { StateRepository } from "../persistence/state-repository.js";
import type { RoleGateway } from "./role-gateway.js";

export const PRO_EVENT_TYPE = "member.pro.updated";

/** Le site signale qu'un compte Eventis relié à Discord passe Pro (ou ne l'est plus). */
export const proUpdateSchema = z
  .object({
    change_id: z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/, "change_id invalide"),
    discord_user_id: z.string().regex(/^\d{17,20}$/, "discord_user_id invalide"),
    is_pro: z.boolean(),
    changed_at: z.iso.datetime({ offset: true }),
  })
  .strict();

export type ProUpdate = z.output<typeof proUpdateSchema>;

export class ProRoleHandler implements EventHandler<ProUpdate> {
  readonly type = PRO_EVENT_TYPE;

  constructor(
    private readonly proRoleId: string | undefined,
    private readonly roles: RoleGateway,
    private readonly state: StateRepository,
  ) {}

  parse(data: unknown): ProUpdate {
    return proUpdateSchema.parse(data);
  }

  dedupeKey(update: ProUpdate): string {
    return `pro:${update.change_id}`;
  }

  rejectionReason(): string | null {
    return this.proRoleId ? null : "pro_role_not_configured";
  }

  prepare(update: ProUpdate): Promise<PreparedPublication> {
    const roleId = this.proRoleId;
    if (!roleId) return Promise.resolve({ ignore: "pro_role_not_configured" });
    // Un changement plus ancien que le dernier appliqué (livraison dans le désordre) est ignoré.
    const stateKey = `pro_last_change:${update.discord_user_id}`;
    const last = this.state.get(stateKey);
    if (last && new Date(last).getTime() > new Date(update.changed_at).getTime()) {
      return Promise.resolve({ ignore: "outdated_change" });
    }
    return Promise.resolve({
      run: async () => {
        const found = await this.roles.setRole(
          update.discord_user_id,
          roleId,
          update.is_pro,
          update.is_pro ? "Compte Eventis passé Pro" : "Compte Eventis plus Pro",
        );
        this.state.set(stateKey, update.changed_at);
        return found ? (update.is_pro ? "pro_role_added" : "pro_role_removed") : "member_not_in_guild";
      },
    });
  }
}
