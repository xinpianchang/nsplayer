import delegates from 'delegates'
import {
  Disposable,
  MutableDisposable,
  combinedDisposable,
  IDisposable,
} from '@newstudios/common/lifecycle'
import { Emitter, Event } from '@newstudios/common/event'
import { BasePlayerWithEvent, VideoEventNameMap, VideoEventNameArray, isSafari } from './types'
import { assert } from './types'

export interface NSPlayerOptions {
  el?: HTMLElement
}

export interface FullscreenFallbackOptions {
  /** @default never fallback to native fullscreen  */
  fallback?: 'native' | 'never'
}

export interface RequestFullscreenOptions extends FullscreenFallbackOptions, FullscreenOptions {}

export interface IBasePlayer extends IDisposable {
  video: HTMLVideoElement | null

  toggle(): void

  togglePictureInPicture(): void
  requestPictureInPicture(): Promise<void>
  exitPictureInPicture(): Promise<void>
  readonly supportPictureInPicture: boolean
  readonly pictureInPicture: boolean

  toggleFullscreen(options?: FullscreenFallbackOptions): void
  requestFullscreen(options?: RequestFullscreenOptions): Promise<void>
  exitFullscreen(options?: FullscreenFallbackOptions): Promise<void>
  readonly fullscreen: boolean

  toggleNativeFullscreen(): void
  requestNativeFullscreen(): void
  exitNativeFullscreen(): void
  readonly nativeFullscreen: boolean

  readonly onAutoPlayError: Event<globalThis.Event>
  readonly onLoopChange: Event<globalThis.Event>
}

/**
 * Base Player that delegates to the video property within the player
 */
export interface BasePlayer extends BasePlayerWithEvent {
  /** video delegation begin */
  poster: string
  readonly videoHeight: number
  readonly videoWidth: number
  autoplay: boolean
  buffered: TimeRanges
  controls: boolean
  crossOrigin: string | null
  readonly currentSrc: string
  currentTime: number
  readonly duration: number
  readonly ended: boolean
  readonly error: MediaError | null
  mediaKeys: MediaKeys | null
  muted: boolean
  readonly networkState: number
  readonly paused: boolean
  playbackRate: number
  defaultPlaybackRate: number
  readonly played: TimeRanges
  preload: string
  readonly readyState: number
  readonly seekable: TimeRanges
  readonly seeking: boolean
  volume: number

  getVideoPlaybackQuality(): VideoPlaybackQuality
  addTextTrack(
    kind: TextTrackKind,
    label?: string | undefined,
    language?: string | undefined
  ): TextTrack
  canPlayType(type: string): CanPlayTypeResult
  load(): void
  pause(): void
  play(): Promise<void>
  setMediaKeys(mediaKeys: MediaKeys | null): Promise<void>
  /** video delegation end */
}

/** fix auto play policy, when autoplay policy error happened, just set muted true and replay */
function fixAutoPlayPolicy(this: BasePlayer, video: HTMLVideoElement, disposables?: IDisposable[]) {
  if (!('_fixedPlay' in video)) {
    const play = video.play
    video.play = () => {
      return play.call(video).catch((error: Error) => {
        video.dispatchEvent(
          new ErrorEvent('error', {
            error,
            message: error.message,
          })
        )
      })
    }

    Object.defineProperty(video, '_fixedPlay', { value: true, enumerable: false })
  }

  const onAutoPlayError = Event.filter(
    Event.once(Event.fromDOMEventEmitter<ErrorEvent>(video, 'error')),
    evt => {
      const { error: err = this.error } = evt
      return (
        this.autoplay &&
        !this.muted &&
        (err?.name == 'NotAllowedError' || (err?.name == 'AbortError' && isSafari()))
      )
    }
  )

  onAutoPlayError(
    () => {
      const err = new window.Event('error', {
        cancelable: true,
      })
      const onAutoPlayError: Emitter<globalThis.Event> = (this as any)._onAutoPlayError
      onAutoPlayError.fire(err)
      if (!err.defaultPrevented) {
        this.muted = true
        this.play()
      }
    },
    null,
    disposables
  )
}

