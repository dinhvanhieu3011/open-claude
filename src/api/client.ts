import { net, session } from 'electron';
import Store from 'electron-store';
import crypto from 'crypto';
import type { StoreSchema, ApiResponse, AttachmentPayload, UploadFilePayload } from '../types';

const BASE_URL = 'https://chatgpt.com';

// Store instance
const store = new Store<StoreSchema>() as Store<StoreSchema> & {
  get<K extends keyof StoreSchema>(key: K): StoreSchema[K];
  set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void;
  delete<K extends keyof StoreSchema>(key: K): void;
  clear(): void;
};

// Generate stable device/anonymous IDs
export function getDeviceId(): string {
  let deviceId = store.get('deviceId');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    store.set('deviceId', deviceId);
  }
  return deviceId;
}

export function getAnonymousId(): string {
  let anonId = store.get('anonymousId');
  if (!anonId) {
    anonId = `claudeai.v1.${crypto.randomUUID()}`;
    store.set('anonymousId', anonId);
  }
  return anonId;
}

// Convert various binary inputs to a Node.js Buffer
function toBuffer(data: UploadFilePayload['data']): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(data));
  if (data instanceof Uint8Array) return Buffer.from(data);
  return Buffer.from(data);
}

// Check if we have valid session cookies
export async function isAuthenticated(): Promise<boolean> {
  const token = await getBearerToken();
  return !!token;
}

// Get org ID from cookies (for ChatGPT, returns session token)
export async function getOrgId(): Promise<string | null> {
  const cookies = await session.defaultSession.cookies.get({ domain: '.chatgpt.com' });
  return cookies.find(c => c.name === '__Secure-next-auth.session-token')?.value || null;
}

// Set common headers on a request
function setCommonHeaders(request: Electron.ClientRequest): void {
  request.setHeader('accept', 'application/json, text/event-stream');
  request.setHeader('content-type', 'application/json');
  request.setHeader('origin', BASE_URL);
  request.setHeader('anthropic-client-platform', 'web_claude_ai');
  request.setHeader('anthropic-device-id', getDeviceId());
  request.setHeader('anthropic-anonymous-id', getAnonymousId());
  request.setHeader('user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
}

// Make authenticated request using Electron net (includes session cookies)
export async function makeRequest(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: object
): Promise<ApiResponse> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      url,
      method,
      useSessionCookies: true,
    });

    setCommonHeaders(request);

    let responseData = '';
    let statusCode = 0;

    request.on('response', (response) => {
      statusCode = response.statusCode;

      response.on('data', (chunk) => {
        responseData += chunk.toString();
      });

      response.on('end', () => {
        try {
          const data = responseData ? JSON.parse(responseData) : null;
          resolve({ status: statusCode, data });
        } catch {
          resolve({ status: statusCode, data: responseData });
        }
      });
    });

    request.on('error', (error) => {
      reject(error);
    });

    if (body) {
      request.write(JSON.stringify(body));
    }
    request.end();
  });
}

