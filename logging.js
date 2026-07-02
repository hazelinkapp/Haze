// ============================================================
//  logging.js — Hazel Event Logger
//  Tracks joins, leaves, message deletes/edits, role changes
//  Sends formatted embeds to #hazel-logs
// ============================================================

const { EmbedBuilder, AuditLogEvent } = require("discord.js");

// ── Colour palette (matches Hazelink brand) ──────────────────
const COLOR = {
  join:   0x57F287, // green
  leave:  0xED4245, // red
  delete: 0xFEE75C, // yellow
  edit:   0x5865F2, // blurple
  role:   0xEB459E, // pink
  mod:    0xFF6B35, // orange
  info:   0x00B4D8, // cyan
};

// ── Helper: find the #hazel-logs channel in a guild ──────────
function getLogChannel(guild) {
  return (
    guild.channels.cache.find(
      (c) => c.name === "hazel-logs" && c.isTextBased()
    ) ?? null
  );
}

// ── Helper: safe send (no crash if channel missing) ──────────
async function sendLog(guild, embed) {
  const ch = getLogChannel(guild);
  if (!ch) return;
  try {
    await ch.send({ embeds: [embed] });
  } catch (_) {}
}

// ── Helper: truncate long strings ────────────────────────────
function trunc(str, max = 1024) {
  if (!str) return "*empty*";
  return str.length > max ? str.slice(0, max - 3) + "..." : str;
}

// ── Helper: fetch audit log entry for an action ──────────────
async function fetchAudit(guild, type, targetId, maxAge = 5000) {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 1 });
    const entry = logs.entries.first();
    if (!entry) return null;
    if (targetId && entry.target?.id !== targetId) return null;
    if (Date.now() - entry.createdTimestamp > maxAge) return null;
    return entry;
  } catch (_) {
    return null;
  }
}

// ────────────────────────────────────────────────────────────
//  MEMBER JOIN
// ────────────────────────────────────────────────────────────
async function onGuildMemberAdd(member) {
  const age = Date.now() - member.user.createdTimestamp;
  const ageDays = Math.floor(age / 86_400_000);
  const newAcct = ageDays < 7;

  const embed = new EmbedBuilder()
    .setColor(COLOR.join)
    .setAuthor({
      name: `${member.user.tag} joined`,
      iconURL: member.user.displayAvatarURL({ dynamic: true }),
    })
    .addFields(
      { name: "👤 User",       value: `${member} \`(${member.id})\``,           inline: false },
      { name: "📅 Acc. Created", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: "👥 Member #",   value: `${member.guild.memberCount}`,              inline: true },
      ...(newAcct
        ? [{ name: "⚠️ New Account", value: `Account is only **${ageDays}** day(s) old!` }]
        : [])
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 128 }))
    .setFooter({ text: "Hazel Logs • Join" })
    .setTimestamp();

  await sendLog(member.guild, embed);
}

// ────────────────────────────────────────────────────────────
//  MEMBER LEAVE
// ────────────────────────────────────────────────────────────
async function onGuildMemberRemove(member) {
  // Check if it was actually a kick via audit log
  const auditKick = await fetchAudit(member.guild, AuditLogEvent.MemberKick, member.id);

  const roles = member.roles.cache
    .filter((r) => r.id !== member.guild.id)
    .map((r) => `${r}`)
    .slice(0, 10)
    .join(", ") || "None";

  const embed = new EmbedBuilder()
    .setColor(COLOR.leave)
    .setAuthor({
      name: auditKick
        ? `${member.user.tag} was kicked`
        : `${member.user.tag} left`,
      iconURL: member.user.displayAvatarURL({ dynamic: true }),
    })
    .addFields(
      { name: "👤 User",     value: `${member.user.tag} \`(${member.id})\``, inline: false },
      { name: "🎭 Roles",   value: trunc(roles, 512),                         inline: false },
      { name: "📅 Joined",  value: member.joinedAt
          ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
          : "Unknown",                                                          inline: true },
      ...(auditKick
        ? [
            { name: "🔨 Kicked By", value: `${auditKick.executor?.tag ?? "Unknown"}`, inline: true },
            { name: "📝 Reason",    value: auditKick.reason ?? "No reason",            inline: false },
          ]
        : [])
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 128 }))
    .setFooter({ text: "Hazel Logs • Leave" })
    .setTimestamp();

  await sendLog(member.guild, embed);
}

// ────────────────────────────────────────────────────────────
//  MESSAGE DELETE
// ────────────────────────────────────────────────────────────
async function onMessageDelete(message) {
  if (!message.guild || message.author?.bot) return;
  if (!message.author) return; // partial / uncached

  const audit = await fetchAudit(
    message.guild,
    AuditLogEvent.MessageDelete,
    message.author.id
  );
  const deletedBy = audit?.executor
    ? `${audit.executor.tag} \`(${audit.executor.id})\``
    : "Unknown (self-delete or uncached)";

  const embed = new EmbedBuilder()
    .setColor(COLOR.delete)
    .setAuthor({
      name: `Message deleted in #${message.channel.name}`,
      iconURL: message.author.displayAvatarURL({ dynamic: true }),
    })
    .addFields(
      { name: "👤 Author",     value: `${message.author.tag} \`(${message.author.id})\``, inline: true },
      { name: "🗑️ Deleted By", value: deletedBy,                                          inline: true },
      { name: "📝 Content",    value: trunc(message.content || "*No text content*"),       inline: false },
      ...(message.attachments.size
        ? [{ name: "📎 Attachments", value: message.attachments.map((a) => a.url).join("\n") }]
        : [])
    )
    .setFooter({ text: `Channel ID: ${message.channel.id} • Hazel Logs` })
    .setTimestamp();

  await sendLog(message.guild, embed);
}

