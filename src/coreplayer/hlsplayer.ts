import Hls, { Level } from 'hls.js'
import {
  toDisposable,
  MutableDisposable,
  DisposableStore,
  Event,
  onUnexpectedError,
} from '@newstudios/common'
import { CorePlayer, SourceWithMimeType, QualityLevel } from '.'

const supportMSE = typeof window === 'undefined' ? false : Hls.isSupported()

export class HlsPlayer extends CorePlayer<Level> {
  private _hlsPlayer?: Hls
  private _nextLevel = -1
  private readonly _fastSwitchEnabled: boolean
  private _initialBitrateMutable = this._register(new MutableDisposable())

  constructor(
    video: HTMLVideoElement,
    source: SourceWithMimeType,
    fastSwitch = true,
    capLevelToPlayerSize = false
  ) {
    super(video, source)
    this._fastSwitchEnabled = fastSwitch
    if (supportMSE) {
      const hlsPlayer = new Hls({
        autoStartLoad: false,
        capLevelToPlayerSize,
      })
      this._hlsPlayer = hlsPlayer
      this._register(toDisposable(() => hlsPlayer.destroy()))
    }
  }

  protected get levels() {
    return this._hlsPlayer?.levels || []
  }

  protected get currentLevel() {
    if (this.ready) {
      return this._hlsPlayer?.levels[this._hlsPlayer?.currentLevel]
    } else {
      return this._hlsPlayer?.levels[this._hlsPlayer?.startLevel]
    }
  }

  protected get nextLevel() {
    if (!this._hlsPlayer) {
      return undefined
    }
    const nextLevelIndex =
      this._nextLevel < 0
        ? this._fastSwitchEnabled
          ? this._hlsPlayer.nextLevel
          : this._hlsPlayer.nextLoadLevel
        : this._nextLevel
    return this._hlsPlayer?.levels[nextLevelIndex]
  }

  protected get autoQualityEnabled(): boolean {
    const hlsPlayer = this._hlsPlayer
    if (hlsPlayer) {
      return this._nextLevel < 0
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
      this._nextLevel = hlsPlayer.nextLevel
      this._initialBitrateMutable.value = undefined
    }
  }

  protected setNextLevelIndex(index: number) {
    const hlsPlayer = this._hlsPlayer
    if (!hlsPlayer) {
      return
    }
    if (!this.ready) {
      this.log('setNextLevelIndex', 'start level:', index)
      hlsPlayer.startLevel = index
    }
    this._nextLevel = index
    if (this._nextLevel >= 0) {
      if (this._fastSwitchEnabled) {
        hlsPlayer.nextLevel = index
      } else {
        hlsPlayer.loadLevel = index
      }
    }
    this._initialBitrateMutable.value = undefined
  }

  protected onInit(video: HTMLVideoElement, source: SourceWithMimeType) {
    const hlsPlayer = this._hlsPlayer
    if (hlsPlayer) {
      const disposables = this._register(new DisposableStore())
      const onManifestParsed = Event.fromNodeEventEmitter(hlsPlayer, Hls.Events.MANIFEST_PARSED)
      const onLevelsUpdated = Event.fromNodeEventEmitter(hlsPlayer, Hls.Events.LEVEL_UPDATED)
      const onLevelSwitched = Event.fromNodeEventEmitter(hlsPlayer, Hls.Events.LEVEL_SWITCHED)
      const onLevelSwitching = Event.fromNodeEventEmitter(hlsPlayer, Hls.Events.LEVEL_SWITCHING)

      onLevelsUpdated(this.updatePlayList, this, disposables)
      onManifestParsed(this.updatePlayList, this, disposables)
      onManifestParsed(() => {
        hlsPlayer.startLoad()
        video.autoplay && video.play()
        this.setReady()
      })

      onLevelSwitching(this.updateNextQualityLevel, this, disposables)
      onLevelSwitched(this.updateQualityLevel, this, disposables)

      hlsPlayer.loadSource(source.src)
      hlsPlayer.attachMedia(video)
    } else {
      video.src = source.src
      if (!video.canPlayType(source.mime)) {
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

    this._initialBitrateMutable.value = this.onOncePlayListReady(levels => {
      let index = 0
      for (let i = 0; i < levels.length; i++) {
        if (levels[i].bitrate <= bitrate) {
          index = i
        } else {
          break
        }
      }
      this.log('setInitialBitrate', 'async start level:', index)
      hlsPlayer.startLevel = index
      // hlsPlayer.nextLoadLevel = index
    })
  }

  public setCapLevelToPlayerSize(capLevelToPlayerSize: boolean) {
    if (this._hlsPlayer) {
      this.log('setCapLevelToPlayerSize', capLevelToPlayerSize)
      this._hlsPlayer.capLevelToPlayerSize = capLevelToPlayerSize
    }
  }

  public get capLevelToPlayerSize(): boolean {
    return this._hlsPlayer?.capLevelToPlayerSize ?? false
  }

  public get bandwidthEstimate(): number {
    return this._hlsPlayer?.bandwidthEstimate || NaN
  }

  public get name() {
    return `HLSPlayer (${Hls.version})`
  }

  public get supportAutoQuality(): boolean {
    return true
  }
}
