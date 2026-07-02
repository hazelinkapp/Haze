// ============================================================
//  commands/moderation/ban.js — Ban a user from the server
// ============================================================

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const embeds = require("../../utils/embeds");
const { isMod } = require("../../utils/permissions");

module.exports = {
  category: "moderation",

  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member from this server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The user to ban.").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("Reason for the ban.").setRequired(false)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("days")
        .setDescription("Number of days of messages to delete (0–7).")
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false)
    ),

  cooldown: 5,

  async execute(interaction, client) {
    // Permission check
    if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
      return interaction.reply({
        embeds: [embeds.error("No Permission", "You need the **Ban Members** permission.")],
        ephemeral: true,
      });
    }

    const target = interaction.options.getMember("user");
    const reason = interaction.options.getString("reason") ?? "No reason provided.";
    const days   = interaction.options.getInteger("days") ?? 0;

    if (!target) {
      return interaction.reply({
        embeds: [embeds.error("User Not Found", "That user is not in this server.")],
        ephemeral: true,
      });
    }

    // Can't ban yourself
    if (target.id === interaction.user.id) {
      return interaction.reply({
        embeds: [embeds.error("Invalid Target", "You cannot ban yourself.")],
        ephemeral: true,
      });
    }

    // Can't ban someone with a higher role
    if (
      target.roles.highest.position >=
      interaction.member.roles.highest.position
    ) {
      return interaction.reply({
        embeds: [embeds.error("Hierarchy Error", "You cannot ban someone with an equal or higher role.")],
        ephemeral: true,
      });
    }

    // Check bot's ability
    if (!target.bannable) {
      return interaction.reply({
        embeds: [embeds.error("Cannot Ban", "I don't have permission to ban that user.")],
        ephemeral: true,
      });
    }

    // DM the user before banning
    await target.send({
      embeds: [
        embeds
          .error("You have been banned", `You were banned from **${interaction.guild.name}**.`)
          .addFields({ name: "Reason", value: reason }),
      ],
    }).catch(() => null); // Ignore DM failures

    await target.ban({ reason, deleteMessageDays: days });

    await interaction.reply({
      embeds: [
        embeds.modAction({
          action: "Member Banned",
          target: target.user,
          moderator: interaction.user,
          reason,
          color: client.config.colors.danger,
        }),
      ],
    });
  },

  // ── Prefix Fallback ────────────────────────────────────────
  name: "ban",

  async run(message, args, client) {
    if (!isMod(message.member)) {
      return message.reply("❌ You don't have permission to ban members.");
    }

    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Please mention a user to ban.");

    const reason = args.slice(1).join(" ") || "No reason provided.";

    if (!target.bannable) return message.reply("❌ I cannot ban that user.");

    await target.ban({ reason });
    message.reply({
      embeds: [
        embeds.modAction({
          action: "Member Banned",
          target: target.user,
          moderator: message.author,
          reason,
          color: client.config.colors.danger,
        }),
      ],
    });
  },
};
