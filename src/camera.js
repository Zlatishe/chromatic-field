/**
 * camera.js — Camera stream acquisition and permission handling.
 *
 * Returns the hidden <video> element as a source for MediaPipe.
 * The user never sees the camera feed — only the gradient canvas.
 */

export class Camera {
  /**
   * @param {HTMLVideoElement} videoEl — the hidden #camera-feed element
   */
  constructor(videoEl) {
    this.video  = videoEl;
    this.stream = null;
    /** @type {'idle'|'granted'|'denied'|'error'} */
    this.state  = 'idle';
  }

  /**
   * Request front-facing camera access. Resolves with the permission state.
   * Rejects only on unexpected errors (not on deny).
   * @returns {Promise<'granted'|'denied'>}
   */
  async requestAccess() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width:  { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      this.video.srcObject = this.stream;

      // Wait for video metadata so width/height are known
      await new Promise((resolve, reject) => {
        this.video.onloadedmetadata = resolve;
        this.video.onerror = reject;
      });

      await this.video.play();
      this.state = 'granted';
      return 'granted';

    } catch (err) {
      if (
        err.name === 'NotAllowedError' ||
        err.name === 'PermissionDeniedError' ||
        err.name === 'SecurityError'
      ) {
        this.state = 'denied';
        return 'denied';
      }
      // NotFoundError, OverconstrainedError, etc.
      this.state = 'error';
      throw err;
    }
  }

  /** Stop all camera tracks and release the stream. */
  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
    this.state = 'idle';
  }

  /** True once the video has enough data for MediaPipe to process. */
  get isReady() {
    return this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  }
}