// Get Bearer token from ChatGPT session API
export async function getBearerToken(): Promise<string | null> {
  // First check if we have a cached token
  let token = store.get('bearerToken' as any);
  if (token) {
    // TODO: Validate token expiry if needed
    return token;
  }

  // Try to get token from ChatGPT session API
  try {
    const request = net.request({
      url: `${BASE_URL}/api/auth/session`,
      method: 'GET',
      useSessionCookies: true,
    });

    request.setHeader('accept', 'application/json');
    request.setHeader('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const response = await new Promise<{ accessToken?: string }>((resolve, reject) => {
      let data = '';
      request.on('response', (response) => {
        response.on('data', (chunk) => {
          data += chunk.toString();
        });
        response.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch {
            resolve({});
          }
        });
      });
      request.on('error', (error) => {
        reject(error);
      });
      request.end();
    });

    if (response.accessToken) {
      token = response.accessToken;
      store.set('bearerToken' as any, token);
      console.log('[API] Got bearer token from session API');
      return token;
    }

    console.log('[API] No bearer token in session response');
    return null;
  } catch (error) {
    console.error('[API] Failed to get bearer token:', error);
    return null;
  }
}
// Transcribe audio file using ChatGPT Whisper API
export async function transcribeAudio(
  audioData: Buffer | Uint8Array,
  fileName: string = 'audio.webm',
  language: string = 'auto'
): Promise<{ text: string }> {
  console.time('[Transcribe] Bearer Token Fetch');
  const token = await getBearerToken();
  console.timeEnd('[Transcribe] Bearer Token Fetch');
  if (!token) {
    throw new Error('Not authenticated - no bearer token');
  }

  const boundary = '----ElectronFormBoundary' + crypto.randomBytes(16).toString('hex');
  const fileBuffer = Buffer.isBuffer(audioData) ? audioData : Buffer.from(audioData);

  // Detect file type from filename
  let contentType = 'audio/webm';
  if (fileName.endsWith('.mp3')) {
    contentType = 'audio/mpeg';
  } else if (fileName.endsWith('.wav')) {
    contentType = 'audio/wav';
  } else if (fileName.endsWith('.ogg')) {
    contentType = 'audio/ogg';
  } else if (fileName.endsWith('.m4a')) {
    contentType = 'audio/mp4';
  }

  // Optimize: Pre-calculate total size and allocate once
  console.time('[Transcribe] Multipart Form Construction');
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`;
  const footer = `\r\n--${boundary}--\r\n`;
  const totalSize = Buffer.byteLength(header) + fileBuffer.length + Buffer.byteLength(footer);

  const body = Buffer.allocUnsafe(totalSize);
  let offset = 0;
  offset += body.write(header, offset);
  offset += fileBuffer.copy(body, offset);
  body.write(footer, offset);
  console.timeEnd('[Transcribe] Multipart Form Construction');

  return new Promise((resolve, reject) => {
    const request = net.request({
      url: `${BASE_URL}/backend-api/transcribe`,
      method: 'POST',
      useSessionCookies: true,
      redirect: 'follow'
    });

    request.setHeader('accept', '*/*');
    request.setHeader('accept-language', 'en-US,en;q=0.9,vi;q=0.8,zh-CN;q=0.7,zh;q=0.6');
    request.setHeader('authorization', `Bearer ${token}`);
    request.setHeader('content-type', `multipart/form-data; boundary=${boundary}`);
    request.setHeader('oai-client-version', 'prod-6b4285d9fac6acbe84a72f879ad3082e807495ed');
    request.setHeader('oai-device-id', getDeviceId());
    request.setHeader('oai-language', language === 'auto' ? 'en-US' : language);
    request.setHeader('origin', BASE_URL);
    request.setHeader('priority', 'u=1, i');
    request.setHeader('referer', `${BASE_URL}/`);
    request.setHeader('sec-ch-ua', '"Brave";v="143", "Chromium";v="143", "Not A(Brand";v="24"');
    request.setHeader('sec-ch-ua-mobile', '?0');
    request.setHeader('sec-ch-ua-platform', '"Windows"');
    request.setHeader('sec-fetch-dest', 'empty');
    request.setHeader('sec-fetch-mode', 'cors');
    request.setHeader('sec-fetch-site', 'same-origin');
    request.setHeader('sec-gpc', '1');
    request.setHeader('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36');

    let responseData = '';
    let statusCode = 0;

    request.on('response', (response) => {
      statusCode = response.statusCode;

      response.on('data', (chunk) => {
        responseData += chunk.toString();
      });

      response.on('end', () => {
        try {
          if (statusCode !== 200) {
            reject(new Error(`Transcribe failed: ${statusCode} - ${responseData}`));
            return;
          }
          const parsed = responseData ? JSON.parse(responseData) : null;
          console.log('[API] Transcribe response:', parsed);
          resolve(parsed);
        } catch (err) {
          reject(new Error(`Transcribe parse failed: ${err instanceof Error ? err.message : String(err)}`));
        }
      });
    });

    request.on('error', (error) => {
      reject(error);
    });

    request.write(body);
    request.end();
  });
}

// Export store and BASE_URL for use in other modules
export { store, BASE_URL };
