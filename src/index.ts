// Import here Polyfills if needed. Recommended core-js (npm i -D core-js)
// import 'core-js/fn/array.find'
// ...
// import '@babel/runtime'

import { BasePlayer } from './baseplayer'
import {
  MutableDisposable,
  toDisposable,
  onDispose,
  IDisposable,
  dispose,
} from './common/lifecycle'
import { Emitter, Event, Relay } from './common/event'
import { Source, getMimeType } from './types'
import { ICorePlayer, PlayList, QualityLevel, qualityLevelToId } from './coreplayer'
import { SourcePolicy, DefaultSourcePolicy } from './policy/source'
import createCorePlayer from './createPlayer'

export interface NSPlayerOptions {
  el?: HTMLElement
  selector?: string
  source?: Source | Source[]
  autoplay?: boolean
  preload?: 'auto' | 'none' | 'metadata'
  loop?: boolean
  muted?: boolean
  volume?: number
  controls?: boolean
}

export interface IPlayer extends BasePlayer {
  readonly src: string
  readonly srcObject: MediaStream | MediaSource | Blob | null
  readonly currentPlayerName: string | undefined
  readonly currentQualityId: string
  readonly currentPlayList: PlayList
  container: HTMLElement | null
  sourcePolicy: SourcePolicy

  /** 提供所有可供播放的资源，请尽量提供 mime type 以及 src */
  setSource(sources: Source | Source[]): void

  /** 根据 id 请求播放质量，auto 表示自动，id 在各类核心播放器之间通用 */
  requestQualityById(id: string): void

  /** 根据 PlayList 数组的下标请求播放质量，-1 则表示自动 */
  requestQualityByIndex(index: number): void

  readonly onFullscreenChange: Event<void>
  readonly onFullscreenError: Event<void>
  readonly onVideoAttach: Event<HTMLVideoElement>
  readonly onVideoDetach: Event<HTMLVideoElement>
  readonly onQualityChange: Event<QualityLevel>
  readonly onPlayListChange: Event<PlayList>
  readonly onQualityRequest: Event<string>
}

/**
 * NSPlayer
 */
export default class NSPlayer extends BasePlayer implements IPlayer {
  private _el: HTMLElement | null = null
  private _disposableParentElement = new MutableDisposable()
  private _corePlayerRef = new MutableDisposable<ICorePlayer>()
  private _sources: Source[] = []
  private _requestedQualityId = 'auto'
  private _sourcePolicy = DefaultSourcePolicy

  protected readonly _onFullscreenChange = this._register(new Emitter<void>())
  public readonly onFullscreenChange = this._onFullscreenChange.event

  protected readonly _onFullscreenError = this._register(new Emitter<void>())
  public readonly onFullscreenError = this._onFullscreenError.event

  protected readonly _onVideoAttach = this._register(new Emitter<HTMLVideoElement>())
  public readonly onVideoAttach = this._onVideoAttach.event

  protected readonly _onVideoDetach = this._register(new Emitter<HTMLVideoElement>())
  public readonly onVideoDetach = this._onVideoDetach.event

  protected readonly _onQualityChange = this._register(new Relay<QualityLevel>())
  public readonly onQualityChange = this._onQualityChange.event

  protected readonly _onPlayListChange = this._register(new Relay<PlayList>())
  public readonly onPlayListChange = this._onPlayListChange.event

  protected readonly _onQualityRequest = this._register(new Emitter<string>())
  public readonly onQualityRequest = this._onQualityRequest.event

  constructor(readonly opt: NSPlayerOptions = {}) {
    super()
    this._register(this._disposableParentElement)
    this._register(this._corePlayerRef)

    if (document !== undefined) {
      this.video = this.initHTMLVideoElement()
      if (opt.el) {
        this.container = opt.el
      } else if (opt.selector) {
        this.container = document.querySelector(opt.selector)
      }

      if (opt.autoplay) {
        this.autoplay = opt.autoplay
      }

      if (opt.preload) {
        this.preload = opt.preload
      }

      if (opt.loop) {
        this.loop = opt.loop
      }

      if (opt.muted) {
        this.muted = opt.muted
      }

      if (opt.volume) {
        this.volume = opt.volume
      }

      if (opt.controls) {
        this.controls = opt.controls
      }

      if (opt.source) {
        this.setSource(opt.source)
      }
    }
  }

