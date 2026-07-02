// ============================================================
//  moderation.js — Hazel Moderation Commands
//  !ban  !kick  !mute  !warn  + MongoDB audit storage
// ============================================================

const {
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  ChannelType,
} = require("discord.js");
const mongoose = require("mongoose");

// ────────────────────────────────────────────────────────────
//  MongoDB Schema — ModerationAction
// ────────────────────────────────────────────────────────────
const modActionSchema = new mongoose.Schema(
  {
    guildId:     { type: String, required: true, index: true },
    guildName:   { type: String },
    action:      { type: String, enum: ["ban", "kick", "mute", "unmute", "warn", "unban"], required: true },
    targetId:    { type: String, required: true, index: true },
    targetTag:   { type: String },
    moderatorId: { type: String, required: true },
    moderatorTag:{ type: String },
    reason:      { type: String, default: "No reason provided." },
    duration:    { type: String, default: null }, // e.g. "10m", "1h"
    durationMs:  { type: Number, default: null }, // raw ms for unmute scheduling
    expiresAt:   { type: Date,   default: null },
    active:      { type: Boolean, default: true }, // for mutes
    caseNumber:  { type: Number },
  },
  { timestamps: true, versionKey: false }
);

// Auto-increment case number per guild
modActionSchema.pre("save", async function (next) {
  if (this.isNew) {
    const last = await ModerationAction.findOne({ guildId: this.guildId }).sort({ caseNumber: -1 });
    this.caseNumber = (last?.caseNumber ?? 0) + 1;
  }
  next();
});

const ModerationAction = mongoose.model("ModerationAction", modActionSchema);

// ────────────────────────────────────────────────────────────
//  Duration parser — "10m" "2h" "1d" → milliseconds
// ────────────────────────────────────────────────────────────
function parseDuration(str) {
  if (!str) return null;
  const match = str.match(/^(\d+)(s|m|h|d|w)$/i);
  if (!match) return null;
  const n = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const map  = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  return n * map[unit];
}

function formatDuration(ms) {
  if (!ms) return "permanent";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ────────────────────────────────────────────────────────────
//  Shared embed builder
// ────────────────────────────────────────────────────────────
const ACTION_COLOR = {
  ban:    0xED4245,
  kick:   0xFF6B35,
  mute:   0xFEE75C,
  unmute: 0x57F287,
  warn:   0xEB459E,
  unban:  0x57F287,
};
const ACTION_EMOJI = {
  ban: "🔨", kick: "👢", mute: "🔇", unmute: "🔊", warn: "⚠️", unban: "✅",
};

function modEmbed(action, target, moderator, reason, caseNum, extra = {}) {
  const e = new EmbedBuilder()
    .setColor(ACTION_COLOR[action] ?? 0x5865F2)
    .setTitle(`${ACTION_EMOJI[action] ?? "🛡️"} ${action.toUpperCase()} — Case #${caseNum}`)
    .addFields(
      { name: "👤 User",      value: `${target.tag ?? target} \`(${target.id})\``,       inline: true },
      { name: "🛡️ Moderator", value: `${moderator.tag ?? moderator} \`(${moderator.id})\``, inline: true },
      { name: "📝 Reason",    value: reason,                                              inline: false },
      ...(extra.duration
        ? [{ name: "⏱️ Duration", value: extra.duration, inline: true }]
        : []),
      ...(extra.expires
        ? [{ name: "🕐 Expires",  value: `<t:${Math.floor(extra.expires.getTime() / 1000)}:R>`, inline: true }]
        : [])
    )
    .setFooter({ text: "Hazel Moderation" })
    .setTimestamp();
  return e;
}

// ────────────────────────────────────────────────────────────
//  Permission guard
// ────────────────────────────────────────────────────────────
function noPerms(message, msg = "You don't have permission to use this command.") {
  return message.reply({ content: `❌ ${msg}`, allowedMentions: { repliedUser: false } });
}

// ────────────────────────────────────────────────────────────
//  BAN
// ────────────────────────────────────────────────────────────
async function handleBan(message, args) {
  if (!message.member.permissions.has(PermissionFlagsBits.BanMembers))
    return noPerms(message);

  const target = message.mentions.members.first();
  if (!target) return message.reply("❌ Please mention a user to ban. `!ban @user [reason]`");

  if (target.id === message.author.id)
    return message.reply("❌ You cannot ban yourself.");

  if (target.roles.highest.position >= message.member.roles.highest.position)
    return message.reply("❌ You cannot ban someone with an equal or higher role.");

  if (!target.bannable)
    return message.reply("❌ I don't have permission to ban that user.");

  const reason = args.slice(1).join(" ") || "No reason provided.";

  // DM before ban
  await target.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle(`🔨 You have been banned from ${message.guild.name}`)
        .addFields({ name: "Reason", value: reason })
        .setFooter({ text: "Hazel Moderation" })
        .setTimestamp(),
    ],
  }).catch(() => null);

  await target.ban({ reason, deleteMessageSeconds: 86400 });

  const record = await ModerationAction.create({
    guildId:     message.guild.id,
    guildName:   message.guild.name,
    action:      "ban",
    targetId:    target.id,
    targetTag:   target.user.tag,
    moderatorId: message.author.id,
    moderatorTag:message.author.tag,
    reason,
  });

  await message.reply({
    embeds: [modEmbed("ban", target.user, message.author, reason, record.caseNumber)],
    allowedMentions: { repliedUser: false },
  });
}

