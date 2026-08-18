// ============================================================
//  index.js — Hazel Bot Entry Point v2
//  All economy commands are now slash commands
// ============================================================

const dns = require("dns");
const fs  = require("fs");
const path = require("path");

// Load local env files if present. Hosts inject vars themselves.
try {
  const envFiles = [
    path.join(__dirname, ".env"),
    path.join(__dirname, "env.txt"),
    path.join(__dirname, "..", ".env"),
    path.join(__dirname, "..", "env.txt"),
  ];
  for (const envFile of envFiles) {
    if (!fs.existsSync(envFile)) continue;
    for (const raw of fs.readFileSync(envFile, "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
} catch { /* ignore missing or unreadable env file */ }

process.env.DISCORD_TOKEN =
  process.env.DISCORD_TOKEN
  || process.env.BOT_TOKEN
  || process.env.TOKEN
  || process.env.DISCORD_BOT_TOKEN
  || "";
process.env.MONGO_URI =
  process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL || "";

const {
  Client, GatewayIntentBits, Collection, REST, Routes,
} = require("discord.js");
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
const token =
  process.env.DISCORD_TOKEN
  || config.discordToken
  || config.botToken
  || "";
if (!token) {
  const related = Object.keys(process.env)
    .filter(k => /token|mongo|discord|bot|uri|secret/i.test(k))
    .sort()
    .join(", ");
  logger.error("DISCORD_TOKEN not set.");
  logger.error(`Related env names: ${related || "(none)"}`);
  process.exit(1);
}
process.env.DISCORD_TOKEN = token;
client.login(token);
module.exports = client;
