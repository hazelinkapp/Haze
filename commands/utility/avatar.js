// ============================================================
//  commands/utility/avatar.js — Fetch a user's avatar
// ============================================================

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const config = require("../../config/config.json");

module.exports = {
  category: "utility",

  data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Get the avatar of a user.")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The user whose avatar you want.").setRequired(false)
    ),

  cooldown: 5,

  async execute(interaction) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const formats = ["png", "jpg", "webp"];
    if (target.avatar?.startsWith("a_")) formats.push("gif");

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`🖼️ ${target.tag}'s Avatar`)
      .setImage(target.displayAvatarURL({ size: 1024, dynamic: true }))
      .setFooter({ text: "Hazel • Hazelink Bot" })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      formats.map((fmt) =>
        new ButtonBuilder()
          .setLabel(fmt.toUpperCase())
          .setStyle(ButtonStyle.Link)
          .setURL(target.displayAvatarURL({ size: 1024, format: fmt }))
      )
    );

    await interaction.reply({ embeds: [embed], components: [row] });
  },

  name: "avatar",
  aliases: ["av", "pfp"],

  async run(message, args) {
    const target = message.mentions.users.first() ?? message.author;
    message.reply(target.displayAvatarURL({ size: 1024, dynamic: true }));
  },
};
