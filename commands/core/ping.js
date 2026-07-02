// ============================================================
//  commands/core/ping.js — Slash + prefix ping command
// ============================================================

const { SlashCommandBuilder } = require("discord.js");
const embeds = require("../../utils/embeds");

module.exports = {
  // ── Slash Command ──────────────────────────────────────────
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check Hazel's latency and API response time."),

  cooldown: 5,

  async execute(interaction, client) {
    const sent = await interaction.reply({
      embeds: [embeds.info("🏓 Pinging...", "Measuring latency...")],
      fetchReply: true,
    });

    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    const wsLatency = client.ws.ping;

    await interaction.editReply({
      embeds: [
        embeds.success("🏓 Pong!", `Ready and responding!`)
          .addFields(
            { name: "📡 Roundtrip", value: `\`${roundtrip}ms\``, inline: true },
            { name: "💓 WebSocket", value: `\`${wsLatency}ms\``, inline: true }
          ),
      ],
    });
  },

  // ── Prefix Command ─────────────────────────────────────────
  name: "ping",
  aliases: ["p", "latency"],

  async run(message, args, client) {
    const sent = await message.reply("🏓 Pinging...");
    const roundtrip = sent.createdTimestamp - message.createdTimestamp;

    await sent.edit(
      `🏓 **Pong!**\n📡 Roundtrip: \`${roundtrip}ms\`\n💓 WebSocket: \`${client.ws.ping}ms\``
    );
  },
};
