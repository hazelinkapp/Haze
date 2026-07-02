// ============================================================
//  dashboard.js — Hazel Express Backend v2
//  Full API: economy · business · investments · shop · access
// ============================================================

const express  = require("express");
const path     = require("path");
const mongoose = require("mongoose");

const { attachAuthRoutes, requireAuth, requireAdmin, requireApproved } = require("./auth");
const { ModerationAction } = require("./moderation");
const {
  Wallet, ShopItem, Inventory, Transaction,
  OwnedBusiness, Investment, WealthRole,
  EconConfig, AccessControl, ChatShortcut,
  BUSINESS_TYPES, STOCK_LIST,
} = require("./database/economy");
const { getAllPrices, getPrice, HOLD_MS, TAX_PCT } = require("./features/investmentSystem");
const { checkWealthRoles, getCfg } = require("./features/economySystem");

const app    = express();
const PORT   = process.env.PORT ?? 3000;
const PUBLIC = path.join(__dirname, "public");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/static", express.static(PUBLIC));

// ── Helpers ───────────────────────────────────────────────────
function paginate(total, page, limit) {
  return { total, page, limit, pages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 };
}
function pageParams(q) {
  return { page: Math.max(1, parseInt(q.page ?? "1")), limit: Math.min(100, parseInt(q.limit ?? "25")) };
}
function fmtUptime(ms) {
  if (!ms) return "0s";
  const s = Math.floor(ms/1000), m = Math.floor(s/60), h = Math.floor(m/60), d = Math.floor(h/24);
  if (d) return `${d}d ${h%24}h`; if (h) return `${h}h ${m%60}m`; if (m) return `${m}m`; return `${s}s`;
}

