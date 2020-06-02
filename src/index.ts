// Import here Polyfills if needed. Recommended core-js (npm i -D core-js)
// import 'core-js/fn/array.find'
// ...

import { BasePlayer } from './baseplayer'
import { MutableDisposable, toDisposable } from './common/lifecycle'
import { Emitter, EmitterOptions } from './common/event'
// import { Source } from './types'

export interface NSPlayerOptions {
  el?: HTMLElement
  selector?: string
  emitter?: EmitterOptions
}

export interface IPlayer extends BasePlayer {
  readonly src: string
  readonly srcObject: MediaStream | MediaSource | Blob | null

  container: HTMLElement | null

  // onReceivePlayList: Event<PlayList>
}

/**
 * NSPlayer
 */
export default class NSPlayer extends BasePlayer implements IPlayer {
  private _el: HTMLElement | null = null
  private _disposableParentElement = new MutableDisposable()

  constructor(private readonly opt: NSPlayerOptions = {}) {
    super(opt.emitter)
    this._register(this._disposableParentElement)
    if (document !== undefined) {
      this.video = this.initHTMLVideoElement()
      if (opt.el) {
        this.container = opt.el
      } else if (opt.selector) {
        this.container = document.querySelector(opt.selector)
      }
    }
  }

  public requestFullscreen(options?: FullscreenOptions | undefined) {
    if (this._el) {
      return this._el.requestFullscreen(options)
    }
    const error = new Error('container not initialized')
    this._onFullscreenError.fire()
    return Promise.reject(error)
  }

  protected readonly _onFullscreenChange = this._register(new Emitter<void>(this.opt.emitter))
  public readonly onFullscreenChange = this._onFullscreenChange.event

  protected readonly _onFullscreenError = this._register(new Emitter<void>(this.opt.emitter))
  public readonly onFullscreenError = this._onFullscreenError.event

  protected readonly _onVideoAttached = this._register(
    new Emitter<HTMLVideoElement>(this.opt.emitter)
  )
  public readonly onVideoAttached = this._onVideoAttached.event

  protected readonly _onVideoDetached = this._register(
    new Emitter<HTMLVideoElement>(this.opt.emitter)
  )
  public readonly onVideoDetached = this._onVideoDetached.event

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

  private _registerContainerListeners(el: HTMLElement | null) {
    this._el = el
    const video = this.withVideo()
    if (el) {
      const fullscreenChangeHandler = () => this._onFullscreenChange.fire()
      const fullscreenErrorHandler = () => this._onFullscreenError.fire()
      el.addEventListener('fullscreenchange', fullscreenChangeHandler)
      el.addEventListener('fullscreenerror', fullscreenErrorHandler)
      el.innerHTML = ''
      el.appendChild(video)
      this._onVideoAttached.fire(video)
      return toDisposable(() => {
        el.removeEventListener('fullscreenchange', fullscreenChangeHandler)
        el.removeEventListener('fullscreenerror', fullscreenErrorHandler)
        this._onVideoDetached.fire(video)
      })
    }
  }

  get src() {
    return this.video ? this.video.src : ''
  }

  get srcObject() {
    return this.video ? this.video.srcObject : null
  }

  // setProgressiveSources(sources: Source[]) {
  //   this._sources = sources
  //   this.withVideo().src = sources[0].src || ''
  // }
}
