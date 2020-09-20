// Import here Polyfills if needed. Recommended core-js (npm i -D core-js)
// import 'core-js/fn/array.find'
// ...
// import '@babel/runtime'

import { BasePlayer, RequestFullscreenOptions } from './baseplayer'
import {
  MutableDisposable,
  toDisposable,
  IDisposable,
  dispose,
  DisposableStore,
  Emitter,
  Event,
  Relay,
  PauseableEmitter,
} from '@newstudios/common'
import { Source, getMimeType, formatTime, Size } from './types'
import {
  ICorePlayer,
  PlayList,
  QualityLevel,
  qualityLevelToId,
  idToQualityLevel,
  isAutoQuality,
  isSameLevel,
} from './coreplayer'
import { SourcePolicy, DefaultSourcePolicy } from './policy/source'
import createCorePlayer from './createPlayer'
import './fullscreen-polyfill'

export interface NSPlayerOptions {
  el?: HTMLElement
  selector?: string
  source?: Source | Source[]
  initialBitrate?: number
  autoplay?: boolean
  playbackRate?: number
  preload?: 'auto' | 'none' | 'metadata'
  loop?: boolean
  muted?: boolean
  volume?: number
  controls?: boolean
  abrFastSwitch?: boolean
}

export interface IPlayer extends BasePlayer {
  readonly src: string
  readonly srcObject: MediaStream | MediaSource | Blob | null
  readonly currentPlayerName: string | undefined
  readonly currentQualityId: string
  readonly currentPlayList: PlayList
  readonly currentQualityLevel?: QualityLevel
  readonly requestedQualityId: string
  readonly autoQuality: boolean
  readonly fullscreen: boolean
  readonly supportAutoQuality: boolean
  readonly viewport: Size
  readonly bandwidthEstimate: number
  container: HTMLElement | null
  sourcePolicy: SourcePolicy

  /** 提供所有可供播放的资源，请尽量提供 mime type 以及 src */
  setSource(sources: Source | Source[], initialBitrate?: number): boolean

  /** 根据 id 请求播放质量，auto 表示自动，id 在各类核心播放器之间通用 */
  requestQualityById(id: string): void

  /** 根据 PlayList 数组的下标请求播放质量，-1 则表示自动 */
  requestQualityByIndex(index: number): void

  readonly onFullscreenChange: Event<globalThis.Event>
  readonly onFullscreenError: Event<globalThis.Event>
  readonly onVideoAttach: Event<HTMLVideoElement>
  readonly onVideoDetach: Event<HTMLVideoElement>
  readonly onQualitySwitchStart: Event<QualityLevel>
  readonly onQualitySwitchEnd: Event<QualityLevel>
  readonly onQualityChange: Event<QualityLevel>
  readonly onPlayListChange: Event<PlayList>
  readonly onAutoChange: Event<boolean>
  readonly onQualityRequest: Event<string>
}

/**
 * NSPlayer
 */
export default class NSPlayer extends BasePlayer implements IPlayer {
  public static readonly qualityLevelToId = qualityLevelToId
  public static readonly idToQualityLevel = idToQualityLevel
  public static readonly isAutoQuality = isAutoQuality
  public static readonly isSameLevel = isSameLevel
  public static readonly formatTime = formatTime
  public static readonly getMimeType = getMimeType

  private _el: HTMLElement | null = null
  private _disposableParentElement = new MutableDisposable()
  private _delayQualitySwitchRequest = new MutableDisposable()
  private _corePlayerRef = new MutableDisposable<ICorePlayer>()
  private _sources: Source[] = []
  private _requestedQualityId = 'auto'
  private _sourcePolicy = DefaultSourcePolicy
  private _abrFastSwitch = true
  private _containerTimer = 0
  private _corePlayerCreateCounter = 0

  protected readonly _onFullscreenChange = this._register(new Emitter<globalThis.Event>())
  public readonly onFullscreenChange = this._onFullscreenChange.event

  protected readonly _onFullscreenError = this._register(new Emitter<globalThis.Event>())
  public readonly onFullscreenError = this._onFullscreenError.event

  protected readonly _onVideoAttach = this._register(new Emitter<HTMLVideoElement>())
  public readonly onVideoAttach = this._onVideoAttach.event

  protected readonly _onVideoDetach = this._register(new Emitter<HTMLVideoElement>())
  public readonly onVideoDetach = this._onVideoDetach.event

  protected readonly _onQualityChange = this._register(new Relay<QualityLevel>())
  public readonly onQualityChange = this._onQualityChange.event

  protected readonly _onPlayListChange = this._register(new Relay<PlayList>())
  public readonly onPlayListChange = this._onPlayListChange.event

  protected readonly _onAutoChange = this._register(new Relay<boolean>())
  public readonly onAutoChange = this._onAutoChange.event

  protected readonly _onQualityRequest = this._register(new Emitter<string>())
  public readonly onQualityRequest = this._onQualityRequest.event

