// ============================================================
//  features/levelingSystem/index.js
//  Listens to messages, awards XP, announces level-ups
// ============================================================

const UserProfile = require("../../database/userProfiles");
const embeds      = require("../../utils/embeds");
const logger      = require("../../utils/logger");

// XP cooldown: prevent spamming (user can gain XP once per minute)
const xpCooldown = new Map(); // userId -> timestamp
const COOLDOWN_MS = 60 * 1000;
const XP_PER_MSG  = { min: 15, max: 40 };

/**
 * Attach the leveling system to the client.
 * Call this from index.js or a feature loader.
 * @param {import('discord.js').Client} client
 */
function initLeveling(client) {
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;
    if (!process.env.MONGO_URI) return; // skip if DB not configured

    const userId  = message.author.id;
    const guildId = message.guild.id;
    const now     = Date.now();

    // Cooldown check
    if (xpCooldown.has(userId)) {
      if (now - xpCooldown.get(userId) < COOLDOWN_MS) return;
    }
    xpCooldown.set(userId, now);

    // Random XP in range
    const xpGain = Math.floor(
      Math.random() * (XP_PER_MSG.max - XP_PER_MSG.min + 1) + XP_PER_MSG.min
    );

    try {
      const { profile, leveledUp } = await UserProfile.addXP(userId, guildId, xpGain);

      if (leveledUp) {
        logger.info(`[Leveling] ${message.author.tag} leveled up to ${profile.level} in ${message.guild.name}`);

        const levelUpEmbed = embeds
          .success("🎉 Level Up!", `Congratulations ${message.author}, you reached **Level ${profile.level}**!`)
          .addFields(
            { name: "Current XP", value: `${profile.xp}`, inline: true },
            { name: "Level",      value: `${profile.level}`, inline: true }
          )
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }));

        await message.channel.send({ embeds: [levelUpEmbed] }).catch(() => null);

        // Optional: assign level roles
        // await assignLevelRole(message.member, profile.level);
      }
    } catch (err) {
      logger.error(`[Leveling] XP error for ${userId}: ${err.message}`);
    }
  });

  logger.info("[Leveling] Leveling system initialized.");
}

module.exports = { initLeveling };
