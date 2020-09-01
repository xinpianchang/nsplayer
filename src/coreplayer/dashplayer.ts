import { toDisposable, DisposableStore, Event } from '@newstudios/common'
import { CorePlayer, SourceWithMimeType, QualityLevel, idToQualityLevel } from '.'
import {
  MediaPlayer,
  MediaPlayerClass,
  MediaPlayerFactory,
  BitrateInfo,
  QualityChangeRequestedEvent,
  QualityChangeRenderedEvent,
  MediaType,
} from 'dashjs'

type Trace = {
  b: [number]
  d: number
  s: Date
}

type MetricRequest = {
  interval: number
  responsecode: number
  trequest: Date
  tresponse: Date
  url: string
  type: 'MediaSegment'
  _tfinish: Date
  _stream: MediaType
  _mediaduration: number
  _responseHeaders: string
  _quality: number
  trace: Trace[]
}

function getBytesLength(request: MetricRequest) {
  return request.trace.reduce((a, b) => a + b.b[0], 0)
}

function getTime(request: MetricRequest) {
  return request.trace.reduce((a, b) => a + b.d, 0)
}

function caculateBandWidthFor(player: MediaPlayerClass, type: MediaType) {
  const metrics = player.getDashMetrics()
  const requests = metrics.getHttpRequests(type) as MetricRequest[]

  const lastCount = 4

  const requestWindow = requests
    .slice(-lastCount * 5)
    .filter(req => {
      return (
        req.type === 'MediaSegment' &&
        req._stream === type &&
        req.trace.length > 1 &&
        req._tfinish.getTime() - req.tresponse.getTime() > 0
      )
    })
    .slice(-lastCount)

  if (requestWindow.length === 0) {
    return 0
  }

  const downloadLengths = requestWindow.map(req => getBytesLength(req) * 8)
  const downloadTimes = requestWindow.map(req => getTime(req) / 1000)

  const size = downloadLengths.reduce((a, b) => a + b, 0)
  const time = downloadTimes.reduce((a, b) => a + b, 0)

  return Math.round(size / time)
}

function caculateBandWidth(player: MediaPlayerClass): number {
  return caculateBandWidthFor(player, 'video') + caculateBandWidthFor(player, 'audio')
}

export class DashPlayer extends CorePlayer<BitrateInfo> {
  public static setDefaultMediaPlayerFactory(factory: MediaPlayerFactory) {
    DashPlayer._mediaPlayerFactory = factory
  }

  private static _mediaPlayerFactory = MediaPlayer()
  /** currently only support video media type */
  private readonly _mediaType: 'video' | 'audio' = 'video'
  private readonly _fastSwitchEnabled: boolean
  private _dashPlayer: MediaPlayerClass
  private _currentLevelIndex = 0

  constructor(video: HTMLVideoElement, source: SourceWithMimeType, fastSwitch = true) {
    super(video, source)
    this._fastSwitchEnabled = fastSwitch
    this._dashPlayer = DashPlayer._mediaPlayerFactory.create()
    this._dashPlayer.updateSettings({
      streaming: {
        fastSwitchEnabled: this._fastSwitchEnabled,
      },
    })

    // debug error
    this.debugError()
    this._register(toDisposable(() => this._dashPlayer.reset()))
  }

  private debugError() {
    const onError = Event.fromNodeEventEmitter(this._dashPlayer, MediaPlayer.events.ERROR)
    const onPlaybackError = Event.fromNodeEventEmitter(
      this._dashPlayer,
      MediaPlayer.events.PLAYBACK_ERROR
    )
    this._register(onError(err => console.info(err)))
    this._register(onPlaybackError(err => console.info(err)))
  }

  protected get levels() {
    return this._dashPlayer.getBitrateInfoListFor(this._mediaType)
  }

  protected get currentLevel(): BitrateInfo | undefined {
    return this.levels[this._currentLevelIndex]
  }

