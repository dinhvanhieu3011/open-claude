import { desktopCapturer } from 'electron';
import * as os from 'os';

// Lazy-load mac-screen-capture-permissions to avoid loading electron-util before Electron is ready
let macScreenCapturePermissions: any = null;
function getMacScreenCapturePermissions() {
  if (!macScreenCapturePermissions) {
    macScreenCapturePermissions = require('mac-screen-capture-permissions');
  }
  return macScreenCapturePermissions;
}

/**
 * Check macOS version to determine if ScreenCaptureKit is available
 * ScreenCaptureKit audio loopback requires macOS 13.2+ (Ventura)
 */
export function hasDualAudioSupport(): boolean {
  if (process.platform !== 'darwin') {
    return false;
  }

  try {
    const release = os.release();
    const [major, minor] = release.split('.').map(Number);

    // macOS 13.x = Darwin 22.x, need 13.2+ = Darwin 22.2+
    if (major > 22) return true;
    if (major === 22 && minor >= 2) return true;

    return false;
  } catch (error) {
    console.error('[Audio Sources] Error checking macOS version:', error);
    return false;
  }
}

/**
 * Check if app has Screen Recording permission (required for system audio)
 */
export function hasScreenRecordingPermission(): boolean {
  if (process.platform !== 'darwin') {
    return false;
  }

  try {
    return getMacScreenCapturePermissions().hasScreenCapturePermission();
  } catch (error) {
    console.error('[Audio Sources] Error checking screen recording permission:', error);
    return false;
  }
}

/**
 * Request Screen Recording permission from user
 * This will open System Settings on first call
 */
export function requestScreenRecordingPermission(): void {
  if (process.platform !== 'darwin') {
    return;
  }

  try {
    // This will trigger the system permission dialog on first call
    getMacScreenCapturePermissions().hasScreenCapturePermission();
  } catch (error) {
    console.error('[Audio Sources] Error requesting screen recording permission:', error);
  }
}

/**
 * Get microphone audio stream using getUserMedia
 */
export async function getMicrophoneStream(): Promise<MediaStream | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 1
      }
    });

    console.log('[Audio Sources] Microphone stream created');
    return stream;
  } catch (error) {
    console.error('[Audio Sources] Error getting microphone stream:', error);
    return null;
  }
}

/**
 * Get system audio stream using desktopCapturer (macOS 13.2+)
 * Requires Screen Recording permission
 */
export async function getSystemAudioStream(): Promise<MediaStream | null> {
  if (!hasDualAudioSupport()) {
    console.warn('[Audio Sources] System audio not supported on this macOS version (need 13.2+)');
    return null;
  }

  if (!hasScreenRecordingPermission()) {
    console.warn('[Audio Sources] Screen Recording permission not granted');
    return null;
  }

  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      fetchWindowIcons: false
    });

    if (sources.length === 0) {
      console.error('[Audio Sources] No screen sources available');
      return null;
    }

    // Use the first screen source (usually primary display)
    const source = sources[0];

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id
        }
      } as any,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id
        }
      } as any
    });

    // Extract only audio track
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.error('[Audio Sources] No audio track in system capture');
      return null;
    }

    // Create new stream with only audio
    const audioStream = new MediaStream(audioTracks);

    // Stop video tracks (we don't need them)
    stream.getVideoTracks().forEach(track => track.stop());

    console.log('[Audio Sources] System audio stream created');
    return audioStream;
  } catch (error) {
    console.error('[Audio Sources] Error getting system audio stream:', error);
    return null;
  }
}

/**
 * Check if system audio capture is available and configured properly
 */
export function canCaptureSystemAudio(): { available: boolean; reason?: string } {
  if (process.platform !== 'darwin') {
    return {
      available: false,
      reason: 'System audio capture only supported on macOS'
    };
  }

  if (!hasDualAudioSupport()) {
    return {
      available: false,
      reason: 'macOS 13.2 or newer required for system audio capture'
    };
  }

  if (!hasScreenRecordingPermission()) {
    return {
      available: false,
      reason: 'Screen Recording permission required (System Settings > Privacy & Security > Screen Recording)'
    };
  }

  return { available: true };
}