// ────────────────────────────────────────────────────────────
//  KICK
// ────────────────────────────────────────────────────────────
async function handleKick(message, args) {
  if (!message.member.permissions.has(PermissionFlagsBits.KickMembers))
    return noPerms(message);

  const target = message.mentions.members.first();
  if (!target) return message.reply("❌ Please mention a user to kick. `!kick @user [reason]`");

  if (target.id === message.author.id)
    return message.reply("❌ You cannot kick yourself.");

  if (target.roles.highest.position >= message.member.roles.highest.position)
    return message.reply("❌ You cannot kick someone with an equal or higher role.");

  if (!target.kickable)
    return message.reply("❌ I don't have permission to kick that user.");

  const reason = args.slice(1).join(" ") || "No reason provided.";

  await target.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xFF6B35)
        .setTitle(`👢 You have been kicked from ${message.guild.name}`)
        .addFields({ name: "Reason", value: reason })
        .setFooter({ text: "Hazel Moderation" })
        .setTimestamp(),
    ],
  }).catch(() => null);

  await target.kick(reason);

  const record = await ModerationAction.create({
    guildId:     message.guild.id,
    guildName:   message.guild.name,
    action:      "kick",
    targetId:    target.id,
    targetTag:   target.user.tag,
    moderatorId: message.author.id,
    moderatorTag:message.author.tag,
    reason,
  });

  await message.reply({
    embeds: [modEmbed("kick", target.user, message.author, reason, record.caseNumber)],
    allowedMentions: { repliedUser: false },
  });
}

// ────────────────────────────────────────────────────────────
//  MUTE  (Discord timeout — no mute-role needed)
// ────────────────────────────────────────────────────────────
async function handleMute(message, args) {
  if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
    return noPerms(message, "You need the **Timeout Members** permission.");

  const target = message.mentions.members.first();
  if (!target) return message.reply("❌ Usage: `!mute @user <duration> [reason]`\nDurations: 10m 1h 1d 1w");

  const rawDuration = args[1];
  const durationMs  = parseDuration(rawDuration);
  if (!durationMs)
    return message.reply("❌ Invalid duration. Examples: `10m` `2h` `1d` `1w`");

  // Discord max timeout = 28 days
  if (durationMs > 28 * 86_400_000)
    return message.reply("❌ Duration cannot exceed 28 days.");

  if (!target.moderatable)
    return message.reply("❌ I can't timeout that user.");

  const reason    = args.slice(2).join(" ") || "No reason provided.";
  const expiresAt = new Date(Date.now() + durationMs);

  await target.timeout(durationMs, reason);

  await target.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle(`🔇 You have been muted in ${message.guild.name}`)
        .addFields(
          { name: "Duration", value: formatDuration(durationMs), inline: true },
          { name: "Expires",  value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`, inline: true },
          { name: "Reason",   value: reason }
        )
        .setFooter({ text: "Hazel Moderation" })
        .setTimestamp(),
    ],
  }).catch(() => null);

  const record = await ModerationAction.create({
    guildId:     message.guild.id,
    guildName:   message.guild.name,
    action:      "mute",
    targetId:    target.id,
    targetTag:   target.user.tag,
    moderatorId: message.author.id,
    moderatorTag:message.author.tag,
    reason,
    duration:   formatDuration(durationMs),
    durationMs,
    expiresAt,
    active:     true,
  });

  await message.reply({
    embeds: [
      modEmbed("mute", target.user, message.author, reason, record.caseNumber, {
        duration: formatDuration(durationMs),
        expires:  expiresAt,
      }),
    ],
    allowedMentions: { repliedUser: false },
  });
}

// ────────────────────────────────────────────────────────────
//  WARN
// ────────────────────────────────────────────────────────────
async function handleWarn(message, args) {
  if (
    !message.member.permissions.has(PermissionFlagsBits.ModerateMembers) &&
    !message.member.permissions.has(PermissionFlagsBits.KickMembers)
  )
    return noPerms(message);

  const target = message.mentions.members.first();
  if (!target) return message.reply("❌ Usage: `!warn @user [reason]`");

  if (target.user.bot) return message.reply("❌ You cannot warn a bot.");

  const reason = args.slice(1).join(" ") || "No reason provided.";

  const record = await ModerationAction.create({
    guildId:     message.guild.id,
    guildName:   message.guild.name,
    action:      "warn",
    targetId:    target.id,
    targetTag:   target.user.tag,
    moderatorId: message.author.id,
    moderatorTag:message.author.tag,
    reason,
  });

  // Count total warnings
  const warnCount = await ModerationAction.countDocuments({
    guildId:  message.guild.id,
    targetId: target.id,
    action:   "warn",
  });

  await target.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xEB459E)
        .setTitle(`⚠️ You have been warned in ${message.guild.name}`)
        .addFields(
          { name: "Reason",           value: reason },
          { name: "Total Warnings",   value: `${warnCount}` }
        )
        .setFooter({ text: "Hazel Moderation" })
        .setTimestamp(),
    ],
  }).catch(() => null);

  const embed = modEmbed("warn", target.user, message.author, reason, record.caseNumber);
  embed.addFields({ name: "⚠️ Total Warnings", value: `${warnCount}`, inline: true });

  await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
}

// ────────────────────────────────────────────────────────────
//  WARNINGS — list user's warnings
// ────────────────────────────────────────────────────────────
async function handleWarnings(message, args) {
  const target = message.mentions.users.first() ?? message.author;

  const warnings = await ModerationAction.find({
    guildId:  message.guild.id,
    targetId: target.id,
    action:   "warn",
  }).sort({ createdAt: -1 }).limit(10);

  if (!warnings.length) {
    return message.reply(`✅ **${target.tag}** has no warnings.`);
  }

  const lines = warnings.map(
    (w) =>
      `**#${w.caseNumber}** — ${w.reason} *(by ${w.moderatorTag}, <t:${Math.floor(w.createdAt.getTime() / 1000)}:R>)*`
  );

  const embed = new EmbedBuilder()
    .setColor(0xEB459E)
    .setTitle(`⚠️ Warnings — ${target.tag}`)
    .setDescription(lines.join("\n"))
    .addFields({ name: "Total", value: `${warnings.length}`, inline: true })
    .setFooter({ text: "Hazel Moderation" })
    .setTimestamp();

  await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
}

// ────────────────────────────────────────────────────────────
//  MODLOGS — audit history for a user
// ────────────────────────────────────────────────────────────
async function handleModlogs(message, args) {
  if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
    return noPerms(message);

  const target = message.mentions.users.first() ?? message.author;

  const records = await ModerationAction.find({
    guildId:  message.guild.id,
    targetId: target.id,
  }).sort({ createdAt: -1 }).limit(15);

  if (!records.length)
    return message.reply(`📭 No moderation history found for **${target.tag}**.`);

  const lines = records.map(
    (r) =>
      `${ACTION_EMOJI[r.action] ?? "🛡️"} **#${r.caseNumber} ${r.action.toUpperCase()}** — ${r.reason} *(${r.moderatorTag}, <t:${Math.floor(r.createdAt.getTime() / 1000)}:R>)*`
  );

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`📋 Mod History — ${target.tag}`)
    .setDescription(lines.join("\n"))
    .setFooter({ text: "Hazel Moderation • Last 15 actions" })
    .setTimestamp();

  await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } });
}

