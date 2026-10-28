/** 暂停恢复时只跳到已下载的连续缓冲内，保留两秒余量避免落在未发布的直播边缘。 */
export function resumeLivePlayback(video: HTMLVideoElement): void {
  const ranges = video.buffered;
  if (ranges.length === 0) return;
  const last = ranges.length - 1;
  const start = ranges.start(last);
  const end = ranges.end(last);
  const target = end - 2;
  if (target < start || end - video.currentTime <= 3) return;
  video.currentTime = target;
}
