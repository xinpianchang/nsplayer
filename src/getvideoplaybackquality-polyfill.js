function isWebKit() {
  // has not getVideoPlaybackQuality, but has webkit prefix method
  return 'webkitDroppedFrameCount' in HTMLVideoElement.prototype
}

function getVideoPlaybackQuality() {
  if (isWebKit()) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const webKitVideo = this
    return {
      droppedVideoFrames: webKitVideo.webkitDroppedFrameCount,
      totalVideoFrames: webKitVideo.webkitDecodedFrameCount,
      // Not provided by this polyfill:
      corruptedVideoFrames: webKitVideo.corruptedVideoFrames || 0,
      creationTime: webKitVideo.creationTime || NaN,
      totalFrameDelay: webKitVideo.totalFrameDelay || 0, // Moz extension
    }
  } else {
    return {
      droppedVideoFrames: 0,
      totalVideoFrames: 0,
      corruptedVideoFrames: 0,
      creationTime: NaN,
      totalFrameDelay: 0, // Moz extension
    }
  }
}

if (typeof window !== 'undefined') {
  if (!HTMLVideoElement.prototype.getVideoPlaybackQuality) {
    HTMLVideoElement.prototype.getVideoPlaybackQuality = getVideoPlaybackQuality
  }
}

export default {}
