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
  MessageFlags,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const embeds  = require("../../utils/embeds");
const logger  = require("../../utils/logger");
const { isAdmin, isSnowflake } = require("../../utils/permissions");
const { sendTicketPanel } = require("../../features/ticketSystem");

async function waitForComponent(client, userId, customIds, timeMs = 120000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off("interactionCreate", handler);
      reject(new Error("timeout"));
    }, timeMs);

    const handler = (i) => {
      if (!i || i.user?.id !== userId) return;
      if (customIds && !customIds.includes(i.customId)) return;
      client.off("interactionCreate", handler);
      clearTimeout(timer);
      resolve(i);
    };

    client.on("interactionCreate", handler);
  });
}

async function executeSetup(interaction, client) {
  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({ content: "Use this in a server.", flags: MessageFlags.Ephemeral });
  }
  if (!interaction.member || !isAdmin(interaction.member)) {
    return interaction.reply({ content: "❌ Admin only.", flags: MessageFlags.Ephemeral });
  }

  // Step 1: panel channel (where the ticket button will be posted)
  const panelMenu = new ChannelSelectMenuBuilder()
    .setCustomId("ticket_setup_panel_channel")
    .setPlaceholder("Choose the channel for the ticket panel")
    .addChannelTypes(ChannelType.GuildText);
  const panelRow = new ActionRowBuilder().addComponents(panelMenu);

  await interaction.reply({
    content: "Step 1/4 — Choose the channel where the **ticket button** will be posted.",
    flags: MessageFlags.Ephemeral,
    components: [panelRow],
  });

  let panelChannelId;
  let step;
  try {
    step = await waitForComponent(client, interaction.user.id, ["ticket_setup_panel_channel"]);
    panelChannelId = step.values[0];
    await step.update({
      content: "Step 2/4 — Choose the **category** for newly created tickets.",
      components: [
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId("ticket_setup_category")
            .setPlaceholder("Choose the ticket category")
            .addChannelTypes(ChannelType.GuildCategory)
        ),
      ],
    });

    const category = await waitForComponent(client, interaction.user.id, ["ticket_setup_category"]);
    const ticketCategoryID = category.values[0];
    await category.update({
      content: "Step 3/4 — Choose the **moderator role** that should be allowed in tickets.",
      components: [
        new ActionRowBuilder().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId("ticket_setup_mod_role")
            .setPlaceholder("Choose moderator role")
            .setMinValues(1)
            .setMaxValues(1)
        ),
      ],
    });

    const role = await waitForComponent(client, interaction.user.id, ["ticket_setup_mod_role"]);
    const modRoleID = role.values[0];

    const presets = [
      {
        label: "🎫 Hazelink Support",
        value: "preset_default",
        ticketPanelTitle: "🎫 Hazelink Support",
        ticketPanelButtonLabel: "Open Ticket",
        ticketPanelButtonEmoji: "🎫",
        ticketPanelDescription:
          "Need help? Click the button below to open a private support ticket.\n\n" +
          "**Before opening a ticket:**\n" +
          "• Check our FAQ channel for common answers\n" +
          "• Be ready to describe your issue clearly\n" +
          "• Abuse of tickets may result in a restriction",
      },
      {
        label: "💬 Support Center",
        value: "preset_center",
        ticketPanelTitle: "💬 Support Center",
        ticketPanelButtonLabel: "Create Ticket",
        ticketPanelButtonEmoji: "💬",
        ticketPanelDescription:
          "Welcome! Choose below to open a support ticket with the Hazelink team.",
      },
      {
        label: "❓ Help Desk",
        value: "preset_helpdesk",
        ticketPanelTitle: "❓ Help Desk",
        ticketPanelButtonLabel: "Get Help",
        ticketPanelButtonEmoji: "❓",
        ticketPanelDescription:
          "Click the button to open a ticket. Include details so staff can help you faster.",
      },
    ];

    await role.update({
      content: "Step 4/4 — Choose how the ticket button looks (title + button label).",
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("ticket_setup_panel_preset")
            .setPlaceholder("Pick a panel style")
            .addOptions(
              presets.map(p => ({ label: p.label, value: p.value })).slice(0, 25)
            )
        ),
      ],
    });

    const presetPick = await waitForComponent(client, interaction.user.id, ["ticket_setup_panel_preset"]);
    const preset = presets.find(p => p.value === presetPick.values[0]) ?? presets[0];

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_setup_confirm")
        .setLabel("Confirm")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("ticket_setup_cancel")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary)
    );

    await presetPick.update({
      content:
        "✅ Review:\n" +
        `• Ticket panel channel: <#${panelChannelId}>\n` +
        `• Ticket category: <#${ticketCategoryID}>\n` +
        `• Mod role: <@&${modRoleID}>\n` +
        `• Button: ${preset.ticketPanelButtonEmoji} ${preset.ticketPanelButtonLabel}\n\n` +
        "Press **Confirm** to save.",
      components: [confirmRow],
    });

    const confirm = await waitForComponent(client, interaction.user.id, ["ticket_setup_confirm", "ticket_setup_cancel"]);
    if (confirm.customId === "ticket_setup_cancel") {
      await confirm.update({ content: "❌ Setup cancelled.", components: [] });
      return;
    }

    // Save to config/config.json
    const configPath = path.join(__dirname, "../../config/config.json");
    const currentConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));

    currentConfig.ticketCategoryID = ticketCategoryID; // category id picked in step 2
    currentConfig.modRoleID = modRoleID;
    currentConfig.ticketPanelChannelID = panelChannelId;
    currentConfig.ticketPanelTitle = preset.ticketPanelTitle;
    currentConfig.ticketPanelDescription = preset.ticketPanelDescription;
    currentConfig.ticketPanelButtonLabel = preset.ticketPanelButtonLabel;
    currentConfig.ticketPanelButtonEmoji = preset.ticketPanelButtonEmoji;

    fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), "utf8");
    client.config = currentConfig;

    const panelChannel = guild.channels.cache.get(panelChannelId);
    if (!panelChannel || panelChannel.type !== ChannelType.GuildText) {
      return confirm.update({ content: "Saved, but I couldn't find that panel channel to post the ticket button.", components: [] });
    }
    await sendTicketPanel(panelChannel, client).catch(() => null);

    await confirm.update({
      content:
        "✅ Ticket setup saved!\n" +
        `• Panel posted in <#${panelChannelId}>\n` +
        `• Tickets will be created under category ID: ${ticketCategoryID}\n` +
        `• Mod role: <@&${modRoleID}>`,
      components: [],
    });
  } catch (err) {
    // timeout / cancel
    await interaction.editReply?.({
      content: "Setup timed out. Run `/ticket setup` again.",
      components: [],
    }).catch(() => null);
  }
}

