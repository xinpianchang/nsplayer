import {
  IDisposable,
  Disposable,
  toDisposable,
  MutableDisposable,
} from '@newstudios/common/lifecycle'
import { Event, Emitter } from '@newstudios/common/event'
import { MimeType, Source } from '../types'

export interface QualityLevel {
  readonly bitrate: number
  readonly width: number
  readonly height: number
  readonly type?: 'video' | 'audio'
}

export type PlayList = readonly QualityLevel[]

export interface SourceWithMimeType extends Readonly<Source> {
  readonly mime: MimeType
}

export interface ICorePlayer extends IDisposable {
  /** 当前播放器内核名称 */
  readonly name: string

  /** 当 PlayList 发生改变时触发 */
  readonly onPlayListChange: Event<PlayList>

  /** 当播放质量切换发生请求时触发 */
  readonly onQualitySwitching: Event<QualityLevel>

  /** 当播放质量切换完成时触发 */
  readonly onQualityChange: Event<QualityLevel>

  /** 当自动清晰度选项切换时触发 */
  readonly onAutoChange: Event<boolean>

  /** 当播放器初始化完成，可以切换播放质量时触发 */
  readonly onReady: Event<void>

  /** 实际的当前播放质量级别，未确定时为 undefined */
  readonly qualityLevel?: QualityLevel

  /** 实际的准备切换的播放质量级别，未确定时为 undefined */
  readonly nextQualityLevel?: QualityLevel

  /** 当前已知的所有质量级别组 */
  readonly playList: PlayList

  /** 当前是否启用了 auto 切换质量 */
  readonly autoQuality: boolean

  /** 实际的当前播放质量ID，未确定时为 auto */
  readonly qualityId: string

  /** 实际的下一个播放质量ID，自动时时为 auto */
  readonly nextQualityId: string

  /** 告知当前播放内容是否支持自动质量切换 */
  readonly supportAutoQuality: boolean

  /** 是否初始化完成 playList，并准备就绪 */
  readonly ready: boolean

  /** 根据质量ID设定播放质量，ID 为 auto 表示自动切换 */
  setQualityById(id: string): void
}

/**
 * 将 id 转变为 Quality Level
 * @param id 指定的 ID，形如 br2000000-1920x1080-video / br1200000-1280x720
 */
export function idToQualityLevel(id: string): QualityLevel | undefined {
  const result = id.match(/^br(\d+)-(\d+)x(\d+)(?:-(video|audio))?$/)
  if (result) {
    const level: { -readonly [k in keyof QualityLevel]: QualityLevel[k] } = {
      bitrate: parseInt(result[1]),
      width: parseInt(result[2]),
      height: parseInt(result[3]),
    }
    if (result[4]) {
      level.type = result[4] as any
    }
    return level
  }
}

/**
 * 将播放质量级别转为为播放质量 ID
 * @param level 播放质量级别
 */
export function qualityLevelToId(level: QualityLevel): string {
  let id = `br${level.bitrate}-${level.width}x${level.height}`
  if (level.type) {
    id = `${id}-${level.type}`
  }
  return id
}

/** 播放质量 ID 是否为 auto 自动切换 */
export function isAutoQuality(id: string): id is 'auto' {
  return id === 'auto'
}

/** 两个播放质量是否同级 */
export function isSameLevel(
  level1: QualityLevel | undefined | null,
  level2: QualityLevel | undefined | null
) {
  if (!level1 || !level2) {
    return level2 === level2
  }
  return (
    level1.bitrate === level2.bitrate &&
    level1.width === level2.width &&
    level1.height === level2.height &&
    (!level1.type || !level2.type || level1.type === level2.type)
  )
}

export abstract class CorePlayer<Level = unknown> extends Disposable implements ICorePlayer {
  protected readonly _onPlayListChange = this._register(new Emitter<PlayList>())
  public readonly onPlayListChange = this._onPlayListChange.event

  protected readonly _onQualityChange = this._register(new Emitter<QualityLevel>())
  public readonly onQualityChange = this._onQualityChange.event

  protected readonly _onQualitySwitching = this._register(new Emitter<QualityLevel>())
  public readonly onQualitySwitching = this._onQualitySwitching.event

  protected readonly _onAutoChange = this._register(new Emitter<boolean>())
  public readonly onAutoChange = this._onAutoChange.event

  protected readonly _onReady = this._register(new Emitter<void>())
  public readonly onReady = this._onReady.event

  private _playList: PlayList = []
  private _qualityLevel?: QualityLevel
  private _nextQualityLevel?: QualityLevel
  private _autoQuality?: boolean
  private _ready = false
  private _updateAutoDisposable = new MutableDisposable()

  public abstract get name(): string
  public abstract get supportAutoQuality(): boolean

  protected abstract get levels(): Level[]
  protected abstract get currentLevel(): Level | undefined
  protected abstract get nextLevel(): Level | undefined
  protected abstract get autoQualityEnabled(): boolean
  protected abstract levelToQuality(level: Level): QualityLevel
  protected abstract findLevelIndexById(id: string): number
  protected abstract setAutoQualityState(auto: boolean): void
  protected abstract setNextLevelIndex(index: number): void
  protected abstract setInitialBitrate(bitrate: number): void

