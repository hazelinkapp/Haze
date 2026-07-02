// ============================================================
//  commands/core/help.js — Lists all available commands
// ============================================================

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config/config.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("View all of Hazel's available commands."),

  cooldown: 5,

  async execute(interaction, client) {
    const categories = {};

    client.commands.forEach((cmd) => {
      const category = cmd.category ?? "misc";
      if (!categories[category]) categories[category] = [];
      categories[category].push(`\`/${cmd.data.name}\` — ${cmd.data.description}`);
    });

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle("📖 Hazel — Command List")
      .setDescription("Here are all my available slash commands:")
      .setFooter({ text: "Hazel • Hazelink Bot" })
      .setTimestamp();

    for (const [cat, cmds] of Object.entries(categories)) {
      embed.addFields({
        name: `📂 ${cat.charAt(0).toUpperCase() + cat.slice(1)}`,
        value: cmds.join("\n"),
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },

  name: "help",
  async run(message, args, client) {
    const lines = [];
    client.prefixCommands.forEach((cmd, name) => {
      if (cmd.name === name) lines.push(`\`${client.config.prefix}${name}\``);
    });
    message.reply(`📖 **Commands:** ${lines.join(", ")}`);
  },
};
