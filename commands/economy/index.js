// ============================================================
//  commands/economy/index.js — All Economy Slash Commands
//  /balance /daily /work /gamble /rob /give /deposit /withdraw
//  /shop /buy /inventory /leaderboard
//  /business /collect /upgrade
//  /invest /sell /portfolio /market
// ============================================================

const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require("discord.js");

const {
  Wallet, ShopItem, Inventory, Transaction,
  OwnedBusiness, Investment, EconConfig,
} = require("../../database/economy");

const {
  getAllPrices, getPrice, HOLD_MS, TAX_PCT,
} = require("../../features/investmentSystem");

const {
  buyBusiness, collectBusiness, upgradeBusiness,
  getUserBusinesses, getBizDef, getLevelDef,
  fmtMs, cooldownLeft, BUSINESS_TYPES,
} = require("../../features/businessSystem");

const { checkWealthRoles } = require("../../features/economySystem");

// ── Helpers ───────────────────────────────────────────────────
async function getCfg(guildId) {
  let cfg = await EconConfig.findOne({ guildId });
  if (!cfg) cfg = await EconConfig.create({ guildId });
  return cfg;
}

function cdLeft(lastDate, hours) {
  if (!lastDate) return 0;
  const next = new Date(lastDate).getTime() + hours * 3_600_000;
  return Math.max(0, next - Date.now());
}

function econEmbed(color = 0x5B6EF5) {
  return new EmbedBuilder().setColor(color).setFooter({ text: "Hazel Economy" }).setTimestamp();
}

async function logTx(guildId, userId, type, amount, balance, note = "", targetId = null) {
  await Transaction.create({ guildId, userId, type, amount, balance, note, targetId });
}

const JOBS = [
  { title: "Chef",          verb: "cooked gourmet meals"         },
  { title: "Developer",     verb: "shipped a feature"            },
  { title: "Driver",        verb: "completed deliveries"         },
  { title: "Doctor",        verb: "treated patients"             },
  { title: "Streamer",      verb: "went live and got donations"  },
  { title: "Artist",        verb: "sold a painting"              },
  { title: "Trader",        verb: "made a profitable trade"      },
  { title: "Mechanic",      verb: "fixed several cars"           },
  { title: "Teacher",       verb: "taught a full class"          },
  { title: "Security Guard",verb: "worked a long night shift"    },
  { title: "Fisherman",     verb: "caught a big haul"            },
  { title: "DJ",            verb: "performed at a party"         },
  { title: "Photographer",  verb: "sold a photoshoot"            },
  { title: "YouTuber",      verb: "uploaded a viral video"       },
];

const SLOTS = ["🍒","🍋","🍊","🍇","💎","7️⃣","⭐"];

