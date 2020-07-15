/* eslint-disable no-constant-condition */
import { Event } from '@newstudios/common/event'

export type Size = {
  width: number
  height: number
}

declare global {
  interface HTMLMediaElementEventMap {
    enterpictureinpicture: globalThis.Event
    leavepictureinpicture: globalThis.Event
    webkitplaybacktargetavailabilitychanged: WebKitPlaybackTargetAvailabilityEvent
  }

  /** airplay */
  interface WebKitPlaybackTargetAvailabilityEvent extends globalThis.Event {
    availability: 'available' | 'not-available'
  }

  /** airplay */
  interface Window {
    WebKitPlaybackTargetAvailabilityEvent?: WebKitPlaybackTargetAvailabilityEvent
  }

  interface Document {
    pictureInPictureEnabled: boolean
    pictureInPictureElement: HTMLVideoElement | null
    exitPictureInPicture(): Promise<void>
  }

  interface HTMLVideoElement {
    requestPictureInPicture?: () => Promise<void>
    // airplay
    webkitShowPlaybackTargetPicker?: () => void
  }
}

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
  onEnterPictureInPicture: 'enterpictureinpicture',
  onLeavePictureInPicture: 'leavepictureinpicture',
  onWebkitPlaybackTargetAvailabilityChanged: 'webkitplaybacktargetavailabilitychanged',
} as const

export type VideoEventNameMap = typeof VideoEventNameMap
type BasePlayerEventName = keyof VideoEventNameMap
export type BasePlayerWithEvent = {
  readonly [key in BasePlayerEventName]: Event<HTMLMediaElementEventMap[VideoEventNameMap[key]]>
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

export function isMp4(mimeType: string): mimeType is MimeTypeMap['mp4'][number] {
  return MimeTypeMap.mp4.indexOf(mimeType as any) >= 0
}

export function getMimeType(src: string): MimeType | undefined {
  const matched = src.match(/\.([^./\\]+)$/)
  if (matched) {
    const extension = matched[1].toLowerCase()
    if (extension in MimeTypeMap) {
      return MimeTypeMap[extension as Extension][0]
    }
  }
}

export function isSafari() {
  const chr = !!window.navigator.userAgent.match(/chrome/i)
  const sfri = !!window.navigator.userAgent.match(/safari/i)
  return !chr && sfri
}

export function assert(target: any): asserts target is true {
  if (!target) {
    throw new Error(`expect target but get [${target}]`)
  }
}

function dup(char: string, count: number): string {
  return [...new Array(count)].reduce(l => l + char, '')
}

function prefix(num: number, len: number): string {
  const t = String(num)
  if (t.length < len) {
    return `${dup('0', len - t.length)}${t}`
  }
  return t
}

/**
 * format the seconds time
 * @param timeInSeconds the number of seconds
 * @param format h:mm:ss.SSS
 */
export function formatTime(timeInSeconds: number, format: string) {
  const date = new Date(timeInSeconds * 1000)
  let time = format
  let changed = false

  const hh = ~~(timeInSeconds / 3600)
  {
    const ma = time.match(/(h+)/)
    if (ma) {
      const h = ma[1]
      time = time.replace(h, prefix(hh, h.length))
      changed = true
    }
  }

  const mm = changed ? date.getUTCMinutes() : ~~(timeInSeconds / 60)
  {
    const ma = time.match(/(m+)/)
    if (ma) {
      const m = ma[1]
      time = time.replace(m, prefix(mm, m.length))
      changed = true
    }
  }

  const ss = changed ? date.getUTCSeconds() : ~~timeInSeconds
  {
    const ma = time.match(/(s+)/)
    if (ma) {
      const s = ma[1]
      time = time.replace(s, prefix(ss, s.length))
    }
  }

  const SSS = changed ? date.getMilliseconds() : ~~(timeInSeconds * 1000)
  {
    const ma = time.match(/(S+)/)
    if (ma) {
      const S = ma[1]
      time = time.replace(S, prefix(SSS, S.length))
    }
  }

  return time
}

export interface Source {
  src: string
  fps?: string
  width?: number
  height?: number
  bitrate?: number
  mime?: MimeType
}
