import Hls from 'hls.js'
import { toDisposable, IDisposable, combinedDisposable } from '@newstudios/common/lifecycle'
import {
  CorePlayer,
  SourceWithMimeType,
  isAutoQuality,
  idToQualityLevel,
  QualityLevel,
  qualityLevelToId,
} from '.'
import { Event } from '@newstudios/common/event'
import { onUnexpectedError } from '@newstudios/common/errors'

const supportMSE = Hls.isSupported()

export class HlsPlayer extends CorePlayer {
  private _hlsPlayer?: Hls
  private _nextLevel = -1

  constructor(video: HTMLVideoElement, source: SourceWithMimeType) {
    super(video, source)
    if (supportMSE) {
      const hlsPlayer = new Hls()
      this._hlsPlayer = hlsPlayer
      this._register(toDisposable(() => hlsPlayer.destroy()))
    }
  }

  protected translatePlayList() {
    const levels = this.levels
    return levels.map(level => this.hlsLevelToQuality(level))
  }

  protected translateCurrentQuality() {
    const level = this.currentLevel
    if (level) {
      return this.hlsLevelToQuality(level)
    }
  }

  private get levels() {
    return this._hlsPlayer?.levels || []
  }

  private get currentLevel() {
    return this._hlsPlayer?.levels[this._hlsPlayer?.currentLevel]
  }

  private requestQualityLevel() {
    const level = this.levels[this._nextLevel]
    if (level) {
      const qualityLevel = this.hlsLevelToQuality(level)
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

  private hlsLevelToQuality(hlsLevel: Hls.Level): QualityLevel {
    const level: { -readonly [k in keyof QualityLevel]: QualityLevel[k] } = {
      bitrate: hlsLevel.bitrate,
      width: hlsLevel.width,
      height: hlsLevel.height,
    }
    if (hlsLevel.videoCodec) {
      level.type = 'video'
    }
    return level
  }

  protected onInit(video: HTMLVideoElement, source: SourceWithMimeType) {
    const hlsPlayer = this._hlsPlayer
    if (hlsPlayer) {
      const disposables: IDisposable[] = []
      const onManifestParsed = Event.fromNodeEventEmitter(hlsPlayer, Hls.Events.MANIFEST_PARSED)
      const onLevelsUpdated = Event.fromNodeEventEmitter(hlsPlayer, Hls.Events.LEVEL_UPDATED)
      const onLevelSwitched = Event.fromNodeEventEmitter(hlsPlayer, Hls.Events.LEVEL_SWITCHED)
      const onLevelSwitching = Event.fromNodeEventEmitter(hlsPlayer, Hls.Events.LEVEL_SWITCHING)

      onLevelsUpdated(this.updatePlayList, this, disposables)
      onManifestParsed(this.updatePlayList, this, disposables)
      onManifestParsed(this.setReady, this, disposables)
      onManifestParsed(() => video.autoplay && video.play())
      onLevelSwitching(this.requestQualityLevel, this, disposables)
      onLevelSwitched(this.updateQualityLevel, this, disposables)

      hlsPlayer.attachMedia(video)
      hlsPlayer.loadSource(source.src)

      this._register(combinedDisposable(...disposables))
    } else {
      this.video.src = source.src
      if (!this.video.canPlayType(source.mime)) {
        onUnexpectedError(
          new Error('hlsplayer src not supported: ' + source.src + ', mime: ' + source.mime)
        )
      }
      this.updatePlayList()
    }
  }

  public get name() {
    return `HLSPlayer (${Hls.version})`
  }

  public setQualityById(id: string, fastSwitch = false): void {
    const hlsPlayer = this._hlsPlayer
    if (hlsPlayer) {
      let nextLevel: number
      if (isAutoQuality(id)) {
        nextLevel = -1
        const qualityLevel = this.qualityLevel
        if (qualityLevel) {
          setTimeout(() => this._onQualityChange.fire(qualityLevel))
        }
      } else {
        nextLevel = this.findLevelById(id)
      }
      this._nextLevel = nextLevel
      if (this.isReady()) {
        if (fastSwitch) {
          hlsPlayer.nextLevel = nextLevel
        } else {
          hlsPlayer.loadLevel = nextLevel
        }
      } else {
        hlsPlayer.startLevel = nextLevel
        if (id !== 'auto') {
          const qualityLevel = idToQualityLevel(id)
          if (qualityLevel) {
            setTimeout(() => this._onQualityChange.fire(qualityLevel))
          }
        }
      }
    }
  }

  public get qualityId(): string {
    if (this.currentLevel) {
      return qualityLevelToId(this.hlsLevelToQuality(this.currentLevel))
    } else {
      return 'auto'
    }
  }

  public get autoQuality(): boolean {
    const hlsPlayer = this._hlsPlayer
    if (hlsPlayer) {
      return hlsPlayer.autoLevelEnabled
    }
    return true
  }

  public get supportAutoQuality(): boolean {
    return true
  }
}
