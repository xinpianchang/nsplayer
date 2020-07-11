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

export interface IBasePlayer extends IDisposable {
  video: HTMLVideoElement | null

  toggle(): void

  togglePictureInPicture(): void
  requestPictureInPicture(): Promise<void>
  exitPictureInPicture(): Promise<void>
  readonly supportPictureInPicture: boolean
  readonly pictureInPicture: boolean

  toggleFullscreen(): void
  requestFullscreen(options?: FullscreenOptions | undefined): Promise<void>
  exitFullscreen(): Promise<void>
  readonly fullscreen: boolean

  readonly onAutoPlayError: Event<globalThis.Event>
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
  loop: boolean
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
        (err.name == 'NotAllowedError' || (err.name == 'AbortError' && isSafari()))
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
  private _disposableVideo = new MutableDisposable()

  private readonly _onAutoPlayError = this._register(new Emitter<globalThis.Event>())
  public readonly onAutoPlayError = Event.once(this._onAutoPlayError.event)

  // pause state for workaround
  private _paused = false

  constructor() {
    super()

    // register video disposable
    this._register(this._disposableVideo)

    // register player listener disposable
    const player = this as any
    VideoEventNameArray.map(key => {
      const emitter = new Emitter<unknown>()
      this._register(emitter)
      player[`_${key}`] = emitter
      player[key] = emitter.event
    })
  }

  public abstract get fullscreen(): boolean

  public abstract requestFullscreen(options?: FullscreenOptions | undefined): Promise<void>

  public exitFullscreen(): Promise<void> {
    if (this.fullscreen) {
      return document.exitFullscreen()
    }
    return Promise.resolve()
  }

  public toggleFullscreen() {
    if (this.fullscreen) {
      this.requestFullscreen()
    } else {
      this.exitFullscreen()
    }
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
    return !!HTMLVideoElement.prototype.requestPictureInPicture
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
  .access('loop')
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
  .method('requestFullscreen')
