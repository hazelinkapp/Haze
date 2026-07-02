// ============================================================
//  commands/moderation/timeout.js — Timeout (mute) a user
// ============================================================

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const embeds = require("../../utils/embeds");

const DURATION_MAP = {
  "60s":  60 * 1000,
  "5m":   5 * 60 * 1000,
  "10m":  10 * 60 * 1000,
  "30m":  30 * 60 * 1000,
  "1h":   60 * 60 * 1000,
  "6h":   6 * 60 * 60 * 1000,
  "12h":  12 * 60 * 60 * 1000,
  "1d":   24 * 60 * 60 * 1000,
  "1w":   7 * 24 * 60 * 60 * 1000,
};

module.exports = {
  category: "moderation",

  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member for a set duration.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The user to timeout.").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("duration")
        .setDescription("Duration of the timeout.")
        .setRequired(true)
        .addChoices(
          { name: "60 Seconds", value: "60s" },
          { name: "5 Minutes",  value: "5m" },
          { name: "10 Minutes", value: "10m" },
          { name: "30 Minutes", value: "30m" },
          { name: "1 Hour",     value: "1h" },
          { name: "6 Hours",    value: "6h" },
          { name: "12 Hours",   value: "12h" },
          { name: "1 Day",      value: "1d" },
          { name: "1 Week",     value: "1w" }
        )
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("Reason for the timeout.").setRequired(false)
    ),

  cooldown: 5,

  async execute(interaction, client) {
    const target   = interaction.options.getMember("user");
    const durKey   = interaction.options.getString("duration");
    const reason   = interaction.options.getString("reason") ?? "No reason provided.";
    const duration = DURATION_MAP[durKey];

    if (!target) {
      return interaction.reply({
        embeds: [embeds.error("Not Found", "User not found in this server.")],
        ephemeral: true,
      });
    }

    if (!target.moderatable) {
      return interaction.reply({
        embeds: [embeds.error("Cannot Timeout", "I can't timeout that user.")],
        ephemeral: true,
      });
    }

    await target.timeout(duration, reason);

    await interaction.reply({
      embeds: [
        embeds.modAction({
          action: `Member Timed Out (${durKey})`,
          target: target.user,
          moderator: interaction.user,
          reason,
          color: client.config.colors.warning,
        }),
      ],
    });
  },

  name: "timeout",
};
