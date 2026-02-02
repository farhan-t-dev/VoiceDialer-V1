import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);


export interface VirtualAudioDevices {
  // App-side devices (what Node.js uses)
  captureDevice: string;       // Where app captures FROM (Google Voice audio)
  playbackDevice: string;      // Where app plays TO (AI audio)
  
  // Browser-side devices (what Playwright browser uses)
  browserOutputDevice: string; // Where Google Voice plays TO
  browserInputDevice: string;  // Where Google Voice listens FROM (as microphone)
}

export const getWindowsAudioDevices = (): VirtualAudioDevices => {
  // CABLE 1: Google Voice → AI
  // Google Voice outputs to Line 1, Node.js captures from Line 1 Output
  const captureDevice = process.env.VAC_CAPTURE_DEVICE || 'Line 1 (Virtual Audio Cable)';
  const browserOutputDevice = process.env.VAC_BROWSER_OUTPUT || 'Line 1 (Virtual Audio Cable)';
  
  // CABLE 2: AI → Google Voice
  // Node.js plays to Line 2, Google Voice uses Line 2 as microphone
  const playbackDevice = process.env.VAC_PLAYBACK_DEVICE || 'Line 2 (Virtual Audio Cable)';
  const browserInputDevice = process.env.VAC_BROWSER_INPUT || 'Line 2 (Virtual Audio Cable)';

  return {
    captureDevice,
    playbackDevice,
    browserOutputDevice,
    browserInputDevice,
  };
};

export async function listAudioDevices(): Promise<string> {
  try {
    const { stdout } = await execAsync(
      'powershell "Get-PnpDevice -Class AudioEndpoint | Select-Object FriendlyName, Status"'
    );
    console.log('Available Audio Devices:\n', stdout);
    return stdout;
  } catch (error) {
    console.error('Failed to list audio devices:', error);
    return '';
  }
}

export async function validateAudioDevices(): Promise<boolean> {
  try {
    const devices = await listAudioDevices();
    const { captureDevice, playbackDevice, browserOutputDevice, browserInputDevice } = getWindowsAudioDevices();

    const hasCaptureDevice = devices.includes(captureDevice);
    const hasPlaybackDevice = devices.includes(playbackDevice);
    const hasBrowserOutput = devices.includes(browserOutputDevice);
    const hasBrowserInput = devices.includes(browserInputDevice);

    if (!hasCaptureDevice) {
      console.warn(`Warning: App capture device "${captureDevice}" not found`);
    }
    if (!hasPlaybackDevice) {
      console.warn(`Warning: App playback device "${playbackDevice}" not found`);
    }
    if (!hasBrowserOutput) {
      console.warn(`Warning: Browser output device "${browserOutputDevice}" not found`);
    }
    if (!hasBrowserInput) {
      console.warn(`Warning: Browser input device "${browserInputDevice}" not found`);
    }

    return hasCaptureDevice && hasPlaybackDevice && hasBrowserOutput && hasBrowserInput;
  } catch (error) {
    console.error('Audio device validation failed:', error);
    return false;
  }
}
