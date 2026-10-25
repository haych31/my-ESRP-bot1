const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID, OWNER_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID || !OWNER_ID) {
  console.error('Missing settings. Copy .env.example to .env and fill in all four values.');
  process.exit(1);
}

// Persistent local data: data/staff.json and data/dm-blacklist.json
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const staffPath = path.join(dataDir, 'staff.json');
const blacklistPath = path.join(dataDir, 'dm-blacklist.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}
function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}
let staff = readJson(staffPath, {});
let blacklist = readJson(blacklistPath, []);

const RANKS = { ADMIN: 1, HR: 2, OWNER: 3 };
const rankOf = userId => userId === OWNER_ID ? 'OWNER' : (staff[userId] || null);
const canUse = (userId, minimumRank) => (RANKS[rankOf(userId)] || 0) >= RANKS[minimumRank];
const isOwner = userId => userId === OWNER_ID;
const isStaff = userId => Boolean(rankOf(userId));
const safe = value => String(value).replace(/`/g, "'");

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check whether the bot is online'),

  new SlashCommandBuilder()
    .setName('app-admin')
    .setDescription('Grant or remove staff access')
    .addStringOption(o => o.setName('action').setDescription('What to do').setRequired(true)
      .addChoices({ name: 'Add access', value: 'add' }, { name: 'Remove access', value: 'remove' }))
    .addUserOption(o => o.setName('user').setDescription('Staff member').setRequired(true))
    .addStringOption(o => o.setName('rank').setDescription('Staff rank').setRequired(true)
      .addChoices({ name: 'Admin', value: 'ADMIN' }, { name: 'HR', value: 'HR' })),

  new SlashCommandBuilder()
    .setName('admin-dashboard')
    .setDescription('Show everyone who has bot staff access'),

  new SlashCommandBuilder()
    .setName('dm')
    .setDescription('Send a plain-text DM to one user')
    .addUserOption(o => o.setName('user').setDescription('Who to message').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Message to send').setRequired(true).setMaxLength(2000)),

  new SlashCommandBuilder()
    .setName('dm-everyone')
    .setDescription('Prepare a DM to all non-bot server members (confirmation required)')
    .addStringOption(o => o.setName('message').setDescription('Message to send').setRequired(true).setMaxLength(1800)),

  new SlashCommandBuilder()
    .setName('dm-blacklist')
    .setDescription('Manage who is skipped by /dm-everyone')
    .addStringOption(o => o.setName('action').setDescription('What to do').setRequired(true)
      .addChoices({ name: 'Add user', value: 'add' }, { name: 'Remove user', value: 'remove' }, { name: 'View list', value: 'list' }))
    .addUserOption(o => o.setName('user').setDescription('User to add/remove')),

  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Send a normal message in a chosen channel')
    .addChannelOption(o => o.setName('channel').setDescription('Where to send the message').setRequired(true)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
    .addStringOption(o => o.setName('message').setDescription('Message to send').setRequired(true).setMaxLength(2000)),
].map(c => c.toJSON());

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

function noAccess(interaction) {
  return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
}
function staffEmbed() {
  const embed = new EmbedBuilder()
    .setTitle('Staff Access Dashboard')
    .setColor(0x5865F2)
    .setDescription('Bot access ranks. Only the configured owner can be Owner.');
  const entries = [{ id: OWNER_ID, rank: 'OWNER' }, ...Object.entries(staff).map(([id, rank]) => ({ id, rank }))]
    .filter((entry, index, arr) => arr.findIndex(x => x.id === entry.id) === index)
    .sort((a, b) => RANKS[b.rank] - RANKS[a.rank]);
  if (!entries.length) embed.addFields({ name: 'Staff', value: 'No staff access has been granted yet.' });
  else {
    const lines = entries.map(e => `**${e.rank}** — <@${e.id}>`);
    // Keep the embed field under Discord's 1024-character field limit.
    let chunk = '', fieldNumber = 1;
    for (const line of lines) {
      if ((chunk + '\n' + line).length > 1000) {
        embed.addFields({ name: fieldNumber === 1 ? 'Staff' : `Staff (continued ${fieldNumber})`, value: chunk });
        chunk = line; fieldNumber++;
      } else chunk += (chunk ? '\n' : '') + line;
    }
    if (chunk) embed.addFields({ name: fieldNumber === 1 ? 'Staff' : `Staff (continued ${fieldNumber})`, value: chunk });
  }
  return embed.setFooter({ text: `${entries.length} account(s) with access` }).setTimestamp();
}

client.once('ready', () => console.log(`Online as ${client.user.tag}`));

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isButton()) {
      if (!interaction.customId.startsWith('dmall:')) return;
      const [, action, ownerId] = interaction.customId.split(':');
      if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: 'Only the person who started this send can confirm it.', ephemeral: true });
      }
      if (!canUse(interaction.user.id, 'HR')) {
        return interaction.reply({ content: 'You no longer have permission to do this.', ephemeral: true });
      }
      if (action === 'cancel') {
        return interaction.update({ content: 'Bulk DM cancelled. No messages were sent.', embeds: [], components: [] });
      }
      const message = interaction.message.embeds[0]?.description?.match(/Message:\n([\s\S]*)$/)?.[1];
      if (!message) return interaction.update({ content: 'Could not read the message. Please run /dm-everyone again.', embeds: [], components: [] });
      await interaction.update({ content: 'Bulk DM started. This can take a while; the bot will report the result when finished.', embeds: [], components: [] });

      await interaction.guild.members.fetch();
      const members = [...interaction.guild.members.cache.values()]
        .filter(m => !m.user.bot && !blacklist.includes(m.id));
      let sent = 0, failed = 0;
      for (const member of members) {
        try {
          await member.send({ content: message, allowedMentions: { parse: [] } });
          sent++;
        } catch {
          failed++;
        }
        // Gentle pacing to reduce rate-limit risk. Do not repeatedly retry failures.
        await new Promise(resolve => setTimeout(resolve, 1200));
      }
      await interaction.followUp({
        content: `Bulk DM finished. Sent: **${sent}** · Failed/DMs closed: **${failed}** · Blacklisted: **${blacklist.length}**.`,
        ephemeral: true,
      });
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    const id = interaction.user.id;
    const command = interaction.commandName;

    if (command === 'ping') return interaction.reply({ content: 'Pong! 🏓', ephemeral: true });

    if (command === 'app-admin') {
      if (!canUse(id, 'HR')) return noAccess(interaction);
      const action = interaction.options.getString('action');
      const target = interaction.options.getUser('user');
      const rank = interaction.options.getString('rank');

      if (target.bot) return interaction.reply({ content: 'Bots cannot be given staff access.', ephemeral: true });
      if (target.id === OWNER_ID) return interaction.reply({ content: 'The Owner rank cannot be changed.', ephemeral: true });
      if (action === 'add') {
        if (rank === 'HR' && !isOwner(id)) {
          return interaction.reply({ content: 'Only the Owner can grant HR access.', ephemeral: true });
        }
        staff[target.id] = rank;
        writeJson(staffPath, staff);
        return interaction.reply({ content: `Granted **${rank}** access to ${target}.`, ephemeral: true });
      }
      // Removal rules: Owner can remove any staff; HR can remove Admin only.
      if (!isOwner(id) && staff[target.id] !== 'ADMIN') {
        return interaction.reply({ content: 'HR can only remove Admin access. Only the Owner can remove HR.', ephemeral: true });
      }
      if (!staff[target.id]) return interaction.reply({ content: 'That user does not currently have staff access.', ephemeral: true });
      delete staff[target.id];
      writeJson(staffPath, staff);
      return interaction.reply({ content: `Removed bot staff access from ${target}.`, ephemeral: true });
    }

    if (command === 'admin-dashboard') {
      if (!isStaff(id)) return noAccess(interaction);
      return interaction.reply({ embeds: [staffEmbed()], ephemeral: true });
    }

    if (command === 'dm') {
      if (!isStaff(id)) return noAccess(interaction);
      const target = interaction.options.getUser('user');
      const message = interaction.options.getString('message');
      try {
        await target.send({ content: message, allowedMentions: { parse: [] } });
        return interaction.reply({ content: `Plain-text DM sent to ${target.tag}.`, ephemeral: true });
      } catch {
        return interaction.reply({ content: `I couldn't DM ${target.tag}. They may have DMs disabled or blocked the bot.`, ephemeral: true });
      }
    }

    if (command === 'dm-everyone') {
      if (!canUse(id, 'HR')) return noAccess(interaction);
      const message = interaction.options.getString('message');
      const preview = new EmbedBuilder()
        .setTitle('Confirm bulk DM')
        .setColor(0xFEE75C)
        .setDescription(`This will attempt to DM all non-bot members in **${safe(interaction.guild.name)}**, except blacklisted users.\n\n**Message:**\n${message}`)
        .setFooter({ text: 'Only use for relevant server communications. Discord may rate-limit bulk messaging.' });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`dmall:confirm:${id}`).setLabel('Confirm and send').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`dmall:cancel:${id}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      );
      return interaction.reply({ embeds: [preview], components: [row], ephemeral: true });
    }

    if (command === 'dm-blacklist') {
      if (!canUse(id, 'HR')) return noAccess(interaction);
      const action = interaction.options.getString('action');
      const target = interaction.options.getUser('user');
      if (action === 'list') {
        const display = blacklist.length ? blacklist.map(userId => `<@${userId}>`).join('\n') : 'Blacklist is empty.';
        return interaction.reply({ content: `**/dm-everyone blacklist**\n${display}`.slice(0, 1900), ephemeral: true });
      }
      if (!target) return interaction.reply({ content: 'Choose a user for add/remove.', ephemeral: true });
      if (target.bot) return interaction.reply({ content: 'Bots do not need to be blacklisted.', ephemeral: true });
      if (action === 'add') {
        if (!blacklist.includes(target.id)) blacklist.push(target.id);
        writeJson(blacklistPath, blacklist);
        return interaction.reply({ content: `${target} added to the /dm-everyone blacklist.`, ephemeral: true });
      }
      blacklist = blacklist.filter(userId => userId !== target.id);
      writeJson(blacklistPath, blacklist);
      return interaction.reply({ content: `${target} removed from the /dm-everyone blacklist.`, ephemeral: true });
    }

    if (command === 'say') {
      if (!isStaff(id)) return noAccess(interaction);
      const channel = interaction.options.getChannel('channel');
      const message = interaction.options.getString('message');
      try {
        await channel.send({ content: message, allowedMentions: { parse: [] } });
        return interaction.reply({ content: `Message sent in ${channel}.`, ephemeral: true });
      } catch {
        return interaction.reply({ content: `I couldn't send a message in ${channel}. Check the bot's channel permissions.`, ephemeral: true });
      }
    }
  } catch (error) {
    console.error('Interaction error:', error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Something went wrong. Check the terminal for details.', ephemeral: true }).catch(() => {});
    }
  }
});

async function main() {
  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log('Slash commands registered for the configured server.');
  await client.login(DISCORD_TOKEN);
}
main().catch(error => {
  console.error('Startup failed:', error);
  process.exit(1);
});
