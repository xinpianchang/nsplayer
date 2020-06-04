// Import here Polyfills if needed. Recommended core-js (npm i -D core-js)
// import 'core-js/fn/array.find'
// ...
import { BasePlayer } from './baseplayer'
import { MutableDisposable, toDisposable, onDispose } from './common/lifecycle'
import { Emitter, EmitterOptions } from './common/event'
import { Source, getMimeType } from './types'
import { ICorePlayer, createCorePlayer } from './coreplayer'
// import { createCorePlayer } from './coreplayer'

export interface NSPlayerOptions {
  el?: HTMLElement
  selector?: string
  emitter?: EmitterOptions
  source?: Source | Source[]
  pluginOptions?: {
    hls: any
    dash: any
  }
  autoplay?: boolean
}

export interface IPlayer extends BasePlayer {
  readonly src: string
  readonly srcObject: MediaStream | MediaSource | Blob | null

  container: HTMLElement | null
  setSource(sources: Source | Source[]): void

  // onReceivePlayList: Event<PlayList>
}

/**
 * NSPlayer
 */
export default class NSPlayer extends BasePlayer implements IPlayer {
  private _el: HTMLElement | null = null
  private _disposableParentElement = new MutableDisposable()
  private _corePlayerRef = new MutableDisposable<ICorePlayer>()

  // private qualityIndex: number | undefined
  // private quality: QualityWithName | undefined
  // private type: VideoType
  // private opts: NSPlayerOptions
  // private plugins: any
  // 这么写是否有问题？？？？？？？？？？？？？？？？？？？？？

  constructor(private readonly opt: NSPlayerOptions = {}) {
    super(opt.emitter)
    this._register(this._disposableParentElement)
    this._register(this._corePlayerRef)

    if (document !== undefined) {
      this.video = this.initHTMLVideoElement()
      if (opt.el) {
        this.container = opt.el
      } else if (opt.selector) {
        this.container = document.querySelector(opt.selector)
      }
      if (opt.source) {
        this.setSource(opt.source)
      }

      // if (opt.source?.quality) {
      //   this.qualityIndex = opt.source.defaultQuality
      //   this.quality = opt.source.quality[this.qualityIndex ? this.qualityIndex : 0]
      //   opt.source.src = this.quality?.url
      // }

      // if (opt.source && opt.source.src) {
      //   this.video.src = opt.source.src
      // }
      // console.log(this.quality?.type, opt.source?.type);
      // this.initPlayer((this.quality && this.quality.type) || opt.source?.type)
      // console.log(opt.autoplay, 'ssssss')
      if (opt.autoplay) {
        // alert('kkk')
        // this.video.autoplay = opt.autoplay
        // setTimeout(() => {
        //   this.video?.play()
        // },2000)
        // this.plays()
        // this.video.play()
      }
    }
  }

  protected get corePlayer() {
    return this._corePlayerRef.value
  }

  // protected readonly initMSE = (type: VideoType) => {
  //   // console.log(type)
  //   this.type = type
  //   if (this.type === 'auto') {
  //     const src = this.video?.src || ''
  //     // 这么写是否合适？？？？？？？？？？？？？？？？

  //     if (/m3u8(#|\?|$)/i.exec(src)) {
  //       this.type = 'hls'
  //     } else if (/.mpd(#|\?|$)/i.exec(src)) {
  //       this.type = 'dash'
  //     } else {
  //       this.type = 'normal'
  //     }
  //   }
  //   if (
  //     this.type === 'hls' &&
  //     this.video &&
  //     (this.video.canPlayType('application/x-mpegURL') ||
  //       this.video.canPlayType('application/vnd.apple.mpegURL'))
  //   ) {
  //     this.type = 'normal'
  //   }
  //   // console.log(this.type, 'aaaaa')

  //   coreplayer(this.type, this.video, this.opts.pluginOptions, this._onReceivePlayList)
  // }

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

  // 这么写是否合适？？？？？？？？？？？？？？？？？？
  protected readonly _onReceivePlayList = this._register(new Emitter<any[]>(this.opt.emitter))
  public readonly onReceivePlayList = this._onReceivePlayList.event

  private initHTMLVideoElement() {
    const video = document.createElement('video')
    video.setAttribute('controls', 'controls')
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
        this._onVideoDetached.fire(video)
        el.removeEventListener('fullscreenchange', fullscreenChangeHandler)
        el.removeEventListener('fullscreenerror', fullscreenErrorHandler)
      })
    }
  }

  get src() {
    return this.video ? this.video.src : ''
  }

  get srcObject() {
    return this.video ? this.video.srcObject : null
  }

  public switchQuality(key?: string) {
    const corePlayer = this._corePlayerRef.value
    corePlayer?.setQuality(key)
  }

  public setSource(sources: Source | Source[]) {
    if (!Array.isArray(sources)) {
      this.setSource([sources])
      return
    }

    // policy to choose coreplayer
    const source = sources[0]
    const mime = source.mime ?? getMimeType(source.src)
    if (mime) {
      const corePlayer = createCorePlayer(mime, this.withVideo())
      // this._corePlayer = corePlayer
      /**
       * init coreplayer
       */
      corePlayer.init(source.src)

      const disposable = corePlayer.onReceivePlayList(evt => {
        this._onReceivePlayList.fire(evt)
        corePlayer.setQuality()

        setTimeout(() => {
          corePlayer.setQuality('rs=height-360#bitrate=200000')
        }, 5000)
      })

      onDispose(corePlayer, () => {
        // register something that should be called withinf corePlayer.dispose()
        // corePlayer()
        disposable.dispose()
      })

      this._corePlayerRef.value = corePlayer
    } else {
      throw new Error('should provide the mime type')
    }
  }

  // plays() {
  //   if (this.video) {
  //     alert(1)
  //     console.log(this.video)
  //     this.video.play()
  //     const playedPromise = Promise.resolve(this.video.play())
  //     playedPromise
  //       .catch(() => {
  //         this.pause()
  //       })
  //       // eslint-disable-next-line @typescript-eslint/no-empty-function
  //       .then(() => {})
  //   }
  // }

  // setProgressiveSources(sources: Source[]) {
  //   this._sources = sources
  //   this.withVideo().src = sources[0].src || ''
  // }
}
