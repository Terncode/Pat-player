import { Message, TextChannel} from "discord.js";
import { random, clamp } from "lodash";
import { prefix, GUILD_ID, OWNER_ID, config } from ".";
import * as os from "os";
import * as osUtils from "os-utils";
import { downloadAttachments, removeTrack, youtubeDownload } from "./download";
import { cursedMembers, getIndexPlaying, getPlaying, getReactMessage, getStartedAt, getTracks, getVoiceChannel, getVoiceConnection, getVolumeType, numberEmojis, playNext, setIndexPlaying, setLoop, setReactMessage, setSoundBomb, setVolume, setVolumeType, volumeTypes } from "./player";
import { removeExtension, queryTrack, truncateName } from "./trackutils";
import { exec } from "child_process";
const botVersion = require("./../package.json").version;
import { default as pretty } from "prettysize";
import moment from "moment";
const q = '```';
type CommandPermission = 'everyone' | 'admin';
type Fn = (messageData: MessageData) => void
interface MessageData {
  message: Message, 
  userPermission: CommandPermission;
  tracks: string[],
  noPrefix: string,
  indexPlaying: number,
  args: string[],
}


const commandsMap = new Map<string, {help: string, permission: CommandPermission, fn: Fn, hidden: boolean}>();

export function handleCommand(message: Message) {
  const noPrefix = message.content.slice(prefix.length);
  const args = noPrefix.replace(/ +(?= )/g,'').toLowerCase().split(' ');
  
  const arg = args[0].toLowerCase();
  const command = commandsMap.get(arg);
  if (command) {
    const isAdmin = message.member!.hasPermission("ADMINISTRATOR") || message.author.id === OWNER_ID;
    const permission: CommandPermission = isAdmin ? "admin" : "everyone"; 
    const messageData: MessageData = {
      message,
      userPermission: permission,
      tracks: getTracks(),
      indexPlaying: getIndexPlaying(),
      noPrefix,
      args: noPrefix.replace(/ +(?= )/g,'').toLowerCase().split(' '),
    }
    if ((command.permission === 'admin' && permission === 'admin') || command.permission === 'everyone') {
      command.fn(messageData);
    } else {
      message.channel.send("You do not have permission to use this command");
    }
  }
}

export function createCommand(args: string[], help: string, permission: CommandPermission, fn: Fn, hidden = false) {
  for (const arg of args) {
    commandsMap.set(arg, {help, permission, fn, hidden});
  }
}


