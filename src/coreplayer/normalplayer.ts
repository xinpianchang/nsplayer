// import { Disposable, toDisposable } from '@newstudios/common/lifecycle'
// import { ICorePlayer, PlayList, createPlayList } from '.'
// import { Emitter } from '@newstudios/common/event'
// // import Hls from 'hls.js'
// // const STREAM_INITIALIZED = Dash.MediaPlayer.events.STREAM_INITIALIZED

// export class NormalPlayer extends Disposable implements ICorePlayer {
//   // private _hlsPlayer?: Hls
//   public playList: PlayList = []
//   constructor(private _video: HTMLVideoElement, private _quiltyList: any[]) {
//     super()
//   }

//   public init(src: string): void {
//     this._video.src = src
//     const handler = () => {
//       this.playList = createPlayList(this._quiltyList)
//       this._onReceivePlayList.fire(this.playList)
//     }
//     const timer = setTimeout(handler, 0)

//     this._register(
//       toDisposable(() => {
//         clearTimeout(timer)
//       })
//     )
//   }

//   public setQualityById(key?: string): void {
//     const index = this.playList.findIndex(item => item.key === key)
//     this._video.src = this.playList[index > -1 ? index : 0].src
//   }

//   protected _onReceivePlayList = this._register(new Emitter<PlayList>())
//   public onPlayListResolve = this._onReceivePlayList.event
// }
