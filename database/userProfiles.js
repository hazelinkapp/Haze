// ============================================================
//  database/userProfiles.js — MongoDB user profile schema
// ============================================================

const mongoose = require("mongoose");

const userProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    guildId: {
      type: String,
      required: true,
    },
    xp: {
      type: Number,
      default: 0,
    },
    level: {
      type: Number,
      default: 0,
    },
    totalMessages: {
      type: Number,
      default: 0,
    },
    lastMessageAt: {
      type: Date,
      default: null,
    },
    // Ticket history
    tickets: {
      type: [
        {
          ticketId:  String,
          openedAt:  Date,
          closedAt:  Date,
          topic:     String,
          status:    { type: String, enum: ["open", "closed"], default: "open" },
        },
      ],
      default: [],
    },
    // Moderation history
    warnings: {
      type: [
        {
          reason:    String,
          moderator: String,
          issuedAt:  { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    // Suggestion history
    suggestions: {
      type: [String],
      default: [],
    },
    // Custom profile fields
    bio: {
      type: String,
      default: null,
      maxlength: 300,
    },
    badges: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true, // adds createdAt & updatedAt
    versionKey: false,
  }
);

// Compound index — one profile per user per guild
userProfileSchema.index({ userId: 1, guildId: 1 }, { unique: true });

// ── Static helper methods ─────────────────────────────────────

/**
 * Get or create a profile for a user in a guild.
 */
userProfileSchema.statics.getOrCreate = async function (userId, guildId) {
  let profile = await this.findOne({ userId, guildId });
  if (!profile) {
    profile = await this.create({ userId, guildId });
  }
  return profile;
};

/**
 * Add XP and handle level-ups. Returns { profile, leveledUp }.
 */
userProfileSchema.statics.addXP = async function (userId, guildId, amount) {
  const profile = await this.getOrCreate(userId, guildId);

  profile.xp            += amount;
  profile.totalMessages += 1;
  profile.lastMessageAt  = new Date();

  const xpNeeded = Math.floor(100 * Math.pow(1.35, profile.level));
  let leveledUp  = false;

  if (profile.xp >= xpNeeded) {
    profile.level += 1;
    profile.xp    -= xpNeeded;
    leveledUp      = true;
  }

  await profile.save();
  return { profile, leveledUp };
};

/**
 * Add a warning to a user's profile.
 */
userProfileSchema.statics.addWarning = async function (userId, guildId, reason, moderatorId) {
  const profile = await this.getOrCreate(userId, guildId);
  profile.warnings.push({ reason, moderator: moderatorId });
  await profile.save();
  return profile;
};

module.exports = mongoose.model("UserProfile", userProfileSchema);
