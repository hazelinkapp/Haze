// ============================================================
//  utils/permissions.js — Permission helpers for Hazel
// ============================================================

const { PermissionsBitField, MessageFlags } = require("discord.js");
const config = require("../config/config.json");

/** Discord snowflake IDs are 17–20 digit strings. Placeholders like YOUR_MOD_ROLE_ID fail channel overwrites. */
function isSnowflake(id) {
  return typeof id === "string" && /^\d{17,20}$/.test(id);
}

/**
 * Check if a member has Administrator permission or the configured admin role.
 * @param {import('discord.js').GuildMember} member
 * @returns {boolean}
 */
function isAdmin(member) {
  return (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.roles.cache.has(config.adminRoleID)
  );
}

/**
 * Check if a member has the Moderator role or is an admin.
 * @param {import('discord.js').GuildMember} member
 * @returns {boolean}
 */
function isMod(member) {
  return (
    isAdmin(member) ||
    member.roles.cache.has(config.modRoleID) ||
    member.permissions.has(PermissionsBitField.Flags.ModerateMembers)
  );
}

/**
 * Check if a user is the bot owner.
 * @param {string} userId
 * @returns {boolean}
 */
function isOwner(userId) {
  return userId === config.ownerID;
}

/**
 * Check if a member has a specific Discord permission flag.
 * @param {import('discord.js').GuildMember} member
 * @param {bigint} flag — e.g. PermissionsBitField.Flags.BanMembers
 * @returns {boolean}
 */
function hasPermission(member, flag) {
  return member.permissions.has(flag);
}

/**
 * Check if the bot itself has a permission in a given channel.
 * @param {import('discord.js').GuildChannel} channel
 * @param {bigint} flag
 * @returns {boolean}
 */
function botHasPermission(channel, flag) {
  return channel.permissionsFor(channel.guild.members.me)?.has(flag) ?? false;
}

/**
 * Reply with a "no permission" message and return false.
 * Returns true if the check PASSES (member has perm).
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {Function} checkFn — one of the above helpers
 * @param {string} [message]
 */
async function requirePermission(interaction, checkFn, message) {
  if (checkFn(interaction.member)) return true;
  await interaction.reply({
    content: message ?? "❌ You don't have permission to use this command.",
    flags: MessageFlags.Ephemeral,
  });
  return false;
}

module.exports = {
  isSnowflake,
  isAdmin,
  isMod,
  isOwner,
  hasPermission,
  botHasPermission,
  requirePermission,
};