createCommand(["help", "?"], "Shows help", "everyone", (messageData) => {
  const commandFnMap = new Map<Fn, {args: string[], help: string}>();
  
  commandsMap.forEach((value, key) => {
    if (value.hidden) return
    if (value.permission === "admin" && messageData.userPermission !== "admin") {
      return;
    }

    const existing = commandFnMap.get(value.fn)
    if (existing) {
      existing.args.push(key);
      commandFnMap.set(value.fn, existing);
    } else {
      commandFnMap.set(value.fn, {
        args: [key],
        help: value.help,
      });
    }
  });

  let stringBuilder: string[] = [];

  commandFnMap.forEach((value) => {
    const commandInfo = `${value.args[0]} - ${value.help}`;
    stringBuilder.push(commandInfo)
  });
  messageData.message.channel.send(`${q}\n${stringBuilder.join("\n")}${q}`);
});
createCommand(["playlist", "queue"], "Shows playlist", "everyone", async (messageData) => {
  const playlistList: string[] = [];
  for (let i = 0; i < 10; i++) {
   let readingIndex = messageData.indexPlaying - 5 + i 
   const trackName = messageData.tracks[readingIndex];
   if (trackName) {  
     const now = messageData.indexPlaying === readingIndex;
     const removedE = removeExtension(trackName)
     if (now) {
       playlistList.push(`==> ${readingIndex}: ${removedE} <==`);
     } else {
       playlistList.push(`${readingIndex}: ${removedE}`);
     }
   }
  }
  const playlistGen = [
   `\`\`\``,
   ...playlistList,
   `\`\`\``,
  ].join('\n');
  messageData.message.channel.send(playlistGen);
});
createCommand(["next", ">>" , "forward"], "Switches to next track", "everyone", async (messageData) => {
  if (shouldForbidPlayerCommand(messageData)) { 
    return messageData.message.channel.send("You don't have permission to skip")
  }
  await playNext(messageData.message.client);
  setTimeout(() => {
    const trackName = messageData.tracks[getIndexPlaying()];
    messageData.message.channel.send(`Playing \`${removeExtension(trackName)}\``)
  }, 1000);
});
createCommand(["back", "<<" , "previous"], "Switches to previous track", "everyone", async (messageData) => {
  if (shouldForbidPlayerCommand(messageData)) { 
    return messageData.message.channel.send("You don't have permission to switch to previous")
  }
  const newIndex = messageData.indexPlaying - 2;
  setIndexPlaying(newIndex);
  await playNext(messageData.message.client);
      setTimeout(() => {
        const trackName = messageData.tracks[getIndexPlaying()];
        messageData.message.channel.send(`Playing \`${removeExtension(trackName)}\``)
      }, 1000);
});
createCommand(["volume", "vol" ], "Set volume", "admin", async (messageData) => {
  let number: number = parseInt(messageData.args[1]);
  if(messageData.args[1].toLowerCase() === 'max') {
    number = Number.MAX_SAFE_INTEGER;
  }
  if (isNaN(number)) {
    const volumeTypeNew = volumeTypes.find(e => e === messageData.args[1].toLowerCase())
    if (volumeTypeNew) {
      setVolumeType(volumeTypeNew);
      if (volumeTypeNew === 'default') {
        setVolume(number);
      }
      if (volumeTypeNew === 'surprise') {
        setVolume(number);
        setSoundBomb(random(2, 5))
      }
      messageData.message.channel.send(`Volume set to \`${getVolumeType()}\``);
    } else {
      messageData.message.channel.send(`Unknown volume type! You can use \`${volumeTypes.join('`, `')}\``);
    }
  } else {
    setVolumeType('default');
    const clampedNumber = clamp(number, 0, Number.MAX_SAFE_INTEGER);
    if(clampedNumber > 100) {
      if(Number.MAX_SAFE_INTEGER === clampedNumber) {
        messageData.message.channel.send(`**!!! Volume set to _MAXIMUM_ !!!**`);
        setVolume(Number.MAX_SAFE_INTEGER);
        return;
      } else {
        messageData.message.channel.send(`**!!! Volume set to ${clampedNumber}% !!!**`);
      }
    } else {
      messageData.message.channel.send(`Volume set to ${clampedNumber}%`);
    }
    setVolume(clampedNumber / 100)
  }
});
createCommand(["ytdownload","yt", "enqueue", "add"], "Download from youtube", "admin", (messageData) => {
  const ytReg = /http(?:s?):\/\/(?:www\.)?youtu(?:be\.com\/watch\?v=|\.be\/)([\w\-\\_]*)(&(amp;)?‌​[\w\\?‌​=]*)?/g;
  const array = messageData.message.content.match(ytReg);
  const url = array && array[0]
  if (!url) {
    return messageData.message.channel.send('Not valid youtube link!');
  }
  youtubeDownload(messageData.message.channel as TextChannel, url);
});
createCommand(["atdownload", "download"], "Downloader from attachment", "admin", async (messageData) => {
  const msg = messageData.message;
  if (!msg.attachments.size) {
    return msg.channel.send(`You have to include attachment!`);
  }
  const attachments = Array.from(msg.attachments).map(a => a[1]);
  downloadAttachments(attachments, messageData.message.channel as TextChannel);
});
createCommand(["delete", "remove"], "Deletes track from the bot", "admin", (messageData) => {
  const songName = messageData.noPrefix.slice('delete'.length).trim();
  const found = messageData.tracks.find(e => removeExtension(e.replace(/ +(?= )/g,'').toLowerCase()) === songName.replace(/ +(?= )/g,'').toLowerCase());
  if (found) {
    removeTrack(messageData.message.channel as TextChannel, found);
  } else {
    messageData.message.channel.send('Unable to find that track!');
  }
});
createCommand(["curse", "fuck", "rape" ], "Locks user to bot's channel", "admin", async (messageData) => {
  const users = messageData.message.mentions.users;
  if (!users.size) {
    messageData.message.channel.send('You have to mention user!');
  } else {
    if (!messageData.message.client.voice) {
      return messageData.message.channel.send("You have to be in voice channel to use this command");
    }

    const vc = messageData.message.client.voice.connections.find(v => {
      return !!(v && v.voice && v.voice.channel && v.voice.channel.guild && v.voice.channel.guild.id === GUILD_ID);
    });
    users.forEach(u => {
      cursedMembers.add(u.id);
      const member = messageData.message.guild!.members.cache.get(u.id);
      if (member && vc) {
        if(member.voice && member.voice.channel && member.voice.channel.id !== vc.channel.id) {
          member.voice.setChannel(vc.channel);
        }
      }
    });
    if (users.size === 1) {
      messageData.message.channel.send('Member has been cursed!');
    } else {
      messageData.message.channel.send(`${users.size} members have been cursed!`);
    }
  }
});
createCommand(["uncurse", "unfuck", "unrape" ], "Unlocks user from bot's channel", "admin", async (messageData) => {
  const users2 = messageData.message.mentions.users;
      if (!users2.size) {
        messageData.message.channel.send('Please mention user!');
      } else {
        let count = 0;
        users2.forEach(u => {
          if(cursedMembers.has(u.id)) {
            count++
          }
          cursedMembers.delete(u.id);
        });
        if(!count) {
          messageData.message.channel.send('No one got uncursed')
        } else if (count) {
          messageData.message.channel.send('Member uncursed')
        } else {
          messageData.message.channel.send(`${count} members uncursed`)
        }
      }
});
createCommand(["select", "play", "query" ], "Plays specified track", "everyone", async (messageData) => {
  if (shouldForbidPlayerCommand(messageData)) { 
    return messageData.message.channel.send("You don't have permission go use this command!");
  }
  if (!messageData.args.slice(1).join('').length) {
    return messageData.message.channel.send('Provide search query!');
  }
  const queriedTracks = queryTrack(messageData.args.slice(1));
  if (queriedTracks[0].score === 0) {
    messageData.message.channel.send(`Nothing found!`);
  } else {
    const sameScore = queriedTracks.filter(t => t.score === queriedTracks[0].score);
    if (sameScore.length === 1) {
      const track = sameScore[0].fullName;
      messageData.message.channel.send(`Playing \`${removeExtension(track)}\``);
      playNext(messageData.message.client, track);
    } else {

      const songs = sameScore.slice(0,5);
      const fiveSongs = songs.map((t, i) => `${i + 1}: ${truncateName(removeExtension(t.fullName), 50)}`);

      let reactMessage = getReactMessage();
      if (reactMessage) {
        clearTimeout(reactMessage.timeout);
        if (!reactMessage.message.deleted) {
          try {
            reactMessage.message.delete();
          } catch (error) {
            console.error(error)
          }
        }
        setReactMessage(undefined);
      }
      const sentMessage = await messageData.message.channel.send(`${fiveSongs.join('\n')}`)
      for (let i = 0; i < songs.length; i++) {
        await sentMessage.react(numberEmojis[i])   
      }
      const timeout =  setTimeout(() => {
        reactMessage = undefined;
        if (!sentMessage.deleted) {
          try {
            sentMessage.delete();
          } catch (error) {
            console.error(error)
          }
        }
      }, 1000 * 60 * 5);

      reactMessage = {
        timeout,
        message:sentMessage,
        trackList: sameScore.map(e => e.fullName)
      }
      setReactMessage(reactMessage);
    }
  }
});

