// ============================================================
//  index.js — Hazel Bot Entry Point v2
//  All economy commands are now slash commands
// ============================================================

require("dotenv").config();

const dns = require("dns");

const {
  Client, GatewayIntentBits, Collection, REST, Routes,
} = require("discord.js");
const fs       = require("fs");
const path     = require("path");
const mongoose = require("mongoose");

const config  = require("./config/config.json");
const logger  = require("./utils/logger");

const { initLogging }      = require("./logging");
const { initModeration }   = require("./moderation");
const { initEconomy }      = require("./features/economySystem");
const { initShortcuts }    = require("./features/shortcuts");
const { initInvestments }  = require("./features/investmentSystem");
const { initBusinesses }   = require("./features/businessSystem");
const { startDashboard }   = require("./dashboard");
const { registerEconomyCommands, commands: econCommands } = require("./commands/economy");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

// ── Client ────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent,
  ],
});

client.config         = config;
client.commands       = new Collection();
client.prefixCommands = new Collection();
client.cooldowns      = new Collection();

// ── Register economy slash commands ───────────────────────────
registerEconomyCommands(client);

// ── File-based command loader ─────────────────────────────────
const slashData = [];

function loadCommands(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.resolve(dir, entry.name);
    if (entry.isDirectory()) { loadCommands(full); continue; }
    if (!entry.name.endsWith(".js")) continue;
    // Skip economy index since already registered above
    if (full === path.resolve("commands", "economy", "index.js")) continue;
    try {
      const cmd = require(full);
      if (cmd.data && cmd.execute) {
        client.commands.set(cmd.data.name, cmd);
        slashData.push(cmd.data.toJSON());
        logger.info(`[CMD] Slash: ${cmd.data.name}`);
      }
      if (cmd.name && cmd.run) {
        client.prefixCommands.set(cmd.name, cmd);
        (cmd.aliases ?? []).forEach(a => client.prefixCommands.set(a, cmd));
        logger.info(`[CMD] Prefix: ${cmd.name}`);
      }
    } catch (err) {
      logger.error(`[CMD] Load failed ${full}: ${err.message}`);
    }
  }
}

// Add economy slash command data
econCommands.forEach(cmd => slashData.push(cmd.data.toJSON()));

loadCommands(path.resolve("commands"));

// ── Event file loader ─────────────────────────────────────────
function loadEvents(dir) {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".js"))) {
    try {
      const event   = require(path.resolve(dir, file));
      const evtName = file.replace(".js", "");
      event.once
        ? client.once(evtName, (...a) => event.execute(...a, client))
        : client.on(evtName,   (...a) => event.execute(...a, client));
      logger.info(`[EVT] ${evtName}`);
    } catch (err) {
      logger.error(`[EVT] Load failed ${file}: ${err.message}`);
    }
  }
}

loadEvents(path.resolve("events"));

// ── Slash command interaction handler ─────────────────────────
client.on("interactionCreate", async (interaction) => {
  if (interaction.isAutocomplete()) {
    const cmd = client.commands.get(interaction.commandName);
    if (cmd?.autocomplete) {
      try { await cmd.autocomplete(interaction); } catch (_) {}
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return interaction.reply({ content: "❌ Unknown command.", ephemeral: true });

  if (!client.cooldowns.has(command.data.name))
    client.cooldowns.set(command.data.name, new Collection());

  const now        = Date.now();
  const timestamps = client.cooldowns.get(command.data.name);
  const cdMs       = (command.cooldown ?? 3) * 1000;

  if (timestamps.has(interaction.user.id)) {
    const expires = timestamps.get(interaction.user.id) + cdMs;
    if (now < expires)
      return interaction.reply({ content: `⏳ Wait **${((expires-now)/1000).toFixed(1)}s**.`, ephemeral: true });
  }
  timestamps.set(interaction.user.id, now);
  setTimeout(() => timestamps.delete(interaction.user.id), cdMs);

  try {
    await command.execute(interaction, client);
  } catch (err) {
    logger.error(`[CMD] ${interaction.commandName}: ${err.message}`);
    const payload = { content: "❌ Command error.", ephemeral: true };
    interaction.replied || interaction.deferred
      ? interaction.followUp(payload)
      : interaction.reply(payload);
  }
});

// ── Ready ─────────────────────────────────────────────────────
client.once("ready", async () => {
  logger.success(`✅ Hazel is online! Logged in as ${client.user.tag}`);

  try {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: slashData });
    logger.success(`[API] Registered ${slashData.length} slash command(s).`);
  } catch (err) {
    logger.error(`[API] Slash registration failed: ${err.message}`);
    if (err.rawError?.errors) {
      logger.error(`[API] Details: ${JSON.stringify(err.rawError.errors, null, 2)}`);
    }
  }

  client.user.setPresence({
    activities: [{ name: "Hazelink Community", type: 3 }],
    status: "online",
  });

  startDashboard(client);
});

// ── MongoDB ───────────────────────────────────────────────────
if (process.env.MONGO_URI) {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => logger.success("[DB] MongoDB connected."))
    .catch(err => logger.error(`[DB] ${err.message}`));
} else {
  logger.warn("[DB] MONGO_URI not set.");
}

// ── Init all systems ──────────────────────────────────────────
initLogging(client);
initModeration(client);
initEconomy(client);
initShortcuts(client);
initInvestments();
initBusinesses();

// ── Login ─────────────────────────────────────────────────────
const token = process.env.DISCORD_TOKEN;
if (!token) { logger.error("DISCORD_TOKEN not set."); process.exit(1); }
client.login(token);
module.exports = client;
