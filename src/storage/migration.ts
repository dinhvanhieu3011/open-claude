import { BrowserWindow } from 'electron';
import type { RecordingMetadata } from '../types';
import { addRecording, setMigrationCompleted, isMigrationCompleted } from './database';
import { saveTranscriptToFile } from './recordings';
import * as crypto from 'crypto';

interface TranscriptionItem {
  text: string;
  timestamp: string;
}

/**
 * Migrate transcription history from localStorage to electron-store
 */
export async function migrateTranscriptionHistory(mainWindow: BrowserWindow): Promise<void> {
  // Skip if migration already completed
  if (isMigrationCompleted()) {
    console.log('[Migration] Already completed, skipping');
    return;
  }

  try {
    console.log('[Migration] Starting transcription history migration...');

    // Get transcription history from renderer's localStorage
    const historyJson = await mainWindow.webContents.executeJavaScript(
      `localStorage.getItem('transcriptionHistory')`
    );

    if (!historyJson) {
      console.log('[Migration] No transcription history found in localStorage');
      setMigrationCompleted();
      return;
    }

    const history: TranscriptionItem[] = JSON.parse(historyJson);

    if (!Array.isArray(history) || history.length === 0) {
      console.log('[Migration] Transcription history is empty');
      setMigrationCompleted();
      return;
    }

    console.log(`[Migration] Found ${history.length} transcription items to migrate`);

    let migratedCount = 0;
    let errorCount = 0;

    // Migrate each item
    for (const item of history) {
      try {
        const metadata: RecordingMetadata = {
          id: crypto.randomUUID(),
          timestamp: item.timestamp,
          duration: estimateDuration(item.text), // Estimate ~30 seconds per transcription
          transcriptPath: '', // Will be set by saveTranscriptToFile
          format: 'md',
          recordingMode: 'mic', // Old recordings were mic-only
          wordCount: item.text.split(/\s+/).length,
          fileSize: 0 // Will be set by saveTranscriptToFile
        };

        // Save transcript to file
        await saveTranscriptToFile(metadata, item.text);

        // Add metadata to database
        addRecording(metadata);

        migratedCount++;
      } catch (error) {
        console.error('[Migration] Error migrating item:', error);
        errorCount++;
      }
    }

    console.log(`[Migration] Completed: ${migratedCount} migrated, ${errorCount} errors`);

    // Mark migration as completed
    setMigrationCompleted();

    // Clear localStorage (optional, keep as backup)
    // await mainWindow.webContents.executeJavaScript(`localStorage.removeItem('transcriptionHistory')`);

  } catch (error) {
    console.error('[Migration] Fatal error during migration:', error);
    // Don't mark as completed if there was an error
    throw error;
  }
}

/**
 * Estimate duration based on word count
 * Average speaking rate: ~150 words per minute
 */
function estimateDuration(text: string): number {
  const wordCount = text.split(/\s+/).length;
  const minutes = wordCount / 150;
  return Math.ceil(minutes * 60); // Convert to seconds
}
