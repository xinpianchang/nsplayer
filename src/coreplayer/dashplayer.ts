import { toDisposable, IDisposable, combinedDisposable } from '../common/lifecycle'
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
} from 'dashjs'
import { Event } from '../common/event'

export class DashPlayer extends CorePlayer {
  public static setDefaultMediaPlayerFactory(factory: MediaPlayerFactory) {
    DashPlayer._mediaPlayerFactory = factory
  }

  private static _mediaPlayerFactory = MediaPlayer()
  private _dashPlayer: MediaPlayerClass
  /** currently only support video media type */
  private _mediaType: 'video' | 'audio' = 'video'

  constructor(video: HTMLVideoElement, source: SourceWithMimeType) {
    super(video, source)
    this._dashPlayer = DashPlayer._mediaPlayerFactory.create()
    this._dashPlayer.updateSettings({
      streaming: {
        fastSwitchEnabled: true,
      },
    })
    this._register(toDisposable(() => this._dashPlayer.reset))
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

  private get currentLevel() {
    return this.levels[this._dashPlayer.getQualityFor(this._mediaType)]
  }

  private requestQualityLevel(evt: QualityChangeRequestedEvent) {
    const level = this.levels[evt.newQuality]
    if (level) {
      const qualityLevel = this.dashBitrateInfoToQuality(level)
      this._onQualitySwitching.fire(qualityLevel)
    }
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
    // const onLevelsUpdated = Event.fromNodeEventEmitter(hlsPlayer, Hls.Events.LEVELS_UPDATED)
    const onLevelSwitched = Event.fromNodeEventEmitter(
      dashPlayer,
      MediaPlayer.events.QUALITY_CHANGE_RENDERED
    )
    const onLevelSwitching = Event.fromNodeEventEmitter<QualityChangeRequestedEvent>(
      dashPlayer,
      MediaPlayer.events.QUALITY_CHANGE_REQUESTED
    )

    onManifestParsed(this.updatePlayList, this, disposables)
    onManifestParsed(this.setReady, this, disposables)
    onLevelSwitching(this.requestQualityLevel, this, disposables)
    onLevelSwitched(this.updateQualityLevel, this, disposables)

    this._register(combinedDisposable(...disposables))
  }

  public get name() {
    return `DASHPlayer (${this._dashPlayer.getVersion()})`
  }

  public setQualityById(id: string, fastSwitch = false): void {
    const dashPlayer = this._dashPlayer
    if (this.isReady()) {
      // dashPlayer.setTrackSwitchModeFor('video', 'alwaysReplace')
      if (isAutoQuality(id)) {
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
      } else {
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
        const nextQuality = this.findLevelById(id)
        dashPlayer.setQualityFor(this._mediaType, nextQuality)
        // TODO audio switched
      }
    } else {
      if (id === 'auto') {
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
