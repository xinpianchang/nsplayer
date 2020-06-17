import { toDisposable, DisposableStore } from '@newstudios/common/lifecycle'
import { CorePlayer, SourceWithMimeType, QualityLevel, idToQualityLevel } from '.'
import {
  MediaPlayer,
  MediaPlayerClass,
  MediaPlayerFactory,
  BitrateInfo,
  QualityChangeRequestedEvent,
  QualityChangeRenderedEvent,
} from 'dashjs'
import { Event } from '@newstudios/common/event'

export class DashPlayer extends CorePlayer<BitrateInfo> {
  public static setDefaultMediaPlayerFactory(factory: MediaPlayerFactory) {
    DashPlayer._mediaPlayerFactory = factory
  }

  private static _mediaPlayerFactory = MediaPlayer()
  /** currently only support video media type */
  private readonly _mediaType: 'video' | 'audio' = 'video'
  private readonly _fastSwitchEnabled: boolean
  private _dashPlayer: MediaPlayerClass
  private _currentLevelIndex = 0

  constructor(video: HTMLVideoElement, source: SourceWithMimeType, fastSwitch = true) {
    super(video, source)
    this._fastSwitchEnabled = fastSwitch
    this._dashPlayer = DashPlayer._mediaPlayerFactory.create()
    this._dashPlayer.updateSettings({
      streaming: {
        fastSwitchEnabled: this._fastSwitchEnabled,
      },
    })

    // debug error
    this.debugError()
    this._register(toDisposable(() => this._dashPlayer.reset()))
  }

  private debugError() {
    const onError = Event.fromNodeEventEmitter(this._dashPlayer, MediaPlayer.events.ERROR)
    const onPlaybackError = Event.fromNodeEventEmitter(
      this._dashPlayer,
      MediaPlayer.events.PLAYBACK_ERROR
    )
    this._register(onError(err => console.info(err)))
    this._register(onPlaybackError(err => console.info(err)))
  }

  protected get levels() {
    return this._dashPlayer.getBitrateInfoListFor(this._mediaType)
  }

  protected get currentLevel(): BitrateInfo | undefined {
    return this.levels[this._currentLevelIndex]
  }

  protected get nextLevel(): BitrateInfo | undefined {
    return this.levels[this._dashPlayer.getQualityFor(this._mediaType)]
  }

  protected get autoQualityEnabled(): boolean {
    const autoSwitchBitrate = this._dashPlayer.getSettings().streaming?.abr?.autoSwitchBitrate
    if (autoSwitchBitrate) {
      return typeof autoSwitchBitrate[this._mediaType] === 'boolean'
        ? (autoSwitchBitrate[this._mediaType] as boolean)
        : true
    }
    return true
  }

  protected levelToQuality(bitrateInfo: BitrateInfo): QualityLevel {
    const level: QualityLevel = {
      bitrate: bitrateInfo.bitrate,
      width: bitrateInfo.width,
      height: bitrateInfo.height,
      type: bitrateInfo.mediaType,
    }
    return level
  }

  protected findLevelIndexById(id: string) {
    const playLevel = idToQualityLevel(id)
    const levels = this.levels
    if (playLevel && levels.length) {
      // bitrate match
      let idx = levels.findIndex(level => level.bitrate === playLevel.bitrate)
      if (idx >= 0) {
        return idx
      }
      // short side match
      const shortSide = Math.min(playLevel.width, playLevel.height)
      idx = levels.findIndex(level => Math.min(level.width, level.height) === shortSide)
      if (idx >= 0) {
        return idx
      }
    }
    return -1
  }

  protected setAutoQualityState(auto: boolean) {
    const dashPlayer = this._dashPlayer
    dashPlayer.updateSettings({
      streaming: {
        fastSwitchEnabled: this._fastSwitchEnabled,
        abr: {
          autoSwitchBitrate: {
            [this._mediaType]: auto,
          },
        },
      },
    })
  }

  protected setNextLevelIndex(index: number) {
    const dashPlayer = this._dashPlayer
    if (index >= 0) {
      dashPlayer.setQualityFor(this._mediaType, index)
    }
  }

  protected setInitialBitrate(bitrate: number) {
    const dashPlayer = this._dashPlayer
    dashPlayer.updateSettings({
      streaming: {
        fastSwitchEnabled: this._fastSwitchEnabled,
        abr: {
          autoSwitchBitrate: {
            [this._mediaType]: false,
          },
          initialBitrate: {
            [this._mediaType]: bitrate,
          },
        },
      },
    })
  }

  protected onInit(video: HTMLVideoElement, source: SourceWithMimeType): void {
    const dashPlayer = this._dashPlayer
    dashPlayer.initialize(video, source.src, this.video.autoplay)

    const disposables = new DisposableStore()
    const onManifestParsed = Event.fromNodeEventEmitter(
      dashPlayer,
      MediaPlayer.events.STREAM_INITIALIZED
    )

    const onLevelSwitched = Event.filter(
      Event.fromNodeEventEmitter<QualityChangeRenderedEvent>(
        dashPlayer,
        MediaPlayer.events.QUALITY_CHANGE_RENDERED
      ),
      evt => evt.mediaType === this._mediaType
    )

    const onLevelSwitching = Event.filter(
      Event.fromNodeEventEmitter<QualityChangeRequestedEvent>(
        dashPlayer,
        MediaPlayer.events.QUALITY_CHANGE_REQUESTED
      ),
      evt => evt.mediaType === this._mediaType
    )

    onManifestParsed(this.updatePlayList, this, disposables)
    onManifestParsed(this.setReady, this, disposables)
    onLevelSwitching(this.updateNextQualityLevel, this, disposables)
    onLevelSwitched(
      evt => {
        this._currentLevelIndex = evt.newQuality
        this.updateQualityLevel()
      },
      null,
      disposables
    )

    this._register(disposables)
  }

  public get name() {
    return `DASHPlayer (${this._dashPlayer.getVersion()})`
  }

  public get supportAutoQuality(): boolean {
    return true
  }
}
