import { MessageAttachment, TextChannel } from "discord.js";
import ytdl from 'ytdl-core';
import ffmpeg from "fluent-ffmpeg";
import Internal from "stream";
import path from "path";
import { deleteTrack, TEMP_DIRECTORY_NAME, trackExist, TRACK_DIRECTORY_NAME, unlinkPromise } from "./fs";
import { addTrack, getTracks } from "./player";
import axios from "axios";
import { createWriteStream, createReadStream } from "fs";
import { removeExtension } from "./trackutils";
import { random } from "lodash";

export const MAX_SECONDS = 60 * 10; // 10 minutes

export async function youtubeDownload(channel: TextChannel, url: string) {
  if(!ytdl.validateURL(url)){
    return channel.send('Video url is not valid!');
  }

  const message = await channel.send('Preparing...')
  const info = await ytdl.getInfo(url);
  const trackName = `${info.videoDetails.title.replace(/\//, '').replace(/\\/, '')}.mp3`;

  if (await trackExist(trackName)) {
    await message.edit('Track already exist!');
    return;
  }

  if (info.videoDetails.isLiveContent) {
    await message.edit('Cannot play live!')
    return 
  }
  
  const seconds = parseInt(info.videoDetails.lengthSeconds);
  if (isNaN(seconds)) {
    await message.edit(`Something went wrong try again later!`);
    return;
  }

  if (seconds > MAX_SECONDS) {
    await message.edit(`Video should not be longer than ${MAX_SECONDS} seconds!`)
    return;
  }
  let progress = 0;

  const updateDownloadMsg = async () => {
    message.edit(`Downloading ${progress}%`).catch(() => {});
  } 

  const download = ytdl.downloadFromInfo(info, {quality: "highestaudio"});

  download.on('progress', (chunk, downloaded, total) => {
    progress = Math.round(downloaded / total * 100);
  });

  let s: NodeJS.Timeout | undefined = setInterval(() => {
    updateDownloadMsg()
  }, 1000 * 5)

  const failedToDownload = (error:Error) => {
    if (s) {
      clearInterval(s);
    }
    message.edit(`Failed to download\n${error && error.stack}`);
    hasError = true;
  }
  let hasError = false;
  download.on('error', error => {
    hasError = true;
    failedToDownload(error);
  })
  const pathString = path.join(process.cwd(), TRACK_DIRECTORY_NAME, trackName); 
  try {
    if (!hasError) {
      await saveFile(download, pathString);
    }
  } catch (error) {
      failedToDownload(error);
  } finally {
    clearInterval(s);
  }
  s = undefined;
  if(hasError) return;
  message.edit(`Downloaded ${info.videoDetails.title}`).catch(() => {});
  addTrack(trackName);
}

export async function downloadAttachments(attachments: MessageAttachment[], channel:TextChannel) {
  const message = await channel.send('Preparing attachment downloader...');
  let trackName = '';
  let knownSize = false;
  let progress = 0;
  let gotError = false;

  const updateDownloadMsg = async () => {
    if(knownSize) {
      message.edit(`Downloading ${trackName} ${progress}%`).catch(() => {});
    } else {
      message.edit(`Downloading ${progress}`).catch(() => {});
    }
  } 

  let s = setInterval(() => {
    updateDownloadMsg()
  }, 1000 * 5)

  for (let i = 0; i < attachments.length; i++) {
    const attachment = attachments[i];
    const url = attachment.url;
    try {
      const attachmentName = attachment.name || `gen-${random(1000, 9999)}`;
      const streamPath = await downloadFile(url, attachmentName, (processReport, lengthKnown) => {
        progress = processReport;
        knownSize = lengthKnown;
      });
      const fileName = `${removeExtension(attachmentName).replace(/_/g, ' ')}.mp3`
      const pathString = path.join(process.cwd(), TRACK_DIRECTORY_NAME, fileName); 
      const name = getFileFromPath(streamPath);

      if (await trackExist(fileName)) {
        await channel.send(`Track \`${name}\` already exist!`);
        await unlinkPromise(streamPath);
        throw new Error('Track exist');
      }

      try {
        await saveFile(streamPath, pathString);
      } catch (error) {
        await channel.send(`Unable to convert \`${name}\`\n ${error.stack}!`);
        throw new Error(`Unable to download ${name}`)
      } finally {
        await unlinkPromise(streamPath);
      }

      addTrack(fileName);
      channel.send(`Downloaded \`${fileName}\``);
    } catch (error) {
      gotError = true
      channel.send(`Download failed! ${error.stack}}`);
    }
  }
  clearInterval(s);
  
  if (gotError) {
    message.edit(`Downloaded finished with errors!`);
  } else {
    message.edit(`Everything downloaded successfully!`);
  }
}

export async function downloadFile(url: string, name: string, progress: (number:number, lengthKnown: boolean) => void) {
  return new Promise<string>(async (resolve,reject) => {
    const pathJoin = path.join(process.cwd(), TEMP_DIRECTORY_NAME, name);
    const writer = createWriteStream(pathJoin);
    let length: number;
    let downloaded = 0;

    try {
      const result = await axios.get<Internal.Readable>(url, {
        responseType: 'stream',
        
      });
      const len = result.headers['content-length'];
      if(len) {
        length = parseInt(len, 10);
        if (isNaN(length)) {
          length = 0;
        }
      }
      result.data.on('data', chunk => {
        downloaded += chunk.length;
        if (length) {
          progress(Math.round(downloaded / length * 100), true);

        } else {
          progress(Math.round(downloaded), false);
        }
      })
      result.data.pipe(writer);
    } catch (error) {
      reject(error);
    }
    writer.on('error', error => {
      reject(error);
    });
    writer.on('finish', () => {
      resolve(writer.path as string);
    });
  })
} 

export async function saveFile(stream: Internal.Readable | string, savePath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => { 
      ffmpeg(stream)
          .audioBitrate(256)
          .audioChannels(2)
          .save(savePath)
          .on("end", () => {
              resolve();
          })
          .on('error', reject);
  })
}


export async function removeTrack(channel: TextChannel, track: string) {
  const tracks = getTracks();
  try {
    await deleteTrack(track);
    const index = tracks.indexOf(track);
    if (index !== -1) {
      tracks.splice(index, 1)
    }
    channel.send(`Track \`${track}\` has been deleted`);
  } catch (error) {
    console.error(error)
    channel.send('Something went wrong while trying to delete track!');
  }
}


export function getFileFromPath(file: string) {
  const leftSlash = file.lastIndexOf('\\');
  const rightSlash = file.lastIndexOf('/');
  if (rightSlash !== -1) {
    return file.slice(rightSlash + 1);
  }
  if (leftSlash !== -1) {
    return file.slice(leftSlash + 1);
  }
  return file;
}