/** fix safari pause event twice issue */
function fixPauseEvent(this: BasePlayer, video: HTMLVideoElement, disposables?: IDisposable[]) {
  const target = this as any
  target._paused = video.paused
  const setPaused = (paused: boolean, evt: globalThis.Event) => {
    if (target._paused !== paused) {
      target._paused = paused
      if (paused) {
        target._onPause.fire(evt)
      } else {
        target._onPlay.fire(evt)
      }
    }
  }

  const onPlay = Event.fromDOMEventEmitter<globalThis.Event>(video, 'play')
  onPlay(evt => setPaused(false, evt), null, disposables)
  const onPause = Event.fromDOMEventEmitter<globalThis.Event>(video, 'pause')
  onPause(evt => setPaused(true, evt), null, disposables)
}

export abstract class BasePlayer extends Disposable implements IBasePlayer {
  private _video: HTMLVideoElement | null = null
  private _disposableVideo = this._register(new MutableDisposable())

  protected readonly _onAutoPlayError = this._register(new Emitter<globalThis.Event>())
  public readonly onAutoPlayError = Event.once(this._onAutoPlayError.event)

  protected readonly _onLoopChange = this._register(new Emitter<globalThis.Event>())
  public readonly onLoopChange = this._onLoopChange.event

  // pause state for workaround
  private _paused = false
  private _loop = false

  public abstract get fullscreen(): boolean
  public abstract requestFullscreen(options?: RequestFullscreenOptions | undefined): Promise<void>

  public set loop(loop: boolean) {
    const video = this.video
    if (video) {
      this._loop = video.loop
    }
    if (this._loop !== loop) {
      this._loop = loop
      if (video) {
        video.loop = loop
      }
      this._onLoopChange.fire(new window.Event('loopchange'))
    }
  }

  public get loop() {
    const video = this.video
    if (video) {
      this._loop = video.loop
    }
    return this._loop
  }

  public exitFullscreen({ fallback = 'never' } = {}): Promise<void> {
    if (this.supportFullscreen) {
      if (this.fullscreen) {
        return document.exitFullscreen()
      }
    } else if (fallback === 'native') {
      if (this.nativeFullscreen) {
        this.exitNativeFullscreen()
      }
    }
    return Promise.resolve()
  }

  public toggleFullscreen({ fallback = 'never' } = {}) {
    if (this.supportFullscreen) {
      if (this.fullscreen) {
        this.exitFullscreen().catch((error: Error) => {
          console.warn(error, 'Video failed to exit fullscreen mode.')
        })
      } else {
        this.requestFullscreen().catch((error: Error) => {
          console.warn(error, 'Video failed to enter fullscreen mode.')
        })
      }
    } else if (fallback === 'native') {
      this.toggleNativeFullscreen()
    } else {
      console.warn('Fullscreen is not supported')
    }
  }

  public exitNativeFullscreen() {
    if (this.nativeFullscreen) {
      if (this.video?.webkitExitFullscreen) {
        this.video.webkitExitFullscreen()
      }
    }
  }

  public requestNativeFullscreen() {
    if (!this.nativeFullscreen && this.supportNativeFullscreen) {
      if (this.video?.webkitEnterFullscreen) {
        this.video.webkitEnterFullscreen()
      }
    }
  }

  public toggleNativeFullscreen() {
    if (this.supportNativeFullscreen) {
      if (this.nativeFullscreen) {
        this.exitNativeFullscreen()
      } else {
        this.requestNativeFullscreen()
      }
    } else {
      console.warn('Native fullscreen is not supported')
    }
  }

  public get supportFullscreen() {
    return !!document.fullscreenEnabled
  }

  public get supportNativeFullscreen() {
    return !!this.video?.webkitSupportsFullscreen
  }

  public get nativeFullscreen(): boolean {
    return !!this.video?.webkitDisplayingFullscreen
  }

  public get pictureInPicture(): boolean {
    return !!this.video && this.video === document.pictureInPictureElement
  }

  public requestPictureInPicture(): Promise<void> {
    const video = this.withVideo()
    if (video.requestPictureInPicture) {
      return video.requestPictureInPicture()
    }
    return Promise.reject(new Error('picture in picture not supported'))
  }

  public exitPictureInPicture(): Promise<void> {
    if (this.pictureInPicture) {
      return document.exitPictureInPicture()
    }
    return Promise.resolve()
  }

  public get supportPictureInPicture() {
    return !!document.pictureInPictureEnabled
  }

