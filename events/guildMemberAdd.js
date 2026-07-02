// ============================================================
//  events/guildMemberAdd.js — Hazel welcome message
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
      const channelId = client.config.welcomeChannelID;
      if (!channelId) return;

      const channel = member.guild.channels.cache.get(channelId);
      if (!channel) {
        return logger.warn(`[guildMemberAdd] Welcome channel ${channelId} not found.`);
      }

      await channel.send({ embeds: [embeds.welcome(member)] });
      logger.info(`[guildMemberAdd] Welcomed ${member.user.tag} in ${member.guild.name}`);

      // Optional: assign an auto-role on join
      // const autoRole = member.guild.roles.cache.get("YOUR_AUTO_ROLE_ID");
      // if (autoRole) await member.roles.add(autoRole).catch(() => null);

      // Optional: DM the new member
      // await member.send({ embeds: [embeds.welcome(member)] }).catch(() => null);
    } catch (err) {
      logger.error(`[guildMemberAdd] ${err.message}`);
    }
  },
};
