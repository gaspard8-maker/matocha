import { randomBytes, randomUUID } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  InteractionContextType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { ZodError } from "zod";
import { isAdministrator } from "../bot/access.js";
import { toDiscordPayload } from "../bot/publisher.js";
import type { PublishOutcome } from "../integration/handler.js";
import type { ReleaseData } from "./release-schema.js";
import { parseRelease } from "./release-handler.js";
import { buildUpdateMessage } from "./update-message.js";

export const UPDATE_MODAL_ID = "eventis:update:modal";
export const UPDATE_PUBLISH_PREFIX = "eventis:update:publish:";
export const UPDATE_CANCEL_PREFIX = "eventis:update:cancel:";
const DRAFT_TTL_MS = 15 * 60 * 1000;

export const updateAnnounceCommand = new SlashCommandBuilder()
  .setName("update-announce")
  .setDescription("Préparer une annonce de mise à jour (prévisualisation avant envoi)")
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

/** Une ligne = une modification ; les puces saisies à la main sont retirées. */
export function parseChangeLines(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[•\-*]\s*)+/, "").trim())
    .filter((line) => line.length > 0);
}

export function releaseFromForm(input: { version: string; tickets: string; api: string }, now: Date): ReleaseData {
  return parseRelease({
    release_id: `manual-${randomUUID()}`,
    version: input.version.trim().replace(/^v/i, ""),
    environment: "production",
    published_at: now.toISOString(),
    changes: [
      ...parseChangeLines(input.tickets).map((description) => ({ category: "tickets", description })),
      ...parseChangeLines(input.api).map((description) => ({ category: "api", description })),
    ],
  });
}

interface Draft {
  release: ReleaseData;
  authorId: string;
  expiresAt: number;
}

export class UpdateDrafts {
  private readonly drafts = new Map<string, Draft>();

  constructor(private readonly now: () => number = Date.now) {}

  create(release: ReleaseData, authorId: string): string {
    this.purge();
    const id = randomBytes(6).toString("hex");
    this.drafts.set(id, { release, authorId, expiresAt: this.now() + DRAFT_TTL_MS });
    return id;
  }

  take(id: string, authorId: string): ReleaseData | null {
    this.purge();
    const draft = this.drafts.get(id);
    if (draft?.authorId !== authorId) return null;
    this.drafts.delete(id);
    return draft.release;
  }

  private purge(): void {
    const now = this.now();
    for (const [id, d] of this.drafts) if (d.expiresAt < now) this.drafts.delete(id);
  }
}

export interface UpdateInteractionDeps {
  drafts: UpdateDrafts;
  showLogo: boolean;
  loadLogo: () => Promise<Buffer>;
  updatesChannelId: string;
  publishRelease: (release: ReleaseData) => Promise<PublishOutcome>;
}

async function denyIfNotAdmin(
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction | ButtonInteraction,
): Promise<boolean> {
  if (isAdministrator(interaction.memberPermissions)) return false;
  await interaction.reply({ content: "Commande réservée aux administrateurs.", flags: MessageFlags.Ephemeral });
  return true;
}

export async function handleUpdateAnnounceCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (await denyIfNotAdmin(interaction)) return;
  const modal = new ModalBuilder()
    .setCustomId(UPDATE_MODAL_ID)
    .setTitle("Annonce de mise à jour")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Version")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId("version")
            .setPlaceholder("6.4.2")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(16),
        ),
      new LabelBuilder()
        .setLabel("Tickets")
        .setDescription("Une modification par ligne")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("tickets").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(3000),
        ),
      new LabelBuilder()
        .setLabel("API")
        .setDescription("Une modification par ligne (facultatif)")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("api").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1500),
        ),
    );
  await interaction.showModal(modal);
}

export async function handleUpdateModal(interaction: ModalSubmitInteraction, deps: UpdateInteractionDeps): Promise<void> {
  if (await denyIfNotAdmin(interaction)) return;
  let release: ReleaseData;
  try {
    release = releaseFromForm(
      {
        version: interaction.fields.getTextInputValue("version"),
        tickets: interaction.fields.getTextInputValue("tickets"),
        api: interaction.fields.getTextInputValue("api"),
      },
      new Date(),
    );
  } catch (error) {
    const detail =
      error instanceof ZodError ? error.issues.map((i) => `${i.path.join(".")} : ${i.message}`).join("\n") : String(error);
    await interaction.reply({ content: `Annonce invalide :\n${detail}`, flags: MessageFlags.Ephemeral });
    return;
  }

  const draftId = deps.drafts.create(release, interaction.user.id);
  const preview = buildUpdateMessage(release, deps.showLogo ? await deps.loadLogo() : null);
  await interaction.reply({
    ...toDiscordPayload(preview),
    flags: MessageFlags.Ephemeral,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`${UPDATE_PUBLISH_PREFIX}${draftId}`).setLabel("Publier").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`${UPDATE_CANCEL_PREFIX}${draftId}`).setLabel("Annuler").setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}

export function outcomeReply(outcome: PublishOutcome, channelId: string): string {
  switch (outcome.status) {
    case "published":
      return `Annonce publiée dans <#${channelId}>.`;
    case "ignored":
      return outcome.reason === "version_already_announced"
        ? "Cette version a déjà été annoncée : rien n'a été publié."
        : `Annonce non publiée (${outcome.reason}).`;
    case "duplicate":
      return "Cette annonce a déjà été traitée.";
    case "retrying":
      return "Discord n'a pas répondu : l'envoi sera réessayé automatiquement.";
    case "failed":
      return `Échec de la publication : ${outcome.error}`;
  }
}

export async function handleUpdateButton(interaction: ButtonInteraction, deps: UpdateInteractionDeps): Promise<void> {
  if (await denyIfNotAdmin(interaction)) return;
  const publish = interaction.customId.startsWith(UPDATE_PUBLISH_PREFIX);
  const draftId = interaction.customId.slice((publish ? UPDATE_PUBLISH_PREFIX : UPDATE_CANCEL_PREFIX).length);
  const release = deps.drafts.take(draftId, interaction.user.id);

  if (!publish || !release) {
    await interaction.update({
      content: release || !publish ? "Annonce annulée." : "Prévisualisation expirée : relance /update-announce.",
      embeds: [],
      files: [],
      attachments: [],
      components: [],
    });
    return;
  }

  await interaction.update({ content: "Publication en cours…", components: [] });
  const outcome = await deps.publishRelease(release);
  await interaction.editReply({ content: outcomeReply(outcome, deps.updatesChannelId) });
}
