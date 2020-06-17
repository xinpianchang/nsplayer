// import {
//   CorePlayer,
//   SourceWithMimeType,
//   PlayList,
//   QualityLevel,
//   qualityLevelToId,
//   idToQualityLevel,
//   isSameLevel,
// } from '.'
// import { Event } from '@newstudios/common/event'

// export interface SourceWithDetail extends SourceWithMimeType {
//   width: number
//   height: number
//   bitrate: number
// }

// export class NormalPlayer extends CorePlayer {
//   private _currentLevelIndex: number

//   constructor(private _video: HTMLVideoElement, private _sources: SourceWithDetail[]) {
//     super(_video, _sources[0])
//     this._currentLevelIndex = 0
//   }

//   protected translatePlayList(): PlayList {
//     return this._sources.map(source => this.detailSourceToQuality(source))
//   }

//   protected translateCurrentQuality(): QualityLevel | undefined {
//     return this.detailSourceToQuality(this.currentLevel)
//   }

//   private get levels() {
//     return this._sources
//   }

//   private get currentLevel() {
//     return this.levels[this._currentLevelIndex]
//   }

//   private updateNextQualityLevel(levelIndex: number) {
//     const level = this.levels[levelIndex]
//     if (level) {
//       const qualityLevel = this.detailSourceToQuality(level)
//       this._onQualitySwitching.fire(qualityLevel)
//     }
//   }

//   private detailSourceToQuality(source: SourceWithDetail): QualityLevel {
//     return {
//       width: source.width,
//       height: source.height,
//       bitrate: source.bitrate,
//       type: 'video',
//     }
//   }

//   private findSourceByQuality(quality: QualityLevel): SourceWithDetail | undefined {
//     return this._sources.find(source => isSameLevel(this.detailSourceToQuality(source), quality))
//   }

//   public get name(): string {
//     return 'XPCPlayer'
//   }

//   public get autoQuality(): boolean {
//     return false
//   }

//   public get qualityId(): string {
//     return qualityLevelToId(this.detailSourceToQuality(this.currentLevel))
//   }

//   public get supportAutoQuality(): boolean {
//     return false
//   }

//   public setQualityById(id: string, _fastSwitch = false): void {
//     const qualityLevel = idToQualityLevel(id)
//     if (qualityLevel) {
//       const source = this.findSourceByQuality(qualityLevel)
//       if (!source) {
//         return
//       }
//       if (this.isReady()) {
//         this.currentLevel = source
//         this._video.src = source.src
//       } else {
//         Event.once(this.onReady)
//       }
//     }
//   }

//   protected onInit(video: HTMLVideoElement, source: SourceWithMimeType): void {
//     if (video.canPlayType(source.mime)) {
//       const onLoadStart = Event.fromDOMEventEmitter(video, 'loadstart')
//       const onLoadEnd = Event.fromDOMEventEmitter(video, 'loadmetadata')

//       // this.qualityId = this.

//       this.updatePlayList()
//       this.setReady()
//       video.src = source.src
//     } else {
//       throw new Error(`cannot play this video with mime type ${source.mime}`)
//     }
//   }
// }
