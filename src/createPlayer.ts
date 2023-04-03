import { Source, isHls, isDash, isMp4 } from './types'
import { SourceWithMimeType, ICorePlayer } from './coreplayer'
import { isSafari } from './types'

export default function createCorePlayer(
  source: SourceWithMimeType,
  video: HTMLVideoElement,
  sources: Source[] = [],
  fastSwitch = true,
  capLevelToPlayerSize = false,
  callback: (corePlayer: ICorePlayer) => ICorePlayer | Promise<ICorePlayer> = id => id
): Promise<ICorePlayer> {
  if (isHls(source.mime)) {
    return import('./coreplayer/hlsplayer')
      .then(module => module.HlsPlayer)
      .then(HlsPlayer => callback(new HlsPlayer(video, source, fastSwitch, capLevelToPlayerSize)))
  } else if (isDash(source.mime)) {
    let use_dash_js = false // shaka-player bundle size is smaller than dash.js
    const manuallySetTarget = (localStorage && localStorage.getItem('use_dash_js')) || null
    if (manuallySetTarget !== null) {
      use_dash_js = manuallySetTarget === 'true' || manuallySetTarget === '1'
    }
    if (use_dash_js) {
      return import('./coreplayer/dashplayer')
        .then(module => module.DashPlayer)
        .then(DashPlayer =>
          callback(new DashPlayer(video, source, fastSwitch, capLevelToPlayerSize))
        )
    }
    return import('./coreplayer/shakaplayer')
      .then(module => module.ShakaPlayer)
      .then(ShakaPlayer =>
        callback(new ShakaPlayer(video, source, fastSwitch, capLevelToPlayerSize))
      )
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
