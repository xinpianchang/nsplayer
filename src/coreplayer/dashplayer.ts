import { toDisposable, IDisposable, combinedDisposable } from '@newstudios/common/lifecycle'
import {
  CorePlayer,
  SourceWithMimeType,
  QualityLevel,
  idToQualityLevel,
  isAutoQuality,
  qualityLevelToId,
} from '.'
import {
  MediaPlayer,
  MediaPlayerClass,
  MediaPlayerFactory,
  BitrateInfo,
  QualityChangeRequestedEvent,
  QualityChangeRenderedEvent,
} from 'dashjs'
import { Event } from '@newstudios/common/event'

export class DashPlayer extends CorePlayer {
  public static setDefaultMediaPlayerFactory(factory: MediaPlayerFactory) {
    DashPlayer._mediaPlayerFactory = factory
  }

  private static _mediaPlayerFactory = MediaPlayer()
  private _dashPlayer: MediaPlayerClass
  /** currently only support video media type */
  private _mediaType: 'video' | 'audio' = 'video'
  private _currentLevelIndex = 0

  constructor(video: HTMLVideoElement, source: SourceWithMimeType) {
    super(video, source)
    this._dashPlayer = DashPlayer._mediaPlayerFactory.create()
    this._dashPlayer.updateSettings({
      streaming: {
        fastSwitchEnabled: true,
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

  protected translatePlayList() {
    const levels = this.levels
    return levels.map(level => this.dashBitrateInfoToQuality(level))
  }

  protected translateCurrentQuality() {
    const level = this.currentLevel
    if (level) {
      return this.dashBitrateInfoToQuality(level)
    }
  }

  private get levels() {
    return this._dashPlayer.getBitrateInfoListFor(this._mediaType)
  }

  private get currentLevel(): BitrateInfo | undefined {
    return this.levels[this._currentLevelIndex]
  }

  private requestQualityLevel(evt: QualityChangeRequestedEvent) {
    this._currentLevelIndex = evt.oldQuality
    const level = this.levels[evt.newQuality]
    if (level) {
      const qualityLevel = this.dashBitrateInfoToQuality(level)
      this._onQualitySwitching.fire(qualityLevel)
    }
  }

  private setUpdatedQualityLevel(evt: QualityChangeRenderedEvent) {
    this._currentLevelIndex = evt.newQuality
    this.updateQualityLevel()
  }

  private findLevelById(id: string) {
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

  private dashBitrateInfoToQuality(bitrateInfo: BitrateInfo): QualityLevel {
    const level: QualityLevel = {
      bitrate: bitrateInfo.bitrate,
      width: bitrateInfo.width,
      height: bitrateInfo.height,
      type: bitrateInfo.mediaType,
    }
    return level
  }

  protected onInit(video: HTMLVideoElement, source: SourceWithMimeType): void {
    const dashPlayer = this._dashPlayer
    dashPlayer.initialize(video, source.src, this.video.autoplay)

    const disposables: IDisposable[] = []
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
    onLevelSwitching(this.requestQualityLevel, this, disposables)
    onLevelSwitched(this.setUpdatedQualityLevel, this, disposables)

    this._register(combinedDisposable(...disposables))
  }

  public get name() {
    return `DASHPlayer (${this._dashPlayer.getVersion()})`
  }

  public setQualityById(id: string, fastSwitch = false): void {
    const dashPlayer = this._dashPlayer
    if (isAutoQuality(id)) {
      if (!this.autoQuality) {
        dashPlayer.updateSettings({
          streaming: {
            fastSwitchEnabled: fastSwitch,
            abr: {
              autoSwitchBitrate: {
                [this._mediaType]: true,
              },
            },
          },
        })
      }
    } else {
      if (this.isReady()) {
        if (this.autoQuality) {
          dashPlayer.updateSettings({
            streaming: {
              fastSwitchEnabled: fastSwitch,
              abr: {
                autoSwitchBitrate: {
                  [this._mediaType]: false,
                },
              },
            },
          })
        }
        const nextQuality = this.findLevelById(id)
        dashPlayer.setQualityFor(this._mediaType, nextQuality)
      } else {
        const qualityLevel = idToQualityLevel(id)
        if (qualityLevel) {
          dashPlayer.updateSettings({
            streaming: {
              fastSwitchEnabled: fastSwitch,
              abr: {
                autoSwitchBitrate: {
                  [this._mediaType]: false,
                },
                initialBitrate: {
                  [this._mediaType]: qualityLevel.bitrate,
                },
              },
            },
          })
          // quality level fired
          setTimeout(() => this._onQualityChange.fire(qualityLevel))
        }
      }
    }
  }

  public get qualityId(): string {
    if (this.currentLevel) {
      return qualityLevelToId(this.dashBitrateInfoToQuality(this.currentLevel))
    } else {
      return 'auto'
    }
  }

  public get autoQuality(): boolean {
    const autoSwitchBitrate = this._dashPlayer.getSettings().streaming?.abr?.autoSwitchBitrate
    if (autoSwitchBitrate) {
      return typeof autoSwitchBitrate[this._mediaType] === 'boolean'
        ? (autoSwitchBitrate[this._mediaType] as boolean)
        : true
    }
    return true
  }

  public get supportAutoQuality(): boolean {
    return true
  }
}
