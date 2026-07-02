// ============================================================
//  commands/community/rank.js — View your XP rank card
// ============================================================

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const UserProfile = require("../../database/userProfiles");
const config      = require("../../config/config.json");

function xpForLevel(level) {
  return Math.floor(100 * Math.pow(1.35, level));
}

module.exports = {
  category: "community",

  data: new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Check your XP level and rank.")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("User to check (defaults to you).").setRequired(false)
    ),

  cooldown: 5,

  async execute(interaction) {
    await interaction.deferReply();

    const target = interaction.options.getUser("user") ?? interaction.user;

    let profile;
    try {
      profile = await UserProfile.findOne({
        userId:  target.id,
        guildId: interaction.guild.id,
      });
    } catch {
      return interaction.editReply("❌ Database not connected.");
    }

    if (!profile) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.warning)
            .setDescription(`📭 **${target.tag}** has no XP yet. Start chatting to earn some!`)
            .setFooter({ text: "Hazel • Hazelink Bot" }),
        ],
      });
    }

    const needed      = xpForLevel(profile.level);
    const progress    = Math.min(Math.floor((profile.xp / needed) * 20), 20);
    const progressBar = "█".repeat(progress) + "░".repeat(20 - progress);
    const rankPos     = await UserProfile.countDocuments({
      guildId: interaction.guild.id,
      xp: { $gt: profile.xp },
    }) + 1;

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`📊 ${target.tag}'s Rank`)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: "Rank",    value: `#${rankPos}`,                    inline: true },
        { name: "Level",   value: `${profile.level}`,               inline: true },
        { name: "XP",      value: `${profile.xp} / ${needed}`,      inline: true },
        { name: "Progress", value: `\`${progressBar}\` ${Math.floor((profile.xp / needed) * 100)}%` }
      )
      .setFooter({ text: "Hazel • Hazelink Bot" })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },

  name: "rank",
  aliases: ["level", "xp"],

  async run(message, args) {
    const target = message.mentions.users.first() ?? message.author;
    message.reply(`📊 Use \`/rank\` to see **${target.tag}**'s full rank card.`);
  },
};
