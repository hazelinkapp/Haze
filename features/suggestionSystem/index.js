// ============================================================
//  features/suggestionSystem/index.js
//  Manages suggestion lifecycle: submit → vote → review
// ============================================================

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const logger = require("../../utils/logger");
const config = require("../../config/config.json");

// In-memory vote store (use DB in production)
const voteStore = new Map(); // messageId -> { up: Set, down: Set }

/**
 * Build a suggestion embed and vote row.
 */
function buildSuggestionEmbed(author, text, upCount = 0, downCount = 0, status = "⏳ Pending") {
  return new EmbedBuilder()
    .setColor(
      status.includes("✅") ? config.colors.success :
      status.includes("❌") ? config.colors.danger  :
      config.colors.primary
    )
    .setTitle("💡 New Suggestion")
    .setDescription(text)
    .addFields(
      { name: "Submitted by", value: `${author}`, inline: true },
      { name: "Status",       value: status,        inline: true },
      { name: "Votes",        value: `👍 ${upCount}  |  👎 ${downCount}`, inline: false }
    )
    .setThumbnail(author.displayAvatarURL?.({ dynamic: true }) ?? null)
    .setFooter({ text: "Hazel • Hazelink Bot" })
    .setTimestamp();
}

function buildVoteRow(upCount = 0, downCount = 0) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("sug_up").setLabel(`👍  ${upCount}`).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("sug_down").setLabel(`👎  ${downCount}`).setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("sug_approve").setLabel("Approve ✅").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("sug_deny").setLabel("Deny ❌").setStyle(ButtonStyle.Secondary)
  );
}

/**
 * Initialise the suggestion interaction handler.
 * @param {import('discord.js').Client} client
 */
function initSuggestions(client) {
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    const id = interaction.customId;
    if (!["sug_up", "sug_down", "sug_approve", "sug_deny"].includes(id)) return;

    const msgId = interaction.message.id;
    if (!voteStore.has(msgId)) {
      voteStore.set(msgId, { up: new Set(), down: new Set(), text: "", author: null });
    }

    const votes   = voteStore.get(msgId);
    const userId  = interaction.user.id;
    const { isMod } = require("../../utils/permissions");

    if (id === "sug_up") {
      if (votes.up.has(userId)) votes.up.delete(userId);
      else { votes.up.add(userId); votes.down.delete(userId); }
      await interaction.deferUpdate();
    } else if (id === "sug_down") {
      if (votes.down.has(userId)) votes.down.delete(userId);
      else { votes.down.add(userId); votes.up.delete(userId); }
      await interaction.deferUpdate();
    } else if (id === "sug_approve") {
      if (!isMod(interaction.member)) {
        return interaction.reply({ content: "❌ Moderators only.", ephemeral: true });
      }
      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(config.colors.success)
        .spliceFields(1, 1, { name: "Status", value: "✅ Approved", inline: true });
      await interaction.message.edit({ embeds: [embed] });
      return interaction.reply({ content: "✅ Suggestion approved.", ephemeral: true });
    } else if (id === "sug_deny") {
      if (!isMod(interaction.member)) {
        return interaction.reply({ content: "❌ Moderators only.", ephemeral: true });
      }
      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(config.colors.danger)
        .spliceFields(1, 1, { name: "Status", value: "❌ Denied", inline: true });
      await interaction.message.edit({ embeds: [embed] });
      return interaction.reply({ content: "❌ Suggestion denied.", ephemeral: true });
    }

    const newRow   = buildVoteRow(votes.up.size, votes.down.size);
    const newEmbed = EmbedBuilder.from(interaction.message.embeds[0]).spliceFields(2, 1, {
      name: "Votes", value: `👍 ${votes.up.size}  |  👎 ${votes.down.size}`, inline: false,
    });
    await interaction.message.edit({ embeds: [newEmbed], components: [newRow] });
  });

  logger.info("[Suggestions] Suggestion system initialized.");
}

module.exports = { initSuggestions, buildSuggestionEmbed, buildVoteRow };
