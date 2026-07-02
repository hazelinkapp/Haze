// ============================================================
//  database/economy.js — Complete Economy Schemas v2
//  Wallet · Shop · Inventory · Transaction · WealthRole
//  Business · Investment · EconConfig · AccessControl · Shortcut
// ============================================================

const mongoose = require("mongoose");

// ── Wallet ────────────────────────────────────────────────────
const walletSchema = new mongoose.Schema({
  userId:        { type: String, required: true },
  guildId:       { type: String, required: true },
  balance:       { type: Number, default: 0, min: 0 },
  bank:          { type: Number, default: 0, min: 0 },
  totalEarned:   { type: Number, default: 0 },
  totalSpent:    { type: Number, default: 0 },
  lastDaily:     { type: Date,   default: null },
  lastWork:      { type: Date,   default: null },
  lastRob:       { type: Date,   default: null },
  dailyStreak:   { type: Number, default: 0 },
  secured:       { type: Boolean, default: false }, // admin-set protection
  xp:            { type: Number, default: 0 },
  level:         { type: Number, default: 0 },
  totalMessages: { type: Number, default: 0 },
}, { timestamps: true, versionKey: false });

walletSchema.index({ userId: 1, guildId: 1 }, { unique: true });

walletSchema.statics.getOrCreate = async function (userId, guildId) {
  let w = await this.findOne({ userId, guildId });
  if (!w) w = await this.create({ userId, guildId });
  return w;
};

walletSchema.statics.addBalance = async function (userId, guildId, amount) {
  const w = await this.getOrCreate(userId, guildId);
  w.balance = Math.max(0, w.balance + amount);
  if (amount > 0) w.totalEarned += amount;
  if (amount < 0) w.totalSpent  += Math.abs(amount);
  await w.save();
  return w;
};

const Wallet = mongoose.model("Wallet", walletSchema);

// ── Shop Item ─────────────────────────────────────────────────
const shopItemSchema = new mongoose.Schema({
  guildId:     { type: String, required: true },
  name:        { type: String, required: true },
  description: { type: String, default: "" },
  price:       { type: Number, required: true, min: 0 },
  type:        { type: String, enum: ["role", "badge", "custom"], default: "role" },
  roleId:      { type: String, default: null },
  emoji:       { type: String, default: "🛍️" },
  stock:       { type: Number, default: -1 },
  sold:        { type: Number, default: 0 },
  enabled:     { type: Boolean, default: true },
  featured:    { type: Boolean, default: false },
  sortOrder:   { type: Number, default: 0 },
}, { timestamps: true, versionKey: false });

shopItemSchema.index({ guildId: 1, enabled: 1 });
const ShopItem = mongoose.model("ShopItem", shopItemSchema);

// ── Inventory ─────────────────────────────────────────────────
const inventorySchema = new mongoose.Schema({
  userId:   { type: String, required: true },
  guildId:  { type: String, required: true },
  itemId:   { type: mongoose.Schema.Types.ObjectId, ref: "ShopItem" },
  itemName: { type: String },
  quantity: { type: Number, default: 1 },
  boughtAt: { type: Date, default: Date.now },
}, { versionKey: false });

inventorySchema.index({ userId: 1, guildId: 1 });
const Inventory = mongoose.model("Inventory", inventorySchema);

// ── Transaction ───────────────────────────────────────────────
const transactionSchema = new mongoose.Schema({
  guildId:  { type: String, required: true },
  userId:   { type: String, required: true },
  type:     {
    type: String,
    enum: ["daily","work","gamble","rob","give","receive","shop","admin",
           "penalty","business","invest_buy","invest_sell","deposit","withdraw","xp"],
    required: true,
  },
  amount:   { type: Number, required: true },
  balance:  { type: Number },
  note:     { type: String, default: "" },
  targetId: { type: String, default: null },
}, { timestamps: true, versionKey: false });

transactionSchema.index({ guildId: 1, userId: 1, createdAt: -1 });
const Transaction = mongoose.model("Transaction", transactionSchema);

