import { computeFPS, CorePlayer, QualityLevel, SourceWithMimeType } from '.'
import shaka from 'shaka-player'
import {
  DisposableStore,
  Emitter,
  Event,
  IntervalTimer,
  MutableDisposable,
  toDisposable,
} from '@newstudios/common'

export class ShakaPlayer extends CorePlayer<shaka.extern.Track> {
  private static readonly _fixed = (function fixPlayer() {
    if (typeof window !== 'undefined') {
      shaka.polyfill.installAll()
      // if (shaka.Player.isBrowserSupported()) {
      //   return true
      // } else {
      //   console.warn('Shaka player not supported')
      // }
      return true
    }
    return false
  })()

  private _shakaPlayer: shaka.Player
  private _nextTrack: shaka.extern.Track | undefined
  private _videoSizeObserverTimer = this._register(new IntervalTimer())
  private _initialBitrateMutable = this._register(new MutableDisposable())
  private _videoWidth = 0
  private _videoHeight = 0
  private _maxWidth = 1e5
  private _maxHeight = 1e5
  private _bufferMutable = this._register(new MutableDisposable())

  protected readonly _onVideoLevelSwitched = this._register(new Emitter<void>())
  public readonly onVideoLevelSwitched = this._onVideoLevelSwitched.event

  constructor(
    video: HTMLVideoElement,
    source: SourceWithMimeType,
    private _fastSwitch = true,
    private _capLevelToPlayerSize = false
  ) {
    super(video, source)

    const player = new shaka.Player()
    this._shakaPlayer = player as shaka.Player

    // https://github.com/google/shaka-player/pull/2330/commits/4f8e1286610e4ae667f0bb82f4f4fa97b451595c
    this._shakaPlayer.configure({
      manifest: {
        dash: {
          ignoreEmptyAdaptationSet: true,
          ignoreMinBufferTime: true,
        },
      },
      streaming: {
        bufferingGoal: 15,
      },
    })

    this.debugError()
    this._register(toDisposable(() => player.destroy()))
  }

  private debugError() {
    const onError = Event.fromDOMEventEmitter<shaka.Player.ErrorEvent>(this._shakaPlayer, 'error')
    this._register(onError(err => console.warn('shaka error', err.detail?.message || '')))
  }

  private startObserveVideoSize() {
    this._videoSizeObserverTimer.cancelAndSet(this.videoSizeHandler, 1000)
  }

  private videoSizeHandler = () => {
    let changed = false
    if (this._videoWidth !== this.video.videoWidth) {
      this._videoWidth = this.video.videoWidth
      changed = true
    }
    if (this._videoHeight !== this.video.videoHeight) {
      this._videoHeight = this.video.videoHeight
      changed = true
    }
    if (changed && !isNaN(this._videoWidth) && !isNaN(this._videoHeight)) {
      this._onVideoLevelSwitched.fire()
    }

    // capLevelToPlayerSize
    const maxWidth = this._capLevelToPlayerSize
      ? this.video.clientWidth * this.devicePixelRatio
      : 1e5
    const maxHeight = this._capLevelToPlayerSize
      ? this.video.clientHeight * this.devicePixelRatio
      : 1e5

    if (maxWidth !== this._maxWidth && !isNaN(maxWidth)) {
      this._maxWidth = maxWidth
      this._shakaPlayer.configure('abr.restrictions.maxWidth', maxWidth)
    }
    if (maxHeight !== this._maxHeight && !isNaN(maxHeight)) {
      this._maxHeight = maxHeight
      this._shakaPlayer.configure('abr.restrictions.maxHeight', maxHeight)
    }
  }

  private get devicePixelRatio() {
    const w = window as any as Record<string, number>
    return (
      w.devicePixelRatio ||
      w.mozDevicePixelRatio ||
      w.webkitDevicePixelRatio ||
      w.msDevicePixelRatio ||
      1
    )
  }

  private stopObserveVideoSize() {
    this._videoSizeObserverTimer.cancel()
  }

  public get name(): string {
    return `SHAKAPlayer (${shaka.Player.version})`
  }

  public get supportAutoQuality(): boolean {
    // return shaka.Player.isBrowserSupported()
    return true
  }

  public get bandwidthEstimate(): number {
    return this._shakaPlayer.getStats().estimatedBandwidth
  }

  public setInitialBitrate(bitrate: number) {
    // abr control doc https://github.com/shaka-project/shaka-player/issues/629
    this._shakaPlayer.configure('abr.defaultBandwidthEstimate', bitrate)
    if (this.ready) {
      return
    }
    this._initialBitrateMutable.value = this.onOncePlayListReady(() => {
      let index = 0
      const levels = this.levels
      for (let i = 0; i < levels.length; i++) {
        if (levels[i].bandwidth <= bitrate) {
          index = i
        } else {
          break
        }
      }
      this.log('setInitialBitrate', 'async start level:', index)
      this._shakaPlayer.selectVariantTrack(levels[index], true)
    })
  }

