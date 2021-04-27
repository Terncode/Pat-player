import { ConfigFile } from "./interfaces";
export const config: ConfigFile = require('../config.json');
import { Client } from 'discord.js';
import { getVoiceConnection, leaveAllVoiceChannels, onStartup } from "./player";

const discordToken = config.DISCORD_TOKEN;
export const OWNER_ID = config.OWNER_ID;
export const VOICE_CHANNEL_ID = config.VOICE_CHANNEL_ID;
export const GUILD_ID = config.GUILD_ID;
export let prefix = config.PREFIX;

if (!discordToken) throw new Error('Config file is not setup properly');
if (prefix) prefix = prefix.toLowerCase();
if (!prefix && prefix.length > 10) throw new Error('Prefix is not valid');

const client = new Client();

export let invite = '';

client.once('ready', async () => {
	console.info(`Logged in as ${client.user!.tag}!`)
	invite = await client.generateInvite(['SEND_MESSAGES', 'PRIORITY_SPEAKER', 'CONNECT', 'EMBED_LINKS']);
	console.info(`Invite link ${invite}`);
	onStartup(client);
});


client.on('debug', data => {
	//console.debug(data);
})

client.on('error', err => {
	if (err.stack) console.error(err.stack);
	else console.error(err.toString());
	destroy();
})


//process.on('beforeExit', () => destroy());
process.on('SIGINT', () => destroy(true));
process.on('SIGTERM', () => destroy(true));
//process.on('SIGKILL', () => destroy());

process.on('uncaughtException', async err => {
	const voice = getVoiceConnection();
	if(!voice) return;
	try {
		voice.disconnect();
		await new Promise(resolve => {
			setTimeout(resolve, 1000);
		})
	} catch (error) {
		
	}
	
	console.error(err.stack);
	destroy();
});
process.on('unhandledRejection', err => {
	console.error(err)
	setTimeout(() => {
		process.exit(1);
	}, 10000);
});

export async function destroy(force?: boolean) {
	force = force || config.DESTROY_ON_ERROR;
	if (force) {
		await leaveAllVoiceChannels(client);
		client.destroy();
		process.exit(1);
	}
}

function login() {
	try {
		client.login(discordToken)

	} catch (error) {
		throw new Error(error)
	}
}

login();