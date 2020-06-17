import { Source, isHls, isDash, isMp4 } from './types'
import { SourceWithMimeType, ICorePlayer } from './coreplayer'

export default function createCorePlayer(
  source: SourceWithMimeType,
  video: HTMLVideoElement,
  sources: Source[] = [],
  fastSwitch = true
): Promise<ICorePlayer> {
  if (isHls(source.mime)) {
    return import('./coreplayer/hlsplayer')
      .then(module => module.HlsPlayer)
      .then(HlsPlayer => new HlsPlayer(video, source, fastSwitch))
  } else if (isDash(source.mime)) {
    return import('./coreplayer/dashplayer')
      .then(module => module.DashPlayer)
      .then(DashPlayer => new DashPlayer(video, source, fastSwitch))
  } else if (isMp4(source.mime)) {
    if (sources) {
      // return new NormalPlayer(video, sources)
    } else {
      throw new Error('none video sources')
    }
  }
  throw new Error('unsupported mime type')
}
