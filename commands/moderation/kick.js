// ============================================================
//  commands/moderation/kick.js — Kick a user
// ============================================================

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const embeds = require("../../utils/embeds");

module.exports = {
  category: "moderation",

  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from this server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The user to kick.").setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("Reason for the kick.").setRequired(false)
    ),

  cooldown: 5,

  async execute(interaction, client) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return interaction.reply({
        embeds: [embeds.error("No Permission", "You need **Kick Members** permission.")],
        ephemeral: true,
      });
    }

    const target = interaction.options.getMember("user");
    const reason = interaction.options.getString("reason") ?? "No reason provided.";

    if (!target) {
      return interaction.reply({
        embeds: [embeds.error("User Not Found", "That user is not in this server.")],
        ephemeral: true,
      });
    }

    if (!target.kickable) {
      return interaction.reply({
        embeds: [embeds.error("Cannot Kick", "I don't have permission to kick that user.")],
        ephemeral: true,
      });
    }

    await target.send({
      embeds: [
        embeds.warning("You have been kicked", `You were kicked from **${interaction.guild.name}**.`)
          .addFields({ name: "Reason", value: reason }),
      ],
    }).catch(() => null);

    await target.kick(reason);

    await interaction.reply({
      embeds: [
        embeds.modAction({
          action: "Member Kicked",
          target: target.user,
          moderator: interaction.user,
          reason,
          color: client.config.colors.warning,
        }),
      ],
    });
  },

  name: "kick",
  async run(message, args) {
    const target = message.mentions.members.first();
    if (!target) return message.reply("❌ Mention a user to kick.");
    const reason = args.slice(1).join(" ") || "No reason provided.";
    if (!target.kickable) return message.reply("❌ I cannot kick that user.");
    await target.kick(reason);
    message.reply(`✅ **${target.user.tag}** was kicked. Reason: ${reason}`);
  },
};
