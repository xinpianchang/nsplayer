import { toDisposable, IDisposable, combinedDisposable } from '../common/lifecycle'
import {
  PlayList,
  CorePlayer,
  SourceWithMimeType,
  QualityLevel,
  idToQualityLevel,
  isAutoQuality,
  qualityLevelToId,
} from '.'
import { MediaPlayer, MediaPlayerClass, MediaPlayerFactory, BitrateInfo } from 'dashjs'
import { Event } from '../common/event'

export class DashPlayer extends CorePlayer {
  public static setDefaultMediaPlayerFactory(factory: MediaPlayerFactory) {
    DashPlayer._mediaPlayerFactory = factory
  }

  public playList: PlayList = []

  private static _mediaPlayerFactory = MediaPlayer()
  private _dashPlayer: MediaPlayerClass
  /** currently only support video media type */
  private _mediaType: 'video' | 'audio' = 'video'

  constructor(video: HTMLVideoElement, source: SourceWithMimeType) {
    super(video, source)
    this._dashPlayer = DashPlayer._mediaPlayerFactory.create()
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

  private findLevelById(id: string) {
    const playLevel = idToQualityLevel(id)
    const levels = this.levels
    if (playLevel && levels.length) {
      // bitrate match
      let idx = levels.findIndex(level => level.bitrate, playLevel.bitrate)
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

    onManifestParsed(this.updatePlayList, this, disposables)
    onManifestParsed(this.setReady, this, disposables)
    onLevelSwitched(this.updateQualityLevel, this, disposables)

    this._register(combinedDisposable(...disposables))
  }

  public get name() {
    return 'DASHPlayer'
  }

  public setQualityById(id: string): void {
    const dashPlayer = this._dashPlayer
    if (isAutoQuality(id)) {
      dashPlayer.updateSettings({
        streaming: {
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
          abr: {
            autoSwitchBitrate: {
              [this._mediaType]: false,
            },
          },
        },
      })
      const nextQuality = this.findLevelById(id)
      dashPlayer.setQualityFor(this._mediaType, nextQuality)
      // audio switched
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
      return autoSwitchBitrate[this._mediaType] ?? true
    }
    return true
  }

  public get supportAutoQuality(): boolean {
    return true
  }
}
