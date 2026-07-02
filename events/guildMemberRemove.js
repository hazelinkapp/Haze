// ============================================================
//  events/guildMemberRemove.js — Hazel leave message
// ============================================================

const embeds = require("../utils/embeds");
const logger  = require("../utils/logger");

module.exports = {
  once: false,

  /**
   * @param {import('discord.js').GuildMember} member
   * @param {import('discord.js').Client} client
   */
  async execute(member, client) {
    try {
      const channelId = client.config.leaveChannelID;
      if (!channelId) return;

      const channel = member.guild.channels.cache.get(channelId);
      if (!channel) {
        return logger.warn(`[guildMemberRemove] Leave channel ${channelId} not found.`);
      }

      await channel.send({ embeds: [embeds.leave(member)] });
      logger.info(`[guildMemberRemove] ${member.user.tag} left ${member.guild.name}`);
    } catch (err) {
      logger.error(`[guildMemberRemove] ${err.message}`);
    }
  },
};
