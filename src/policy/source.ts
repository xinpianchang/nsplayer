import { Source, isHls, getMimeType, isDash, isMp4, isSafari, isMobile } from '../types'
import { QualityLevel, SourceWithMimeType } from '../coreplayer'

export type SourcePolicy = (sources: Source[]) => SourceWithMimeType | undefined

export interface SourceMap {
  dash: SourceWithMimeType[]
  hls: SourceWithMimeType[]
  mp4: SourceWithMimeType[]
}

const DefaultSorter = (s1: Source, s2: Source) => {
  if (s1.bitrate && s2.bitrate) {
    return s1.bitrate - s2.bitrate
  }
  if (s1.width && s1.height && s2.width && s2.height) {
    return Math.min(s1.width, s1.height) - Math.min(s2.width, s2.height)
  }
  if (s1.fps && s2.fps) {
    return Number(s1.fps) - Number(s2.fps)
  }
  return 0
}

declare const WebKitMediaSource: typeof MediaSource

export function supportMediaSource() {
  return typeof window !== undefined && typeof (MediaSource || WebKitMediaSource) === 'function'
}

/**
 * 通过可播放资源，以及当前浏览器环境，推算出使用的资源
 * @param sources 所有可播放的资源列表
 */
export const DefaultSourcePolicy: SourcePolicy = sources => {
  const sourceMap: SourceMap = {
    dash: [],
    hls: [],
    mp4: [],
  }
  for (const source of sources) {
    const { src } = source
    let { mime } = source
    if (!mime) {
      source.mime = mime = getMimeType(src)
    }
    if (mime) {
      if (isHls(mime)) {
        sourceMap.hls.push(source as SourceWithMimeType)
      } else if (isDash(mime)) {
        sourceMap.dash.push(source as SourceWithMimeType)
      } else if (isMp4(mime)) {
        sourceMap.mp4.push(source as SourceWithMimeType)
      }
    }
  }
  sourceMap.dash.sort(DefaultSorter)
  sourceMap.hls.sort(DefaultSorter)
  sourceMap.mp4.sort(DefaultSorter)

  /**
   * Workaround because android dose not support dash well
   */
  if ((isSafari() || isMobile()) && sourceMap.hls.length) {
    return sourceMap.hls[0]
  }

  if (sourceMap.dash.length && supportMediaSource()) {
    return sourceMap.dash[0]
  }

  if (sourceMap.hls.length && supportMediaSource()) {
    return sourceMap.hls[0]
  }

  if (sourceMap.mp4.length) {
    return sourceMap.mp4[0]
  }
}

const sourceKeys = ['src', 'bitrate', 'fps', 'height', 'width', 'mime'] as const

export function isSourceEqual(s1: Source, s2: Source) {
  return sourceKeys.every(k => s1[k] === s2[k])
}

export function areSourcesEqual(s1: Source[], s2: Source[]) {
  if (s1.length !== s2.length) {
    return false
  }
  return s1.every((s, idx) => isSourceEqual(s, s2[idx]))
}

export function isLevelMatch(source: QualityLevel, target: QualityLevel) {
  if (source.type && target.type && source.type !== target.type) {
    return false
  }
  if (Math.min(source.width, source.height) > Math.min(target.width, target.height)) {
    return false
  }
  return true
}
