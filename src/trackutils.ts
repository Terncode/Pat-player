import { getTracks } from "./player";

interface TrackScore {
  fullName: string,
  score: number
}

export function queryTrack(query: string[]) {
  for (let i = 0; i < query.length; i++) {
    query[i] = query[i].replace(/_/g, " ").replace(/-/g, " ");
  }

  let tracksScores: TrackScore[] = [];
  const tracks = getTracks();
  for (let i = 0; i < tracks.length; i++) {
    let score = 0;
    const fullName = tracks[i];
    const value = removeExtension(fullName).toLowerCase()
                                            .replace(/_/g, " ")
                                            .replace(/-/g, " ")
                                            .replace(/  +/g, " ");
    for (let j = 0; j < query.length; j++) {
      if (value === query[j]) {
        score += 100;
      }else if (value.includes(query[j])) {
        score++;
      }
    }
    tracksScores.push({fullName, score});
  }
  return tracksScores.sort((a,b) => a.score > b.score ? -1 : 1);
}

export function removeExtension(trackName: string) {
  const dotIndex = trackName.lastIndexOf('.');
  if (dotIndex === -1) {
    return trackName;
  }
  return trackName.slice(0, dotIndex);
}

export function truncateName(trackName: string, size: number) {
  if(trackName.length > size) {
    return `${trackName.slice(0, size)}...`;
  }
  return trackName;
}