import { Disposable, toDisposable } from '../common/lifecycle'
import { ICorePlayer, PlayList } from '.'
import { Event } from '../common/event'
import Dash from 'dash.js'

console.log(Dash)

export class DashPlayer extends Disposable implements ICorePlayer {
  private _dashPlayer: any
  constructor(
    private _video: HTMLVideoElement,
    private _options: any = {},
    private _onReceivePlayList: Event<PlayList>
  ) {
    super()
    this._dashPlayer = Dash.MediaPlayer().create()
    this._register(
      toDisposable(() => {
        this._dashPlayer.destroy()
        Dash.MediaPlayer().reset()
      })
    )
  }

  public init(src: string): void {
    const dashjsPlayer = this._dashPlayer
    const video = this._video
    const options = this._options

    dashjsPlayer.initialize(video, src, false)
    dashjsPlayer.updateSettings(options)
    const STREAM_INITIALIZED = Dash.MediaPlayer.events.STREAM_INITIALIZED
    const handler = (evt: any[]) => {
      console.log(dashjsPlayer.getBitrateInfoListFor('video'), 'xxxxx')
      this._onReceivePlayList.fire(evt)
    }

    dashjsPlayer.on(STREAM_INITIALIZED, handler, this)
    this._register(
      toDisposable(() => {
        dashjsPlayer.off(STREAM_INITIALIZED, handler, this)
      })
    )
  }

  // protected _onReceivePlayList = this._register(new Emitter<PlayList>())
  // public onReceivePlayList = this._onReceivePlayList.event
}