// ────────────────────────────────────────────────────────────
//  UNMUTE — remove timeout early
// ────────────────────────────────────────────────────────────
async function handleUnmute(message, args) {
  if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
    return noPerms(message);

  const target = message.mentions.members.first();
  if (!target) return message.reply("❌ Usage: `!unmute @user`");

  if (!target.communicationDisabledUntil)
    return message.reply("❌ That user is not currently muted.");

  await target.timeout(null);

  await ModerationAction.updateMany(
    { guildId: message.guild.id, targetId: target.id, action: "mute", active: true },
    { active: false }
  );

  const record = await ModerationAction.create({
    guildId:     message.guild.id,
    guildName:   message.guild.name,
    action:      "unmute",
    targetId:    target.id,
    targetTag:   target.user.tag,
    moderatorId: message.author.id,
    moderatorTag:message.author.tag,
    reason:      "Manual unmute",
  });

  await message.reply({
    embeds: [modEmbed("unmute", target.user, message.author, "Manual unmute", record.caseNumber)],
    allowedMentions: { repliedUser: false },
  });
}

// ────────────────────────────────────────────────────────────
//  Command router — called from messageCreate event
// ────────────────────────────────────────────────────────────
const COMMANDS = {
  ban:      handleBan,
  kick:     handleKick,
  mute:     handleMute,
  unmute:   handleUnmute,
  warn:     handleWarn,
  warnings: handleWarnings,
  modlogs:  handleModlogs,
};

async function routeCommand(message, commandName, args) {
  const handler = COMMANDS[commandName];
  if (!handler) return false;
  try {
    await handler(message, args);
  } catch (err) {
    console.error(`[Moderation] Error in !${commandName}:`, err.message);
    await message.reply("❌ An error occurred. Check my permissions and try again.").catch(() => null);
  }
  return true;
}

// ────────────────────────────────────────────────────────────
//  initModeration — hook into the client
// ────────────────────────────────────────────────────────────
function initModeration(client) {
  // messageCreate is already handled in events/messageCreate.js
  // Just export routeCommand and call it from there.
  // This function is here for any future slash-command registration.
  console.log("[Moderation] Moderation module loaded. Commands: " + Object.keys(COMMANDS).join(", "));
}

module.exports = {
  initModeration,
  routeCommand,
  ModerationAction,
  parseDuration,
  formatDuration,
};
