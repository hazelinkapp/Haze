// ============================================================
//  events/messageCreate.js
//  Routes prefix commands → moderation → economy → file cmds
// ============================================================

const logger = require("../utils/logger");
const { routeCommand }   = require("../moderation");
const { routeEconomy }   = require("../features/economySystem");

module.exports = {
  once: false,

  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

    const prefix = client.config?.prefix ?? "!";
    if (!message.content.startsWith(prefix)) return;

    const args    = message.content.slice(prefix.length).trim().split(/\s+/);
    const cmdName = args.shift().toLowerCase();

    // 1. Moderation commands (ban kick mute warn etc.)
    const handledByMod = await routeCommand(message, cmdName, args);
    if (handledByMod) return;

    // 2. Economy commands (balance daily work gamble rob shop etc.)
    const handledByEcon = await routeEconomy(message, cmdName, args);
    if (handledByEcon) return;

    // 3. File-based prefix commands
    const command = client.prefixCommands?.get(cmdName);
    if (!command) return;

    // Cooldown
    if (!client.cooldowns.has(`prefix_${command.name}`)) {
      const { Collection } = require("discord.js");
      client.cooldowns.set(`prefix_${command.name}`, new Collection());
    }
    const now        = Date.now();
    const timestamps = client.cooldowns.get(`prefix_${command.name}`);
    const cdMs       = (command.cooldown ?? 3) * 1000;

    if (timestamps.has(message.author.id)) {
      const expiresAt = timestamps.get(message.author.id) + cdMs;
      if (now < expiresAt) {
        const rem = ((expiresAt - now) / 1000).toFixed(1);
        return message.reply(`⏳ Please wait **${rem}s** before using \`${prefix}${command.name}\` again.`);
      }
    }
    timestamps.set(message.author.id, now);
    setTimeout(() => timestamps.delete(message.author.id), cdMs);

    try {
      await command.run(message, args, client);
    } catch (err) {
      logger.error(`[messageCreate] ${cmdName}: ${err.message}`);
      message.reply("❌ An error occurred.").catch(() => null);
    }
  },
};
