import { IDisposable } from '../common/lifecycle'
import { DashPlayer } from './dashplayer'
import { HlsPlayer } from './hlsplayer'
import { MimeType, isHls, isDash } from '../types'
import { Event } from '../common/event'

export type PlayList = any[]

export interface ICorePlayer extends IDisposable {
  init(src: string): void
  onReceivePlayList: Event<PlayList>
  setQuality(key?: string): void
}

export function createCorePlayer(mime: MimeType, video: HTMLVideoElement): ICorePlayer {
  if (isHls(mime)) {
    return new HlsPlayer(video)
  } else if (isDash(mime)) {
    return new DashPlayer(video)
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