  /** 根据当前的 source 形态获取底层的 CorePlayer，可能为 undefined */
  protected get corePlayer() {
    return this._corePlayerRef.value
  }

  public get currentPlayerName() {
    return this._corePlayerRef.value?.name
  }

  public requestFullscreen(options?: FullscreenOptions | undefined) {
    if (this._el) {
      return this._el.requestFullscreen(options)
    }
    const error = new Error('container not initialized')
    this._onFullscreenError.fire()
    return Promise.reject(error)
  }

  private initHTMLVideoElement() {
    const video = document.createElement('video')
    video.controls = false
    return video
  }

  set container(el: HTMLElement | null) {
    if (this._el === el) {
      return
    }

    this._disposableParentElement.value = this._registerContainerListeners(el)
  }

  get container() {
    return this._el
  }

  set sourcePolicy(sourcePolicy: SourcePolicy) {
    if (this._sourcePolicy !== sourcePolicy) {
      this._sourcePolicy = sourcePolicy
      this.setSource(this._sources)
    }
  }

  get sourcePolicy() {
    return this._sourcePolicy
  }

  private _registerContainerListeners(el: HTMLElement | null) {
    this._el = el
    const video = this.withVideo()
    if (el) {
      const fullscreenChangeHandler = () => this._onFullscreenChange.fire()
      const fullscreenErrorHandler = () => this._onFullscreenError.fire()
      const detachVideoHandler = () => this._onVideoDetach.fire(video)
      const onFullscreenChange = Event.fromDOMEventEmitter(el, 'fullscreenchange')
      const onFullscreenError = Event.fromDOMEventEmitter(el, 'fullscreenerror')
      const disposables: IDisposable[] = []

      el.innerHTML = ''
      el.appendChild(video)

      onFullscreenChange(fullscreenChangeHandler, null, disposables)
      onFullscreenError(fullscreenErrorHandler, null, disposables)
      this._onVideoAttach.fire(video)

      return toDisposable(() => {
        detachVideoHandler()
        dispose(disposables)
      })
    }
  }

  public get src() {
    return this.video ? this.video.src : ''
  }

  public get srcObject() {
    return this.video ? this.video.srcObject : null
  }

  public get currentQualityId() {
    return this._corePlayerRef.value?.qualityId || this._requestedQualityId
  }

  public get currentPlayList() {
    return this._corePlayerRef.value?.playList || []
  }

  public requestQualityById(id: string) {
    if (this._requestedQualityId !== id) {
      this._requestedQualityId = id
      this._onQualityRequest.fire(id)
    }
  }

  public requestQualityByIndex(index: number) {
    if (index === -1) {
      this.requestQualityById('auto')
    } else if (index < this.currentPlayList.length) {
      const qualityLevel = this.currentPlayList[index]
      this.requestQualityById(qualityLevelToId(qualityLevel))
    } else {
      console.warn('there is no such quality index, please use quality id instead')
    }
  }

  public setSource(sources: Source | Source[]) {
    if (!Array.isArray(sources)) {
      this.setSource([sources])
      return
    }

    this._sources = sources

    // policy to choose coreplayer
    const source = this._sourcePolicy(sources)

    const mime = source.mime ?? getMimeType(source.src)
    if (mime) {
      const video = this.withVideo()
      createCorePlayer(source, video, sources)
        .then(corePlayer => {
          const disposables: IDisposable[] = []

          this._onPlayListChange.input = corePlayer.onPlayListChange
          this._onQualityChange.input = corePlayer.onQualityChange

          corePlayer.onReady(
            () => corePlayer.setQualityById(this._requestedQualityId),
            null,
            disposables
          )

          this.onQualityRequest(corePlayer.setQualityById, corePlayer, disposables)

          onDispose(corePlayer, () => dispose(disposables))

          this._corePlayerRef.value = corePlayer
        })
        .catch(err => console.warn(err))
    } else {
      throw new Error('should provide the mime type')
    }
  }
}