  public togglePictureInPicture() {
    if (this.supportPictureInPicture) {
      if (this.pictureInPicture) {
        //关闭
        this.exitPictureInPicture().catch((error: Error) => {
          console.warn(error, 'Video failed to leave Picture-in-Picture mode.')
        })
      } else {
        //开启
        this.requestPictureInPicture().catch((error: Error) => {
          console.warn(error, 'Video failed to enter Picture-in-Picture mode.')
        })
      }
    } else {
      console.warn('Picture in picture is not supported')
    }
  }

  get video() {
    return this._video
  }

  set video(video: HTMLVideoElement | null) {
    if (this.video === video) {
      return
    }

    this._disposableVideo.value = this._registerVideoListeners(video)
  }

  private _registerVideoListeners(video: HTMLVideoElement | null) {
    this._video = video
    if (video) {
      // sync status with video
      this._paused = video.paused
      // sync status with base player
      video.loop = this._loop

      const player = this as any
      const disposables: IDisposable[] = []

      VideoEventNameArray.forEach(key => {
        // eliminate the 'on' upon the event type
        const type = VideoEventNameMap[key]

        if (key === 'onPause' || key === 'onPlay') {
          // fix pause and play event in safari
          return
        }

        // every video event should be fired to the player event emitter
        const handler = (ev: any) => player[`_${key}`].fire(ev)
        Event.fromDOMEventEmitter(video, type)(handler, this, disposables)
      })

      // fix auto play rejection issue
      fixAutoPlayPolicy.call(this, video, disposables)

      // fix pause event twice issue in safari
      fixPauseEvent.call(this, video, disposables)

      return combinedDisposable(...disposables)
    }
  }

  /**
   * get inner HTMLVideoElement, throw error if video is null
   */
  protected withVideo() {
    const video = this.video
    assert(video)
    return video
  }

  public toggle() {
    if (this.paused) {
      this.play()
    } else {
      this.pause()
    }
  }

  public reset() {
    if (this.video) {
      this.video.pause()
      this.video?.removeAttribute('src')
      this.load()
      if (!this._paused) {
        // workaround to dispatch a pause event for completing the lifecycle
        this.video.dispatchEvent(new window.Event('pause', { cancelable: true }))
      }
    }
  }

  public get bufferedTime() {
    const c = this.currentTime
    if (this.buffered.length === 0) {
      return c
    }
    let i = 0
    let j = this.buffered.length

    // start0
    while (i < j) {
      const idx = (i + j) >> 1
      const start = this.buffered.start(idx)
      if (c > start) {
        i = idx + 1
      } else if (c < start) {
        j = idx
      } else {
        return this.buffered.end(i)
      }
    }

    const idx = i - 1

    if (idx >= this.buffered.length || idx < 0) {
      return c
    }

    const end = this.buffered.end(idx)
    return end < c ? c : end
  }
}

delegates(BasePlayer.prototype, 'video')
  .access('poster')
  .getter('videoHeight')
  .getter('videoWidth')
  .method('getVideoPlaybackQuality')
  .access('autoplay')
  .access('buffered')
  .access('controls')
  .access('crossOrigin')
  .getter('currentSrc')
  .access('currentTime')
  .getter('duration')
  .getter('ended')
  .getter('error')
  // .access('loop')
  .access('mediaKeys')
  .access('muted')
  .getter('networkState')
  .getter('paused')
  .access('playbackRate')
  .access('defaultPlaybackRate')
  .getter('played')
  .access('preload')
  .getter('readyState')
  .getter('seekable')
  .getter('seeking')
  .access('volume')
  .method('addTextTrack')
  .method('canPlayType')
  .method('load')
  .method('pause')
  .method('play')
  .method('setMediaKeys')

const _noop = () => undefined

const _internalEmitter = {
  fire: _noop,
  event: () => Disposable.None,
  dispose: _noop,
}

// register player listener disposable
const desc = VideoEventNameArray.reduce((desc: any, key) => {
  const emitterKey = `_${key}`
  desc[emitterKey] = {
    value: _internalEmitter,
  }
  desc[key] = {
    get() {
      let emitter = this[emitterKey]
      if (emitter === _internalEmitter) {
        emitter = this._register(new Emitter())
        Object.defineProperty(this, emitterKey, { get: () => emitter })
      }
      return emitter.event
    },
    enumerable: true,
  }
  return desc
}, {} as Record<string, PropertyDescriptor>)

Object.defineProperties(BasePlayer.prototype, desc)
