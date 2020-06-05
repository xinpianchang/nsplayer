import { IDisposable } from '../common/lifecycle'
import { DashPlayer } from './dashplayer'
import { HlsPlayer } from './hlsplayer'
import { NormalPlayer } from './normalplayer'
import { MimeType, isHls, isDash, Source, isMp4 } from '../types'
import { Event } from '../common/event'

export type PlayList = any[]

export interface ICorePlayer extends IDisposable {
  init(src: string): void
  onReceivePlayList: Event<PlayList>
  setQuality(key?: string): void
}

export function createCorePlayer(
  mime: MimeType,
  video: HTMLVideoElement,
  sources?: Source[]
): ICorePlayer {
  if (isHls(mime)) {
    return new HlsPlayer(video)
  } else if (isDash(mime)) {
    return new DashPlayer(video)
  } else if (isMp4(mime)) {
    if (sources) {
      return new NormalPlayer(video, sources)
    } else {
      throw new Error('none video sources')
    }
  }
  throw new Error('unsupported mime type')
  // return DefaultPlayer(video)
}

export function createPlayList(quiltyList: any[]): PlayList {
  quiltyList.map(item => {
    const rs = item.height < item.width ? `height-${item.height}` : `width-${item.width}`
    item.key = `rs=${rs}#bitrate=${item.bitrate}`
  })
  return quiltyList
}