  public setCapLevelToPlayerSize(capLevelToPlayerSize: boolean) {
    this.log('setCapLevelToPlayerSize', capLevelToPlayerSize)
    this._capLevelToPlayerSize = capLevelToPlayerSize
  }

  public get capLevelToPlayerSize(): boolean {
    return this._capLevelToPlayerSize
  }

  protected get levels(): shaka.extern.Track[] {
    return this._shakaPlayer
      .getVariantTracks()
      .filter(
        track =>
          track.type === 'variant' &&
          typeof track.videoId === 'number' &&
          typeof track.videoCodec === 'string'
      )
  }

  protected get currentLevel(): shaka.extern.Track | undefined {
    return this._shakaPlayer
      .getVariantTracks()
      .find(track => track.type === 'variant' && typeof track.videoId === 'number' && track.active)
  }

  protected get nextLevel(): shaka.extern.Track | undefined {
    return this._nextTrack
  }

  protected get autoQualityEnabled(): boolean {
    return this._shakaPlayer.getConfiguration().abr.enabled
  }

  protected levelToQuality(level: shaka.extern.Track): QualityLevel {
    const fps = computeFPS(level.frameRate)
    return {
      bitrate: level.bandwidth,
      width: level.width || 0,
      height: level.height || 0,
      type:
        typeof level.videoId === 'number'
          ? 'video'
          : typeof level.audioId === 'number'
          ? 'audio'
          : undefined,
      ...(fps ? { fps } : {}),
    }
  }

  protected findLevelIndexByQualityLevel(playLevel: QualityLevel) {
    // bitrate match
    const idx = this.levels.findIndex(level => level.bandwidth === playLevel.bitrate)
    if (idx >= 0) {
      return idx
    }
    // short side match
    const shortSide = Math.min(playLevel.width, playLevel.height)
    return this.levels.findIndex(
      level => Math.min(level.width || 0, level.height || 0) === shortSide
    )
  }

  protected setAutoQualityState(auto: boolean): void {
    this._shakaPlayer.configure('abr.enabled', auto)
    if (!auto) {
      this._initialBitrateMutable.value = undefined
    }
  }

  protected setNextLevelIndex(index: number): void {
    const track = this.levels[index]
    if (track) {
      this._nextTrack = track
      if (this.ready) {
        this._shakaPlayer.selectVariantTrack(track, true, this._fastSwitch ? 5 : 8)
      } else if (!this.autoQualityEnabled) {
        this.log('setNextLevelIndex', 'start level:', index, `${track.width}x${track.height}`)
        this._shakaPlayer.selectVariantTrack(track)
      }
      this._initialBitrateMutable.value = undefined
    }
  }

  protected onInit(video: HTMLVideoElement, source: SourceWithMimeType): void {
    const player = this._shakaPlayer
    player.attach(video)
    player.load(source.src, 0, source.mime)

    const disposables = this._register(new DisposableStore())

    Event.fromDOMEventEmitter(video, 'play')(this.startObserveVideoSize, this, disposables)
    Event.fromDOMEventEmitter(video, 'pause')(this.stopObserveVideoSize, this, disposables)

    const onTracksChanged = Event.fromDOMEventEmitter<shaka.Player.TracksChangedEvent>(
      player as Event.DOMEventEmitter,
      'trackschanged'
    )

    const onAutoLevelSwitched = Event.fromDOMEventEmitter<shaka.Player.AdaptationEvent>(
      player,
      'adaptation'
    )

    const onLoad = Event.fromDOMEventEmitter<shaka.Player.LoadedEvent>(player, 'loaded')
    const onBuffering = Event.fromDOMEventEmitter<shaka.Player.BufferingEvent>(player, 'buffering')
    const onManualLevelSwitched = Event.fromDOMEventEmitter<shaka.Player.VariantChangedEvent>(
      player,
      'variantchanged'
    )

    // hack video event
    onBuffering(
      evt => {
        if (evt.buffering) {
          this._bufferMutable.value = Event.fromDOMEventEmitter(video, [
            'playing',
            'canplaythrough',
          ])(() => {
            video.dispatchEvent(new window.Event('waiting'))
          })
          if (!video.paused) {
            video.dispatchEvent(new window.Event('waiting'))
          }
        } else {
          this._bufferMutable.value = undefined
          if (!video.paused) {
            video.dispatchEvent(new window.Event('playing'))
          }
        }
      },
      null,
      disposables
    )
    onTracksChanged(this.updatePlayList, this, disposables)
    onLoad(
      () => {
        video.autoplay && video.play()
        this.setReady()
      },
      null,
      disposables
    )

    onAutoLevelSwitched(() => (this._nextTrack = this.currentLevel), null, disposables)
    onAutoLevelSwitched(this.updateQualityLevel, this, disposables)
    onManualLevelSwitched(this.updateNextQualityLevel, this, disposables)
    this.onVideoLevelSwitched(this.updateQualityLevel, this, disposables)
  }
}
