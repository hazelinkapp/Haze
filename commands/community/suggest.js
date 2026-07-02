// ============================================================
//  commands/community/suggest.js — Submit a suggestion
// ============================================================

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const config = require("../../config/config.json");

module.exports = {
  category: "community",

  data: new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Submit a suggestion to the server team.")
    .addStringOption((opt) =>
      opt
        .setName("suggestion")
        .setDescription("Your suggestion (be descriptive!)")
        .setRequired(true)
        .setMaxLength(1000)
    ),

  cooldown: 30,

  async execute(interaction, client) {
    const suggestionText = interaction.options.getString("suggestion");
    const channelId      = client.config.suggestionChannelID ?? null;

    const channel = channelId
      ? interaction.guild.channels.cache.get(channelId)
      : interaction.channel;

    if (!channel) {
      return interaction.reply({
        content: "❌ Suggestion channel not configured. Contact an admin.",
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle("💡 New Suggestion")
      .setDescription(suggestionText)
      .addFields(
        { name: "Submitted by", value: `${interaction.user} (${interaction.user.tag})`, inline: true },
        { name: "Status",       value: "⏳ Pending Review",                              inline: true }
      )
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: "Hazel • Hazelink Bot" })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("suggest_upvote")
        .setLabel("👍 Upvote (0)")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("suggest_downvote")
        .setLabel("👎 Downvote (0)")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("suggest_approve")
        .setLabel("✅ Approve")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("suggest_deny")
        .setLabel("❌ Deny")
        .setStyle(ButtonStyle.Secondary)
    );

    const msg = await channel.send({ embeds: [embed], components: [row] });

    // Voting collector (persistent via interactionCreate in a real setup)
    const votes    = { up: new Set(), down: new Set() };
    const collector = msg.createMessageComponentCollector({ time: 7 * 24 * 60 * 60 * 1000 });

    collector.on("collect", async (btn) => {
      const { isMod } = require("../../utils/permissions");

      if (btn.customId === "suggest_upvote") {
        if (votes.up.has(btn.user.id)) votes.up.delete(btn.user.id);
        else { votes.up.add(btn.user.id); votes.down.delete(btn.user.id); }
      } else if (btn.customId === "suggest_downvote") {
        if (votes.down.has(btn.user.id)) votes.down.delete(btn.user.id);
        else { votes.down.add(btn.user.id); votes.up.delete(btn.user.id); }
      } else if (btn.customId === "suggest_approve" && isMod(btn.member)) {
        embed.setColor(config.colors.success).spliceFields(1, 1, { name: "Status", value: "✅ Approved" });
        await msg.edit({ embeds: [embed] });
        return btn.reply({ content: "✅ Suggestion approved.", ephemeral: true });
      } else if (btn.customId === "suggest_deny" && isMod(btn.member)) {
        embed.setColor(config.colors.danger).spliceFields(1, 1, { name: "Status", value: "❌ Denied" });
        await msg.edit({ embeds: [embed] });
        return btn.reply({ content: "❌ Suggestion denied.", ephemeral: true });
      } else if (!isMod(btn.member) && (btn.customId === "suggest_approve" || btn.customId === "suggest_deny")) {
        return btn.reply({ content: "❌ Only moderators can approve or deny suggestions.", ephemeral: true });
      }

      const newRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("suggest_upvote").setLabel(`👍 Upvote (${votes.up.size})`).setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("suggest_downvote").setLabel(`👎 Downvote (${votes.down.size})`).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("suggest_approve").setLabel("✅ Approve").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("suggest_deny").setLabel("❌ Deny").setStyle(ButtonStyle.Secondary)
      );

      await msg.edit({ components: [newRow] });
      await btn.deferUpdate();
    });

    await interaction.reply({
      content: `✅ Your suggestion has been submitted to ${channel}!`,
      ephemeral: true,
    });
  },

  name: "suggest",
};