createCommand(["sysinfo"], "Shows system info", "everyone", async messageData => {
  const percentage = await new Promise<number>(resolve => {
    osUtils.cpuUsage(percentage => {
        resolve(percentage);
    });
  });

  const execute = async (command: string) => {
    return new Promise<string>((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
          if (error) {
            return reject(error);
          }
          if (stderr) {
            return resolve(stderr);
          }
          return resolve(stdout);
      });
    });
  };

  let tempC: number | undefined;
  try {
    const temperature = await execute("cat /sys/class/thermal/thermal_zone*/temp");
    tempC = Math.round(parseInt(temperature, 10) / 1000);
  } catch (error) {
      /* ignored */
  }
  const arrayBuilder: string[] = [];

  const memoryUsage = process.memoryUsage();
  arrayBuilder.push(`Memory usage: `);
  arrayBuilder.push(`   External: ${pretty(memoryUsage.external)}`);
  arrayBuilder.push(`   HeapTotal: ${pretty(memoryUsage.heapTotal)}`);
  arrayBuilder.push(`   HeapUsed: ${pretty(memoryUsage.heapUsed)}`);
  arrayBuilder.push(`   Rss: ${pretty(memoryUsage.rss)}`);
  arrayBuilder.push(``);
  
  arrayBuilder.push(`CPU usage: ${Math.round(percentage * 100)}%`);
  if (tempC) {
    arrayBuilder.push(`Temperature: ${Math.round(tempC)}°C`);
  }
  arrayBuilder.push(`Arch: ${process.arch}`);
  arrayBuilder.push(`Node version: ${process.version}`);
  arrayBuilder.push(`Bot version: v${botVersion}`);

  arrayBuilder.push(``);
  arrayBuilder.push(`Platform: ${os.platform()}`);
  arrayBuilder.push(`Release: ${os.release()}`);
  arrayBuilder.push(`Total memory: ${pretty(os.totalmem())}`);

  messageData.message.channel.send(`${q}\n${arrayBuilder.join("\n")}${q}`);

}, true);

