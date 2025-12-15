import { app, BrowserWindow, ipcMain, session, globalShortcut, screen, dialog, clipboard, net } from 'electron';


import { exec } from 'child_process';
import { keyboard, Key } from '@nut-tree-fork/nut-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { isAuthenticated, getOrgId, makeRequest,  store, BASE_URL, transcribeAudio, getBearerToken } from './api/client';
import { createStreamState, processSSEChunk, type StreamCallbacks } from './streaming/parser';
import type { SettingsSchema, AttachmentPayload, UploadFilePayload } from './types';

let mainWindow: BrowserWindow | null = null;
let spotlightWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let recordingOverlay: BrowserWindow | null = null;

// Default settings
const DEFAULT_SETTINGS: SettingsSchema = {
  spotlightKeybind: 'CommandOrControl+Shift+C',
  spotlightPersistHistory: true,
};

// Get settings with defaults
function getSettings(): SettingsSchema {
  const stored = store.get('settings');
  return { ...DEFAULT_SETTINGS, ...stored };
}

// Save settings
function saveSettings(settings: Partial<SettingsSchema>) {
  const current = getSettings();
  store.set('settings', { ...current, ...settings });
}

// Register global shortcuts
function registerGlobalShortcuts() {
  globalShortcut.unregisterAll();
  const settings = getSettings();
  const keybind = settings.spotlightKeybind || DEFAULT_SETTINGS.spotlightKeybind;

  // Spotlight shortcut
  try {
    globalShortcut.register(keybind, () => {
      createSpotlightWindow();
    });
  } catch (e) {
    console.error('Failed to register keybind:', keybind, e);
    globalShortcut.register(DEFAULT_SETTINGS.spotlightKeybind, () => {
      createSpotlightWindow();
    });
  }

  // Global voice recording shortcut - Ctrl+K (press to start, press again to stop)
  globalShortcut.register('CommandOrControl+K', () => {
    if (isGlobalRecording) {
      stopGlobalRecording();
    } else {
      startGlobalRecording();
    }
  });
}

