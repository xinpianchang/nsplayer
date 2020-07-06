import delegates from 'delegates'
import {
  Disposable,
  MutableDisposable,
  combinedDisposable,
  IDisposable,
} from '@newstudios/common/lifecycle'
import { Emitter, Event } from '@newstudios/common/event'
import {
  BasePlayerWithEvent,
  VideoEventNameMap,
  VideoEventNameArray,
  isSafari,
  DOMEvent,
} from './types'
import { assert } from './types'

export interface NSPlayerOptions {
  el?: HTMLElement
}

export interface IBasePlayer extends IDisposable {
  video: HTMLVideoElement | null

  toggle(): void
  exitFullscreen(): Promise<void>
  requestFullscreen(options?: FullscreenOptions | undefined): Promise<void>
  readonly fullscreen: boolean
  readonly onAutoPlayError: Event<DOMEvent>
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

export abstract class BasePlayer extends Disposable implements IBasePlayer {
  private _video: HTMLVideoElement | null = null
  private _disposableVideo = new MutableDisposable()
  private _paused = true

  private readonly _onAutoPlayError = this._register(new Emitter<DOMEvent>())
  public readonly onAutoPlayError = Event.once(this._onAutoPlayError.event)

  // detect pure safari
  protected static _isSafari = isSafari()

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

  public exitFullscreen(): Promise<void> {
    return document.exitFullscreen()
  }

  public get fullscreen() {
    return document.fullscreen
  }

  public abstract requestFullscreen(options?: FullscreenOptions | undefined): Promise<void>

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
      this._paused = video.paused
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
      this._fixAutoPlayPolicy(video, disposables)

      // fix pause event twice issue in safari
      this._fixPauseEvent(video, disposables)

      return combinedDisposable(...disposables)
    }
  }

  // when autoplay policy error happened, just set muted true and replay
  private _fixAutoPlayPolicy(video: HTMLVideoElement, disposables?: IDisposable[]) {
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

      Object.defineProperty(video, '_fixedPlay', { value: true })
    }

    const onAutoPlayError = Event.filter(
      Event.once(Event.fromDOMEventEmitter<ErrorEvent>(video, 'error')),
      evt => {
        const { error: err = this.error } = evt
        return (
          this.autoplay &&
          !this.muted &&
          (err.name == 'NotAllowedError' || (err.name == 'AbortError' && BasePlayer._isSafari))
        )
      }
    )

    onAutoPlayError(
      () => {
        const err = new window.Event('error', {
          cancelable: true,
        })
        this._onAutoPlayError.fire(err)
        if (!err.defaultPrevented) {
          console.info('mute and re-play')
          this.muted = true
          this.play()
        }
      },
      null,
      disposables
    )
  }

  private _fixPauseEvent(video: HTMLVideoElement, disposables?: IDisposable[]) {
    const target = this as any
    const setPaused = (paused: boolean, evt: any) => {
      if (this._paused !== paused) {
        this._paused = paused
        if (paused) {
          target._onPause.fire(evt)
        } else {
          target._onPlay.fire(evt)
        }
      }
    }

    const onPlay = Event.fromDOMEventEmitter(video, 'play')
    onPlay((evt: any) => setPaused(false, evt), null, disposables)
    const onPause = Event.fromDOMEventEmitter(video, 'pause')
    onPause((evt: any) => setPaused(true, evt), null, disposables)
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
      this.video?.removeAttribute('src')
      this.load()
    }
    this._paused = true
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