// ────────────────────────────────────────────────────────────
//  MESSAGE EDIT
// ────────────────────────────────────────────────────────────
async function onMessageUpdate(oldMsg, newMsg) {
  if (!newMsg.guild || newMsg.author?.bot) return;
  if (!oldMsg.content || !newMsg.content) return;
  if (oldMsg.content === newMsg.content) return; // embed unfurl, ignore

  const embed = new EmbedBuilder()
    .setColor(COLOR.edit)
    .setAuthor({
      name: `Message edited in #${newMsg.channel.name}`,
      iconURL: newMsg.author.displayAvatarURL({ dynamic: true }),
    })
    .setURL(newMsg.url)
    .addFields(
      { name: "👤 Author",   value: `${newMsg.author.tag} \`(${newMsg.author.id})\``, inline: true },
      { name: "🔗 Jump",     value: `[Click to view](${newMsg.url})`,                  inline: true },
      { name: "📝 Before",   value: trunc(oldMsg.content),                             inline: false },
      { name: "✏️ After",    value: trunc(newMsg.content),                             inline: false }
    )
    .setFooter({ text: `Msg ID: ${newMsg.id} • Hazel Logs` })
    .setTimestamp();

  await sendLog(newMsg.guild, embed);
}

// ────────────────────────────────────────────────────────────
//  ROLE CHANGES (member role add/remove)
// ────────────────────────────────────────────────────────────
async function onGuildMemberUpdate(oldMember, newMember) {
  const addedRoles   = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
  const removedRoles = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));

  if (!addedRoles.size && !removedRoles.size) return;

  const audit = await fetchAudit(
    newMember.guild,
    AuditLogEvent.MemberRoleUpdate,
    newMember.id
  );

  const embed = new EmbedBuilder()
    .setColor(COLOR.role)
    .setAuthor({
      name: `Role update — ${newMember.user.tag}`,
      iconURL: newMember.user.displayAvatarURL({ dynamic: true }),
    })
    .addFields(
      { name: "👤 Member",   value: `${newMember} \`(${newMember.id})\``,                          inline: false },
      ...(addedRoles.size
        ? [{ name: "➕ Roles Added",   value: addedRoles.map((r) => `${r}`).join(", "),   inline: true }]
        : []),
      ...(removedRoles.size
        ? [{ name: "➖ Roles Removed", value: removedRoles.map((r) => `${r}`).join(", "), inline: true }]
        : []),
      ...(audit?.executor
        ? [{ name: "🛡️ Changed By", value: `${audit.executor.tag} \`(${audit.executor.id})\``, inline: false }]
        : [])
    )
    .setFooter({ text: "Hazel Logs • Role Update" })
    .setTimestamp();

  await sendLog(newMember.guild, embed);
}

// ────────────────────────────────────────────────────────────
//  NICKNAME CHANGES
// ────────────────────────────────────────────────────────────
async function onNicknameUpdate(oldMember, newMember) {
  if (oldMember.nickname === newMember.nickname) return;

  const embed = new EmbedBuilder()
    .setColor(COLOR.info)
    .setAuthor({
      name: `Nickname changed — ${newMember.user.tag}`,
      iconURL: newMember.user.displayAvatarURL({ dynamic: true }),
    })
    .addFields(
      { name: "👤 Member",  value: `${newMember} \`(${newMember.id})\``,                                        inline: false },
      { name: "📛 Before",  value: oldMember.nickname ?? "*No nickname*",                                       inline: true },
      { name: "📛 After",   value: newMember.nickname ?? "*Nickname removed*",                                  inline: true }
    )
    .setFooter({ text: "Hazel Logs • Nickname" })
    .setTimestamp();

  await sendLog(newMember.guild, embed);
}

// ────────────────────────────────────────────────────────────
//  initLogging — attach all listeners to the client
// ────────────────────────────────────────────────────────────
function initLogging(client) {
  client.on("guildMemberAdd",    (member)           => onGuildMemberAdd(member));
  client.on("guildMemberRemove", (member)           => onGuildMemberRemove(member));
  client.on("messageDelete",     (msg)              => onMessageDelete(msg));
  client.on("messageUpdate",     (oldMsg, newMsg)   => onMessageUpdate(oldMsg, newMsg));

  // Split guildMemberUpdate into role + nickname handlers
  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    await onGuildMemberUpdate(oldMember, newMember);
    await onNicknameUpdate(oldMember, newMember);
  });

  console.log("[Logging] Event logger attached — watching #hazel-logs");
}

module.exports = { initLogging, getLogChannel, sendLog };
