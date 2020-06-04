import { IDisposable } from '../common/lifecycle'
import { Event } from '../common/event'
import { DashPlayer } from './dashplayer'
import { HlsPlayer } from './hlsplayer'
import { VideoType } from '../types'

export type PlayList = any[]

export interface ICorePlayer extends IDisposable {
  init(src: string): void
  // onReceivePlayList: Event<any[]>
}

function createCorePlayer(
  type: VideoType,
  video: HTMLVideoElement,
  options: any = {},
  onReceivePlayList: Event<PlayList>
): ICorePlayer {
  if (type === 'hls') {
    return new HlsPlayer(video, options.hls, onReceivePlayList)
  }
  if (type === 'dash') {
    return new DashPlayer(video, options.dash, onReceivePlayList)
  }
  return null as any
}

export default createCorePlayer