// Create recording overlay
function createRecordingOverlay() {
  if (recordingOverlay && !recordingOverlay.isDestroyed()) {
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  recordingOverlay = new BrowserWindow({
    width: 200,
    height: 80,
    x: Math.round((width - 200) / 2),
    y: Math.round(height - 150),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false, // Prevent checking stealing focus
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // IMPORTANT: On Windows, focusable: false might prevent the window from showing up on top if not handled correctly,
  // but usually alwaysOnTop covers it.
  // We keep the window non-focusable to preserve the user's cursor position in their editor/input.

  recordingOverlay.setIgnoreMouseEvents(true);
  recordingOverlay.loadFile(path.join(__dirname, '../static/recording-overlay.html'));
}

// Global recording state
let isGlobalRecording = false;

async function startGlobalRecording() {
  if (isGlobalRecording) return;
  
  isGlobalRecording = true;
  createRecordingOverlay();
  
  console.log('[Global Recording] Started');
}

async function stopGlobalRecording() {
  if (!isGlobalRecording) return;
  
  isGlobalRecording = false;
  console.log('[Global Recording] Stopping...');
  
  // Request overlay to finish recording and transcribe
  if (recordingOverlay && !recordingOverlay.isDestroyed()) {
    recordingOverlay.webContents.send('stop-recording');
  }
}

// Create spotlight search window
function createSpotlightWindow() {
  if (spotlightWindow && !spotlightWindow.isDestroyed()) {
    spotlightWindow.focus();
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;

  const isMac = process.platform === 'darwin';

  spotlightWindow = new BrowserWindow({
    width: 600,
    height: 56,
    x: Math.round((screenWidth - 600) / 2),
    y: 180,
    frame: false,
    transparent: isMac,
    ...(isMac ? {
      vibrancy: 'under-window',
      visualEffectState: 'active',
      backgroundColor: '#00000000',
    } : {
      backgroundColor: '#1a1a1a',
    }),
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    closable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  spotlightWindow.loadFile(path.join(__dirname, '../static/spotlight.html'));

  // Close on blur (clicking outside)
  spotlightWindow.on('blur', () => {
    if (spotlightWindow && !spotlightWindow.isDestroyed()) {
      spotlightWindow.close();
    }
  });

  spotlightWindow.on('closed', () => {
    spotlightWindow = null;
  });
}

function createMainWindow() {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    ...(isMac ? {
      transparent: true,
      vibrancy: 'under-window',
      visualEffectState: 'active',
      backgroundColor: '#00000000',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
    } : {
      backgroundColor: '#1a1a1a',
    }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../static/index.html'));
}

// Create settings window
function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  const isMac = process.platform === 'darwin';

  settingsWindow = new BrowserWindow({
    width: 480,
    height: 520,
    minWidth: 400,
    minHeight: 400,
    ...(isMac ? {
      transparent: true,
      vibrancy: 'under-window',
      visualEffectState: 'active',
      backgroundColor: '#00000000',
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 16 },
    } : {
      backgroundColor: '#1a1a1a',
    }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, '../static/settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// IPC handlers

// Spotlight window resize
ipcMain.handle('spotlight-resize', async (_event, height: number) => {
  if (spotlightWindow && !spotlightWindow.isDestroyed()) {
    const maxHeight = 700;
    const newHeight = Math.min(height, maxHeight);
    spotlightWindow.setSize(600, newHeight);
  }
});

// Spotlight conversation state
let spotlightConversationId: string | null = null;
let spotlightParentMessageUuid: string | null = null;
let spotlightMessages: Array<{ role: 'user' | 'assistant'; text: string }> = [];

// Spotlight send message (uses Haiku)
ipcMain.handle('spotlight-send', async (_event, message: string) => {
  const orgId = await getOrgId();
  if (!orgId) throw new Error('Not authenticated');

  if (!spotlightConversationId) {
    const createResult = await makeRequest(
      `${BASE_URL}/api/organizations/${orgId}/chat_conversations`,
      'POST',
      { name: '', model: 'claude-haiku-4-5-20251001' }
    );

    if (createResult.status !== 201 && createResult.status !== 200) {
      throw new Error('Failed to create conversation');
    }

    const convData = createResult.data as { uuid: string };
    spotlightConversationId = convData.uuid;
    spotlightParentMessageUuid = null;
  }

  const conversationId = spotlightConversationId;
  const parentMessageUuid = spotlightParentMessageUuid || conversationId;

  // Store user message
  spotlightMessages.push({ role: 'user', text: message });

  const state = createStreamState();

  const callbacks: StreamCallbacks = {
    onTextDelta: (text, fullText) => {
      spotlightWindow?.webContents.send('spotlight-stream', { text, fullText });
    },
    onThinkingStart: () => {
      spotlightWindow?.webContents.send('spotlight-thinking', { isThinking: true });
    },
    onThinkingDelta: (thinking) => {
      spotlightWindow?.webContents.send('spotlight-thinking-stream', { thinking });
    },
    onThinkingStop: (thinkingText) => {
      spotlightWindow?.webContents.send('spotlight-thinking', { isThinking: false, thinkingText });
    },
    onToolStart: (toolName, msg) => {
      spotlightWindow?.webContents.send('spotlight-tool', { toolName, isRunning: true, message: msg });
    },
    onToolStop: (toolName, input) => {
      spotlightWindow?.webContents.send('spotlight-tool', { toolName, isRunning: false, input });
    },
    onToolResult: (toolName, result, isError) => {
      spotlightWindow?.webContents.send('spotlight-tool-result', { toolName, isError, result });
    },
    onComplete: (fullText, _steps, messageUuid) => {
      // Store assistant response
      spotlightMessages.push({ role: 'assistant', text: fullText });
      spotlightWindow?.webContents.send('spotlight-complete', { fullText, messageUuid });
    }
  };


  if (state.lastMessageUuid) {
    spotlightParentMessageUuid = state.lastMessageUuid;
  }

  return { conversationId, fullText: state.fullResponse, messageUuid: state.lastMessageUuid };
});

// Reset spotlight conversation when window is closed
ipcMain.handle('spotlight-reset', async () => {
  const settings = getSettings();
  // Only reset if persist history is disabled
  if (!settings.spotlightPersistHistory) {
    spotlightConversationId = null;
    spotlightParentMessageUuid = null;
    spotlightMessages = [];
  }
});

// Get spotlight conversation history from local state
ipcMain.handle('spotlight-get-history', async () => {
  const settings = getSettings();
  if (!settings.spotlightPersistHistory || spotlightMessages.length === 0) {
    return { hasHistory: false, messages: [] };
  }

  return { hasHistory: true, messages: spotlightMessages };
});

// Force new spotlight conversation
ipcMain.handle('spotlight-new-chat', async () => {
  spotlightConversationId = null;
  spotlightParentMessageUuid = null;
  spotlightMessages = [];
});

ipcMain.handle('get-auth-status', async () => {
  return isAuthenticated();
});

ipcMain.handle('login', async () => {
  const authWindow = new BrowserWindow({
    width: 500,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'Sign in to ChatGPT',
  });

  authWindow.loadURL(`${BASE_URL}/auth/login`);

  const checkCookies = async (): Promise<{ success: boolean; error?: string } | null> => {
    const cookies = await session.defaultSession.cookies.get({ domain: '.chatgpt.com' });
    const sessionToken = cookies.find(c => c.name === '__Secure-next-auth.session-token')?.value;

    if (sessionToken) {
      console.log('[Auth] Got session token from ChatGPT!');
      console.log('[Auth] Session Token:', sessionToken.substring(0, 50) + '...');
      authWindow.close();
      // Clear cached bearer token so it will be refreshed
      store.delete('bearerToken' as any);
      return { success: true };
    }
    return null;
  };

  return new Promise((resolve) => {
    authWindow.webContents.on('did-finish-load', async () => {
      const result = await checkCookies();
      if (result) resolve(result);
    });

    const interval = setInterval(async () => {
      if (authWindow.isDestroyed()) {
        clearInterval(interval);
        return;
      }
      const result = await checkCookies();
      if (result) {
        clearInterval(interval);
        resolve(result);
      }
    }, 1000);

    authWindow.on('closed', () => {
      clearInterval(interval);
      resolve({ success: false, error: 'Window closed' });
    });
  });
});

ipcMain.handle('logout', async () => {
  store.clear();
  await session.defaultSession.clearStorageData({ storages: ['cookies'] });
  return { success: true };
});

// Create a new conversation
ipcMain.handle('create-conversation', async (_event, model?: string) => {
  const orgId = await getOrgId();
  if (!orgId) throw new Error('Not authenticated');

  const conversationId = crypto.randomUUID();
  const url = `${BASE_URL}/api/organizations/${orgId}/chat_conversations`;

  console.log('[API] Creating conversation:', conversationId, 'with model:', model || 'claude-opus-4-5-20251101');
  console.log('[API] URL:', url);

  const result = await makeRequest(url, 'POST', {
    uuid: conversationId,
    name: '',
    model: model || 'claude-opus-4-5-20251101',
    project_uuid: null,
    create_mode: null
  });

  console.log('[API] Create conversation response:', result.status, JSON.stringify(result.data));

  if (result.status !== 200 && result.status !== 201) {
    throw new Error(`Failed to create conversation: ${result.status} - ${JSON.stringify(result.data)}`);
  }

  // The response includes the conversation data with uuid
  const data = result.data as { uuid?: string };
  return { conversationId, parentMessageUuid: data.uuid || conversationId, ...(result.data as object) };
});

// Get list of conversations
ipcMain.handle('get-conversations', async () => {
  const orgId = await getOrgId();
  if (!orgId) throw new Error('Not authenticated');

  const url = `${BASE_URL}/api/organizations/${orgId}/chat_conversations?limit=30&consistency=eventual`;
  const result = await makeRequest(url, 'GET');

  if (result.status !== 200) {
    throw new Error(`Failed to get conversations: ${result.status}`);
  }

  return result.data;
});

// Load a specific conversation with messages
ipcMain.handle('load-conversation', async (_event, convId: string) => {
  const orgId = await getOrgId();
  if (!orgId) throw new Error('Not authenticated');

  const url = `${BASE_URL}/api/organizations/${orgId}/chat_conversations/${convId}?tree=True&rendering_mode=messages&render_all_tools=true&consistency=eventual`;
  const result = await makeRequest(url, 'GET');

  if (result.status !== 200) {
    throw new Error(`Failed to load conversation: ${result.status}`);
  }

  return result.data;
});

// Delete a conversation
ipcMain.handle('delete-conversation', async (_event, convId: string) => {
  const orgId = await getOrgId();
  if (!orgId) throw new Error('Not authenticated');

  const url = `${BASE_URL}/api/organizations/${orgId}/chat_conversations/${convId}`;
  const result = await makeRequest(url, 'DELETE');

  if (result.status !== 200 && result.status !== 204) {
    throw new Error(`Failed to delete conversation: ${result.status}`);
  }

  return { success: true };
});

// Rename a conversation
ipcMain.handle('rename-conversation', async (_event, convId: string, name: string) => {
  const orgId = await getOrgId();
  if (!orgId) throw new Error('Not authenticated');

  const url = `${BASE_URL}/api/organizations/${orgId}/chat_conversations/${convId}`;
  const result = await makeRequest(url, 'PUT', { name });

  if (result.status !== 200) {
    throw new Error(`Failed to rename conversation: ${result.status}`);
  }

  return result.data;
});

// Star/unstar a conversation
ipcMain.handle('star-conversation', async (_event, convId: string, isStarred: boolean) => {
  const orgId = await getOrgId();
  if (!orgId) throw new Error('Not authenticated');

  const url = `${BASE_URL}/api/organizations/${orgId}/chat_conversations/${convId}?rendering_mode=raw`;
  const result = await makeRequest(url, 'PUT', { is_starred: isStarred });

  if (result.status !== 202) {
    throw new Error(`Failed to star conversation: ${result.status}`);
  }

  return result.data;
});

// Export conversation to Markdown
ipcMain.handle('export-conversation-markdown', async (_event, conversationData: { title: string; messages: Array<{ role: string; content: string; timestamp?: string }> }) => {
  const { title, messages } = conversationData;

  // Build markdown content
  let markdown = `# ${title || 'Conversation'}\n\n`;
  markdown += `_Exported on ${new Date().toLocaleString()}_\n\n---\n\n`;

  for (const msg of messages) {
    const role = msg.role === 'human' ? 'You' : 'Claude';
    const timestamp = msg.timestamp ? ` _(${new Date(msg.timestamp).toLocaleString()})_` : '';
    markdown += `## ${role}${timestamp}\n\n`;
    markdown += `${msg.content}\n\n---\n\n`;
  }

  // Show save dialog
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Export Conversation',
    defaultPath: `${title || 'conversation'}.md`,
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return { success: false, canceled: true };
  }

  // Write file
  try {
    fs.writeFileSync(result.filePath, markdown, 'utf-8');
    return { success: true, filePath: result.filePath };
  } catch (error) {
    console.error('Failed to write file:', error);
    return { success: false, error: 'Failed to write file' };
  }
});


// Audio transcription IPC handler
ipcMain.handle('transcribe-audio', async (_event, audioData: ArrayBuffer, fileName?: string) => {
  try {
    const buffer = Buffer.from(audioData);
    const result = await transcribeAudio(buffer, fileName || 'audio.webm', 'auto');
    return result;
  } catch (error) {
    console.error('[Transcribe] Error:', error);
    throw error;
  }
});

// Get bearer token IPC handler
ipcMain.handle('get-bearer-token', async () => {
  try {
    const token = await getBearerToken();
    return token;
  } catch (error) {
    console.error('[Bearer Token] Error:', error);
    throw error;
  }
});

// Helper: Apply dictionary replacements
function applyDictionary(text: string, dictionary?: Record<string, string>): string {
  if (!dictionary || Object.keys(dictionary).length === 0) return text;
  
  // Create a regex pattern to match whole words from keys
  // Sort keys by length (descending) to match longer phrases first
  const keys = Object.keys(dictionary).sort((a, b) => b.length - a.length);
  
  let processedText = text;
  
  // Simple case-insensitive replacement for now
  for (const key of keys) {
    const value = dictionary[key];
    const regex = new RegExp(`\\b${key}\\b`, 'gi');
    processedText = processedText.replace(regex, value);
  }
  
  return processedText;
}

// Helper: Apply LLM correction
async function applyLLMCorrection(text: string, prompt?: string): Promise<string> {
  const orgId = await getOrgId();
  if (!orgId) return text;

  try {
    const defaultPrompt = 'Fix grammar, punctuation, and capitalization. Return only the corrected text without any explanation.';
    const systemPrompt = prompt || defaultPrompt;
    
    // Create a temporary conversation
    const createResult = await makeRequest(
      `${BASE_URL}/api/organizations/${orgId}/chat_conversations`,
      'POST',
      { name: '', model: 'claude-haiku-4-5-20251001' } // Use Haiku for speed
    );

    if (createResult.status !== 201 && createResult.status !== 200) {
      console.warn('[LLM Correction] Failed to create conversation');
      return text;
    }

    const convData = createResult.data as { uuid: string };
    const conversationId = convData.uuid;
    
    // Send message
    const message = `${systemPrompt}\n\nInput text:\n${text}`;
    
    // We need to stream the response to get the text
    const parserState = createStreamState();
    const url = `${BASE_URL}/api/organizations/${orgId}/chat_conversations/${conversationId}/completion`;
    
    const response = await new Promise<string>((resolve, reject) => {
        const request = net.request({
            url,
            method: 'POST',
            useSessionCookies: true,
        });
        
        // Add headers same as makeRequest... simple duplication for stream handling here or we could refactor makeRequest to support streaming better.
        // For now, let's just make a non-streaming request if possible? 
        // ChatGPT API usually requires streaming for completion.
        // Let's rely on the parser we already have.
        
        request.setHeader('accept', 'text/event-stream');
        request.setHeader('content-type', 'application/json');
        request.setHeader('origin', BASE_URL);
        request.setHeader('anthropic-client-platform', 'web_claude_ai');
    
        // Auth headers
        request.setHeader('authorization', `Bearer ${store.get('bearerToken' as any)}`);
        
        request.on('response', (res: Electron.IncomingMessage) => {
            res.on('data', (chunk: Buffer) => {
               const lines = chunk.toString().split('\n');
               for (const line of lines) {
                   if (line.trim()) processSSEChunk(line, parserState, {});
               }
            });
            
            res.on('end', () => {
                resolve(parserState.fullResponse);
            });
        });
        
        request.on('error', reject);
        
        request.write(JSON.stringify({
            conversation_mode: { kind: "primary_assistant" },
            force_parsimony: true,
            history_and_training_disabled: false,
            input_files: [],
            model: "claude-haiku-4-5-20251001",
            messages: [
                {
                    content: { content_type: "text", parts: [message] },
                    id: crypto.randomUUID(),
                    role: "user"
                }
            ],
            parent_message_id: conversationId, // Usually same as conv ID for first message
            timezone_offset_min: -420,
            websocket_request_id: crypto.randomUUID()
        }));
        
        request.end();
    });

    // Cleanup: Delete conversation
    makeRequest(`${BASE_URL}/api/organizations/${orgId}/chat_conversations/${conversationId}`, 'DELETE').catch(console.error);
    
    return response || text;

  } catch (e) {
    console.error('[LLM Correction] Failed:', e);
    return text;
  }
}

// Global recording IPC handlers
ipcMain.handle('global-recording-complete', async (_event, audioData: ArrayBuffer, fileName?: string) => {
  try {
    console.log('[Global Recording] Transcribing audio...');
    const buffer = Buffer.from(audioData);
    const result = await transcribeAudio(buffer, fileName || 'audio.webm', 'auto');
    let finalKey = result.text;

    // 1. Dictionary Replacement
    const settings = getSettings();
    if (settings.dictionary) {
        finalKey = applyDictionary(finalKey, settings.dictionary);
        console.log('[Global Recording] Applied dictionary replacement');
    }

    // 2. LLM Correction
    if (settings.llmCorrectionEnabled) {
        console.log('[Global Recording] Applying LLM correction...');
        const corrected = await applyLLMCorrection(finalKey, settings.llmCorrectionPrompt);
        if (corrected && corrected !== finalKey) {
             finalKey = corrected;
             console.log('[Global Recording] LLM correction applied');
        }
    }
    
    // Paste to clipboard
    clipboard.writeText(finalKey);
    console.log('[Global Recording] Text copied to clipboard:', finalKey);
    
    // Auto-paste using nut.js (simulate Ctrl+V)
    setTimeout(async () => {
      try {
        // Small delay to ensure clipboard is ready
        const isMac = process.platform === 'darwin';
        const modifier = isMac ? Key.LeftSuper : Key.LeftControl;
        
        await keyboard.pressKey(modifier, Key.V);
        await keyboard.releaseKey(modifier, Key.V);
        
        console.log('[Global Recording] Auto-pasted to active window');
      } catch (error) {
        console.error('[Global Recording] Auto-paste failed:', error);
        // Fallback to system command if nut.js fails
        try {
           console.log('[Global Recording] nut.js failed, attempting system fallback...');
           if (process.platform === 'darwin') {
             exec(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`, (error) => {
               if (error) console.error('[Global Recording] Mac paste fallback failed:', error);
             });
           } else if (process.platform === 'win32') {
             const psCommand = "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys('^v')";
             exec(`powershell -NoProfile -WindowStyle Hidden -Command "${psCommand}"`, (error) => {
               if (error) console.error('[Global Recording] Windows paste fallback failed:', error);
             });
           }
        } catch (fallbackError) {
             console.error('[Global Recording] Fallback failed:', fallbackError);
        }
      }
    }, 100);
    
    // Close overlay
    if (recordingOverlay && !recordingOverlay.isDestroyed()) {
      setTimeout(() => {
        if (recordingOverlay && !recordingOverlay.isDestroyed()) {
          recordingOverlay.close();
          recordingOverlay = null;
        }
      }, 800);
    }
    
    return result;
  } catch (error) {
    console.error('[Global Recording] Error:', error);
    if (recordingOverlay && !recordingOverlay.isDestroyed()) {
      recordingOverlay.close();
      recordingOverlay = null;
    }
    throw error;
  }
});

// Settings IPC handlers
ipcMain.handle('open-settings', async () => {
  createSettingsWindow();
});

ipcMain.handle('get-settings', async () => {
  return getSettings();
});

ipcMain.handle('save-settings', async (_event, settings: Partial<SettingsSchema>) => {
  saveSettings(settings);
  // Re-register shortcut if keybind changed
  if (settings.spotlightKeybind !== undefined) {
    registerGlobalShortcuts();
  }
  return getSettings();
});

// Handle deep link on Windows (single instance)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  createMainWindow();

  // Register global shortcuts
  registerGlobalShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// Unregister shortcuts when app quits
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
