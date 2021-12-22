import { Source, isHls, isDash, isMp4 } from './types'
import { SourceWithMimeType, ICorePlayer } from './coreplayer'

export default function createCorePlayer(
  source: SourceWithMimeType,
  video: HTMLVideoElement,
  sources: Source[] = [],
  fastSwitch = true,
  callback: (corePlayer: ICorePlayer) => ICorePlayer | Promise<ICorePlayer> = id => id
): Promise<ICorePlayer> {
  if (isHls(source.mime)) {
    return import('./coreplayer/hlsplayer')
      .then(module => module.HlsPlayer)
      .then(HlsPlayer => callback(new HlsPlayer(video, source, fastSwitch)))
  } else if (isDash(source.mime)) {
    if (localStorage && localStorage.getItem('use_dash_js') === 'true') {
      return import('./coreplayer/dashplayer')
        .then(module => module.DashPlayer)
        .then(DashPlayer => callback(new DashPlayer(video, source, fastSwitch)))
    }
    return import('./coreplayer/shakaplayer')
      .then(module => module.ShakaPlayer)
      .then(ShakaPlayer => callback(new ShakaPlayer(video, source, fastSwitch)))
  } else if (isMp4(source.mime)) {
    if (sources) {
      return import('./coreplayer/baseplayer')
        .then(module => module.BasePlayer)
        .then(BasePlayer => callback(new BasePlayer(video, sources)))
    } else {
      throw new Error('none video sources')
    }
  }
  throw new Error('unsupported mime type')
}
