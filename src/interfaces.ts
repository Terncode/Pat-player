import { Message } from "discord.js";

export interface ConfigFile {
	DISCORD_TOKEN: string;
	GUILD_ID: string;
	VOICE_CHANNEL_ID: string;
	OWNER_ID: string;
	PREFIX: string;
	DESTROY_ON_ERROR: boolean;
}

export interface ReactMessage {
  message: Message;
  trackList: string[];
  timeout: NodeJS.Timeout
};