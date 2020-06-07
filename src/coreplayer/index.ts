import { IDisposable, Disposable, toDisposable } from '../common/lifecycle'
// import { DashPlayer } from './dashplayer'
// import { HlsPlayer } from './hlsplayer'
// import { NormalPlayer } from './normalplayer'
import { MimeType, isHls, isDash, Source, isMp4 } from '../types'
import { Event, Emitter } from '../common/event'

export interface QualityLevel {
  readonly bitrate: number
  readonly width: number
  readonly height: number
  readonly type?: 'video' | 'audio'
}

export type PlayList = readonly QualityLevel[]

export interface ICorePlayer extends IDisposable {
  /** 当前播放器内核名称 */
  readonly name: string

  /** 当 PlayList 发生改变时触发 */
  readonly onPlayListChange: Event<PlayList>

  /** 当播放质量切换时触发 */
  readonly onQualityChange: Event<QualityLevel>

  /** 当播放器初始化完成，可以切换播放质量时触发 */
  readonly onReady: Event<void>

  /** 根据质量ID设定播放质量，ID 为 auto 表示自动切换, 需要等到 ready 状态之后 */
  setQualityById(id: string): void

  /** 实际的当前播放质量ID，未确定时为 auto */
  readonly qualityId: string

  /** 实际的当前播放质量级别，未确定时为 undefined */
  readonly qualityLevel?: QualityLevel

  /** 当前是否启用了 auto 切换质量 */
  readonly autoQuality: boolean

  /** 当前已知的所有质量级别组 */
  readonly playList: PlayList

  /** 告知当前播放内容是否支持自动质量切换 */
  readonly supportAutoQuality: boolean
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
export function isSameLevel(level1: QualityLevel, level2: QualityLevel) {
  return (
    level1.bitrate === level2.bitrate &&
    level1.width === level2.width &&
    level1.height === level2.height &&
    (!level1.type || !level2.type || level1.type === level2.type)
  )
}

export abstract class CorePlayer extends Disposable implements ICorePlayer {
  protected readonly _onPlayListChange = this._register(new Emitter<PlayList>())
  public readonly onPlayListChange = this._onPlayListChange.event

  protected readonly _onQualityChange = this._register(new Emitter<QualityLevel>())
  public readonly onQualityChange = this._onQualityChange.event

  protected readonly _onReady = this._register(new Emitter<void>())
  public readonly onReady = this._onReady.event

  private _playList: PlayList = []
  private _qualityLevel?: QualityLevel
  private _ready = false

  public abstract get name(): string
  public abstract get autoQuality(): boolean
  public abstract get qualityId(): string
  public abstract get supportAutoQuality(): boolean
  public abstract setQualityById(id: string): void

  /** 实现 video 和播放 src 对应的初始化关系，该 src 通常为一个 mp4 或 m3u8 或 mpd */
  protected abstract onInit(video: HTMLVideoElement, source: SourceWithMimeType): void

  /** 根据子类的情况，翻译出当时的 PlayList，没有时返回空数组 */
  protected abstract translatePlayList(): PlayList

  /** 根据子类的情况，翻译出当时的播放质量，未知时返回 undefined */
  protected abstract translateCurrentQuality(): QualityLevel | undefined

  constructor(
    protected readonly video: HTMLVideoElement,
    protected readonly source: SourceWithMimeType
  ) {
    super()
    const timer = window.setTimeout(() => this.onInit(video, source))
    this._register(toDisposable(() => clearTimeout(timer)))
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

  public get qualityLevel() {
    return this._qualityLevel
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

  /** 更新 PlayList 播放级别组，每当获取到新的 PlayList 时请调用此接口 */
  protected updatePlayList() {
    this.setPlayList(this.translatePlayList())
    this.updateQualityLevel()
  }

  /** 更新当前播放质量级别，每当发生播放质量切换时请调用此接口 */
  protected updateQualityLevel() {
    const ql = this.translateCurrentQuality()
    if (ql) {
      this.setQualityLevel(ql)
    }
  }

  /** 更新当前播放器状态，每当初始化完成后情调用此接口 */
  protected setReady() {
    if (this._ready) return
    this._ready = true
    this._onReady.fire()
  }

  public get playList() {
    return this._playList
  }
}

export interface SourceWithMimeType extends Source {
  mime: MimeType
}
