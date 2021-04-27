import { Client, GuildMember, Message, MessageReaction, StreamOptions, TextChannel, VoiceChannel, VoiceConnection, VoiceState } from "discord.js";
import { destroy, GUILD_ID, OWNER_ID, prefix, VOICE_CHANNEL_ID } from ".";
import { deleteTrack, getAllTracks, getAllTracksAsync, TRACK_DIRECTORY_NAME } from "./fs";
import path from "path";
import { createReadStream } from "fs";
import { clamp, debounce, random } from "lodash";
import { removeExtension, truncateName } from "./trackutils";
import { ReactMessage } from "./interfaces";
import { handleCommand } from "./commands";
import { MAX_SECONDS } from "./download";
import { existsSync } from "node:fs";

let tracks = getAllTracksAsync().sort(() => Math.random() > 0.5 ? 1 : -1);
let indexPlaying = 0;
let loop = false;

const voiceSearcher = (v: VoiceConnection) => !!(v.voice && v.voice.channel && v.voice.channel.guild.id === GUILD_ID);

export const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

let voiceConnection: VoiceConnection | undefined = undefined; 
let reactMessage: ReactMessage | undefined;

export const cursedMembers = new Set<string>();
let startTime = 0;
let playing = "startup"; 
let volume = 0.5;
let soundBomb = 5;
let volumeType:VolumeTypes = 'default'
type VolumeTypes = "default" |"surprise" | "random";
export const volumeTypes: VolumeTypes[] = ["default", "surprise", "random"]  

export async function onStartup(client: Client) {
  const startupFile = 'startup.mp3'
  const startup = path.join(process.cwd(), startupFile); 
  client.on('voiceStateUpdate', voiceStateChange);
  client.on('message', onMessage);
  client.on('messageReactionAdd', messageReaction);

  if(existsSync(startupFile)) {
    playNext(client, 'Startup', startup);
  } else {
    playNext(client);
  }
}

const updateStatus = debounce((client:Client, trackName: string) => {
  playing = truncateName(removeExtension(trackName), 50);

  client.user!.setPresence({
    activity:{ 
      type: "PLAYING",
      name: playing,
    }
  })
}, 1000 * 2);


async function messageReaction(messageReaction: MessageReaction) {
  if (!reactMessage) return

  if (messageReaction.message === reactMessage.message) {
    const members = messageReaction.users.cache.map(e => reactMessage!.message.guild!.members.cache.get(e.id)).filter(m => m && !m.user.bot)
    const admin = members.find(m => m!.hasPermission('ADMINISTRATOR') || m!.id === OWNER_ID)
    if (admin) {
      const index = numberEmojis.indexOf(messageReaction.emoji.name);
      if (index !== -1) {
        const track = reactMessage.trackList[index];
        if (track) {
          clearTimeout(reactMessage.timeout);
          if (!reactMessage.message.deleted) {
            try {
              await reactMessage.message.delete();
            } catch (error) {
              console.error(error);
            }
          }
          reactMessage = undefined;
          playNext(messageReaction.client, track);
          messageReaction.message.channel.send(`Playing \`${removeExtension(track)}\``);
        }
      }
    }
  }
}

let detectDown: NodeJS.Timeout | undefined;

export async function playNext(client: Client, definedTrack?: string, exactPath?:string) {
  if (detectDown) {
    clearTimeout(detectDown);
    detectDown = undefined;
  }

  try {

    await joinVc(client);
    if (!definedTrack) {
      await getNextTrack();
    }
    if (volumeType === "random") {
      volume = random(5, 100) / 100;
    } else if(volumeType === "surprise") {
      console.log(`Sound bomb incoming: ${soundBomb}`);
      if (volume > 0.01) {
        volume -= random(0.04, 0.07, true);
        if (volume < 0.01) {
          volume = 0.01;
        }
      } else if (soundBomb < 0) {
        setTimeout(() => {
          soundBomb = random(1, 10);
          if (voiceConnection) {
            voiceConnection.dispatcher.setVolume(1000);
          }
        }, 1000 * 2);
      } else {
        soundBomb -= 1;
      }
    }

    
    const trackName = definedTrack || tracks[indexPlaying];
    console.log(`${indexPlaying}: Playing ${trackName} V: ${Math.round(volume * 100)} M: ${volumeType}`);
    const pathString = exactPath || path.join(process.cwd(),  TRACK_DIRECTORY_NAME, trackName);
    const stream = createReadStream(pathString);
    const options: StreamOptions = {
      volume
    }

    const dispatcher = voiceConnection!.play(stream, options);    
    dispatcher.on('finish', () => {
      if(loop) {
        playNext(client, trackName, pathString)
      } else {
        playNext(client);
      }
    });
    dispatcher.on('error', (error) => {
      console.error(error)
      onException(client);
    });
  
    dispatcher.on('start', () => {
      startTime = Date.now();
      detectDown = setTimeout(() =>{
        console.log('Bot probably stuck');
        destroy();
      }, (MAX_SECONDS * 1000) + 10000);


      if(volumeType === 'surprise') {
        if (volume > 1) {
          volume = 1;
        }
      }
      updateStatus(client, trackName);
      startTime = Date.now();
    });
  
  } catch (error) {
    console.error(error);    
  }
}

