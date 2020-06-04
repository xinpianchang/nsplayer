import { Disposable, toDisposable } from '../common/lifecycle'
import { ICorePlayer, PlayList } from '.'
import { Emitter } from '../common/event'
import Hls from 'hls.js'

// const STREAM_INITIALIZED = Dash.MediaPlayer.events.STREAM_INITIALIZED

export class HlsPlayer extends Disposable implements ICorePlayer {
  private _hlsPlayer?: Hls
  constructor(private _video: HTMLVideoElement) {
    super()
    if (Hls.isSupported()) {
      const hlsPlayer = new Hls()
      this._hlsPlayer = hlsPlayer
      this._register(toDisposable(() => hlsPlayer.destroy()))
    } else {
      // nothing
    }
  }

  public init(src: string): void {
    const hlsPlayer = this._hlsPlayer
    const video = this._video

    if (hlsPlayer) {
      hlsPlayer.loadSource(src)
      hlsPlayer.attachMedia(video)

      const handler = () => {
        this._onReceivePlayList.fire(hlsPlayer.levels)
        console.log(hlsPlayer.levels)
      }

      hlsPlayer.on(Hls.Events.LEVEL_LOADING, handler)

      // dashjsPlayer.initialize(video, src, false)
      // dashjsPlayer.updateSettings(options)

      // dashjsPlayer.on(STREAM_INITIALIZED, handler, this)
      this._register(
        toDisposable(() => {
          hlsPlayer.off(Hls.Events.LEVEL_LOADING, handler)
        })
      )
    }
  }

  protected _onReceivePlayList = this._register(new Emitter<PlayList>())
  public onReceivePlayList = this._onReceivePlayList.event
}
