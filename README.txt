MY DISCORD BOT — SETUP GUIDE

IMPORTANT
- Never share your Discord bot token. Do not paste it into chat or screenshots.
- This project stores staff ranks and the /dm-everyone blacklist in local JSON files under data/.
- Keep the data/ folder if you want to preserve access settings between restarts.
- /dm-everyone can trigger Discord rate limits and may be considered spam if used for unsolicited messages. Use only for relevant server communications and respect member privacy.

1) CREATE YOUR DISCORD APPLICATION
- Open https://discord.com/developers/applications
- Select your application, then open General Information.
- Copy Application ID; this is CLIENT_ID.
- Open Bot and copy/reset the bot token; this is DISCORD_TOKEN. Keep it private.
- In OAuth2 > URL Generator, select scopes bot and applications.commands.
- Select bot permissions View Channels and Send Messages, then use the generated URL to invite it to your server.
- Under Bot settings, enable the Server Members Intent (needed to fetch the full member list for /dm-everyone). Save changes.

2) GET THE OTHER IDS
- In Discord, User Settings > Advanced > enable Developer Mode.
- Right-click your own profile and choose Copy User ID; this is OWNER_ID.
- Right-click your server icon and choose Copy Server ID; this is GUILD_ID.
- Make sure your bot is invited to that server.

3) SET UP THE FILES
- Extract the ZIP to a folder.
- Open that folder in Visual Studio Code using File > Open Folder.
- In the Explorer, copy .env.example and name the copy .env.
  If you cannot copy it in VS Code: create a new file named .env and copy the four lines from .env.example.
- Fill in DISCORD_TOKEN, CLIENT_ID, GUILD_ID, OWNER_ID with your values. Do not add quotes.
- Do not share the .env file or upload it publicly.

4) INSTALL AND START
- In VS Code, open Terminal > New Terminal.
- If PowerShell blocks npm scripts, choose Command Prompt as the terminal profile.
- Run these commands one at a time:
  npm install
  npm start
- Keep the terminal open while the bot is running. Your hosting provider can run npm start later.

5) COMMANDS
- /ping — checks the bot.
- /app-admin action:Add access user:@member rank:Admin — Owner or HR can grant Admin. Only Owner can grant HR.
- /app-admin action:Remove access user:@member rank:Admin — Owner can remove any rank; HR can remove Admin only. The rank option is required even for removal; choose the user's current rank.
- /admin-dashboard — displays the staff list privately.
- /dm user:@member message:... — sends plain text to one user.
- /dm-everyone message:... — Owner/HR only; preview and confirm before sending to all non-bot members except the blacklist.
- /dm-blacklist action:Add user:@member — add a member to the bulk-DM blacklist.
- /dm-blacklist action:Remove user:@member — remove them from the blacklist.
- /dm-blacklist action:View list — show the blacklist.
- /say channel:#channel message:... — sends a normal message in the selected channel.

PERMISSIONS
- Owner is configured by OWNER_ID and cannot be assigned or removed using commands.
- HR can grant/revoke Admin only. HR cannot grant HR.
- Admin cannot add or remove staff.
- All ranks can use /dm and /say.
- Owner and HR can use /dm-everyone and manage the blacklist.
- The bot's rank system is separate from Discord's native Administrator permission.

TROUBLESHOOTING
- If commands do not appear, check CLIENT_ID and GUILD_ID, restart the bot, and make sure it is invited with applications.commands.
- If /dm-everyone fails to fetch members, enable Server Members Intent on the Bot page and ensure the bot is in the server.
- If /say fails, check the bot has View Channel and Send Messages in the target channel.
