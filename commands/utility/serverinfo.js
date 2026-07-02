// ============================================================
//  commands/utility/serverinfo.js — Display server information
// ============================================================

const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require("discord.js");
const config = require("../../config/config.json");

module.exports = {
  category: "utility",

  data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Display information about this server."),

  cooldown: 5,

  async execute(interaction) {
    const guild = interaction.guild;
    await guild.fetch();

    const textChannels  = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size;
    const voiceChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size;
    const categories    = guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).size;
    const totalMembers  = guild.memberCount;
    const botCount      = guild.members.cache.filter((m) => m.user.bot).size;
    const humanCount    = totalMembers - botCount;
    const roleCount     = guild.roles.cache.size - 1; // exclude @everyone
    const boostTier     = `Level ${guild.premiumTier}`;
    const boostCount    = guild.premiumSubscriptionCount ?? 0;

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`🏠 ${guild.name}`)
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
      .setImage(guild.bannerURL({ size: 1024 }) ?? null)
      .addFields(
        { name: "Server ID",     value: guild.id,                                           inline: true  },
        { name: "Owner",         value: `<@${guild.ownerId}>`,                              inline: true  },
        { name: "Created",       value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
        { name: "Members",       value: `👥 ${humanCount} humans • 🤖 ${botCount} bots`,    inline: false },
        { name: "Channels",      value: `💬 ${textChannels} text • 🔊 ${voiceChannels} voice • 📁 ${categories} categories`, inline: false },
        { name: "Roles",         value: `${roleCount}`,                                     inline: true  },
        { name: "Boost Tier",    value: boostTier,                                          inline: true  },
        { name: "Boosts",        value: `${boostCount}`,                                    inline: true  },
        { name: "Verification",  value: guild.verificationLevel.toString(),                 inline: true  },
        { name: "Emojis",        value: `${guild.emojis.cache.size}`,                       inline: true  },
        { name: "Stickers",      value: `${guild.stickers.cache.size}`,                     inline: true  }
      )
      .setFooter({ text: "Hazel • Hazelink Bot" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },

  name: "serverinfo",
  aliases: ["si", "server"],

  async run(message) {
    const g = message.guild;
    message.reply(
      `🏠 **${g.name}** | Members: **${g.memberCount}** | Roles: **${g.roles.cache.size - 1}** | Created: <t:${Math.floor(g.createdTimestamp / 1000)}:R>`
    );
  },
};
