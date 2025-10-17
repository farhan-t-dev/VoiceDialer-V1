import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface VirtualAudioDevices {
  captureDevice: string;
  playbackDevice: string;
}

export const getWindowsAudioDevices = (): VirtualAudioDevices => {
  const captureDevice = process.env.VAC_INPUT_DEVICE || 'CABLE Output (VB-Audio Virtual Cable)';
  const playbackDevice = process.env.VAC_OUTPUT_DEVICE || 'CABLE Input (VB-Audio Virtual Cable)';

  return {
    captureDevice,
    playbackDevice,
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
    const { captureDevice, playbackDevice } = getWindowsAudioDevices();

    const hasCaptureDevice = devices.includes(captureDevice);
    const hasPlaybackDevice = devices.includes(playbackDevice);

    if (!hasCaptureDevice) {
      console.warn(`Warning: Capture device "${captureDevice}" not found`);
    }
    if (!hasPlaybackDevice) {
      console.warn(`Warning: Playback device "${playbackDevice}" not found`);
    }

    return hasCaptureDevice && hasPlaybackDevice;
  } catch (error) {
    console.error('Audio device validation failed:', error);
    return false;
  }
}
