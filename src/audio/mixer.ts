/**
 * Audio Mixer using Web Audio API
 * Combines multiple audio streams into a single mixed stream
 */
export class AudioMixer {
  private audioContext: AudioContext | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private sources: MediaStreamAudioSourceNode[] = [];
  private gainNodes: GainNode[] = [];

  /**
   * Create a mixed audio stream from microphone and system audio
   * @param micStream Microphone MediaStream
   * @param systemStream System audio MediaStream
   * @returns Mixed MediaStream
   */
  createMixedStream(micStream: MediaStream, systemStream: MediaStream): MediaStream | null {
    try {
      // Create AudioContext with sample rate matching MediaRecorder
      this.audioContext = new AudioContext({ sampleRate: 48000 });

      // Create destination node (output)
      this.destination = this.audioContext.createMediaStreamDestination();

      // Add microphone source
      const micSource = this.audioContext.createMediaStreamSource(micStream);
      const micGain = this.audioContext.createGain();
      micGain.gain.value = 1.0; // Default: 100% volume

      micSource.connect(micGain);
      micGain.connect(this.destination);

      this.sources.push(micSource);
      this.gainNodes.push(micGain);

      // Add system audio source
      const systemSource = this.audioContext.createMediaStreamSource(systemStream);
      const systemGain = this.audioContext.createGain();
      systemGain.gain.value = 1.0; // Default: 100% volume

      systemSource.connect(systemGain);
      systemGain.connect(this.destination);

      this.sources.push(systemSource);
      this.gainNodes.push(systemGain);

      console.log('[Audio Mixer] Mixed stream created with 2 sources');
      return this.destination.stream;
    } catch (error) {
      console.error('[Audio Mixer] Error creating mixed stream:', error);
      this.stop();
      return null;
    }
  }

  /**
   * Set microphone volume (0.0 to 1.0)
   */
  setMicVolume(volume: number): void {
    if (this.gainNodes.length > 0) {
      const normalizedVolume = Math.max(0, Math.min(1, volume));
      this.gainNodes[0].gain.value = normalizedVolume;
      console.log('[Audio Mixer] Mic volume set to:', normalizedVolume);
    }
  }

  /**
   * Set system audio volume (0.0 to 1.0)
   */
  setSystemVolume(volume: number): void {
    if (this.gainNodes.length > 1) {
      const normalizedVolume = Math.max(0, Math.min(1, volume));
      this.gainNodes[1].gain.value = normalizedVolume;
      console.log('[Audio Mixer] System volume set to:', normalizedVolume);
    }
  }

  /**
   * Get current audio context state
   */
  getState(): string {
    return this.audioContext?.state || 'closed';
  }

  /**
   * Resume audio context if suspended
   */
  async resume(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
      console.log('[Audio Mixer] AudioContext resumed');
    }
  }

  /**
   * Stop and cleanup all audio resources
   */
  stop(): void {
    try {
      // Disconnect all sources
      this.sources.forEach(source => {
        try {
          source.disconnect();
        } catch (e) {
          // Already disconnected
        }
      });

      // Disconnect all gain nodes
      this.gainNodes.forEach(gain => {
        try {
          gain.disconnect();
        } catch (e) {
          // Already disconnected
        }
      });

      // Close audio context
      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close();
      }

      // Clear arrays
      this.sources = [];
      this.gainNodes = [];
      this.audioContext = null;
      this.destination = null;

      console.log('[Audio Mixer] Stopped and cleaned up');
    } catch (error) {
      console.error('[Audio Mixer] Error during cleanup:', error);
    }
  }
}