  protected readonly _onQualitySwitchStart = this._register(
    new PauseableEmitter<QualityLevel>({
      merge: levels => levels[levels.length - 1],
    })
  )
  public readonly onQualitySwitchStart = Event.filter(
    this._onQualitySwitchStart.event,
    qualityLevel => {
      const currentQualityLevel = idToQualityLevel(this.currentQualityId)
      return !isSameLevel(qualityLevel, currentQualityLevel)
    }
  )

  protected readonly _onQualitySwitchEnd = this._register(
    new PauseableEmitter<QualityLevel>({
      merge: levels => levels[levels.length - 1],
    })
  )
  public readonly onQualitySwitchEnd = Event.filter(
    this._onQualitySwitchEnd.event,
    qualityLevel => {
      const requestedQualityLevel = idToQualityLevel(this.requestedQualityId)
      return isSameLevel(qualityLevel, requestedQualityLevel)
    }
  )

  public get viewport(): Size {
    const el = this._el
    const video = this.video
    if (el && video) {
      const { offsetWidth, offsetHeight } = el
      const { videoWidth, videoHeight } = video
      if (offsetWidth && offsetHeight && videoWidth && videoHeight) {
        if (offsetWidth * videoHeight > offsetHeight * videoWidth) {
          return {
            width: ~~((offsetHeight * videoWidth) / videoHeight),
            height: offsetHeight,
          }
        } else {
          return {
            width: offsetWidth,
            height: ~~((offsetWidth * videoHeight) / videoWidth),
          }
        }
      }
    }
    return {
      width: 0,
      height: 0,
    }
  }

  public get bandwidthEstimate(): number {
    if (this.corePlayer) {
      return this.corePlayer.bandwidthEstimate
    }
    return NaN
  }

  public get currentQualityLevel() {
    return idToQualityLevel(this.currentQualityId)
  }

  constructor(readonly opt: NSPlayerOptions = {}) {
    super()
    this._register(this._disposableParentElement)
    this._register(this._delayQualitySwitchRequest)
    this._register(this._corePlayerRef)
    this._register(toDisposable(() => this._corePlayerCreateCounter++))
    this.onPause(this._onQualitySwitchStart.pause, this._onQualitySwitchStart)
    this.onPlay(this._onQualitySwitchStart.resume, this._onQualitySwitchStart)
    this.onPause(this._onQualitySwitchEnd.pause, this._onQualitySwitchEnd)
    this.onPlay(this._onQualitySwitchEnd.resume, this._onQualitySwitchEnd)
    this.onQualitySwitchEnd(() => (this._delayQualitySwitchRequest.value = undefined))
    this._onQualitySwitchStart.pause()
    this._onQualitySwitchEnd.pause()

    if (typeof document !== 'undefined') {
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

      if (opt.abrFastSwitch === false) {
        this._abrFastSwitch = false
      }

      if (opt.playbackRate) {
        this.video.defaultPlaybackRate = opt.playbackRate
      }

      if (opt.source) {
        this.setSource(opt.source, opt.initialBitrate)
      }
    }
  }

  /** 根据当前的 source 形态获取底层的 CorePlayer，可能为 undefined */
  protected get corePlayer() {
    return this._corePlayerRef.value
  }

  public get currentPlayerName() {
    return this.corePlayer?.name
  }

  public get fullscreen() {
    if (this._el) {
      return this._el === document.fullscreenElement
    }
    return false
  }

  public requestFullscreen(options?: RequestFullscreenOptions | undefined) {
    if (this.supportFullscreen) {
      if (this.fullscreen) {
        return Promise.resolve()
      }
      if (this._el) {
        return Promise.resolve(this._el.requestFullscreen(options))
      }
      const error = new Error('container not initialized')
      const evt = new window.Event('fullscreenerror')
      Object.defineProperty(evt, 'error', { value: error })
      this._onFullscreenError.fire(evt)
      return Promise.reject(error)
    } else if (options?.fallback === 'native') {
      if (!this.nativeFullscreen) {
        this.requestNativeFullscreen()
      }
    }
    return Promise.resolve()
  }

  private initHTMLVideoElement() {
    const video = document.createElement('video')
    video.controls = false
    return video
  }

  public set container(el: HTMLElement | null) {
    if (this._el === el) {
      return
    }

    this._el = el
    if (this._containerTimer) {
      clearTimeout(this._containerTimer)
    }

    this._containerTimer = window.setTimeout(() => {
      this._containerTimer = 0
      this._disposableParentElement.value = this._registerContainerListeners(el)
    })
  }

  public get container() {
    return this._el
  }

  public set sourcePolicy(sourcePolicy: SourcePolicy) {
    if (this._sourcePolicy !== sourcePolicy) {
      this._sourcePolicy = sourcePolicy
      this.setSource(this._sources)
    }
  }

  public get sourcePolicy() {
    return this._sourcePolicy
  }

