import Hls from 'hls.js'
import { toDisposable, MutableDisposable, DisposableStore } from '@newstudios/common/lifecycle'
import { CorePlayer, SourceWithMimeType, idToQualityLevel, QualityLevel } from '.'
import { Event } from '@newstudios/common/event'
import { onUnexpectedError } from '@newstudios/common/errors'

const supportMSE = Hls.isSupported()

export class HlsPlayer extends CorePlayer<Hls.Level> {
  private _hlsPlayer?: Hls
  private _nextLevel = -1
  private readonly _fastSwitchEnabled: boolean
  private _readyDisposable = new MutableDisposable()

  constructor(video: HTMLVideoElement, source: SourceWithMimeType, fastSwitch = true) {
    super(video, source)
    this._fastSwitchEnabled = fastSwitch
    this._register(this._readyDisposable)
    if (supportMSE) {
      const hlsPlayer = new Hls()
      this._hlsPlayer = hlsPlayer
      this._register(toDisposable(() => hlsPlayer.destroy()))
    }
  }

  protected get levels() {
    return this._hlsPlayer?.levels || []
  }

  protected get currentLevel() {
    return this._hlsPlayer?.levels[this._hlsPlayer?.currentLevel]
  }

  protected get nextLevel() {
    return this._hlsPlayer?.levels[this._nextLevel]
  }

  protected get autoQualityEnabled(): boolean {
    const hlsPlayer = this._hlsPlayer
    if (hlsPlayer) {
      return hlsPlayer.autoLevelEnabled
    }
    return true
  }

  protected levelToQuality(hlsLevel: Hls.Level): QualityLevel {
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
    const hlsPlayer = this._hlsPlayer
    if (!hlsPlayer) {
      return
    }
    if (auto) {
      this._nextLevel = -1
      if (this._fastSwitchEnabled) {
        hlsPlayer.nextLevel = -1
      } else {
        hlsPlayer.loadLevel = -1
      }
    } else {
      this._nextLevel = hlsPlayer.currentLevel
    }
    this._readyDisposable.value = undefined
  }

  protected setNextLevelIndex(index: number) {
    const hlsPlayer = this._hlsPlayer
    if (!hlsPlayer) {
      return
    }
    this._nextLevel = index
    if (this._fastSwitchEnabled) {
      hlsPlayer.nextLevel = index
    } else {
      hlsPlayer.loadLevel = index
    }
    this._readyDisposable.value = undefined
  }

  protected setInitialBitrate(bitrate: number) {
    const hlsPlayer = this._hlsPlayer
    if (!hlsPlayer) {
      return
    }
    if (this.ready) {
      this._readyDisposable.value = undefined
      hlsPlayer.startLevel = this.levels.findIndex(level => level.bitrate === bitrate)
    } else {
      this._readyDisposable.value = this.onReady(() => this.setInitialBitrate(bitrate))
    }
  }

  protected onInit(video: HTMLVideoElement, source: SourceWithMimeType) {
    const hlsPlayer = this._hlsPlayer
    if (hlsPlayer) {
      const disposables = new DisposableStore()
      const onManifestParsed = Event.fromNodeEventEmitter(hlsPlayer, Hls.Events.MANIFEST_PARSED)
      const onLevelsUpdated = Event.fromNodeEventEmitter(hlsPlayer, Hls.Events.LEVEL_UPDATED)
      const onLevelSwitched = Event.fromNodeEventEmitter(hlsPlayer, Hls.Events.LEVEL_SWITCHED)
      const onLevelSwitching = Event.fromNodeEventEmitter(hlsPlayer, Hls.Events.LEVEL_SWITCHING)

      onLevelsUpdated(this.updatePlayList, this, disposables)
      onManifestParsed(this.updatePlayList, this, disposables)
      onManifestParsed(this.setReady, this, disposables)
      onManifestParsed(() => video.autoplay && video.play())
      onLevelSwitching(this.updateNextQualityLevel, this, disposables)
      onLevelSwitched(this.updateQualityLevel, this, disposables)

      hlsPlayer.attachMedia(video)
      hlsPlayer.loadSource(source.src)

      this._register(disposables)
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

  public get bandwidthEstimate(): number {
    const player = this._hlsPlayer as any
    return player?.bandwidthEstimate || NaN
  }

  public get name() {
    return `HLSPlayer (${Hls.version})`
  }

  public get supportAutoQuality(): boolean {
    return true
  }
}
