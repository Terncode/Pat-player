# About pat player

Pat player is a 24/7 discord music bot that can download audio tracks from youtube or discord attachments and play them nonstop. It has built-in earrape feature, curse feature, auto stuck detection and much more. Volume can be set up to javascript max integer limit, volume also has 3 modes default, surprise, and random setting volume differently on every song which you can probably guess what they do.

```
{
	"DISCORD_TOKEN": "YoUrD1sc0rD.T0keN",
	"GUILD_ID": "000000000000000000",
	"VOICE_CHANNEL_ID": "000000000000000000",
	"OWNER_ID": "000000000000000000",
	"PREFIX": "!",
	"DESTROY_ON_ERROR": true
}

```

`DISCORD_TOKEN` Your discord token duh. You can get here https://discordapp.com/developers/applications/<br/>
`GUILD_ID` Your discord server Id. You have to enable developer mode on discord then right click on server icon and Copy ID<br/>
`VOICE_CHANNEL_ID` Default voice channel where bot will join on startup. Right click on channel and Copy ID.<br/>
`OWNER_ID` Bot can control guild admins and owner meaning if you are not admin in the guild you have full perms over your bot. Right click on your name and copy ID.<br/>
`PREFIX` is prefix for your command.<br/>
`DESTROY_ON_ERROR` Random crashes can occur if it does you can decide if bot should destroy itself or keep running. If you set true then it is recommended that you have set up the bot would in a way where it would automatically relaunch itself.<br/>

### Terminal commands
```
npm install
npm run build
npm start
```


