import { Event } from './common/event'

export const VideoEventNameMap = {
  onEncypted: 'encrypted',
  onWaitingForKey: 'waitingforkey',
  onCanPlay: 'canplay',
  onCanPlayThrough: 'canplaythrough',
  onCueChange: 'cuechange',
  onDurationChange: 'durationchange',
  onEmptied: 'emptied',
  onEnded: 'ended',
  onError: 'error',
  onLoadedData: 'loadeddata',
  onLoadedMetaData: 'loadedmetadata',
  onLoadStart: 'loadstart',
  onPause: 'pause',
  onPlay: 'play',
  onPlaying: 'playing',
  onProgress: 'progress',
  onRateChange: 'ratechange',
  onSeeked: 'seeked',
  onSeeking: 'seeking',
  onStalled: 'stalled',
  onSuspend: 'suspend',
  onTimeUpdate: 'timeupdate',
  onVolumeChange: 'volumechange',
  onWaiting: 'waiting',
} as const

export type VideoEventNameMap = typeof VideoEventNameMap
export type BasePlayerWithEvent = {
  readonly [key in keyof VideoEventNameMap]: Event<HTMLVideoElementEventMap[VideoEventNameMap[key]]>
}

export type VideoEventName = keyof VideoEventNameMap
export const VideoEventNameArray = Object.keys(VideoEventNameMap) as VideoEventName[]

export const Quality = {
  Q240: '240p',
  Q320: '320p',
  Q360: '360p',
  Q480: '480p',
  Q540: '540p',
  Q640: '640p',
  Q720: '720p',
  Q1080: '1080p',
  Q1440: '1440p',
  Q2160: '2160p',
} as const

export type QualityMap = typeof Quality
export type QualityKey = keyof QualityMap
export type Quality = QualityMap[QualityKey]

export function is4K(quality: Quality): quality is '2160p' {
  return quality === Quality.Q2160
}

export function is2K(quality: Quality): quality is '1440p' {
  return quality === Quality.Q1440
}

export function isFHD(quality: Quality): quality is '1080p' {
  return quality === Quality.Q1080
}

export function isHD(quality: Quality): quality is '720p' {
  return quality === Quality.Q720
}

export function isSD(quality: Quality): quality is '640p' | '540p' {
  return quality === Quality.Q640 || quality === Quality.Q540
}

export const MimeTypeMap = {
  m3u8: ['application/x-mpegURL', 'application/vnd.apple.mpegURL'],
  mpd: ['application/dash+xml'],
  mp4: ['video/mp4'],
  m4s: ['video/iso.segment'],
  m4a: ['audio/mp4'],
  mp3: ['audio/mpeg'],
  aac: ['audio/aac'],
  ts: ['video/mp2t'],
} as const

export type MimeTypeMap = typeof MimeTypeMap
export type Extension = keyof MimeTypeMap
export type MimeType = MimeTypeMap[Extension][number]

export type SupportedExtension = 'm3u8' | 'mpd' | 'mp4'
export type SupportedMimeType = MimeTypeMap[SupportedExtension][number]
export const SupportedMimeTypes = ([] as string[])
  .concat(MimeTypeMap.m3u8)
  .concat(MimeTypeMap.mpd)
  .concat(MimeTypeMap.mp4) as SupportedMimeType[]

export const MimeTypes = Object.values(MimeTypeMap).reduce(
  (arr, items) => arr.concat(items),
  [] as MimeType[]
)

export function isSupportedMimeType(mimeType: string): mimeType is SupportedMimeType {
  return SupportedMimeTypes.indexOf(mimeType as SupportedMimeType) >= 0
}

export function isHls(mimeType: string): mimeType is MimeTypeMap['m3u8'][number] {
  return MimeTypeMap.m3u8.indexOf(mimeType as any) >= 0
}

export function isDash(mimeType: string): mimeType is MimeTypeMap['mpd'][number] {
  return MimeTypeMap.mpd.indexOf(mimeType as any) >= 0
}

export interface Source {
  quality?: Quality
  fps?: string
  width?: number
  height?: number
  src?: string
  bitrate?: number
  mime?: MimeType
}