module.exports = {
  category: "support",

  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Support tickets with Hazelink.")
    .addSubcommand((sub) =>
      sub
        .setName("open")
        .setDescription("Open a support ticket.")
        .addStringOption((opt) =>
          opt
            .setName("topic")
            .setDescription("Brief description of your issue.")
            .setRequired(false)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("setup")
        .setDescription("Configure ticket channel and the ticket button panel.")
    ),

  cooldown: 30,

  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();
    if (sub === "setup") return executeSetup(interaction, client);

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
        flags: MessageFlags.Ephemeral,
      });
    }

    // Generate ticket number (simple timestamp-based)
    const ticketNumber = Date.now().toString().slice(-5);

    // Create the ticket channel
    const overwrites = [
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
    ];
    if (isSnowflake(client.config.modRoleID)) {
      overwrites.push({
        id: client.config.modRoleID,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
        ],
      });
    }

    let ticketChannel;
    try {
      ticketChannel = await guild.channels.create({
        name: `ticket-${interaction.user.username.toLowerCase()}`,
        type: ChannelType.GuildText,
        parent: isSnowflake(categoryId) ? categoryId : undefined,
        topic: `Support ticket for ${interaction.user.tag} | ${topic}`,
        permissionOverwrites: overwrites,
      });
    } catch (err) {
      logger.error(`[ticket] Failed to create channel: ${err.message}`);
      return interaction.reply({
        embeds: [embeds.error("Error", "Failed to create ticket channel. Check my permissions.")],
        flags: MessageFlags.Ephemeral,
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
      content: isSnowflake(client.config.modRoleID)
        ? `${interaction.user} | <@&${client.config.modRoleID}>`
        : `${interaction.user}`,
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
      flags: MessageFlags.Ephemeral,
    });

    logger.info(`[ticket] #${ticketNumber} opened by ${interaction.user.tag}`);
  },

  name: "ticket",
  async run(message) {
    message.reply("Please use the slash command `/ticket` to open a support ticket.");
  },
};
