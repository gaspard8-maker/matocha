import { DiscordAPIError, type Client } from "discord.js";
import { PermanentPublishError } from "../bot/outbound-message.js";

/** Opérations de rôles (abstraites pour être testables). */
export interface RoleGateway {
  /** Ajoute ou retire le rôle. Retourne false si la personne n'est pas sur le serveur. */
  setRole(userId: string, roleId: string, present: boolean, reason: string): Promise<boolean>;
}

export class DiscordRoleGateway implements RoleGateway {
  constructor(
    private readonly client: Client,
    private readonly guildId: string,
  ) {}

  async setRole(userId: string, roleId: string, present: boolean, reason: string): Promise<boolean> {
    const guild = await this.client.guilds.fetch(this.guildId);
    const member = await guild.members.fetch(userId).catch((error: unknown) => {
      if (error instanceof DiscordAPIError && error.code === 10007) return null; // Unknown Member
      throw error;
    });
    if (!member) return false;
    if (member.roles.cache.has(roleId) === present) return true;
    const role = await guild.roles.fetch(roleId).catch(() => null);
    if (!role) throw new PermanentPublishError(`Rôle ${roleId} introuvable.`);
    if (!role.editable) {
      throw new PermanentPublishError(
        `Le bot ne peut pas gérer le rôle « ${role.name} » : place le rôle du bot au-dessus et donne-lui « Gérer les rôles ».`,
      );
    }
    if (present) await member.roles.add(role, reason);
    else await member.roles.remove(role, reason);
    return true;
  }
}
