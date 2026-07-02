// ============================================================
//  features/businessSystem/index.js
//  Buy · Collect · Upgrade · Passive income
// ============================================================

const { OwnedBusiness, Wallet, Transaction, BUSINESS_TYPES } = require("../../database/economy");
const logger = require("../../utils/logger");

function getBizDef(id) {
  return BUSINESS_TYPES.find(b => b.id === id) ?? null;
}

function getLevelDef(bizDef, level) {
  return bizDef?.levels?.[level - 1] ?? null;
}

function cooldownLeft(lastCollect, cooldownHrs) {
  if (!lastCollect) return 0;
  const next = new Date(lastCollect).getTime() + cooldownHrs * 3_600_000;
  return Math.max(0, next - Date.now());
}

function fmtMs(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ── Buy a business ────────────────────────────────────────────
async function buyBusiness(userId, guildId, businessId) {
  const bizDef = getBizDef(businessId);
  if (!bizDef) return { success: false, error: "Invalid business type." };

  const existing = await OwnedBusiness.findOne({ userId, guildId, businessId });
  if (existing) return { success: false, error: `You already own a **${bizDef.name}**! Upgrade it with \`/upgrade\`.` };

  const lvlDef = getLevelDef(bizDef, 1);
  const wallet = await Wallet.getOrCreate(userId, guildId);

  if (wallet.balance < lvlDef.price)
    return { success: false, error: `You need **${lvlDef.price.toLocaleString()}** coins but only have **${wallet.balance.toLocaleString()}**.` };

  wallet.balance   -= lvlDef.price;
  wallet.totalSpent += lvlDef.price;
  await wallet.save();

  const biz = await OwnedBusiness.create({ userId, guildId, businessId, level: 1 });

  await Transaction.create({
    guildId, userId, type: "business",
    amount: -lvlDef.price, balance: wallet.balance,
    note: `Bought ${bizDef.name} (L1)`,
  });

  return { success: true, business: biz, bizDef, lvlDef, wallet };
}

// ── Collect income ────────────────────────────────────────────
async function collectBusiness(userId, guildId, businessId) {
  const bizDef = getBizDef(businessId);
  if (!bizDef) return { success: false, error: "Invalid business." };

  const biz = await OwnedBusiness.findOne({ userId, guildId, businessId });
  if (!biz) return { success: false, error: `You don't own a **${bizDef.name}**.` };

  const lvlDef = getLevelDef(bizDef, biz.level);
  const cdLeft = cooldownLeft(biz.lastCollect, lvlDef.cooldownHrs);

  if (cdLeft > 0)
    return { success: false, error: `Your **${bizDef.name}** isn't ready yet! Collect again in **${fmtMs(cdLeft)}**.` };

  const income = lvlDef.income;
  const wallet = await Wallet.getOrCreate(userId, guildId);
  wallet.balance    += income;
  wallet.totalEarned += income;
  await wallet.save();

  biz.lastCollect = new Date();
  biz.totalEarned += income;
  await biz.save();

  await Transaction.create({
    guildId, userId, type: "business",
    amount: income, balance: wallet.balance,
    note: `Collected from ${bizDef.name} (L${biz.level})`,
  });

  return { success: true, income, bizDef, biz, lvlDef, wallet };
}

// ── Upgrade business ──────────────────────────────────────────
async function upgradeBusiness(userId, guildId, businessId) {
  const bizDef = getBizDef(businessId);
  if (!bizDef) return { success: false, error: "Invalid business." };

  const biz = await OwnedBusiness.findOne({ userId, guildId, businessId });
  if (!biz) return { success: false, error: `You don't own a **${bizDef.name}**.` };

  if (biz.level >= 3)
    return { success: false, error: `Your **${bizDef.name}** is already at max level (Level 3)!` };

  const nextLevel  = biz.level + 1;
  const nextLvlDef = getLevelDef(bizDef, nextLevel);
  const wallet     = await Wallet.getOrCreate(userId, guildId);

  if (wallet.balance < nextLvlDef.price)
    return { success: false, error: `Upgrade costs **${nextLvlDef.price.toLocaleString()}** coins. You have **${wallet.balance.toLocaleString()}**.` };

  wallet.balance   -= nextLvlDef.price;
  wallet.totalSpent += nextLvlDef.price;
  await wallet.save();

  biz.level = nextLevel;
  await biz.save();

  await Transaction.create({
    guildId, userId, type: "business",
    amount: -nextLvlDef.price, balance: wallet.balance,
    note: `Upgraded ${bizDef.name} to L${nextLevel}`,
  });

  return { success: true, biz, bizDef, nextLvlDef, wallet };
}

// ── Get all businesses for a user ─────────────────────────────
async function getUserBusinesses(userId, guildId) {
  const owned = await OwnedBusiness.find({ userId, guildId });
  return owned.map(biz => {
    const bizDef = getBizDef(biz.businessId);
    const lvlDef = getLevelDef(bizDef, biz.level);
    const cdLeft = cooldownLeft(biz.lastCollect, lvlDef?.cooldownHrs ?? 1);
    return { biz, bizDef, lvlDef, cdLeft, ready: cdLeft === 0 };
  });
}

function initBusinesses() {
  logger.info("[Business] Business system initialised.");
}

module.exports = {
  initBusinesses, buyBusiness, collectBusiness,
  upgradeBusiness, getUserBusinesses,
  getBizDef, getLevelDef, fmtMs, cooldownLeft,
  BUSINESS_TYPES,
};
