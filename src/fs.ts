import { readdir, readdirSync, unlink, access, constants } from 'fs';
import path from 'path';

export const TRACK_DIRECTORY_NAME = 'tracks';
export const TEMP_DIRECTORY_NAME = 'temp';

export function getAllTracks() {
  return new Promise<string[]>((resolve, reject) => {
    readdir(TRACK_DIRECTORY_NAME, (err, files)=> {
      if (err) {
        return reject(err);
      }
      resolve(files);
    })
  })
}

export function trackExist(track: string) {
  return new Promise<boolean>((resolve) => {
    const pathString = path.join(process.cwd(), TRACK_DIRECTORY_NAME, track);  
    access(pathString, constants.F_OK, (err)=> {
      if (err) {
        return resolve(false);
      }
      resolve(true);
    })
  })
}


export async function deleteTrack(track: string) {
  const pathString = path.join(process.cwd(), TRACK_DIRECTORY_NAME, track);
  await unlinkPromise(pathString)
}
export function unlinkPromise(path:string) {
  return new Promise<void>((resolve, reject) => {
    unlink(path, (err) => {
      if (err) {
        return reject(err);
      }
      resolve();
    });
  });
}

export function getAllTracksAsync() {
  return readdirSync(TRACK_DIRECTORY_NAME);
}