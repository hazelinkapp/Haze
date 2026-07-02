// ============================================================
//  features/economySystem/index.js
//  Wealth role checker · XP system · Economy init
// ============================================================

const { Wallet, WealthRole, EconConfig } = require("../../database/economy");
const logger = require("../../utils/logger");

// ── Get or create economy config ─────────────────────────────
async function getCfg(guildId) {
  let cfg = await EconConfig.findOne({ guildId });
  if (!cfg) cfg = await EconConfig.create({ guildId });
  return cfg;
}

// ── Wealth role auto-assign ───────────────────────────────────
async function checkWealthRoles(member, wallet, cfg) {
  try {
    const tiers = await WealthRole.find({
      guildId: member.guild.id,
      enabled: true,
    }).sort({ threshold: 1 });

    for (const tier of tiers) {
      const role = member.guild.roles.cache.get(tier.roleId);
      if (!role) continue;

      const totalCoins = (wallet.balance ?? 0) + (wallet.bank ?? 0);

      if (totalCoins >= tier.threshold) {
        if (!member.roles.cache.has(tier.roleId)) {
          await member.roles.add(role).catch(() => null);
          logger.info(`[Economy] Assigned wealth role "${tier.label || role.name}" to ${member.user.tag}`);
        }
      } else {
        if (member.roles.cache.has(tier.roleId)) {
          await member.roles.remove(role).catch(() => null);
          logger.info(`[Economy] Removed wealth role "${tier.label || role.name}" from ${member.user.tag}`);
        }
      }
    }
  } catch (err) {
    logger.error(`[Economy] Wealth role check failed: ${err.message}`);
  }
}

// ── XP system (triggered by messages) ────────────────────────
const xpCooldown = new Map();
const XP_COOLDOWN_MS = 60_000;

function xpForLevel(level) {
  return Math.floor(100 * Math.pow(1.35, level));
}

async function handleXP(message, client) {
  if (message.author.bot || !message.guild) return;

  const userId  = message.author.id;
  const guildId = message.guild.id;
  const now     = Date.now();

  if (xpCooldown.has(userId) && now - xpCooldown.get(userId) < XP_COOLDOWN_MS) return;
  xpCooldown.set(userId, now);

  try {
    const wallet   = await Wallet.getOrCreate(userId, guildId);
    const xpGain   = Math.floor(Math.random() * 15 + 10);
    wallet.xp     += xpGain;
    wallet.totalMessages += 1;

    const needed   = xpForLevel(wallet.level);
    let leveledUp  = false;

    if (wallet.xp >= needed) {
      wallet.level += 1;
      wallet.xp    -= needed;
      leveledUp     = true;
    }

    await wallet.save();

    if (leveledUp) {
      const cfg = await getCfg(guildId);
      const embed = {
        color: 0x57F287,
        title: "🎉 Level Up!",
        description: `Congratulations ${message.author}, you reached **Level ${wallet.level}**!`,
        fields: [
          { name: "Level",   value: `${wallet.level}`, inline: true },
          { name: "XP",      value: `${wallet.xp}`,    inline: true },
        ],
        footer: { text: "Hazel Economy" },
        timestamp: new Date().toISOString(),
      };
      await message.channel.send({ embeds: [embed] }).catch(() => null);
    }
  } catch (err) {
    logger.error(`[Economy] XP error: ${err.message}`);
  }
}

// ── Init ──────────────────────────────────────────────────────
function initEconomy(client) {
  // XP listener
  client.on("messageCreate", msg => handleXP(msg, client));
  logger.info("[Economy] Economy system initialised.");
}

module.exports = { initEconomy, checkWealthRoles, getCfg, xpForLevel };