function onException(client: Client) {
  try {
    if (voiceConnection && voiceConnection.channel) {
      voiceConnection.channel.leave()
    }
  } catch (error) {
    console.error(error);
  }
  voiceConnection = undefined;
  setTimeout(() => {
    playNext(client);
  }, 1000 * 15);
}

async function getNextTrack(){
  const index = ++indexPlaying % tracks.length;
  if (!index) {
    tracks = await getAllTracks();
    tracks = tracks.sort(() => Math.random() > 0.5 ? 1 : -1);
  }
  indexPlaying = index;
}

export async function joinVc(client:Client) {
  if (!client.voice) {
    return;
  }

  const guildVoiceConnection = client.voice.connections.find(voiceSearcher)

  if (!guildVoiceConnection) {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) throw new Error('Unable to find guild!');
    const channel = guild.channels.cache.get(VOICE_CHANNEL_ID);
    if (!channel) throw new Error("Channel does not exist!");
    if (channel.type !== 'voice') throw new Error("Voice channel is not voice channel");
    voiceConnection = await (channel as VoiceChannel).join();
  }
  if (voiceConnection && voiceConnection.voice) {
    await voiceConnection.voice.setSelfMute(false);
    await voiceConnection.voice.setSelfDeaf(true);
  }
}
export async function leaveAllVoiceChannels(client:Client) {
  if (!client.voice) return;
  for (const [,connection] of client.voice.connections) {
    if (connection.channel) {
      connection.channel.leave();
    }
  }
}

const checkAgain = debounce((member: GuildMember) => {
  if (!member.client.voice) return;

  try {
    if (member.voice && member.voice.connection && member.voice.connection.channel) {
      if (cursedMembers.has(member.id)) {
        const vc = member.client.voice.connections.find(voiceSearcher);
        if (vc && vc.channel !== member.voice.connection.channel) {
          member.voice.setChannel(vc.channel);
        } 
      }
    }
  } catch (error) {
    console.error(error);
  }
}, 5000) 

async function voiceStateChange(oldState: VoiceState, newState: VoiceState) {
  if (!newState.member) return;
  const client = newState.client;
  if (!client.voice) return;

  if (newState.member.user === client.user) {
    if (!newState.connection) {
      console.log('disconnect detected!');
      playNext(client);
    }
  }
  try {
    if (newState.guild.id === GUILD_ID) {
      if (cursedMembers.has(newState.member.id)) {
        const vc = client.voice.connections.find(voiceSearcher);
        if (vc && vc.channel !== newState.channel) {
          await newState.setChannel(vc.channel);
          checkAgain(newState.member);
        } 
      }
    }
  } catch (error) {
    console.error(error);
  }
}

async function onMessage(message: Message) {
  if (message.author.bot) return;
  if (!message.content) return;
  if (!message.guild) return;
  if (!message.member) return;
  if (message.guild.id !== GUILD_ID) return;

  const isPrefix = message.content.startsWith(prefix);

  if (!(message.channel as TextChannel).permissionsFor(message.guild.me).has("SEND_MESSAGES")) {
    return;
  }

  if (isPrefix) {
    handleCommand(message);
  }
}

export function setReactMessage(rMessage: ReactMessage | undefined) {
  reactMessage = rMessage;
}
export function getReactMessage(){
  return reactMessage;
}
export function addTrack(trackName: string) {
  const newTrackList: string[] = [];
  for (let i = 0; i < tracks.length; i++) {
    newTrackList.push(tracks[i]);
    if (indexPlaying === i) {
      newTrackList.push(trackName);
    }
  }
  tracks = newTrackList;
}
export function getTracks() {
  return tracks;
}
export function setVolumeType(newVolumeType: VolumeTypes) {
  volumeType = newVolumeType;
}
export function getVolumeType() {
  return volumeType;
}
export function getVoiceConnection() {
  return voiceConnection;
}
export function getVolume() {
  return volume;
}
export function setVolume(number: number) {
  number = clamp(number, 0, Number.MAX_SAFE_INTEGER);
  volume = number;
  if (voiceConnection) {
    voiceConnection.dispatcher.setVolume(number);
  }
}
export function setSoundBomb(number: number) {
  soundBomb = number;
}
export function getSoundBomb() {
  return soundBomb;
}
export function getIndexPlaying(){
  return indexPlaying;
}
export function setIndexPlaying(index: number){
  indexPlaying = index % tracks.length;
}
export function getLoop() {
  return loop;
}
export function setLoop(l: boolean) {
  loop = l;
}
export function getVoiceChannel() {
  return voiceConnection && voiceConnection.channel;
}
export function getStartedAt() {
  return startTime;
}
export function getPlaying() {
  return playing;
}