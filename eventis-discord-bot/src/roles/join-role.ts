import type { Logger } from "../logging/logger.js";
import type { RoleGateway } from "./role-gateway.js";

/** Donne le rôle Membre à chaque nouvel arrivant (hors bots). */
export async function assignJoinRole(
  member: { userId: string; isBot: boolean },
  roleId: string | undefined,
  roles: RoleGateway,
  logger: Logger,
): Promise<"assigned" | "skipped" | "failed"> {
  if (!roleId || member.isBot) return "skipped";
  try {
    await roles.setRole(member.userId, roleId, true, "Nouvel arrivant");
    return "assigned";
  } catch (error) {
    logger.error({ err: error, userId: member.userId }, "rôle Membre non attribué");
    return "failed";
  }
}
