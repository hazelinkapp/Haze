// ============================================================
//  commands/community/leaderboard.js — XP leaderboard
// ============================================================

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const UserProfile = require("../../database/userProfiles");
const config      = require("../../config/config.json");

module.exports = {
  category: "community",

  data: new SlashCommandBuilder()
    .setName("xp-leaderboard")
    .setDescription("View the top 10 most active members in this server.")
    .addIntegerOption((opt) =>
      opt.setName("page").setDescription("Page number.").setMinValue(1).setRequired(false)
    ),

  cooldown: 10,

  async execute(interaction) {
    await interaction.deferReply();

    const page    = (interaction.options.getInteger("page") ?? 1) - 1;
    const perPage = 10;

    let profiles;
    try {
      profiles = await UserProfile.find({ guildId: interaction.guild.id })
        .sort({ xp: -1 })
        .skip(page * perPage)
        .limit(perPage);
    } catch {
      // Fallback if DB not connected
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.danger)
            .setDescription("❌ Database not connected. Leaderboard unavailable.")
            .setFooter({ text: "Hazel • Hazelink Bot" }),
        ],
      });
    }

    if (!profiles.length) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.warning)
            .setDescription("📭 No leaderboard data found yet.")
            .setFooter({ text: "Hazel • Hazelink Bot" }),
        ],
      });
    }

    const medals = ["🥇", "🥈", "🥉"];
    const lines  = profiles.map((p, i) => {
      const rank  = page * perPage + i + 1;
      const medal = rank <= 3 ? medals[rank - 1] : `**#${rank}**`;
      return `${medal} <@${p.userId}> — Level **${p.level}** • **${p.xp.toLocaleString()}** XP`;
    });

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`🏆 Hazelink XP Leaderboard — Page ${page + 1}`)
      .setDescription(lines.join("\n"))
      .setFooter({ text: "Hazel • Hazelink Bot" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },

  name: "xp-leaderboard",
  aliases: ["lb", "top"],

  async run(message) {
    message.reply("📊 Use `/leaderboard` to view the XP leaderboard.");
  },
};
