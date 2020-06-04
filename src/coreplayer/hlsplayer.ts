import { Disposable, toDisposable } from '../common/lifecycle'
import { ICorePlayer, PlayList } from '.'
import { Emitter, Event } from '../common/event'
import Hls from 'hls.js'

// const STREAM_INITIALIZED = Dash.MediaPlayer.events.STREAM_INITIALIZED

export class HlsPlayer extends Disposable implements ICorePlayer {
  private _hlsPlayer: any
  constructor(
    private _video: HTMLVideoElement,
    private _options: any = {},
    private _onReceivePlayList: Event<PlayList>
  ) {
    super()
    if (Hls.isSupported()) {
      // const options = this.opts.pluginOptions?.hls
      this._hlsPlayer = new Hls(_options)
      this.init(_video.src)
      this._register(
        toDisposable(() => {
          this._hlsPlayer.destroy()
        })
      )
    } else {
      alert('Error: Hls is not supported.')
    }
    // this._dashPlayer = Dash.MediaPlayer().create()
  }
  // onReceivePlayList: import("../common/event").Event<any[]>

  public init(src: string): void {
    const hlsPlayer = this._hlsPlayer
    const video = this._video

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
        hlsPlayer.off(Hls.Events.LEVEL_LOADING, handler, this)
      })
    )
  }

  // protected _onReceivePlayList = this._register(new Emitter<PlayList>())
  // public onReceivePlayList = this._onReceivePlayList.event
}
