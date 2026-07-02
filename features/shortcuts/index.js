// ============================================================
//  features/shortcuts/index.js — Chat Shortcut Engine
//  Defined symbols trigger bot actions when sent in chat
// ============================================================

const { PermissionFlagsBits, ChannelType } = require("discord.js");
const { ChatShortcut } = require("../../database/economy");
const logger = require("../../utils/logger");

// ── Action handlers ───────────────────────────────────────────
async function execAction(message, shortcut) {
  const { action, actionData } = shortcut;
  const channel = message.channel;
  const guild   = message.guild;

  try {
    await message.delete().catch(() => null);
  } catch (_) {}

  switch (action) {

    case "lock_channel": {
      await channel.permissionOverwrites.edit(guild.id, {
        SendMessages: false,
      });
      const reason = actionData.reason || "Channel locked by moderator.";
      await channel.send(`🔒 **Channel locked.** ${reason}`);
      break;
    }

    case "unlock_channel": {
      await channel.permissionOverwrites.edit(guild.id, {
        SendMessages: null,
      });
      await channel.send("🔓 **Channel unlocked.**");
      break;
    }

    case "slow_mode": {
      const seconds = actionData.seconds ?? 10;
      await channel.setRateLimitPerUser(seconds);
      await channel.send(`🐢 **Slow mode set to ${seconds}s.**`);
      break;
    }

    case "purge": {
      const count = Math.min(actionData.count ?? 10, 100);
      const msgs  = await channel.messages.fetch({ limit: count });
      await channel.bulkDelete(msgs, true).catch(() => null);
      const confirm = await channel.send(`🗑️ Deleted **${msgs.size}** messages.`);
      setTimeout(() => confirm.delete().catch(() => null), 3000);
      break;
    }

    case "close_ticket": {
      // Sets channel to view-only for everyone except mods
      await channel.permissionOverwrites.edit(guild.id, {
        SendMessages: false,
        ViewChannel:  false,
      });
      await channel.send("🔒 **Ticket closed.**");
      break;
    }

    case "send_message": {
      const text = actionData.text ?? "";
      if (text) await channel.send(text);
      break;
    }

    case "add_role": {
      const role = guild.roles.cache.get(actionData.roleId);
      if (role) await message.member.roles.add(role).catch(() => null);
      break;
    }

    case "remove_role": {
      const role = guild.roles.cache.get(actionData.roleId);
      if (role) await message.member.roles.remove(role).catch(() => null);
      break;
    }

    default:
      logger.warn(`[Shortcuts] Unknown action: ${action}`);
  }
}

// ── Member role check ─────────────────────────────────────────
function memberHasAllowedRole(member, allowedRoles) {
  if (!allowedRoles.length) return false;
  return allowedRoles.some(rId => member.roles.cache.has(rId));
}

// ── Attach to client ──────────────────────────────────────────
function initShortcuts(client) {
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.trim();
    if (!content || content.length > 10) return; // shortcuts are short symbols

    try {
      const shortcuts = await ChatShortcut.find({
        guildId: message.guild.id,
        symbol:  content,
        enabled: true,
      });

      for (const sc of shortcuts) {
        // Channel check
        if (sc.channels.length > 0 && !sc.channels.includes(message.channel.id)) continue;

        // Role check
        if (!memberHasAllowedRole(message.member, sc.allowedRoles)) continue;

        await execAction(message, sc);
        logger.info(`[Shortcuts] "${content}" triggered by ${message.author.tag} in #${message.channel.name}`);
      }
    } catch (err) {
      logger.error(`[Shortcuts] Error: ${err.message}`);
    }
  });

  logger.info("[Shortcuts] Chat shortcut engine initialised.");
}

module.exports = { initShortcuts };