  /** 实现 video 和播放 src 对应的初始化关系，该 src 通常为一个 mp4 或 m3u8 或 mpd */
  protected abstract onInit(video: HTMLVideoElement, source: SourceWithMimeType): void

  constructor(
    protected readonly video: HTMLVideoElement,
    protected readonly source: SourceWithMimeType
  ) {
    super()
    this._register(this._updateAutoDisposable)
    const timer = setTimeout(() => this.onInit(video, source))
    this._register(toDisposable(() => clearTimeout(timer)))
  }

  public get playList() {
    return this._playList
  }

  /** 更新 PlayList 播放级别组，每当获取到新的 PlayList 时请调用此接口 */
  protected updatePlayList() {
    this.updateQualityLevel()
    this.updateNextQualityLevel()
    this.updateAutoQuality()
    this.setPlayList(this.translatePlayList())
  }

  public get nextQualityLevel() {
    return this._nextQualityLevel
  }

  /** 更新下一个播放质量级别，每当发生播放质量切换开始时请调用此接口 */
  protected updateNextQualityLevel() {
    const ql = this.translateNextQualityLevel()
    if (ql) {
      this.setNextQualityLevel(ql)
    } else {
      this._nextQualityLevel = undefined
    }
  }

  public get qualityLevel() {
    return this._qualityLevel
  }

  /** 更新当前播放质量级别，每当发生播放质量切换结束时请调用此接口 */
  protected updateQualityLevel() {
    const ql = this.translateCurrentQuality()
    if (ql) {
      this.setQualityLevel(ql)
    } else {
      this._qualityLevel = undefined
    }
  }

  public get autoQuality() {
    return !!this._autoQuality
  }

  /** 每当切换自动清晰度状态时，请调用此接口 */
  protected updateAutoQuality() {
    const timer = setTimeout(() => {
      this._updateAutoDisposable.value = undefined
      const support = this.supportAutoQuality
      const auto = support && this.autoQualityEnabled
      if (this._autoQuality !== auto) {
        this._autoQuality = auto
        this._onAutoChange.fire(auto)
        // when enabling auto quality, manually fire quality change to the current
        if (auto) {
          this.updateNextQualityLevel()
          const qualityLevel = this.translateCurrentQuality()
          if (qualityLevel) {
            this._onQualityChange.fire(qualityLevel)
          }
        }
      }
    })

    this._updateAutoDisposable.value = toDisposable(() => clearTimeout(timer))
  }

  public get ready() {
    return this._ready
  }

  /** 更新当前播放器状态，每当初始化完成后情调用此接口 */
  protected setReady() {
    if (this._ready) return
    this._ready = true
    this._onReady.fire()
  }

  public get qualityId() {
    if (this.qualityLevel) {
      return qualityLevelToId(this.qualityLevel)
    } else {
      return 'auto'
    }
  }

  public get nextQualityId() {
    if (this.nextQualityLevel) {
      return qualityLevelToId(this.nextQualityLevel)
    } else {
      return 'auto'
    }
  }

  public setQualityById(id: string): void {
    const auto = isAutoQuality(id)
    if (auto && !this.supportAutoQuality) {
      throw new Error('auto quality not supported')
    }
    this.setAutoQualityState(auto)
    this.updateAutoQuality()
    if (auto) {
      // nothing to do
      return
    }
    if (this.ready) {
      this.setNextLevelIndex(this.findLevelIndexById(id))
    } else {
      const qualityLevel = idToQualityLevel(id)
      if (qualityLevel) {
        this.setInitialBitrate(qualityLevel.bitrate)
      }
    }
  }

  /** 翻译当前 PlayList */
  private translatePlayList() {
    return this.levels
      .map(level => this.levelToQuality(level))
      .sort((l1, l2) => l1.bitrate - l2.bitrate)
  }

  /** 翻译当前 QualityLevel */
  private translateCurrentQuality() {
    const level = this.currentLevel
    if (level) {
      return this.levelToQuality(level)
    }
  }

  /** 翻译下一个 QualityLevel, 当前 autoQuality 打开时返回 undefined */
  private translateNextQualityLevel() {
    const level = this.nextLevel
    if (level && !this.autoQualityEnabled) {
      return this.levelToQuality(level)
    }
  }

  private setPlayList(playList: PlayList) {
    let changed = false
    if (playList.length !== this._playList.length) {
      changed = true
    } else if (playList.some((level, index) => !isSameLevel(this._playList[index], level))) {
      changed = true
    }
    if (changed) {
      this._playList = playList
      this._onPlayListChange.fire(playList)
    }
  }

  private setNextQualityLevel(nextQualityLevel: QualityLevel) {
    let changed = false
    if (this._nextQualityLevel) {
      if (!isSameLevel(nextQualityLevel, this._nextQualityLevel)) {
        changed = true
      }
    } else {
      changed = true
    }
    if (changed) {
      this._nextQualityLevel = nextQualityLevel
      this._onQualitySwitching.fire(nextQualityLevel)
    }
  }

  private setQualityLevel(qualityLevel: QualityLevel) {
    let changed = false
    if (this._qualityLevel) {
      if (!isSameLevel(qualityLevel, this._qualityLevel)) {
        changed = true
      }
    } else {
      changed = true
    }
    if (changed) {
      this._qualityLevel = qualityLevel
      this._onQualityChange.fire(qualityLevel)
    }
  }
}
