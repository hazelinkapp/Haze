// ============================================================
//  utils/embeds.js — Hazel-styled embed helpers
// ============================================================

const { EmbedBuilder } = require("discord.js");
const config = require("../config/config.json");

const C = config.colors;

/**
 * Base embed — all Hazel embeds share this footer
 */
function base() {
  return new EmbedBuilder()
    .setFooter({ text: "Hazel • Hazelink Bot" })
    .setTimestamp();
}

/**
 * Primary info embed (blue/indigo)
 * @param {string} title
 * @param {string} description
 */
function info(title, description) {
  return base()
    .setColor(C.primary)
    .setTitle(title)
    .setDescription(description);
}

/**
 * Success embed (green)
 */
function success(title, description) {
  return base()
    .setColor(C.success)
    .setTitle(`✅ ${title}`)
    .setDescription(description);
}

/**
 * Warning embed (yellow)
 */
function warning(title, description) {
  return base()
    .setColor(C.warning)
    .setTitle(`⚠️ ${title}`)
    .setDescription(description);
}

/**
 * Error embed (red)
 */
function error(title, description) {
  return base()
    .setColor(C.danger)
    .setTitle(`❌ ${title}`)
    .setDescription(description);
}

/**
 * Welcome embed for new members
 * @param {import('discord.js').GuildMember} member
 */
function welcome(member) {
  return base()
    .setColor(C.info)
    .setTitle("👋 Welcome to Hazelink!")
    .setDescription(
      `Hey ${member}, welcome to **${member.guild.name}**!\n\n` +
      `We're glad you're here. Please check the rules channel and enjoy your stay! 🎉`
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "Member #", value: `${member.guild.memberCount}`, inline: true },
      { name: "Joined", value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
    );
}

/**
 * Leave embed
 * @param {import('discord.js').GuildMember} member
 */
function leave(member) {
  return base()
    .setColor(C.danger)
    .setTitle("👋 Goodbye!")
    .setDescription(
      `**${member.user.tag}** has left **${member.guild.name}**.\n` +
      `We hope to see them again soon.`
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
}

/**
 * Moderation action embed
 */
function modAction({ action, target, moderator, reason, color }) {
  return base()
    .setColor(color ?? C.warning)
    .setTitle(`🔨 ${action}`)
    .addFields(
      { name: "User", value: `${target} (${target.tag ?? target.id})`, inline: true },
      { name: "Moderator", value: `${moderator}`, inline: true },
      { name: "Reason", value: reason ?? "No reason provided" }
    );
}

/**
 * Ticket embed
 */
function ticket(user, ticketNumber) {
  return base()
    .setColor(C.primary)
    .setTitle(`🎫 Support Ticket #${ticketNumber}`)
    .setDescription(
      `Hello ${user}! A staff member will be with you shortly.\n\n` +
      `Please describe your issue in detail and we'll help you as soon as possible.`
    )
    .addFields(
      { name: "Opened by", value: `${user}`, inline: true },
      { name: "Ticket #", value: `${ticketNumber}`, inline: true }
    );
}

module.exports = { info, success, warning, error, welcome, leave, modAction, ticket };
