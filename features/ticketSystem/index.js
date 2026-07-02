// ============================================================
//  features/ticketSystem/index.js
//  Panel-based ticket system with buttons
// ============================================================

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");
const logger = require("../../utils/logger");
const embeds = require("../../utils/embeds");

let ticketCounter = 1000;

/**
 * Send a persistent ticket panel to a channel.
 * @param {import('discord.js').TextChannel} channel
 * @param {import('discord.js').Client} client
 */
async function sendTicketPanel(channel, client) {
  const panelEmbed = new EmbedBuilder()
    .setColor(client.config.colors.primary)
    .setTitle("🎫 Hazelink Support")
    .setDescription(
      "Need help? Click the button below to open a private support ticket.\n\n" +
      "**Before opening a ticket:**\n" +
      "• Check our FAQ channel for common answers\n" +
      "• Be ready to describe your issue clearly\n" +
      "• Abuse of tickets may result in a restriction"
    )
    .setFooter({ text: "Hazel • Hazelink Bot" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("open_ticket")
      .setLabel("Open Ticket")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🎫")
  );

  await channel.send({ embeds: [panelEmbed], components: [row] });
  logger.info(`[TicketSystem] Panel sent to #${channel.name}`);
}

/**
 * Attach the ticket interaction listener to the client.
 * @param {import('discord.js').Client} client
 */
function initTicketSystem(client) {
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    // ── Open Ticket ──────────────────────────────────────────
    if (interaction.customId === "open_ticket") {
      const guild    = interaction.guild;
      const member   = interaction.member;
      const existing = guild.channels.cache.find(
        (c) =>
          c.name === `ticket-${member.user.username.toLowerCase()}` &&
          c.type === ChannelType.GuildText
      );

      if (existing) {
        return interaction.reply({
          embeds: [embeds.warning("Already Open", `You already have a ticket open: ${existing}`)],
          ephemeral: true,
        });
      }

      ticketCounter++;
      const ticketName = `ticket-${member.user.username.toLowerCase()}`;

      let ticketChannel;
      try {
        ticketChannel = await guild.channels.create({
          name: ticketName,
          type: ChannelType.GuildText,
          parent: client.config.ticketCategoryID || null,
          topic: `Support ticket for ${member.user.tag} | #${ticketCounter}`,
          permissionOverwrites: [
            { id: guild.id,     deny:  [PermissionFlagsBits.ViewChannel] },
            { id: member.id,    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: client.config.modRoleID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] },
          ],
        });
      } catch (err) {
        logger.error(`[TicketSystem] Channel creation failed: ${err.message}`);
        return interaction.reply({
          embeds: [embeds.error("Error", "Failed to create ticket channel. Check my permissions.")],
          ephemeral: true,
        });
      }

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`close_ticket_${ticketChannel.id}`)
          .setLabel("Close Ticket")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🔒"),
        new ButtonBuilder()
          .setCustomId(`claim_ticket_${ticketChannel.id}`)
          .setLabel("Claim")
          .setStyle(ButtonStyle.Success)
          .setEmoji("✋")
      );

      await ticketChannel.send({
        content: `${member} | <@&${client.config.modRoleID}>`,
        embeds: [embeds.ticket(member.user, ticketCounter)],
        components: [closeRow],
      });

      await interaction.reply({
        embeds: [embeds.success("Ticket Opened", `Your ticket is ready: ${ticketChannel}`)],
        ephemeral: true,
      });

      logger.info(`[TicketSystem] #${ticketCounter} opened by ${member.user.tag}`);
    }

    // ── Close Ticket ─────────────────────────────────────────
    if (interaction.customId.startsWith("close_ticket_")) {
      await interaction.reply({ content: "🔒 Closing ticket in 5 seconds..." });
      setTimeout(async () => {
        await interaction.channel.delete().catch(() => null);
      }, 5000);
    }

    // ── Claim Ticket ─────────────────────────────────────────
    if (interaction.customId.startsWith("claim_ticket_")) {
      const { isMod } = require("../../utils/permissions");
      if (!isMod(interaction.member)) {
        return interaction.reply({
          content: "❌ Only moderators can claim tickets.",
          ephemeral: true,
        });
      }
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(client.config.colors.success)
            .setDescription(`✋ This ticket has been claimed by ${interaction.user}.`)
            .setFooter({ text: "Hazel • Hazelink Bot" }),
        ],
      });
    }
  });

  logger.info("[TicketSystem] Ticket system initialized.");
}

module.exports = { sendTicketPanel, initTicketSystem };