createCommand(["np", "nowplaying", "playing"], "Shows what is currently playing", "everyone", async (messageData) => { 
  const startTime = getStartedAt();
  const playingTime = Date.now() - startTime;

  const mmss = moment.utc(playingTime).format('mm:ss');
  messageData.message.channel.send(`Playing: \`${getPlaying()}\` for \`${mmss}\``);
}, true);

createCommand(["info"], "Shows info about player", "everyone", async (messageData) => { 
  const arrayBuilder: string[] = [
    `${messageData.message.client.user.tag} is a 24/7 player with build in ear-rape feature`,
    ``,
    `Developed by Terncode`,
  ];

  messageData.message.channel.send(`${q}\n${arrayBuilder.join("\n")}${q}`);
});

if (config.DESTROY_ON_ERROR) {
  createCommand(["kill"], "Kills player", "admin", async (messageData) => {
    await messageData.message.channel.send("AAAAAAAAAAAAaaaa");
    messageData.message.client.removeAllListeners();
    const voice = getVoiceConnection();
    try {
      if(voice) {
        voice.disconnect();
      }
      await new Promise(resolve => {
        messageData.message.client.destroy();
        setTimeout(resolve, 1000);
      });
    } catch (error) { 
      /* ignored */ 
    }
    process.exit(1);
  });
}

function shouldForbidPlayerCommand(messageData: MessageData) {
  if (messageData.userPermission === "everyone" && messageData.message.member!.voice.channel === getVoiceChannel()) {
    const channel = getVoiceChannel();
    if(!channel) return;

    const notBots = channel.members.map(m => m).filter(m => !m.user.bot);
    
    if (notBots.length > 1) {
      return true;
    }
  }
  return false;
}