import { Disposable, toDisposable } from '../common/lifecycle'
import { ICorePlayer, PlayList, createPlayList } from '.'
import { Emitter } from '../common/event'
import Hls from 'hls.js'

// const STREAM_INITIALIZED = Dash.MediaPlayer.events.STREAM_INITIALIZED

export class HlsPlayer extends Disposable implements ICorePlayer {
  private _hlsPlayer?: Hls
  public playList: PlayList = []
  constructor(private _video: HTMLVideoElement) {
    super()
    if (Hls.isSupported()) {
      const hlsPlayer = new Hls()
      this._hlsPlayer = hlsPlayer
      // this.init(_video.src)
      this._register(toDisposable(() => hlsPlayer.destroy()))
    } else {
      // nothing
    }
  }

  public init(src: string): void {
    const hlsPlayer = this._hlsPlayer
    // console.log(hlsPlayer)
    const video = this._video

    if (hlsPlayer) {
      hlsPlayer.loadSource(src)
      hlsPlayer.attachMedia(video)

      const handler = () => {
        this.playList = createPlayList(hlsPlayer.levels)
        this._onReceivePlayList.fire(this.playList)
      }
      // hlsPlayer.on(Hls.Events.LEVEL_LOADED, handler)

      hlsPlayer.on(Hls.Events.MEDIA_ATTACHED, handler)

      this._register(
        toDisposable(() => {
          hlsPlayer.off(Hls.Events.LEVEL_LOADED, handler)
        })
      )
    }
  }

  public setQuality(key?: string): void {
    const hlsPlayer = this._hlsPlayer
    const index = this.playList.findIndex(item => item.key === key)
    if (hlsPlayer) {
      hlsPlayer.currentLevel = index
    }
  }

  protected _onReceivePlayList = this._register(new Emitter<PlayList>())
  public onReceivePlayList = this._onReceivePlayList.event
}
