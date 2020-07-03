import { CorePlayer, SourceWithMimeType, QualityLevel, idToQualityLevel } from '.'
import { Event } from '@newstudios/common/event'
import { toDisposable, DisposableStore, MutableDisposable } from '@newstudios/common/lifecycle'
import { Source, DOMEvent } from '../types'

export interface SourceWithDetail extends SourceWithMimeType {
  width: number
  height: number
  bitrate: number
}

export class BasePlayer extends CorePlayer<SourceWithDetail> {
  private _currentLevelIndex: number
  private _nextLevelIndex: number
  private _startLevelIndex: number
  private _changeQualityDisposable = new MutableDisposable()
  private _sources: SourceWithDetail[]

  constructor(private _video: HTMLVideoElement, sources: Source[]) {
    super(_video, sources[0] as SourceWithMimeType)
    this._sources = sources.map(({ bitrate, width, height, src, mime = 'video/mp4' }) => {
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
    this._currentLevelIndex = 0
    this._nextLevelIndex = 0
    this._startLevelIndex = 0
    this._register(this._changeQualityDisposable)
    this._register(toDisposable(() => _video.load()))
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
    return {
      width: source.width,
      height: source.height,
      bitrate: source.bitrate,
      type: 'video',
    }
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
    if (auto) {
      throw new Error('unsupported auto quality')
    }
  }

  protected setNextLevelIndex(index: number) {
    this._nextLevelIndex = index
    const source = this.nextLevel
    if (source) {
      const video = this._video
      const currentTime = video.currentTime
      const paused = video.paused
      const autoplay = video.autoplay
      video.pause()
      video.autoplay = true
      video.src = source.src

      const reset = () => {
        this._changeQualityDisposable.value = undefined
        video.currentTime = currentTime
        video.autoplay = autoplay
        if (paused) {
          video.pause()
        } else {
          video.play()
        }
      }

      const onCanPlay = Event.fromDOMEventEmitter<DOMEvent>(video, 'canplay')
      this._changeQualityDisposable.value = onCanPlay(reset)
    } else {
      console.error(`pause the video due to the next level ${index} unresolved in normalplayer`)
      this.video.pause()
    }
  }

  protected setInitialBitrate(bitrate: number) {
    this._startLevelIndex = this.levels.findIndex(level => level.bitrate === bitrate)
  }

  protected onInit(video: HTMLVideoElement, source: SourceWithMimeType): void {
    source = this.levels[this._startLevelIndex] || source
    // initialize
    if (video.canPlayType(source.mime)) {
      const disposables = new DisposableStore()
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

      this.updatePlayList()
      this.setReady()
      this._register(disposables)

      // TODO currentTime restore
      video.src = source.src
      if (video.autoplay) {
        video.play()
      }
    } else {
      throw new Error(`cannot play this video with mime type ${source.mime}`)
    }
  }

  public get bandwidthEstimate(): number {
    return NaN
  }

  public get name(): string {
    return 'XPCBasePlayer (1.0)'
  }

  public get supportAutoQuality(): boolean {
    return false
  }
}