// ── Business ──────────────────────────────────────────────────
const BUSINESS_TYPES = [
  {
    id: "coffee_shop",
    name: "Coffee Shop",
    emoji: "☕",
    description: "A cozy neighbourhood café.",
    levels: [
      { price: 50_000,      income: 800,     cooldownHrs: 1   },
      { price: 125_000,     income: 1_600,   cooldownHrs: 1.5 },
      { price: 312_500,     income: 3_200,   cooldownHrs: 2   },
    ],
  },
  {
    id: "restaurant",
    name: "Restaurant",
    emoji: "🍽️",
    description: "A bustling fine-dining establishment.",
    levels: [
      { price: 150_000,     income: 2_500,   cooldownHrs: 2   },
      { price: 375_000,     income: 5_000,   cooldownHrs: 2.5 },
      { price: 937_500,     income: 10_000,  cooldownHrs: 3   },
    ],
  },
  {
    id: "car_dealership",
    name: "Car Dealership",
    emoji: "🚗",
    description: "Sell luxury and everyday vehicles.",
    levels: [
      { price: 500_000,     income: 8_000,   cooldownHrs: 3   },
      { price: 1_250_000,   income: 16_000,  cooldownHrs: 3.75},
      { price: 3_125_000,   income: 32_000,  cooldownHrs: 4.5 },
    ],
  },
  {
    id: "tech_startup",
    name: "Tech Startup",
    emoji: "💻",
    description: "A high-growth software company.",
    levels: [
      { price: 1_500_000,   income: 25_000,  cooldownHrs: 4   },
      { price: 3_750_000,   income: 50_000,  cooldownHrs: 4.75},
      { price: 9_375_000,   income: 100_000, cooldownHrs: 5.5 },
    ],
  },
  {
    id: "real_estate",
    name: "Real Estate Agency",
    emoji: "🏢",
    description: "Buy low, sell high — in property.",
    levels: [
      { price: 5_000_000,   income: 85_000,  cooldownHrs: 6   },
      { price: 12_500_000,  income: 170_000, cooldownHrs: 7   },
      { price: 31_250_000,  income: 340_000, cooldownHrs: 8   },
    ],
  },
  {
    id: "private_bank",
    name: "Private Bank",
    emoji: "🏦",
    description: "The ultimate wealth machine.",
    levels: [
      { price: 15_000_000,  income: 280_000, cooldownHrs: 8   },
      { price: 37_500_000,  income: 560_000, cooldownHrs: 10  },
      { price: 93_750_000,  income: 1_120_000, cooldownHrs: 12 },
    ],
  },
];

const ownedBusinessSchema = new mongoose.Schema({
  userId:      { type: String, required: true },
  guildId:     { type: String, required: true },
  businessId:  { type: String, required: true },
  level:       { type: Number, default: 1, min: 1, max: 3 },
  lastCollect: { type: Date, default: null },
  totalEarned: { type: Number, default: 0 },
  boughtAt:    { type: Date, default: Date.now },
}, { versionKey: false });

ownedBusinessSchema.index({ userId: 1, guildId: 1, businessId: 1 }, { unique: true });
const OwnedBusiness = mongoose.model("OwnedBusiness", ownedBusinessSchema);

// ── Investment ────────────────────────────────────────────────
const STOCK_LIST = [
  { symbol: "GOOGL",     name: "Google",    type: "stock",  emoji: "🔍", simulated: false },
  { symbol: "AMZN",      name: "Amazon",    type: "stock",  emoji: "📦", simulated: false },
  { symbol: "NVDA",      name: "Nvidia",    type: "stock",  emoji: "🎮", simulated: false },
  { symbol: "AAPL",      name: "Apple",     type: "stock",  emoji: "🍎", simulated: false },
  { symbol: "005930.KS", name: "Samsung",   type: "stock",  emoji: "📱", simulated: false },
  { symbol: "OQ",        name: "OQ",        type: "stock",  emoji: "🛢️", simulated: true, basePrice: 4.20,  volatility: 0.015 },
  { symbol: "HZLK",      name: "Hazelink",  type: "stock",  emoji: "⚡", simulated: true, basePrice: 250,   volatility: 0.08  },
  { symbol: "BTC",       name: "Bitcoin",   type: "crypto", emoji: "₿",  simulated: false },
  { symbol: "DOGE",      name: "Dogecoin",  type: "crypto", emoji: "🐕", simulated: false },
  { symbol: "XAU",       name: "Gold",      type: "commodity", emoji: "🥇", simulated: false },
  { symbol: "XAG",       name: "Silver",    type: "commodity", emoji: "🥈", simulated: false },
];

