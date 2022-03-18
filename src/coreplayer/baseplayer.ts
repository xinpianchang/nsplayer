import { CorePlayer, SourceWithMimeType, QualityLevel, computeFPS } from '.'
import { toDisposable, DisposableStore, MutableDisposable, Event } from '@newstudios/common'
import { Source } from '../types'

export interface SourceWithDetail extends SourceWithMimeType {
  width: number
  height: number
  bitrate: number
}

export class BasePlayer extends CorePlayer<SourceWithDetail> {
  private _currentLevelIndex: number
  private _nextLevelIndex: number
  private _startLevelIndex: number
  private _capLevelToPlayerSize = false
  private _changeQualityDisposable = this._register(new MutableDisposable())
  private _sources: SourceWithDetail[]

  constructor(private _video: HTMLVideoElement, sources: Source[]) {
    super(_video, sources[0] as SourceWithMimeType)
    this._sources = sources
      .map(({ bitrate, width, height, src, mime = 'video/mp4' }) => {
        if (!bitrate || !width || !height) {
          throw new Error(`we need bitrate / width / height info for source ${src}`)
        }
        return {
          bitrate,
          width,
          height,
          src,
          mime,
        }
      })
      .sort((a, b) => a.bitrate - b.bitrate)
    this._currentLevelIndex = 0
    this._nextLevelIndex = 0
    this._startLevelIndex = 0
    this._register(toDisposable(() => _video.pause()))
  }

  protected get levels() {
    return this._sources
  }

  protected get currentLevel(): SourceWithDetail | undefined {
    return this.levels[this._currentLevelIndex]
  }

  protected get nextLevel(): SourceWithDetail | undefined {
    return this.levels[this._nextLevelIndex]
  }

  protected get autoQualityEnabled() {
    return false
  }

  protected levelToQuality(source: SourceWithDetail): QualityLevel {
    const fps = computeFPS(source.fps)
    return {
      width: source.width,
      height: source.height,
      bitrate: source.bitrate,
      type: 'video',
      ...(fps ? { fps } : {}),
    }
  }

  protected findLevelIndexByQualityLevel(playLevel: QualityLevel) {
    const levels = this.levels
    // bitrate match
    const idx = levels.findIndex(level => level.bitrate === playLevel.bitrate)
    if (idx >= 0) {
      return idx
    }
    // short side match
    const shortSide = Math.min(playLevel.width, playLevel.height)
    return levels.findIndex(level => Math.min(level.width, level.height) === shortSide)
  }

  protected setAutoQualityState(auto: boolean) {
    if (auto) {
      throw new Error('unsupported auto quality')
    }
  }

  public setInitialBitrate(bitrate: number) {
    let index = 0
    const levels = this.levels.slice().sort((a, b) => a.bitrate - b.bitrate)
    for (let i = 0; i < levels.length; i++) {
      // FIXME levels should be safe
      if (levels[i].bitrate <= bitrate) {
        index = i
      } else {
        break
      }
    }
    this.log('setInitialBitrate', 'start level:', index)
    this._startLevelIndex = index
  }

  protected setNextLevelIndex(index: number) {
    this._nextLevelIndex = index
    if (!this.ready) {
      this.log('setNextLevelIndex', 'start level:', index)
      this._startLevelIndex = index
      // should not change any source
      return
    }
    const source = this.nextLevel
    if (source) {
      const video = this._video

      const currentTime = video.currentTime
      const autoplay = video.autoplay
      const playbackRate = video.playbackRate
      const paused = video.paused

      video.pause()
      video.autoplay = true
      video.src = source.src

      const reset = () => {
        this._currentLevelIndex = index
        this._changeQualityDisposable.value = undefined
        video.currentTime = currentTime
        video.autoplay = autoplay
        video.playbackRate = playbackRate
        if (paused) {
          video.pause()
        } else {
          video.play()
        }
      }

      const onCanPlay = Event.fromDOMEventEmitter(video, 'canplay')
      this._changeQualityDisposable.value = onCanPlay(reset)
    } else {
      console.error(`pause the video due to the next level ${index} unresolved in normalplayer`)
      this.video.pause()
    }
  }

  protected onInit(video: HTMLVideoElement, source: SourceWithMimeType): void {
    source = this.levels[this._startLevelIndex] || source
    this._nextLevelIndex = this._startLevelIndex
    this._currentLevelIndex = this._nextLevelIndex

    this.updateQualityLevel()

    // initialize
    if (video.canPlayType(source.mime)) {
      const disposables = this._register(new DisposableStore())
      const onLoadStart = Event.fromDOMEventEmitter(video, 'loadstart')
      const onLoadEnd = Event.fromDOMEventEmitter(video, 'loadedmetadata')

      onLoadStart(this.updateNextQualityLevel, this, disposables)
      onLoadEnd(
        () => {
          this._currentLevelIndex = this._nextLevelIndex
          this.updateQualityLevel()
        },
        null,
        disposables
      )

      // may lead a new next level
      this.updatePlayList()

      // must init the current level because next level may changed while play list changed
      this._currentLevelIndex =
        this._nextLevelIndex >= 0 && this._nextLevelIndex < this._sources.length
          ? this._nextLevelIndex
          : this._startLevelIndex

      this.updateQualityLevel()

      // FIXME currentTime restore
      video.src = this.currentLevel?.src || source.src
      if (video.autoplay) {
        video.play()
      }

      this.setReady()
    } else {
      throw new Error(`cannot play this video with mime type ${source.mime}`)
    }
  }

  /** FIXME cap level safe begin */
  // private isLevelSizeSafe(width: number, height: number): boolean {
  //   if (!this._capLevelToPlayerSize) {
  //     return true
  //   }
  //   return true
  // }

  public setCapLevelToPlayerSize(capLevelToPlayerSize: boolean) {
    this.log('setCapLevelToPlayerSize', capLevelToPlayerSize)
    this._capLevelToPlayerSize = capLevelToPlayerSize
  }

  public get capLevelToPlayerSize(): boolean {
    return this._capLevelToPlayerSize
  }
  /** FIXME cap level safe end */

  public get bandwidthEstimate(): number {
    return NaN
  }

  public get name(): string {
    return 'MP4Player (1.3)'
  }

  public get supportAutoQuality(): boolean {
    return false
  }
}
