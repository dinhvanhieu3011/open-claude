/**
 * Audio Ducking Manager
 * Automatically reduces system volume when recording to improve audio quality
 */

import loudness from 'loudness';

export class AudioDuckingManager {
  private originalVolume: number = 100;
  private isActive: boolean = false;
  private duckingLevel: number = 20; // Reduce to 20% of original volume

  /**
   * Start audio ducking - reduce system volume
   */
  async start(): Promise<void> {
    if (this.isActive) return;

    try {
      // Save current volume
      this.originalVolume = await loudness.getVolume();
      console.log('[Audio Ducking] Original volume:', this.originalVolume);

      // Calculate ducked volume
      const duckedVolume = Math.max(0, Math.floor(this.originalVolume * (this.duckingLevel / 100)));

      // Set ducked volume
      await loudness.setVolume(duckedVolume);
      console.log('[Audio Ducking] Reduced volume to:', duckedVolume);

      this.isActive = true;
    } catch (error) {
      console.error('[Audio Ducking] Failed to start:', error);
      // Don't throw - recording should continue even if ducking fails
    }
  }

  /**
   * Stop audio ducking - restore original volume
   */
  async stop(): Promise<void> {
    if (!this.isActive) return;

    try {
      // Restore original volume
      await loudness.setVolume(this.originalVolume);
      console.log('[Audio Ducking] Restored volume to:', this.originalVolume);

      this.isActive = false;
    } catch (error) {
      console.error('[Audio Ducking] Failed to stop:', error);
      // Don't throw - we want recording to complete
    }
  }

  /**
   * Set the ducking level (0-100)
   * @param level - Percentage of original volume (e.g., 20 = reduce to 20%)
   */
  setDuckingLevel(level: number): void {
    this.duckingLevel = Math.max(0, Math.min(100, level));
  }

  /**
   * Check if ducking is currently active
   */
  isActiveDucking(): boolean {
    return this.isActive;
  }
}

// Export singleton instance
export const audioDuckingManager = new AudioDuckingManager();
