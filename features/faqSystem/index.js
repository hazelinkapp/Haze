// ============================================================
//  features/faqSystem/index.js
//  FAQ lookup via slash command autocomplete
// ============================================================

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const logger = require("../../utils/logger");
const config = require("../../config/config.json");

// ── FAQ Data Store ────────────────────────────────────────────
// In a production bot, load this from a DB or JSON file.
const FAQ_ENTRIES = [
  {
    id:       "roles",
    question: "How do I get roles?",
    answer:   "Head to the `#roles` channel and react or click the buttons to self-assign roles.",
  },
  {
    id:       "appeal",
    question: "How do I appeal a ban?",
    answer:   "Join our appeal server (linked in the ban DM) and open a ticket there.",
  },
  {
    id:       "ticket",
    question: "How do I open a support ticket?",
    answer:   "Use `/ticket` or click the 🎫 button in the support channel.",
  },
  {
    id:       "bot",
    question: "What can Hazel do?",
    answer:   "Use `/help` to see all of Hazel's commands including leveling, tickets, moderation, and more!",
  },
  {
    id:       "verify",
    question: "How do I get verified?",
    answer:   "Follow the instructions in the `#verify` channel. You may need to complete a CAPTCHA or agree to the rules.",
  },
  {
    id:       "partner",
    question: "How do I partner with Hazelink?",
    answer:   "Open a ticket with the topic `Partnership Request` and a staff member will review your server.",
  },
];

/**
 * Build the FAQ slash command (with autocomplete).
 */
const faqCommand = {
  data: new SlashCommandBuilder()
    .setName("faq")
    .setDescription("Look up a frequently asked question.")
    .addStringOption((opt) =>
      opt
        .setName("question")
        .setDescription("Search for a question.")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  async execute(interaction) {
    const query = interaction.options.getString("question");
    const entry = FAQ_ENTRIES.find((f) => f.id === query || f.question.toLowerCase().includes(query.toLowerCase()));

    if (!entry) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(config.colors.warning)
            .setTitle("❓ FAQ Not Found")
            .setDescription("No matching FAQ entry found. Try `/ticket` for personalised help.")
            .setFooter({ text: "Hazel • Hazelink Bot" }),
        ],
        ephemeral: true,
      });
    }

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle(`❓ ${entry.question}`)
          .setDescription(entry.answer)
          .setFooter({ text: "Hazel • Hazelink Bot" })
          .setTimestamp(),
      ],
    });
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const choices = FAQ_ENTRIES
      .filter((f) => f.question.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((f) => ({ name: f.question, value: f.id }));

    await interaction.respond(choices);
  },
};

/**
 * Attach FAQ autocomplete handler and register command.
 * @param {import('discord.js').Client} client
 */
function initFAQ(client) {
  // Register into client.commands so the loader picks it up
  client.commands.set("faq", faqCommand);

  // Handle autocomplete interactions
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isAutocomplete() || interaction.commandName !== "faq") return;
    try {
      await faqCommand.autocomplete(interaction);
    } catch (err) {
      logger.error(`[FAQ] Autocomplete error: ${err.message}`);
    }
  });

  logger.info("[FAQ] FAQ system initialized.");
}

module.exports = { initFAQ, faqCommand, FAQ_ENTRIES };
