import type { StoreSchema, RecordingMetadata } from '../types';

// Get store instance (initialized in main.ts)
let storeInstance: any | null = null;

export function initializeStore(store: any): void {
  storeInstance = store;
}

function getStore(): any {
  if (!storeInstance) {
    throw new Error('[Database] Store not initialized. Call initializeStore() first.');
  }
  return storeInstance;
}

/**
 * Add new recording metadata to database
 */
export function addRecording(metadata: RecordingMetadata): void {
  try {
    const store = getStore();
    const recordings = store.get('recordings', []);

    recordings.unshift(metadata); // Add to beginning (most recent first)
    store.set('recordings', recordings);

    console.log('[Database] Added recording:', metadata.id);
  } catch (error) {
    console.error('[Database] Error adding recording:', error);
    throw error;
  }
}

/**
 * Get recording metadata by ID
 */
export function getRecording(id: string): RecordingMetadata | null {
  try {
    const store = getStore();
    const recordings = store.get('recordings', []);

    const recording = recordings.find((r: RecordingMetadata) => r.id === id);
    return recording || null;
  } catch (error) {
    console.error('[Database] Error getting recording:', error);
    return null;
  }
}

/**
 * List recordings with pagination
 */
export function listRecordings(limit: number = 10, offset: number = 0): RecordingMetadata[] {
  try {
    const store = getStore();
    const recordings = store.get('recordings', []);

    return recordings.slice(offset, offset + limit);
  } catch (error) {
    console.error('[Database] Error listing recordings:', error);
    return [];
  }
}

/**
 * Update recording metadata
 */
export function updateRecording(id: string, updates: Partial<RecordingMetadata>): boolean {
  try {
    const store = getStore();
    const recordings = store.get('recordings', []);

    const index = recordings.findIndex((r: RecordingMetadata) => r.id === id);
    if (index === -1) {
      console.warn('[Database] Recording not found for update:', id);
      return false;
    }

    recordings[index] = { ...recordings[index], ...updates };
    store.set('recordings', recordings);

    console.log('[Database] Updated recording:', id);
    return true;
  } catch (error) {
    console.error('[Database] Error updating recording:', error);
    return false;
  }
}

/**
 * Delete recording metadata
 */
export function deleteRecording(id: string): boolean {
  try {
    const store = getStore();
    const recordings = store.get('recordings', []);

    const filtered = recordings.filter((r: RecordingMetadata) => r.id !== id);

    if (filtered.length === recordings.length) {
      console.warn('[Database] Recording not found for deletion:', id);
      return false;
    }

    store.set('recordings', filtered);

    console.log('[Database] Deleted recording:', id);
    return true;
  } catch (error) {
    console.error('[Database] Error deleting recording:', error);
    return false;
  }
}

/**
 * Get total count of recordings
 */
export function getRecordingsCount(): number {
  try {
    const store = getStore();
    const recordings = store.get('recordings', []);
    return recordings.length;
  } catch (error) {
    console.error('[Database] Error getting recordings count:', error);
    return 0;
  }
}

/**
 * Get recording settings
 */
export function getRecordingSettings(): {
  mode: 'mic' | 'mic+system';
  format: 'txt' | 'json' | 'md';
  autoSave: boolean;
} {
  try {
    const store = getStore();
    const settings = store.get('settings.recordingSettings', {
      mode: 'mic',
      format: 'md',
      autoSave: true
    });

    return settings as any;
  } catch (error) {
    console.error('[Database] Error getting recording settings:', error);
    return {
      mode: 'mic',
      format: 'md',
      autoSave: true
    };
  }
}

/**
 * Update recording settings
 */
export function updateRecordingSettings(settings: Partial<{
  mode: 'mic' | 'mic+system';
  format: 'txt' | 'json' | 'md';
  autoSave: boolean;
}>): void {
  try {
    const store = getStore();
    const currentSettings = getRecordingSettings();
    const newSettings = { ...currentSettings, ...settings };

    store.set('settings.recordingSettings', newSettings);

    console.log('[Database] Updated recording settings:', newSettings);
  } catch (error) {
    console.error('[Database] Error updating recording settings:', error);
    throw error;
  }
}

/**
 * Check if migration has been completed
 */
export function isMigrationCompleted(): boolean {
  try {
    const store = getStore();
    return store.get('migrationCompleted', false);
  } catch (error) {
    console.error('[Database] Error checking migration status:', error);
    return false;
  }
}

/**
 * Mark migration as completed
 */
export function setMigrationCompleted(): void {
  try {
    const store = getStore();
    store.set('migrationCompleted', true);
    console.log('[Database] Migration marked as completed');
  } catch (error) {
    console.error('[Database] Error setting migration completed:', error);
    throw error;
  }
}