  /** when attaching the video, call super.doAttach for just append the video to the child */
  protected doAttach(video: HTMLVideoElement) {
    const el = this._el
    if (el) {
      el.innerHTML = ''
      el.appendChild(video)
    }
  }

  /** when detaching the video from container */
  protected doDetach(video: HTMLVideoElement) {
    // do nothing
    video.remove()
  }

  private _registerContainerListeners(el: HTMLElement | null) {
    const video = this.withVideo()
    if (el) {
      const fullscreenChangeHandler = (e: globalThis.Event) => this._onFullscreenChange.fire(e)
      const fullscreenErrorHandler = (e: globalThis.Event) => this._onFullscreenError.fire(e)
      const detachVideoHandler = () => this._onVideoDetach.fire(video)
      const onFullscreenChange = Event.fromDOMEventEmitter<globalThis.Event>(el, 'fullscreenchange')
      const onFullscreenError = Event.fromDOMEventEmitter<globalThis.Event>(el, 'fullscreenerror')
      const disposables: IDisposable[] = []

      onFullscreenChange(fullscreenChangeHandler, null, disposables)
      onFullscreenError(fullscreenErrorHandler, null, disposables)

      if (!this.supportFullscreen) {
        const onNativeFullscreenChange = Event.fromDOMEventEmitter<globalThis.Event>(video, [
          'webkitbeginfullscreen',
          'webkitendfullscreen',
        ])
        onNativeFullscreenChange(fullscreenChangeHandler, null, disposables)
      }

      this.doAttach(video)
      this._onVideoAttach.fire(video)

      return toDisposable(() => {
        this.doDetach(video)
        detachVideoHandler()
        dispose(disposables)
      })
    }
  }

  private _updateQualityId() {
    const corePlayer = this.corePlayer
    if (corePlayer) {
      corePlayer.setQualityById(this._requestedQualityId)
    }
  }

  public get src() {
    return this.video ? this.video.src : ''
  }

  public get srcObject() {
    return this.video ? this.video.srcObject : null
  }

  public get currentQualityId() {
    return this.corePlayer?.qualityId || this._requestedQualityId
  }

  public get currentPlayList() {
    return this.corePlayer?.playList || []
  }

  public get requestedQualityId() {
    return this._requestedQualityId
  }

  public get autoQuality() {
    const autoQuality = this.corePlayer?.autoQuality
    if (typeof autoQuality === 'boolean') {
      return autoQuality
    }
    return this._requestedQualityId === 'auto'
  }

  public get supportAutoQuality() {
    return this.corePlayer?.supportAutoQuality || false
  }

  public requestQualityById(id: string) {
    const oldQualityId = this._requestedQualityId
    if (oldQualityId !== id) {
      this._requestedQualityId = id
      const corePlayer = this.corePlayer
      if (corePlayer) {
        const disposableStore = new DisposableStore()

        corePlayer.onQualitySwitching(
          this._onQualitySwitchStart.fire,
          this._onQualitySwitchStart,
          disposableStore
        )

        corePlayer.onQualityChange(
          this._onQualitySwitchEnd.fire,
          this._onQualitySwitchEnd,
          disposableStore
        )

        this._delayQualitySwitchRequest.value = disposableStore
      }
      // must call finally
      this._updateQualityId()
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

  public setSource(sources: Source | Source[], initialBitrate?: number): boolean {
    if (!Array.isArray(sources)) {
      return this.setSource([sources], initialBitrate)
    }

    this.reset()
    const counterId = ++this._corePlayerCreateCounter
    this._sources = sources

    // policy to choose coreplayer
    const source = this._sourcePolicy(sources)

    if (source) {
      const mime = source.mime ?? getMimeType(source.src)
      if (mime) {
        const video = this.withVideo()
        createCorePlayer(source, video, sources, this._abrFastSwitch)
          .then(corePlayer => {
            if (counterId !== this._corePlayerCreateCounter) {
              // another core player created
              corePlayer.dispose()
              return
            }

            if (initialBitrate) {
              corePlayer.setInitialBitrate(initialBitrate)
            }

            if (!isAutoQuality(this._requestedQualityId)) {
              corePlayer.setQualityById(this._requestedQualityId)
            } else if (!corePlayer.supportAutoQuality) {
              // sync with core player qualityId
              Event.once(corePlayer.onPlayListChange)(() => {
                this._requestedQualityId = corePlayer.qualityId
              })
            }
            this._onPlayListChange.input = corePlayer.onPlayListChange
            this._onQualityChange.input = corePlayer.onQualityChange
            this._onAutoChange.input = corePlayer.onAutoChange
            this._corePlayerRef.value = corePlayer
          })
          .catch(err => console.warn(err))
        return true
      }
    }

    return false
  }

  public reset() {
    if (this.video) {
      const autoplay = this.autoplay
      this.playbackRate = this.opt.playbackRate || 1
      this._corePlayerRef.value = undefined
      // FIXME auto play status will be false after dispose core player
      this.autoplay = autoplay
      this._requestedQualityId = 'auto'
      super.reset()
    }
  }
}
