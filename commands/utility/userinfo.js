// ============================================================
//  commands/utility/userinfo.js — Display user information
// ============================================================

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config/config.json");

module.exports = {
  category: "utility",

  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Display information about a user.")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The user to look up (defaults to you).").setRequired(false)
    ),

  cooldown: 5,

  async execute(interaction) {
    const target = interaction.options.getMember("user") ?? interaction.member;
    const user   = target.user;

    const roles = target.roles.cache
      .filter((r) => r.id !== interaction.guild.id)
      .sort((a, b) => b.position - a.position)
      .map((r) => `${r}`)
      .slice(0, 10)
      .join(", ") || "None";

    const embed = new EmbedBuilder()
      .setColor(target.displayHexColor ?? config.colors.primary)
      .setTitle(`👤 ${user.tag}`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields(
        { name: "User ID",      value: user.id,                                         inline: true },
        { name: "Nickname",     value: target.nickname ?? "None",                        inline: true },
        { name: "Bot?",         value: user.bot ? "Yes" : "No",                          inline: true },
        { name: "Account Created", value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: "Joined Server",   value: `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>`, inline: true },
        { name: `Roles (${target.roles.cache.size - 1})`, value: roles }
      )
      .setFooter({ text: "Hazel • Hazelink Bot" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },

  name: "userinfo",
  async run(message, args) {
    const target = message.mentions.members.first() ?? message.member;
    message.reply(`👤 **${target.user.tag}** | ID: \`${target.id}\` | Joined: <t:${Math.floor(target.joinedTimestamp / 1000)}:R>`);
  },
};