  protected get nextLevel(): BitrateInfo | undefined {
    return this.levels[this._dashPlayer.getQualityFor(this._mediaType)]
  }

  protected get autoQualityEnabled(): boolean {
    const autoSwitchBitrate = this._dashPlayer.getSettings().streaming?.abr?.autoSwitchBitrate
    if (autoSwitchBitrate) {
      return typeof autoSwitchBitrate[this._mediaType] === 'boolean'
        ? (autoSwitchBitrate[this._mediaType] as boolean)
        : true
    }
    return true
  }

  protected levelToQuality(bitrateInfo: BitrateInfo): QualityLevel {
    const level: QualityLevel = {
      bitrate: bitrateInfo.bitrate,
      width: bitrateInfo.width,
      height: bitrateInfo.height,
      type: bitrateInfo.mediaType,
    }
    return level
  }

  protected findLevelIndexById(id: string) {
    const playLevel = idToQualityLevel(id)
    const levels = this.levels
    if (playLevel && levels.length) {
      // bitrate match
      let idx = levels.findIndex(level => level.bitrate === playLevel.bitrate)
      if (idx >= 0) {
        return idx
      }
      // short side match
      const shortSide = Math.min(playLevel.width, playLevel.height)
      idx = levels.findIndex(level => Math.min(level.width, level.height) === shortSide)
      if (idx >= 0) {
        return idx
      }
    }
    return -1
  }

  protected setAutoQualityState(auto: boolean) {
    const dashPlayer = this._dashPlayer
    dashPlayer.updateSettings({
      streaming: {
        fastSwitchEnabled: this._fastSwitchEnabled,
        abr: {
          autoSwitchBitrate: {
            [this._mediaType]: auto,
          },
        },
      },
    })
  }

  protected setNextLevelIndex(index: number) {
    const dashPlayer = this._dashPlayer
    if (index >= 0) {
      dashPlayer.setQualityFor(this._mediaType, index)
    }
  }

  protected onInit(video: HTMLVideoElement, source: SourceWithMimeType): void {
    const dashPlayer = this._dashPlayer
    dashPlayer.initialize(video, source.src, this.video.autoplay)

    const disposables = new DisposableStore()
    const onManifestParsed = Event.fromNodeEventEmitter(
      dashPlayer,
      MediaPlayer.events.STREAM_INITIALIZED
    )

    const onLevelSwitched = Event.filter(
      Event.fromNodeEventEmitter<QualityChangeRenderedEvent>(
        dashPlayer,
        MediaPlayer.events.QUALITY_CHANGE_RENDERED
      ),
      evt => evt.mediaType === this._mediaType
    )

    const onLevelSwitching = Event.filter(
      Event.fromNodeEventEmitter<QualityChangeRequestedEvent>(
        dashPlayer,
        MediaPlayer.events.QUALITY_CHANGE_REQUESTED
      ),
      evt => evt.mediaType === this._mediaType
    )

    onManifestParsed(this.updatePlayList, this, disposables)
    onManifestParsed(this.setReady, this, disposables)
    onLevelSwitching(this.updateNextQualityLevel, this, disposables)
    onLevelSwitched(
      evt => {
        this._currentLevelIndex = evt.newQuality
        this.updateQualityLevel()
      },
      null,
      disposables
    )

    this._register(disposables)
  }

  public setInitialBitrate(bitrate: number) {
    const dashPlayer = this._dashPlayer
    dashPlayer.updateSettings({
      streaming: {
        fastSwitchEnabled: this._fastSwitchEnabled,
        abr: {
          initialBitrate: {
            [this._mediaType]: bitrate / 1000,
          },
        },
      },
    })
  }

  public get bandwidthEstimate(): number {
    return caculateBandWidth(this._dashPlayer)
  }

  public get name() {
    return `DASHPlayer (${this._dashPlayer.getVersion()})`
  }

  public get supportAutoQuality(): boolean {
    return true
  }
}
