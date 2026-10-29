/** Only count playable data in the range containing the current media time. */
export function bufferedAhead(video: Pick<HTMLVideoElement, 'buffered' | 'currentTime'>): number {
  const { buffered, currentTime } = video;
  for (let index = 0; index < buffered.length; index += 1) {
    if (currentTime >= buffered.start(index) && currentTime <= buffered.end(index)) {
      return Math.max(0, buffered.end(index) - currentTime);
    }
  }
  return 0;
}