function startDashboard(client) {

  attachAuthRoutes(app, client);

  // ── SPAs ──────────────────────────────────────────────────
  app.get(["/bots/dashboard", "/bots/hazel/dashboard"], requireAuth, requireApproved, (req, res) =>
    res.sendFile(path.join(PUBLIC, "dashboard.html")));
  app.get(["/bots/admin", "/bots/hazel/admin"], requireAuth, requireAdmin, (req, res) =>
    res.sendFile(path.join(PUBLIC, "admin.html")));

  app.use("/bots/api", (req, res, next) => {
    req.url = `/bots/hazel/api${req.url}`;
    next();
  });

  // ══════════════════════════════════════════════════════════
  //  SHARED
  // ══════════════════════════════════════════════════════════

  app.get("/bots/hazel/api/me", requireAuth, (req, res) => {
    const { discordId, username, avatar, role, approved, isOwner } = req.user;
    res.json({ discordId, username, avatar, role, approved, isOwner });
  });

  app.get("/bots/hazel/api/stats", requireAuth, requireApproved, async (req, res) => {
    try {
      const [total, bans, kicks, mutes, warns, totalWallets, totalInvest, totalBiz] = await Promise.all([
        ModerationAction.countDocuments(),
        ModerationAction.countDocuments({ action: "ban" }),
        ModerationAction.countDocuments({ action: "kick" }),
        ModerationAction.countDocuments({ action: "mute" }),
        ModerationAction.countDocuments({ action: "warn" }),
        Wallet.countDocuments(),
        Investment.countDocuments({ sold: false }),
        OwnedBusiness.countDocuments(),
      ]);
      res.json({
        bot: {
          name: "Hazel", tag: client.user?.tag ?? "Hazel#0000",
          avatar: client.user?.displayAvatarURL({ size: 128 }) ?? "",
          guilds: client.guilds?.cache?.size ?? 0,
          users:  client.users?.cache?.size  ?? 0,
          ping:   client.ws?.ping            ?? 0,
          uptime: fmtUptime(client.uptime),
          status: client.isReady() ? "online" : "offline",
        },
        moderation: { total, bans, kicks, mutes, warns },
        economy:    { totalWallets, totalInvest, totalBiz },
        db: { connected: mongoose.connection.readyState === 1 },
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get("/bots/hazel/api/guilds", requireAuth, requireApproved, (req, res) => {
    res.json(client.guilds?.cache?.map(g => ({
      id: g.id, name: g.name, icon: g.iconURL({ size: 64 }), memberCount: g.memberCount,
    })) ?? []);
  });

  app.get("/bots/hazel/api/admin/channels/:guildId", requireAuth, requireAdmin, (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: "Guild not found" });
    res.json(guild.channels.cache.filter(c => c.isTextBased())
      .map(c => ({ id: c.id, name: c.name })).sort((a,b) => a.name.localeCompare(b.name)));
  });

  app.get("/bots/hazel/api/admin/roles/:guildId", requireAuth, requireAdmin, (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).json({ error: "Guild not found" });
    res.json(guild.roles.cache.filter(r => r.id !== guild.id)
      .map(r => ({ id: r.id, name: r.name, color: r.hexColor, position: r.position }))
      .sort((a,b) => b.position - a.position));
  });

  // ══════════════════════════════════════════════════════════
  //  MODERATION
  // ══════════════════════════════════════════════════════════

  app.get("/bots/hazel/api/modlogs", requireAuth, requireApproved, async (req, res) => {
    try {
      const { page, limit } = pageParams(req.query);
      const filter = {};
      if (req.query.action)  filter.action  = req.query.action;
      if (req.query.guildId) filter.guildId = req.query.guildId;
      if (req.query.userId)  filter.$or = [{ targetId: req.query.userId }, { moderatorId: req.query.userId }];
      const [records, total] = await Promise.all([
        ModerationAction.find(filter).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit),
        ModerationAction.countDocuments(filter),
      ]);
      res.json({ records, pagination: paginate(total, page, limit) });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/bots/hazel/api/modlogs/:id", requireAuth, requireAdmin, async (req, res) => {
    try { await ModerationAction.findByIdAndDelete(req.params.id); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post("/bots/hazel/api/admin/action", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { guildId, action, targetId, reason, duration } = req.body;
      const guild  = client.guilds.cache.get(guildId);
      if (!guild) return res.status(404).json({ error: "Guild not found" });
      const member = await guild.members.fetch(targetId).catch(() => null);
      const { parseDuration } = require("./moderation");

      if (action === "ban")    await guild.members.ban(targetId, { reason });
      if (action === "kick"   && member) await member.kick(reason);
      if (action === "mute"   && member) await member.timeout(parseDuration(duration ?? "10m"), reason);
      if (action === "unmute" && member) await member.timeout(null);
      if (action === "unban")  await guild.bans.remove(targetId, reason).catch(() => null);

      const record = await ModerationAction.create({
        guildId, guildName: guild.name, action,
        targetId, targetTag: member?.user?.tag ?? targetId,
        moderatorId: req.user.discordId, moderatorTag: req.user.username,
        reason: reason ?? "No reason provided.", duration: duration ?? null,
      });
      res.json({ success: true, caseNumber: record.caseNumber });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post("/bots/hazel/api/admin/send", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { guildId, channelId, type, content, embed: ed } = req.body;
      const channel = client.guilds.cache.get(guildId)?.channels.cache.get(channelId);
      if (!channel) return res.status(404).json({ error: "Channel not found" });
      const payload = {};
      if (content) payload.content = content;
      if (type === "embed" && ed) {
        const { EmbedBuilder } = require("discord.js");
        const e = new EmbedBuilder();
        if (ed.title)       e.setTitle(ed.title);
        if (ed.description) e.setDescription(ed.description);
        if (ed.color)       e.setColor(ed.color);
        if (ed.image)       e.setImage(ed.image);
        if (ed.thumbnail)   e.setThumbnail(ed.thumbnail);
        if (ed.footer)      e.setFooter({ text: ed.footer });
        if (ed.fields?.length) e.addFields(ed.fields);
        e.setTimestamp();
        payload.embeds = [e];
      }
      const msg = await channel.send(payload);
      res.json({ success: true, messageId: msg.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ══════════════════════════════════════════════════════════
  //  ECONOMY CONFIG
  // ══════════════════════════════════════════════════════════

  app.get("/bots/hazel/api/economy/config/:guildId", requireAuth, requireAdmin, async (req, res) => {
    try {
      let c = await EconConfig.findOne({ guildId: req.params.guildId });
      if (!c) c = await EconConfig.create({ guildId: req.params.guildId });
      res.json(c);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put("/bots/hazel/api/economy/config/:guildId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const c = await EconConfig.findOneAndUpdate(
        { guildId: req.params.guildId }, { $set: req.body }, { new: true, upsert: true });
      res.json(c);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ══════════════════════════════════════════════════════════
  //  WALLET + LEADERBOARD
  // ══════════════════════════════════════════════════════════

  app.get("/bots/hazel/api/economy/leaderboard/:guildId", requireAuth, requireApproved, async (req, res) => {
    try {
      const { page, limit } = pageParams(req.query);
      const [wallets, total] = await Promise.all([
        Wallet.find({ guildId: req.params.guildId }).sort({ balance: -1 }).skip((page-1)*limit).limit(limit),
        Wallet.countDocuments({ guildId: req.params.guildId }),
      ]);
      res.json({ wallets, pagination: paginate(total, page, limit) });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get("/bots/hazel/api/economy/wallet/:guildId/:userId", requireAuth, requireApproved, async (req, res) => {
    try {
      const w = await Wallet.getOrCreate(req.params.userId, req.params.guildId);
      res.json(w);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Admin: give/take coins + toggle secured
  app.post("/bots/hazel/api/economy/wallet/:guildId/:userId/adjust", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { amount, note } = req.body;
      const w = await Wallet.addBalance(req.params.userId, req.params.guildId, parseInt(amount));
      await Transaction.create({
        guildId: req.params.guildId, userId: req.params.userId,
        type: "admin", amount: parseInt(amount), balance: w.balance,
        note: note ?? `Admin adjustment by ${req.user.username}`,
      });

      // Check wealth roles after admin adjustment
      try {
        const guild  = client.guilds.cache.get(req.params.guildId);
        const member = guild ? await guild.members.fetch(req.params.userId).catch(() => null) : null;
        const cfg    = await getCfg(req.params.guildId);
        if (member) await checkWealthRoles(member, w, cfg);
      } catch (_) {}

      res.json({ success: true, balance: w.balance });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Toggle secured status
  app.post("/bots/hazel/api/economy/wallet/:guildId/:userId/secure", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { secured } = req.body;
      const w = await Wallet.findOneAndUpdate(
        { userId: req.params.userId, guildId: req.params.guildId },
        { $set: { secured: !!secured } },
        { new: true, upsert: true }
      );
      res.json({ success: true, secured: w.secured, userId: req.params.userId });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Dashboard daily claim (triggers actual daily reward)
  app.post("/bots/hazel/api/economy/daily/:guildId", requireAuth, requireApproved, async (req, res) => {
    try {
      const userId  = req.user.discordId;
      const guildId = req.params.guildId;
      const cfg     = await getCfg(guildId);
      const wallet  = await Wallet.getOrCreate(userId, guildId);

      const now  = Date.now();
      const cdMs = cfg.dailyCooldownHrs * 3_600_000;
      const last = wallet.lastDaily ? new Date(wallet.lastDaily).getTime() : 0;
      const left = Math.max(0, last + cdMs - now);

      if (left > 0) {
        return res.status(429).json({ error: "Cooldown active", cooldownMs: left });
      }

      const lastMs = wallet.lastDaily ? now - last : Infinity;
      const streak = lastMs < 48 * 3_600_000 ? (wallet.dailyStreak ?? 0) + 1 : 1;
      const bonus  = Math.min(streak - 1, 6) * Math.floor(cfg.dailyAmount * 0.1);
      const total  = cfg.dailyAmount + bonus;

      wallet.balance += total; wallet.totalEarned += total;
      wallet.lastDaily = new Date(); wallet.dailyStreak = streak;
      await wallet.save();

      await Transaction.create({
        guildId, userId, type: "daily",
        amount: total, balance: wallet.balance,
        note: `Daily reward (streak ${streak})`,
      });

      res.json({ success: true, earned: total, streak, bonus, balance: wallet.balance });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Dashboard deposit
  app.post("/bots/hazel/api/economy/deposit/:guildId", requireAuth, requireApproved, async (req, res) => {
    try {
      const { amount } = req.body;
      const userId = req.user.discordId;
      const wallet = await Wallet.getOrCreate(userId, req.params.guildId);
      const amt    = amount === "all" ? wallet.balance : parseInt(amount);
      if (!amt || amt <= 0 || amt > wallet.balance) return res.status(400).json({ error: "Invalid amount" });
      wallet.balance -= amt; wallet.bank += amt;
      await wallet.save();
      await Transaction.create({ guildId: req.params.guildId, userId, type: "deposit", amount: -amt, balance: wallet.balance, note: "Deposited to bank" });
      res.json({ success: true, balance: wallet.balance, bank: wallet.bank });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Dashboard withdraw
  app.post("/bots/hazel/api/economy/withdraw/:guildId", requireAuth, requireApproved, async (req, res) => {
    try {
      const { amount } = req.body;
      const userId = req.user.discordId;
      const wallet = await Wallet.getOrCreate(userId, req.params.guildId);
      const amt    = amount === "all" ? wallet.bank : parseInt(amount);
      if (!amt || amt <= 0 || amt > wallet.bank) return res.status(400).json({ error: "Invalid amount" });
      wallet.bank -= amt; wallet.balance += amt;
      await wallet.save();
      await Transaction.create({ guildId: req.params.guildId, userId, type: "withdraw", amount: amt, balance: wallet.balance, note: "Withdrawn from bank" });
      res.json({ success: true, balance: wallet.balance, bank: wallet.bank });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Transactions
  app.get("/bots/hazel/api/economy/transactions/:guildId", requireAuth, requireApproved, async (req, res) => {
    try {
      const { page, limit } = pageParams(req.query);
      const filter = { guildId: req.params.guildId };
      // Users can only see their own; admins can see all or filter by userId
      if (req.user.role !== "admin" && req.user.discordId !== process.env.OWNER_ID) {
        filter.userId = req.user.discordId;
      } else {
        if (req.query.userId) filter.userId = req.query.userId;
      }
      if (req.query.type) filter.type = req.query.type;
      const [records, total] = await Promise.all([
        Transaction.find(filter).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit),
        Transaction.countDocuments(filter),
      ]);
      res.json({ records, pagination: paginate(total, page, limit) });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ══════════════════════════════════════════════════════════
  //  MARKET + INVESTMENTS
  // ══════════════════════════════════════════════════════════

  app.get("/bots/hazel/api/market", requireAuth, requireApproved, async (req, res) => {
    try {
      const prices = await getAllPrices();
      res.json(prices);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get("/bots/hazel/api/portfolio/:guildId", requireAuth, requireApproved, async (req, res) => {
    try {
      const userId = req.query.userId ?? req.user.discordId;
      // Non-admins can only see their own portfolio
      if (userId !== req.user.discordId && req.user.role !== "admin" && req.user.discordId !== process.env.OWNER_ID)
        return res.status(403).json({ error: "Forbidden" });

      const investments = await Investment.find({ userId, guildId: req.params.guildId, sold: false });
      const prices      = await getAllPrices();
      const priceMap    = {};
      prices.forEach(p => { priceMap[p.symbol] = p; });

      const enriched = investments.map(inv => {
        const cur    = priceMap[inv.symbol]?.price ?? inv.buyPrice;
        const curVal = Math.floor(cur * inv.shares);
        const profit = curVal - inv.totalCost;
        const pct    = inv.totalCost > 0 ? (profit / inv.totalCost) * 100 : 0;
        const canSell = Date.now() >= inv.canSellAt.getTime();
        return {
          _id: inv._id, symbol: inv.symbol, name: inv.name,
          type: inv.type, emoji: inv.emoji, shares: inv.shares,
          buyPrice: inv.buyPrice, currentPrice: cur,
          totalCost: inv.totalCost, currentValue: curVal,
          profit, profitPct: pct, canSell,
          canSellAt: inv.canSellAt, boughtAt: inv.boughtAt,
        };
      });

      res.json(enriched);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Dashboard: buy investment
  app.post("/bots/hazel/api/invest/:guildId", requireAuth, requireApproved, async (req, res) => {
    try {
      const { symbol, shares } = req.body;
      const userId  = req.user.discordId;
      const guildId = req.params.guildId;
      const cfg     = await getCfg(guildId);

      const market = await getPrice(symbol?.toUpperCase());
      if (!market) return res.status(404).json({ error: "Symbol not found" });

      const totalCost = Math.floor(market.price * shares);
      const wallet    = await Wallet.getOrCreate(userId, guildId);
      if (wallet.balance < totalCost) return res.status(400).json({ error: `Insufficient balance. Need ${totalCost.toLocaleString()}` });

      wallet.balance   -= totalCost;
      wallet.totalSpent += totalCost;
      await wallet.save();

      const canSellAt = new Date(Date.now() + HOLD_MS);
      const inv = await Investment.create({
        userId, guildId, symbol: market.symbol, name: market.name,
        type: market.type, emoji: market.emoji, shares,
        buyPrice: market.price, totalCost, canSellAt,
      });

      await Transaction.create({ guildId, userId, type: "invest_buy", amount: -totalCost, balance: wallet.balance, note: `Bought ${shares}x ${symbol}` });
      res.json({ success: true, investment: inv, balance: wallet.balance });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Dashboard: sell investment
  app.post("/bots/hazel/api/sell/:guildId/:investmentId", requireAuth, requireApproved, async (req, res) => {
    try {
      const userId = req.user.discordId;
      const inv    = await Investment.findOne({ _id: req.params.investmentId, userId, sold: false });
      if (!inv) return res.status(404).json({ error: "Investment not found" });
      if (Date.now() < inv.canSellAt.getTime()) return res.status(400).json({ error: "Still in holding period", canSellAt: inv.canSellAt });

      const cfg      = await getCfg(req.params.guildId);
      const market   = await getPrice(inv.symbol);
      const curPrice = market?.price ?? inv.buyPrice;
      const revenue  = Math.floor(curPrice * inv.shares);
      const profit   = revenue - inv.totalCost;
      const tax      = profit > 0 ? Math.floor(profit * (TAX_PCT / 100)) : 0;
      const payout   = revenue - tax;

      const wallet = await Wallet.getOrCreate(userId, req.params.guildId);
      wallet.balance     += payout;
      wallet.totalEarned += Math.max(0, profit - tax);
      await wallet.save();

      inv.sold = true; inv.sellPrice = curPrice; inv.soldAt = new Date();
      inv.profit = profit - tax; inv.taxPaid = tax;
      await inv.save();

      await Transaction.create({ guildId: req.params.guildId, userId, type: "invest_sell", amount: payout, balance: wallet.balance, note: `Sold ${inv.shares}x ${inv.symbol}` });

      try {
        const guild  = client.guilds.cache.get(req.params.guildId);
        const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;
        if (member) await checkWealthRoles(member, wallet, cfg);
      } catch (_) {}

      res.json({ success: true, payout, profit: profit - tax, tax, balance: wallet.balance });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Sold investment history
  app.get("/bots/hazel/api/investments/history/:guildId", requireAuth, requireApproved, async (req, res) => {
    try {
      const { page, limit } = pageParams(req.query);
      const userId = req.user.discordId;
      const [records, total] = await Promise.all([
        Investment.find({ userId, guildId: req.params.guildId, sold: true }).sort({ soldAt: -1 }).skip((page-1)*limit).limit(limit),
        Investment.countDocuments({ userId, guildId: req.params.guildId, sold: true }),
      ]);
      res.json({ records, pagination: paginate(total, page, limit) });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ══════════════════════════════════════════════════════════
  //  BUSINESSES
  // ══════════════════════════════════════════════════════════

  app.get("/bots/hazel/api/businesses/:guildId", requireAuth, requireApproved, async (req, res) => {
    try {
      const userId  = req.query.userId ?? req.user.discordId;
      const owned   = await OwnedBusiness.find({ userId, guildId: req.params.guildId });
      const prices  = BUSINESS_TYPES;
      const result  = prices.map(b => {
        const own = owned.find(o => o.businessId === b.id);
        const lvlDef = own ? b.levels[own.level - 1] : b.levels[0];
        const cdLeft = own?.lastCollect
          ? Math.max(0, new Date(own.lastCollect).getTime() + lvlDef.cooldownHrs * 3_600_000 - Date.now())
          : 0;
        return {
          ...b,
          owned: !!own,
          level: own?.level ?? 0,
          lastCollect: own?.lastCollect ?? null,
          totalEarned: own?.totalEarned ?? 0,
          boughtAt: own?.boughtAt ?? null,
          cdLeft,
          ready: own ? cdLeft === 0 : false,
          currentLvlDef: lvlDef,
          nextLvlDef: own && own.level < 3 ? b.levels[own.level] : null,
        };
      });
      res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Dashboard collect business income
  app.post("/bots/hazel/api/businesses/:guildId/collect", requireAuth, requireApproved, async (req, res) => {
    try {
      const { businessId } = req.body;
      const { collectBusiness } = require("./features/businessSystem");
      const result = await collectBusiness(req.user.discordId, req.params.guildId, businessId);
      if (!result.success) return res.status(400).json({ error: result.error });

      const cfg = await getCfg(req.params.guildId);
      try {
        const guild  = client.guilds.cache.get(req.params.guildId);
        const member = guild ? await guild.members.fetch(req.user.discordId).catch(() => null) : null;
        if (member) await checkWealthRoles(member, result.wallet, cfg);
      } catch (_) {}

      res.json({ success: true, income: result.income, balance: result.wallet.balance });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ══════════════════════════════════════════════════════════
  //  SHOP
  // ══════════════════════════════════════════════════════════

  app.get("/bots/hazel/api/shop/:guildId", requireAuth, requireApproved, async (req, res) => {
    try { res.json(await ShopItem.find({ guildId: req.params.guildId }).sort({ sortOrder: 1, price: 1 })); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post("/bots/hazel/api/shop/:guildId", requireAuth, requireAdmin, async (req, res) => {
    try { res.json(await ShopItem.create({ guildId: req.params.guildId, ...req.body })); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put("/bots/hazel/api/shop/:guildId/:itemId", requireAuth, requireAdmin, async (req, res) => {
    try { res.json(await ShopItem.findByIdAndUpdate(req.params.itemId, { $set: req.body }, { new: true })); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/bots/hazel/api/shop/:guildId/:itemId", requireAuth, requireAdmin, async (req, res) => {
    try { await ShopItem.findByIdAndDelete(req.params.itemId); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ══════════════════════════════════════════════════════════
  //  WEALTH ROLES
  // ══════════════════════════════════════════════════════════

  app.get("/bots/hazel/api/wealth-roles/:guildId", requireAuth, requireAdmin, async (req, res) => {
    try { res.json(await WealthRole.find({ guildId: req.params.guildId }).sort({ threshold: 1 })); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });
  app.post("/bots/hazel/api/wealth-roles/:guildId", requireAuth, requireAdmin, async (req, res) => {
    try { res.json(await WealthRole.create({ guildId: req.params.guildId, ...req.body })); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });
  app.put("/bots/hazel/api/wealth-roles/:guildId/:id", requireAuth, requireAdmin, async (req, res) => {
    try { res.json(await WealthRole.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true })); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });
  app.delete("/bots/hazel/api/wealth-roles/:guildId/:id", requireAuth, requireAdmin, async (req, res) => {
    try { await WealthRole.findByIdAndDelete(req.params.id); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ══════════════════════════════════════════════════════════
  //  SHORTCUTS
  // ══════════════════════════════════════════════════════════

  app.get("/bots/hazel/api/shortcuts/:guildId", requireAuth, requireAdmin, async (req, res) => {
    try { res.json(await ChatShortcut.find({ guildId: req.params.guildId })); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });
  app.post("/bots/hazel/api/shortcuts/:guildId", requireAuth, requireAdmin, async (req, res) => {
    try { res.json(await ChatShortcut.create({ guildId: req.params.guildId, ...req.body })); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });
  app.put("/bots/hazel/api/shortcuts/:guildId/:id", requireAuth, requireAdmin, async (req, res) => {
    try { res.json(await ChatShortcut.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true })); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });
  app.delete("/bots/hazel/api/shortcuts/:guildId/:id", requireAuth, requireAdmin, async (req, res) => {
    try { await ChatShortcut.findByIdAndDelete(req.params.id); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ══════════════════════════════════════════════════════════
  //  ACCESS CONTROL
  // ══════════════════════════════════════════════════════════

  app.get("/bots/hazel/api/access", requireAuth, requireAdmin, async (req, res) => {
    try {
      const { page, limit } = pageParams(req.query);
      const filter = {};
      if (req.query.role) filter.role = req.query.role;
      if (req.query.approved !== undefined) filter.approved = req.query.approved === "true";
      const [users, total] = await Promise.all([
        AccessControl.find(filter).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit),
        AccessControl.countDocuments(filter),
      ]);
      res.json({ users, pagination: paginate(total, page, limit) });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.put("/bots/hazel/api/access/:userId", requireAuth, requireAdmin, async (req, res) => {
    try {
      const u = await AccessControl.findOneAndUpdate(
        { discordId: req.params.userId }, { $set: req.body }, { new: true });
      res.json(u);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/bots/hazel/api/access/:userId", requireAuth, requireAdmin, async (req, res) => {
    try { await AccessControl.findOneAndDelete({ discordId: req.params.userId }); res.json({ success: true }); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── 404 ───────────────────────────────────────────────────
  app.use("/bots/hazel", (req, res) => res.status(404).json({ error: "Not found" }));

  app.listen(PORT, () => {
    console.log(`[Dashboard] http://localhost:${PORT}/bots/dashboard`);
    console.log(`[Dashboard] Admin   → http://localhost:${PORT}/bots/hazel/admin`);
  });
}

module.exports = { startDashboard, app };