// ── Build all slash commands ──────────────────────────────────
const commands = [

  // /balance
  {
    data: new SlashCommandBuilder()
      .setName("balance").setDescription("Check your or another user's coin balance.")
      .addUserOption(o => o.setName("user").setDescription("User to check").setRequired(false)),
    async execute(interaction) {
      const cfg    = await getCfg(interaction.guild.id);
      const target = interaction.options.getMember("user") ?? interaction.member;
      const wallet = await Wallet.getOrCreate(target.id, interaction.guild.id);
      await interaction.reply({ embeds: [
        econEmbed()
          .setTitle(`${cfg.coinEmoji} ${target.displayName}'s Wallet`)
          .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: "💰 Wallet",  value: `**${wallet.balance.toLocaleString()}** ${cfg.coinName}`,  inline: true },
            { name: "🏦 Bank",    value: `**${wallet.bank.toLocaleString()}** ${cfg.coinName}`,      inline: true },
            { name: "📈 Earned",  value: `${wallet.totalEarned.toLocaleString()} ${cfg.coinName}`,   inline: true },
            { name: "🔒 Secured", value: wallet.secured ? "✅ Yes" : "❌ No",                         inline: true },
          ),
      ] });
    },
  },

  // /daily
  {
    data: new SlashCommandBuilder().setName("daily").setDescription("Claim your daily coin reward."),
    async execute(interaction) {
      const cfg    = await getCfg(interaction.guild.id);
      const wallet = await Wallet.getOrCreate(interaction.user.id, interaction.guild.id);
      const left   = cdLeft(wallet.lastDaily, cfg.dailyCooldownHrs);
      if (left > 0) return interaction.reply({ embeds: [econEmbed(0xED4245).setDescription(`⏳ Come back in **${fmtMs(left)}**.`)], ephemeral: true });

      const lastMs = wallet.lastDaily ? Date.now() - new Date(wallet.lastDaily).getTime() : Infinity;
      const streak = lastMs < 48 * 3_600_000 ? (wallet.dailyStreak ?? 0) + 1 : 1;
      const bonus  = Math.min(streak - 1, 6) * Math.floor(cfg.dailyAmount * 0.1);
      const total  = cfg.dailyAmount + bonus;

      wallet.balance += total; wallet.totalEarned += total;
      wallet.lastDaily = new Date(); wallet.dailyStreak = streak;
      await wallet.save();
      await logTx(interaction.guild.id, interaction.user.id, "daily", total, wallet.balance, `Daily (streak ${streak})`);
      await checkWealthRoles(interaction.member, wallet, cfg);

      await interaction.reply({ embeds: [
        econEmbed(0x57F287)
          .setTitle(`${cfg.coinEmoji} Daily Claimed!`)
          .addFields(
            { name: "💰 Received",    value: `**${total.toLocaleString()}** ${cfg.coinName}`, inline: true },
            { name: "🔥 Streak",      value: `${streak} day${streak !== 1 ? "s" : ""}`,       inline: true },
            { name: "⭐ Bonus",       value: `+${bonus.toLocaleString()} ${cfg.coinName}`,     inline: true },
            { name: "💳 New Balance", value: `${wallet.balance.toLocaleString()} ${cfg.coinName}`, inline: true },
          ),
      ] });
    },
  },

  // /work
  {
    data: new SlashCommandBuilder().setName("work").setDescription("Work a job to earn coins."),
    async execute(interaction) {
      const cfg    = await getCfg(interaction.guild.id);
      const wallet = await Wallet.getOrCreate(interaction.user.id, interaction.guild.id);
      const left   = cdLeft(wallet.lastWork, cfg.workCooldownHrs);
      if (left > 0) return interaction.reply({ embeds: [econEmbed(0xED4245).setDescription(`⏳ Rest up! Work again in **${fmtMs(left)}**.`)], ephemeral: true });

      const job    = JOBS[Math.floor(Math.random() * JOBS.length)];
      const earned = Math.floor(Math.random() * (cfg.workMaxCoins - cfg.workMinCoins + 1)) + cfg.workMinCoins;
      wallet.balance += earned; wallet.totalEarned += earned; wallet.lastWork = new Date();
      await wallet.save();
      await logTx(interaction.guild.id, interaction.user.id, "work", earned, wallet.balance, `Worked as ${job.title}`);
      await checkWealthRoles(interaction.member, wallet, cfg);

      await interaction.reply({ embeds: [
        econEmbed(0x2DD4BF)
          .setTitle(`💼 ${job.title}`)
          .setDescription(`You ${job.verb} and earned **${earned.toLocaleString()} ${cfg.coinName}**!`)
          .addFields({ name: "💰 Balance", value: `${wallet.balance.toLocaleString()} ${cfg.coinName}`, inline: true }),
      ] });
    },
  },

  // /gamble
  {
    data: new SlashCommandBuilder()
      .setName("gamble").setDescription("Try your luck at the slot machine.")
      .addStringOption(o => o.setName("amount").setDescription("Amount to bet (or 'all')").setRequired(true)),
    async execute(interaction) {
      const cfg    = await getCfg(interaction.guild.id);
      const wallet = await Wallet.getOrCreate(interaction.user.id, interaction.guild.id);
      const raw    = interaction.options.getString("amount");
      const bet    = raw === "all" || raw === "max" ? wallet.balance : parseInt(raw);

      if (!bet || isNaN(bet) || bet <= 0) return interaction.reply({ content: "❌ Invalid bet.", ephemeral: true });
      if (bet < 10) return interaction.reply({ content: "❌ Minimum bet is 10.", ephemeral: true });
      if (bet > wallet.balance) return interaction.reply({ content: `❌ You only have **${wallet.balance.toLocaleString()}** ${cfg.coinName}.`, ephemeral: true });

      const reels = [0,1,2].map(() => Math.floor(Math.random() * SLOTS.length));
      const icons = reels.map(i => SLOTS[i]);

      let multiplier = 0, resultText = "";
      if (reels[0] === reels[1] && reels[1] === reels[2]) {
        if (SLOTS[reels[0]] === "💎")  { multiplier = 10; resultText = "💎 **DIAMOND JACKPOT!** 10×"; }
        else if (SLOTS[reels[0]] === "7️⃣") { multiplier = 7; resultText = "7️⃣ **LUCKY SEVENS!** 7×"; }
        else { multiplier = 4; resultText = "🎰 **JACKPOT!** 4×"; }
      } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
        multiplier = 1.5; resultText = "✅ **Two of a kind!** 1.5×";
      } else {
        multiplier = 0; resultText = "❌ **No match. You lose.**";
      }

      const winnings = Math.floor(bet * multiplier);
      const net      = winnings - bet;
      wallet.balance = Math.max(0, wallet.balance + net);
      if (net > 0) wallet.totalEarned += net; else wallet.totalSpent += Math.abs(net);
      await wallet.save();
      await logTx(interaction.guild.id, interaction.user.id, "gamble", net, wallet.balance, `Gamble: bet ${bet}`);
      await checkWealthRoles(interaction.member, wallet, cfg);

      await interaction.reply({ embeds: [
        econEmbed(multiplier > 0 ? 0x57F287 : 0xED4245)
          .setTitle("🎰 Slot Machine")
          .setDescription(`**[ ${icons.join(" | ")} ]**\n\n${resultText}`)
          .addFields(
            { name: "💸 Bet",     value: `${bet.toLocaleString()} ${cfg.coinName}`,         inline: true },
            { name: net >= 0 ? "✅ Won" : "❌ Lost", value: `${Math.abs(net).toLocaleString()} ${cfg.coinName}`, inline: true },
            { name: "💰 Balance", value: `${wallet.balance.toLocaleString()} ${cfg.coinName}`, inline: true },
          ),
      ] });
    },
  },

  // /rob
  {
    data: new SlashCommandBuilder()
      .setName("rob").setDescription("Attempt to rob another user.")
      .addUserOption(o => o.setName("user").setDescription("User to rob").setRequired(true)),
    async execute(interaction) {
      const cfg    = await getCfg(interaction.guild.id);
      const robber = await Wallet.getOrCreate(interaction.user.id, interaction.guild.id);
      const left   = cdLeft(robber.lastRob, cfg.robCooldownHrs);
      if (left > 0) return interaction.reply({ embeds: [econEmbed(0xED4245).setDescription(`⏳ Can't rob again for **${fmtMs(left)}**.`)], ephemeral: true });

      const targetMember = interaction.options.getMember("user");
      if (!targetMember) return interaction.reply({ content: "❌ User not found.", ephemeral: true });
      if (targetMember.id === interaction.user.id) return interaction.reply({ content: "❌ You can't rob yourself.", ephemeral: true });
      if (targetMember.user.bot) return interaction.reply({ content: "❌ You can't rob a bot.", ephemeral: true });

      const victim = await Wallet.getOrCreate(targetMember.id, interaction.guild.id);

      // Check if victim is secured
      if (victim.secured) {
        return interaction.reply({ embeds: [
          econEmbed(0x5B6EF5)
            .setTitle("🛡️ Protected!")
            .setDescription(`**${targetMember.displayName}** is under admin protection. No one can steal from them.`),
        ] });
      }

      if (victim.balance < 100) return interaction.reply({ content: "❌ That user doesn't have enough coins to rob (min 100).", ephemeral: true });

      const presence = targetMember.presence?.status ?? "offline";
      const isOnline = presence !== "offline" && presence !== "invisible";
      const chance   = isOnline ? cfg.robSuccessOnline : cfg.robSuccessOffline;
      const success  = Math.random() * 100 < chance;

      robber.lastRob = new Date();

      if (success) {
        const stolen = Math.floor(victim.balance * (cfg.robStealPct / 100));
        robber.balance += stolen; robber.totalEarned += stolen;
        victim.balance  = Math.max(0, victim.balance - stolen); victim.totalSpent += stolen;
        await Promise.all([robber.save(), victim.save()]);
        await logTx(interaction.guild.id, interaction.user.id, "rob",     stolen,  robber.balance, `Robbed ${targetMember.user.tag}`, targetMember.id);
        await logTx(interaction.guild.id, targetMember.id,    "penalty", -stolen,  victim.balance,  `Robbed by ${interaction.user.tag}`, interaction.user.id);
        await checkWealthRoles(interaction.member, robber, cfg);
        await checkWealthRoles(targetMember, victim, cfg);

        await interaction.reply({ embeds: [
          econEmbed(0x57F287).setTitle("🦹 Rob Successful!")
            .setDescription(`You robbed **${targetMember.displayName}** while they were **${isOnline ? "online" : "offline"}**!`)
            .addFields(
              { name: "💰 Stolen",        value: `${stolen.toLocaleString()} ${cfg.coinName}`, inline: true },
              { name: "📊 Success Chance", value: `${chance}%`, inline: true },
              { name: "💰 Your Balance",   value: `${robber.balance.toLocaleString()} ${cfg.coinName}`, inline: true },
            ),
        ] });
      } else {
        const penalty = Math.floor(robber.balance * (cfg.robPenaltyPct / 100));
        robber.balance = Math.max(0, robber.balance - penalty); robber.totalSpent += penalty;
        victim.balance += penalty; victim.totalEarned += penalty;
        await Promise.all([robber.save(), victim.save()]);
        await logTx(interaction.guild.id, interaction.user.id, "penalty", -penalty, robber.balance, `Caught robbing ${targetMember.user.tag}`, targetMember.id);
        await logTx(interaction.guild.id, targetMember.id, "receive", penalty, victim.balance, `Compensation from failed rob`, interaction.user.id);
        await checkWealthRoles(interaction.member, robber, cfg);
        await checkWealthRoles(targetMember, victim, cfg);

        await interaction.reply({ embeds: [
          econEmbed(0xED4245).setTitle("🚔 Caught!")
            .setDescription(`You got caught robbing **${targetMember.displayName}** and paid them **${penalty.toLocaleString()}** ${cfg.coinName} as compensation.`)
            .addFields(
              { name: "💸 Penalty",        value: `${penalty.toLocaleString()} ${cfg.coinName}`, inline: true },
              { name: "📊 Success Chance", value: `${chance}%`, inline: true },
              { name: "💰 Your Balance",   value: `${robber.balance.toLocaleString()} ${cfg.coinName}`, inline: true },
            ),
        ] });
      }
    },
  },

  // /give
  {
    data: new SlashCommandBuilder()
      .setName("give").setDescription("Give coins to another user.")
      .addUserOption(o => o.setName("user").setDescription("User to give to").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setDescription("Amount to give").setRequired(true).setMinValue(1)),
    async execute(interaction) {
      const cfg    = await getCfg(interaction.guild.id);
      const target = interaction.options.getMember("user");
      const amount = interaction.options.getInteger("amount");
      if (!target || target.id === interaction.user.id || target.user.bot) return interaction.reply({ content: "❌ Invalid target.", ephemeral: true });

      const sender = await Wallet.getOrCreate(interaction.user.id, interaction.guild.id);
      if (sender.balance < amount) return interaction.reply({ content: `❌ You only have **${sender.balance.toLocaleString()}** ${cfg.coinName}.`, ephemeral: true });

      const receiver = await Wallet.getOrCreate(target.id, interaction.guild.id);
      sender.balance -= amount; sender.totalSpent += amount;
      receiver.balance += amount; receiver.totalEarned += amount;
      await Promise.all([sender.save(), receiver.save()]);
      await logTx(interaction.guild.id, interaction.user.id, "give",    -amount, sender.balance,   `Gave to ${target.user.tag}`, target.id);
      await logTx(interaction.guild.id, target.id,           "receive",  amount, receiver.balance, `From ${interaction.user.tag}`, interaction.user.id);
      await checkWealthRoles(interaction.member, sender, cfg);
      await checkWealthRoles(target, receiver, cfg);

      await interaction.reply({ embeds: [
        econEmbed(0x2DD4BF).setTitle(`${cfg.coinEmoji} Coins Sent`)
          .setDescription(`Sent **${amount.toLocaleString()} ${cfg.coinName}** to ${target}!`)
          .addFields({ name: "💰 Your Balance", value: `${sender.balance.toLocaleString()} ${cfg.coinName}`, inline: true }),
      ] });
    },
  },

  // /deposit
  {
    data: new SlashCommandBuilder()
      .setName("deposit").setDescription("Deposit coins into your bank.")
      .addStringOption(o => o.setName("amount").setDescription("Amount to deposit (or 'all')").setRequired(true)),
    async execute(interaction) {
      const cfg    = await getCfg(interaction.guild.id);
      const wallet = await Wallet.getOrCreate(interaction.user.id, interaction.guild.id);
      const raw    = interaction.options.getString("amount");
      const amount = raw === "all" ? wallet.balance : parseInt(raw);

      if (!amount || isNaN(amount) || amount <= 0) return interaction.reply({ content: "❌ Invalid amount.", ephemeral: true });
      if (amount > wallet.balance) return interaction.reply({ content: `❌ You only have **${wallet.balance.toLocaleString()}** in your wallet.`, ephemeral: true });

      wallet.balance -= amount;
      wallet.bank    += amount;
      await wallet.save();
      await logTx(interaction.guild.id, interaction.user.id, "deposit", -amount, wallet.balance, `Deposited to bank`);

      await interaction.reply({ embeds: [
        econEmbed(0x3B82F6).setTitle("🏦 Deposited")
          .addFields(
            { name: "💰 Deposited",    value: `${amount.toLocaleString()} ${cfg.coinName}`, inline: true },
            { name: "💳 Wallet",       value: `${wallet.balance.toLocaleString()} ${cfg.coinName}`, inline: true },
            { name: "🏦 Bank",         value: `${wallet.bank.toLocaleString()} ${cfg.coinName}`, inline: true },
          ),
      ] });
    },
  },

  // /withdraw
  {
    data: new SlashCommandBuilder()
      .setName("withdraw").setDescription("Withdraw coins from your bank.")
      .addStringOption(o => o.setName("amount").setDescription("Amount to withdraw (or 'all')").setRequired(true)),
    async execute(interaction) {
      const cfg    = await getCfg(interaction.guild.id);
      const wallet = await Wallet.getOrCreate(interaction.user.id, interaction.guild.id);
      const raw    = interaction.options.getString("amount");
      const amount = raw === "all" ? wallet.bank : parseInt(raw);

      if (!amount || isNaN(amount) || amount <= 0) return interaction.reply({ content: "❌ Invalid amount.", ephemeral: true });
      if (amount > wallet.bank) return interaction.reply({ content: `❌ Your bank only has **${wallet.bank.toLocaleString()}**.`, ephemeral: true });

      wallet.bank    -= amount;
      wallet.balance += amount;
      await wallet.save();
      await logTx(interaction.guild.id, interaction.user.id, "withdraw", amount, wallet.balance, `Withdrew from bank`);

      await interaction.reply({ embeds: [
        econEmbed(0x3B82F6).setTitle("🏦 Withdrawn")
          .addFields(
            { name: "💰 Withdrawn", value: `${amount.toLocaleString()} ${cfg.coinName}`, inline: true },
            { name: "💳 Wallet",    value: `${wallet.balance.toLocaleString()} ${cfg.coinName}`, inline: true },
            { name: "🏦 Bank",      value: `${wallet.bank.toLocaleString()} ${cfg.coinName}`, inline: true },
          ),
      ] });
    },
  },

  // /shop
  {
    data: new SlashCommandBuilder().setName("shop").setDescription("Browse the server shop."),
    async execute(interaction) {
      const cfg   = await getCfg(interaction.guild.id);
      const items = await ShopItem.find({ guildId: interaction.guild.id, enabled: true }).sort({ sortOrder: 1, price: 1 });
      if (!items.length) return interaction.reply({ embeds: [econEmbed().setDescription("🛍️ The shop is empty.")], ephemeral: true });

      const lines = items.map((item, i) =>
        `**${i+1}.** ${item.emoji} **${item.name}** — ${item.price.toLocaleString()} ${cfg.coinName}\n> ${item.description || "No description"}${item.stock > 0 ? ` · Stock: ${item.stock - item.sold}` : ""}`
      ).join("\n\n");

      await interaction.reply({ embeds: [
        econEmbed().setTitle(`${cfg.coinEmoji} ${interaction.guild.name} Shop`).setDescription(lines)
          .setFooter({ text: `Use /buy <name> to purchase • Hazel Economy` }),
      ] });
    },
  },

  // /buy
  {
    data: new SlashCommandBuilder()
      .setName("buy").setDescription("Buy an item from the shop.")
      .addStringOption(o => o.setName("item").setDescription("Item name to buy").setRequired(true)),
    async execute(interaction) {
      const cfg  = await getCfg(interaction.guild.id);
      const name = interaction.options.getString("item");
      const item = await ShopItem.findOne({ guildId: interaction.guild.id, enabled: true, name: new RegExp(name, "i") });
      if (!item) return interaction.reply({ content: `❌ Item **${name}** not found.`, ephemeral: true });
      if (item.stock > 0 && item.sold >= item.stock) return interaction.reply({ content: "❌ Out of stock.", ephemeral: true });

      const wallet = await Wallet.getOrCreate(interaction.user.id, interaction.guild.id);
      if (wallet.balance < item.price) return interaction.reply({ content: `❌ Need **${item.price.toLocaleString()}** ${cfg.coinName}, you have **${wallet.balance.toLocaleString()}**.`, ephemeral: true });

      wallet.balance -= item.price; wallet.totalSpent += item.price;
      item.sold      += 1;
      await Promise.all([wallet.save(), item.save()]);
      await Inventory.create({ userId: interaction.user.id, guildId: interaction.guild.id, itemId: item._id, itemName: item.name });
      await logTx(interaction.guild.id, interaction.user.id, "shop", -item.price, wallet.balance, `Bought: ${item.name}`);

      if (item.type === "role" && item.roleId) {
        const role = interaction.guild.roles.cache.get(item.roleId);
        if (role) await interaction.member.roles.add(role).catch(() => null);
      }
      await checkWealthRoles(interaction.member, wallet, cfg);

      await interaction.reply({ embeds: [
        econEmbed(0x57F287).setTitle(`${item.emoji} Purchase Successful!`)
          .setDescription(`You bought **${item.name}** for **${item.price.toLocaleString()} ${cfg.coinName}**!`)
          .addFields({ name: "💰 Balance", value: `${wallet.balance.toLocaleString()} ${cfg.coinName}`, inline: true }),
      ] });
    },
  },

  // /inventory
  {
    data: new SlashCommandBuilder()
      .setName("inventory").setDescription("View your inventory.")
      .addUserOption(o => o.setName("user").setDescription("User to check").setRequired(false)),
    async execute(interaction) {
      const target = interaction.options.getMember("user") ?? interaction.member;
      const items  = await Inventory.find({ userId: target.id, guildId: interaction.guild.id });
      if (!items.length) return interaction.reply({ embeds: [econEmbed().setDescription(`📦 ${target.displayName} has an empty inventory.`)], ephemeral: true });

      const grouped = {};
      items.forEach(i => { grouped[i.itemName] = (grouped[i.itemName] ?? 0) + 1; });
      const lines = Object.entries(grouped).map(([name, qty]) => `• **${name}** ×${qty}`).join("\n");

      await interaction.reply({ embeds: [econEmbed().setTitle(`📦 ${target.displayName}'s Inventory`).setDescription(lines)] });
    },
  },

  // /leaderboard
  {
    data: new SlashCommandBuilder().setName("leaderboard").setDescription("View the richest members in this server."),
    async execute(interaction) {
      await interaction.deferReply();
      const cfg = await getCfg(interaction.guild.id);
      const top = await Wallet.find({ guildId: interaction.guild.id }).sort({ balance: -1 }).limit(10);
      if (!top.length) return interaction.editReply("📊 No economy data yet.");

      const medals = ["🥇","🥈","🥉"];
      const lines  = await Promise.all(top.map(async (w, i) => {
        const member = await interaction.guild.members.fetch(w.userId).catch(() => null);
        const name   = member?.displayName ?? `<@${w.userId}>`;
        return `${medals[i] ?? `**#${i+1}**`} ${name} — **${w.balance.toLocaleString()}** ${cfg.coinName}${w.secured ? " 🛡️" : ""}`;
      }));

      await interaction.editReply({ embeds: [
        econEmbed().setTitle(`${cfg.coinEmoji} ${interaction.guild.name} Leaderboard`).setDescription(lines.join("\n"))
          .setFooter({ text: "Richest members • Hazel Economy" }),
      ] });
    },
  },

  // /business
  {
    data: new SlashCommandBuilder()
      .setName("business").setDescription("View available businesses or your owned ones."),
    async execute(interaction) {
      const cfg    = await getCfg(interaction.guild.id);
      const owned  = await OwnedBusiness.find({ userId: interaction.user.id, guildId: interaction.guild.id });
      const ownedIds = owned.map(o => o.businessId);

      const lines = BUSINESS_TYPES.map(b => {
        const lvl1 = b.levels[0];
        const isOwned = ownedIds.includes(b.id);
        const o = owned.find(x => x.businessId === b.id);
        if (isOwned) {
          const lvlDef = b.levels[o.level - 1];
          return `${b.emoji} **${b.name}** — Level ${o.level}/3 · ${lvlDef.income.toLocaleString()} ${cfg.coinName}/collect`;
        }
        return `${b.emoji} **${b.name}** — ${lvl1.price.toLocaleString()} ${cfg.coinName} · ${lvl1.income.toLocaleString()}/hr`;
      });

      await interaction.reply({ embeds: [
        econEmbed().setTitle("🏢 Businesses")
          .setDescription(lines.join("\n\n"))
          .addFields({ name: "How to buy", value: "`/buy-business <name>`", inline: true })
          .setFooter({ text: "Use /collect and /upgrade to manage owned businesses • Hazel Economy" }),
      ] });
    },
  },

  // /buy-business
  {
    data: new SlashCommandBuilder()
      .setName("buy-business").setDescription("Purchase a business.")
      .addStringOption(o => {
        const opt = o.setName("business").setDescription("Business to buy").setRequired(true);
        BUSINESS_TYPES.forEach(b => opt.addChoices({ name: `${b.emoji} ${b.name}`, value: b.id }));
        return opt;
      }),
    async execute(interaction) {
      const businessId = interaction.options.getString("business");
      const result = await buyBusiness(interaction.user.id, interaction.guild.id, businessId);
      if (!result.success) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });

      const cfg = await getCfg(interaction.guild.id);
      await interaction.reply({ embeds: [
        econEmbed(0x57F287)
          .setTitle(`${result.bizDef.emoji} Business Purchased!`)
          .setDescription(`You now own **${result.bizDef.name}** (Level 1)!`)
          .addFields(
            { name: "💰 Income",    value: `${result.lvlDef.income.toLocaleString()} ${cfg.coinName} per collect`, inline: true },
            { name: "⏰ Cooldown",  value: `${result.lvlDef.cooldownHrs}h`,                                         inline: true },
            { name: "💳 Balance",   value: `${result.wallet.balance.toLocaleString()} ${cfg.coinName}`,             inline: true },
          ),
      ] });
    },
  },

  // /collect
  {
    data: new SlashCommandBuilder()
      .setName("collect").setDescription("Collect income from a business.")
      .addStringOption(o => {
        const opt = o.setName("business").setDescription("Business to collect from").setRequired(true);
        BUSINESS_TYPES.forEach(b => opt.addChoices({ name: `${b.emoji} ${b.name}`, value: b.id }));
        return opt;
      }),
    async execute(interaction) {
      const businessId = interaction.options.getString("business");
      const result = await collectBusiness(interaction.user.id, interaction.guild.id, businessId);
      if (!result.success) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });

      const cfg = await getCfg(interaction.guild.id);
      await checkWealthRoles(interaction.member, result.wallet, cfg);
      await interaction.reply({ embeds: [
        econEmbed(0xF59E0B)
          .setTitle(`${result.bizDef.emoji} Income Collected!`)
          .setDescription(`Collected **${result.income.toLocaleString()} ${cfg.coinName}** from your **${result.bizDef.name}**!`)
          .addFields(
            { name: "💰 Income",      value: `${result.income.toLocaleString()} ${cfg.coinName}`, inline: true },
            { name: "⏰ Next Collect", value: `in ${result.lvlDef.cooldownHrs}h`,                  inline: true },
            { name: "💳 Balance",     value: `${result.wallet.balance.toLocaleString()} ${cfg.coinName}`, inline: true },
          ),
      ] });
    },
  },

  // /upgrade
  {
    data: new SlashCommandBuilder()
      .setName("upgrade").setDescription("Upgrade a business to the next level.")
      .addStringOption(o => {
        const opt = o.setName("business").setDescription("Business to upgrade").setRequired(true);
        BUSINESS_TYPES.forEach(b => opt.addChoices({ name: `${b.emoji} ${b.name}`, value: b.id }));
        return opt;
      }),
    async execute(interaction) {
      const businessId = interaction.options.getString("business");
      const result = await upgradeBusiness(interaction.user.id, interaction.guild.id, businessId);
      if (!result.success) return interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });

      const cfg = await getCfg(interaction.guild.id);
      await interaction.reply({ embeds: [
        econEmbed(0xA855F7)
          .setTitle(`${result.bizDef.emoji} Business Upgraded!`)
          .setDescription(`**${result.bizDef.name}** is now Level **${result.biz.level}**!`)
          .addFields(
            { name: "💰 New Income",   value: `${result.nextLvlDef.income.toLocaleString()} ${cfg.coinName}/collect`, inline: true },
            { name: "⏰ New Cooldown", value: `${result.nextLvlDef.cooldownHrs}h`,                                      inline: true },
            { name: "💳 Balance",      value: `${result.wallet.balance.toLocaleString()} ${cfg.coinName}`,              inline: true },
          ),
      ] });
    },
  },

  // /market
  {
    data: new SlashCommandBuilder()
      .setName("market").setDescription("View live market prices for stocks, crypto, and commodities."),
    async execute(interaction) {
      await interaction.deferReply();
      const prices = await getAllPrices();

      const stocks     = prices.filter(p => p.type === "stock");
      const crypto     = prices.filter(p => p.type === "crypto");
      const commodities= prices.filter(p => p.type === "commodity");

      const fmt = (p) => {
        const arrow = p.changePct >= 0 ? "▲" : "▼";
        const color = p.changePct >= 0 ? "+" : "";
        return `${p.emoji} **${p.name}** (${p.symbol})\n> $${p.price.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${arrow} ${color}${p.changePct.toFixed(2)}%`;
      };

      await interaction.editReply({ embeds: [
        econEmbed()
          .setTitle("📈 Live Market Prices")
          .addFields(
            { name: "📊 Stocks",      value: stocks.map(fmt).join("\n\n"),      inline: false },
            { name: "₿ Crypto",       value: crypto.map(fmt).join("\n\n"),      inline: false },
            { name: "🏅 Commodities", value: commodities.map(fmt).join("\n\n"), inline: false },
          )
          .setFooter({ text: "Prices update every 60s • 2hr hold • 7% profit tax • Hazel Economy" }),
      ] });
    },
  },

  // /invest
  {
    data: new SlashCommandBuilder()
      .setName("invest").setDescription("Invest coins in a stock, crypto, or commodity.")
      .addStringOption(o => o.setName("symbol").setDescription("Ticker symbol (e.g. AAPL, BTC, XAU)").setRequired(true))
      .addIntegerOption(o => o.setName("shares").setDescription("Number of shares/units to buy").setRequired(true).setMinValue(1)),
    async execute(interaction) {
      const cfg    = await getCfg(interaction.guild.id);
      const symbol = interaction.options.getString("symbol").toUpperCase();
      const shares = interaction.options.getInteger("shares");

      const market = await getPrice(symbol);
      if (!market) return interaction.reply({ content: `❌ Symbol **${symbol}** not found. Use \`/market\` to see available symbols.`, ephemeral: true });

      const totalCost = Math.floor(market.price * shares);
      const wallet    = await Wallet.getOrCreate(interaction.user.id, interaction.guild.id);

      if (wallet.balance < totalCost)
        return interaction.reply({ content: `❌ You need **${totalCost.toLocaleString()} ${cfg.coinName}** but have **${wallet.balance.toLocaleString()}**.`, ephemeral: true });

      wallet.balance   -= totalCost;
      wallet.totalSpent += totalCost;
      await wallet.save();

      const canSellAt = new Date(Date.now() + HOLD_MS);
      await Investment.create({
        userId: interaction.user.id, guildId: interaction.guild.id,
        symbol, name: market.name, type: market.type, emoji: market.emoji,
        shares, buyPrice: market.price, totalCost,
        boughtAt: new Date(), canSellAt,
      });

      await logTx(interaction.guild.id, interaction.user.id, "invest_buy", -totalCost, wallet.balance, `Bought ${shares}x ${symbol} @ $${market.price.toFixed(2)}`);
      await checkWealthRoles(interaction.member, wallet, cfg);

      await interaction.reply({ embeds: [
        econEmbed(0x2DD4BF)
          .setTitle(`${market.emoji} Investment Made!`)
          .setDescription(`Bought **${shares}** unit${shares !== 1 ? "s" : ""} of **${market.name}** (${symbol})`)
          .addFields(
            { name: "💵 Buy Price",  value: `$${market.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, inline: true },
            { name: "💰 Total Cost", value: `${totalCost.toLocaleString()} ${cfg.coinName}`, inline: true },
            { name: "⏰ Can Sell",   value: `<t:${Math.floor(canSellAt.getTime() / 1000)}:R>`, inline: true },
            { name: "📋 Note",       value: "7% tax applies on profits when you sell.", inline: false },
          ),
      ] });
    },
  },

  // /sell
  {
    data: new SlashCommandBuilder()
      .setName("sell").setDescription("Sell an active investment.")
      .addStringOption(o => o.setName("symbol").setDescription("Ticker symbol to sell").setRequired(true)),
    async execute(interaction) {
      const cfg    = await getCfg(interaction.guild.id);
      const symbol = interaction.options.getString("symbol").toUpperCase();

      const investments = await Investment.find({
        userId: interaction.user.id, guildId: interaction.guild.id,
        symbol, sold: false,
      }).sort({ boughtAt: 1 });

      if (!investments.length)
        return interaction.reply({ content: `❌ You have no active investment in **${symbol}**.`, ephemeral: true });

      const inv = investments[0];
      if (Date.now() < inv.canSellAt.getTime()) {
        const left = inv.canSellAt.getTime() - Date.now();
        return interaction.reply({ content: `⏰ You must hold this investment for **${fmtMs(left)}** before selling.`, ephemeral: true });
      }

      const market   = await getPrice(symbol);
      const curPrice = market?.price ?? inv.buyPrice;
      const revenue  = Math.floor(curPrice * inv.shares);
      const profit   = revenue - inv.totalCost;
      const tax      = profit > 0 ? Math.floor(profit * (TAX_PCT / 100)) : 0;
      const payout   = revenue - tax;

      const wallet = await Wallet.getOrCreate(interaction.user.id, interaction.guild.id);
      wallet.balance     += payout;
      wallet.totalEarned += Math.max(0, profit - tax);
      await wallet.save();

      inv.sold      = true;
      inv.sellPrice = curPrice;
      inv.soldAt    = new Date();
      inv.profit    = profit - tax;
      inv.taxPaid   = tax;
      await inv.save();

      await logTx(interaction.guild.id, interaction.user.id, "invest_sell", payout, wallet.balance, `Sold ${inv.shares}x ${symbol} @ $${curPrice.toFixed(2)}, profit: ${profit - tax}, tax: ${tax}`);
      await checkWealthRoles(interaction.member, wallet, cfg);

      const isProfit = profit >= 0;
      await interaction.reply({ embeds: [
        econEmbed(isProfit ? 0x57F287 : 0xED4245)
          .setTitle(`${market?.emoji ?? "📈"} Investment Sold!`)
          .setDescription(`Sold **${inv.shares}** unit${inv.shares !== 1 ? "s" : ""} of **${inv.name}** (${symbol})`)
          .addFields(
            { name: "💵 Sell Price",   value: `$${curPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, inline: true },
            { name: isProfit ? "📈 Profit" : "📉 Loss", value: `${(profit - tax).toLocaleString()} ${cfg.coinName}`, inline: true },
            { name: "🧾 Tax (7%)",     value: `${tax.toLocaleString()} ${cfg.coinName}`, inline: true },
            { name: "💰 Payout",       value: `${payout.toLocaleString()} ${cfg.coinName}`, inline: true },
            { name: "💳 New Balance",  value: `${wallet.balance.toLocaleString()} ${cfg.coinName}`, inline: true },
          ),
      ] });
    },
  },

  // /portfolio
  {
    data: new SlashCommandBuilder().setName("portfolio").setDescription("View all your active investments."),
    async execute(interaction) {
      await interaction.deferReply();
      const cfg         = await getCfg(interaction.guild.id);
      const investments = await Investment.find({ userId: interaction.user.id, guildId: interaction.guild.id, sold: false });

      if (!investments.length) return interaction.editReply({ embeds: [econEmbed().setDescription("📭 You have no active investments. Use `/invest` to start!")] });

      const prices = await getAllPrices();
      const priceMap = {};
      prices.forEach(p => { priceMap[p.symbol] = p; });

      const lines = investments.map(inv => {
        const cur       = priceMap[inv.symbol]?.price ?? inv.buyPrice;
        const curVal    = Math.floor(cur * inv.shares);
        const profit    = curVal - inv.totalCost;
        const pct       = ((profit / inv.totalCost) * 100).toFixed(2);
        const canSell   = Date.now() >= inv.canSellAt.getTime();
        const holdLeft  = canSell ? "✅ Ready to sell" : `⏰ ${fmtMs(inv.canSellAt.getTime() - Date.now())}`;
        const arrow     = profit >= 0 ? "▲" : "▼";
        return `${inv.emoji} **${inv.name}** (${inv.symbol}) — ${inv.shares} units\n> Cost: ${inv.totalCost.toLocaleString()} · Value: ${curVal.toLocaleString()} · ${arrow} ${profit >= 0 ? "+" : ""}${profit.toLocaleString()} (${pct}%)\n> ${holdLeft}`;
      });

      await interaction.editReply({ embeds: [
        econEmbed()
          .setTitle("📊 Your Portfolio")
          .setDescription(lines.join("\n\n"))
          .setFooter({ text: "7% tax on profits when selling • Hazel Economy" }),
      ] });
    },
  },
];

// ── Register all commands with client ─────────────────────────
function registerEconomyCommands(client) {
  for (const cmd of commands) {
    client.commands.set(cmd.data.name, cmd);
  }
}

module.exports = { commands, registerEconomyCommands };
