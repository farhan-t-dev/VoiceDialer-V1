# Tools Directory

This directory contains external tools required for the Google Voice Dialer application.

## Required Tools

### SoX (Sound eXchange)

SoX is required for playing AI audio to specific audio devices on Windows.

**Download:**
1. Go to https://sourceforge.net/projects/sox/files/sox/
2. Download the latest Windows version (e.g., `sox-14.4.2-win32.zip`)
3. Extract the zip file
4. Copy `sox.exe` and `play.exe` from the extracted folder to this `tools/` directory
5. Also copy all `.dll` files from the extracted folder to this directory

**Files needed in this directory:**
- `sox.exe`
- `play.exe`
- `libgcc_s_sjlj-1.dll`
- `libgomp-1.dll`
- `libmad-0.dll`
- `libmp3lame-0.dll`
- `libpng16-16.dll`
- `libsndfile-1.dll`
- `libsox-3.dll`
- `libwavpack-1.dll`
- `zlib1.dll`
- (and any other DLL files in the sox distribution)

**Why SoX?**
SoX can target specific audio devices by name on Windows using the `waveaudio` driver, allowing us to play AI audio specifically to Line 2 (Virtual Audio Cable) while the browser outputs to Line 1.

**Verification:**
After copying the files, run this command to verify SoX is working:
```bash
tools\sox --version
```

You should see the SoX version information.
