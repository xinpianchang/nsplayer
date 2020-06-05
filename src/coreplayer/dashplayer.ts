import { Disposable, toDisposable } from '../common/lifecycle'
import { ICorePlayer, PlayList, createPlayList } from '.'
import { MediaPlayer, MediaPlayerClass, MediaPlayerFactory, MediaPlayerSettingClass } from 'dashjs'
import { Emitter } from '../common/event'

export class DashPlayer extends Disposable implements ICorePlayer {
  public static setDefaultMediaPlayerFactory(factory: MediaPlayerFactory) {
    DashPlayer._mediaPlayerFactory = factory
  }
  public playList: PlayList = []

  private static _mediaPlayerFactory = MediaPlayer()
  private _dashPlayer: MediaPlayerClass

  constructor(private _video: HTMLVideoElement) {
    super()
    this._dashPlayer = DashPlayer._mediaPlayerFactory.create()
    this._register(
      toDisposable(() => {
        this._dashPlayer.reset()
        // MediaPlayer().reset()
      })
    )
  }

  public init(src: string): void {
    const dashjsPlayer = this._dashPlayer
    const video = this._video

    dashjsPlayer.initialize(video, src, false)
    // dashjsPlayer.updateSettings(options)
    const STREAM_INITIALIZED = MediaPlayer.events.STREAM_INITIALIZED
    const handler = () => {
      // console.log(
      //   dashjsPlayer.getBitrateInfoListFor('video'),
      //   dashjsPlayer.getBitrateInfoListFor('audio'),
      //   'xxxxx'
      // )
      // this._onReceivePlayList.fire(evt)

      this.playList = createPlayList(dashjsPlayer.getBitrateInfoListFor('video'))
      this._onReceivePlayList.fire(this.playList)
    }

    dashjsPlayer.on(STREAM_INITIALIZED, handler, this)
    this._register(
      toDisposable(() => {
        dashjsPlayer.off(STREAM_INITIALIZED, handler, this)
      })
    )
  }

  public setQuality(key?: string): void {
    const dashPlayer = this._dashPlayer
    const index = this.playList.findIndex(item => item.key === key)
    if (dashPlayer) {
      const cfg: MediaPlayerSettingClass = {
        streaming: {
          abr: {
            autoSwitchBitrate: {
              video: index < 0,
              audio: true,
            },
          },
        },
      }
      if (index >= 0) {
        dashPlayer.updateSettings(cfg)
        dashPlayer.setQualityFor('video', index)
      } else {
        dashPlayer.updateSettings(cfg)
      }
    }
  }

  protected _onReceivePlayList = this._register(new Emitter<PlayList>())
  public onReceivePlayList = this._onReceivePlayList.event
}
