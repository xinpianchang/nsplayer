import { IDisposable } from '../common/lifecycle'
import { DashPlayer } from './dashplayer'
import { HlsPlayer } from './hlsplayer'
import { MimeType, isHls, isDash } from '../types'

export type PlayList = any[]

export interface ICorePlayer extends IDisposable {
  init(src: string): void
  // onReceivePlayList: Event<any[]>
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
