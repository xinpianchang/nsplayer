import Hls, { Level } from 'hls.js'
import {
  toDisposable,
  MutableDisposable,
  DisposableStore,
  Event,
  onUnexpectedError,
} from '@newstudios/common'
import { CorePlayer, SourceWithMimeType, QualityLevel } from '.'

const supportMSE = typeof window === undefined ? false : Hls.isSupported()

export class HlsPlayer extends CorePlayer<Level> {
  private _hlsPlayer?: Hls
  private _nextLevel = -1
  private readonly _fastSwitchEnabled: boolean
  private _readyDisposable = this._register(new MutableDisposable())

  constructor(video: HTMLVideoElement, source: SourceWithMimeType, fastSwitch = true) {
    super(video, source)
    this._fastSwitchEnabled = fastSwitch
    if (supportMSE) {
      const hlsPlayer = new Hls({
        autoStartLoad: false,
      })
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

  protected levelToQuality(hlsLevel: Level): QualityLevel {
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

  protected findLevelIndexByQualityLevel(playLevel: QualityLevel) {
    // bitrate match
    const idx = this.levels.findIndex(level => level.bitrate === playLevel.bitrate)
    if (idx >= 0) {
      return idx
    }
    // short side match
    const shortSide = Math.min(playLevel.width, playLevel.height)
    return this.levels.findIndex(level => Math.min(level.width, level.height) === shortSide)
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
      onManifestParsed(() => {
        hlsPlayer.startLoad()
        video.autoplay && video.play()
      })
      onLevelSwitching(this.updateNextQualityLevel, this, disposables)
      onLevelSwitched(this.updateQualityLevel, this, disposables)

      hlsPlayer.loadSource(source.src)
      hlsPlayer.attachMedia(video)

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

  public setInitialBitrate(bitrate: number) {
    const hlsPlayer = this._hlsPlayer
    if (!hlsPlayer) {
      return
    }
    if (this.ready) {
      this._readyDisposable.value = undefined
      let index = 0
      const levels = this.levels.slice().sort((a, b) => a.bitrate - b.bitrate)
      for (let i = 0; i < levels.length; i++) {
        if (levels[i].bitrate < bitrate) {
          index = i
        } else {
          break
        }
      }
      const startLevel = levels[index]
      hlsPlayer.startLevel = this.levels.findIndex(l => l.bitrate === startLevel.bitrate)
    } else {
      this._readyDisposable.value = this.onReady(() => this.setInitialBitrate(bitrate))
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
