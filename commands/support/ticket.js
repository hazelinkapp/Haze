// ============================================================
//  commands/support/ticket.js — Open a support ticket
// ============================================================

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const embeds  = require("../../utils/embeds");
const logger  = require("../../utils/logger");

module.exports = {
  category: "support",

  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Open a support ticket with the Hazelink team.")
    .addStringOption((opt) =>
      opt
        .setName("topic")
        .setDescription("Brief description of your issue.")
        .setRequired(false)
    ),

  cooldown: 30,

  async execute(interaction, client) {
    const topic      = interaction.options.getString("topic") ?? "General Support";
    const guild      = interaction.guild;
    const categoryId = client.config.ticketCategoryID;

    // Check for existing ticket
    const existing = guild.channels.cache.find(
      (c) =>
        c.name === `ticket-${interaction.user.username.toLowerCase()}` &&
        c.type === ChannelType.GuildText
    );

    if (existing) {
      return interaction.reply({
        embeds: [
          embeds.warning(
            "Ticket Already Open",
            `You already have an open ticket: ${existing}`
          ),
        ],
        ephemeral: true,
      });
    }

    // Generate ticket number (simple timestamp-based)
    const ticketNumber = Date.now().toString().slice(-5);

    // Create the ticket channel
    let ticketChannel;
    try {
      ticketChannel = await guild.channels.create({
        name: `ticket-${interaction.user.username.toLowerCase()}`,
        type: ChannelType.GuildText,
        parent: categoryId || null,
        topic: `Support ticket for ${interaction.user.tag} | ${topic}`,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
          {
            id: client.config.modRoleID,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageMessages,
            ],
          },
        ],
      });
    } catch (err) {
      logger.error(`[ticket] Failed to create channel: ${err.message}`);
      return interaction.reply({
        embeds: [embeds.error("Error", "Failed to create ticket channel. Check my permissions.")],
        ephemeral: true,
      });
    }

    // Close button
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`close_ticket_${ticketChannel.id}`)
        .setLabel("Close Ticket")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔒")
    );

    const ticketEmbed = embeds.ticket(interaction.user, ticketNumber).addFields({
      name: "Topic",
      value: topic,
    });

    await ticketChannel.send({
      content: `${interaction.user} | <@&${client.config.modRoleID}>`,
      embeds: [ticketEmbed],
      components: [row],
    });

    // Handle close button
    const collector = ticketChannel.createMessageComponentCollector({
      filter: (i) => i.customId === `close_ticket_${ticketChannel.id}`,
    });

    collector.on("collect", async (btn) => {
      await btn.reply({ content: "🔒 Closing ticket in 5 seconds..." });
      setTimeout(async () => {
        await ticketChannel.delete().catch(() => null);
      }, 5000);
    });

    await interaction.reply({
      embeds: [
        embeds.success(
          "Ticket Created",
          `Your support ticket has been opened: ${ticketChannel}`
        ),
      ],
      ephemeral: true,
    });

    logger.info(`[ticket] #${ticketNumber} opened by ${interaction.user.tag}`);
  },

  name: "ticket",
  async run(message) {
    message.reply("Please use the slash command `/ticket` to open a support ticket.");
  },
};