const investmentSchema = new mongoose.Schema({
  userId:      { type: String, required: true },
  guildId:     { type: String, required: true },
  symbol:      { type: String, required: true },
  name:        { type: String },
  type:        { type: String, enum: ["stock","crypto","commodity"] },
  emoji:       { type: String, default: "📈" },
  shares:      { type: Number, required: true },
  buyPrice:    { type: Number, required: true },
  totalCost:   { type: Number, required: true },
  boughtAt:    { type: Date, default: Date.now },
  canSellAt:   { type: Date },
  sold:        { type: Boolean, default: false },
  sellPrice:   { type: Number, default: null },
  soldAt:      { type: Date, default: null },
  profit:      { type: Number, default: null },
  taxPaid:     { type: Number, default: null },
}, { timestamps: true, versionKey: false });

investmentSchema.index({ userId: 1, guildId: 1, sold: 1 });
const Investment = mongoose.model("Investment", investmentSchema);

// ── Price Cache (for simulated stocks) ────────────────────────
const priceCacheSchema = new mongoose.Schema({
  symbol:    { type: String, required: true, unique: true },
  price:     { type: Number, required: true },
  change:    { type: Number, default: 0 },
  changePct: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
}, { versionKey: false });

const PriceCache = mongoose.model("PriceCache", priceCacheSchema);

// ── Wealth Role ───────────────────────────────────────────────
const wealthRoleSchema = new mongoose.Schema({
  guildId:   { type: String, required: true },
  roleId:    { type: String, required: true },
  roleName:  { type: String },
  threshold: { type: Number, required: true },
  label:     { type: String, default: "" },
  enabled:   { type: Boolean, default: true },
}, { versionKey: false });

wealthRoleSchema.index({ guildId: 1, threshold: 1 });
const WealthRole = mongoose.model("WealthRole", wealthRoleSchema);

// ── Economy Config ────────────────────────────────────────────
const econConfigSchema = new mongoose.Schema({
  guildId:           { type: String, required: true, unique: true },
  coinName:          { type: String, default: "Coins" },
  coinEmoji:         { type: String, default: "🪙" },
  dailyAmount:       { type: Number, default: 500 },
  dailyCooldownHrs:  { type: Number, default: 24 },
  workCooldownHrs:   { type: Number, default: 2 },
  robCooldownHrs:    { type: Number, default: 1 },
  robSuccessOnline:  { type: Number, default: 35 },
  robSuccessOffline: { type: Number, default: 45 },
  robStealPct:       { type: Number, default: 30 },
  robPenaltyPct:     { type: Number, default: 20 },
  workMinCoins:      { type: Number, default: 100 },
  workMaxCoins:      { type: Number, default: 500 },
  investTaxPct:      { type: Number, default: 7 },
  investHoldHrs:     { type: Number, default: 2 },
  enabled:           { type: Boolean, default: true },
}, { versionKey: false });

const EconConfig = mongoose.model("EconConfig", econConfigSchema);

// ── Access Control ────────────────────────────────────────────
const accessSchema = new mongoose.Schema({
  userId:    { type: String, required: true, unique: true },
  username:  { type: String },
  avatar:    { type: String },
  discordId: { type: String },
  role:      { type: String, enum: ["admin", "user"], default: "user" },
  grantedBy: { type: String },
  approved:  { type: Boolean, default: false },
  banned:    { type: Boolean, default: false },
}, { timestamps: true, versionKey: false });

const AccessControl = mongoose.model("AccessControl", accessSchema);

// ── Chat Shortcut ─────────────────────────────────────────────
const shortcutSchema = new mongoose.Schema({
  guildId:     { type: String, required: true },
  symbol:      { type: String, required: true },
  action:      { type: String, required: true },
  actionData:  { type: mongoose.Schema.Types.Mixed, default: {} },
  allowedRoles:{ type: [String], default: [] },
  channels:    { type: [String], default: [] },
  enabled:     { type: Boolean, default: true },
  label:       { type: String, default: "" },
}, { versionKey: false });

shortcutSchema.index({ guildId: 1, symbol: 1 });
const ChatShortcut = mongoose.model("ChatShortcut", shortcutSchema);

module.exports = {
  Wallet, ShopItem, Inventory, Transaction,
  OwnedBusiness, Investment, PriceCache,
  WealthRole, EconConfig, AccessControl, ChatShortcut,
  BUSINESS_TYPES, STOCK_LIST,
};
