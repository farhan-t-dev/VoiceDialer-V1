# Virtual Audio Cable Integration Guide

## Overview

This application now supports **two-way audio routing** between Google Voice and ElevenLabs Speech-to-Speech API using Virtual Audio Cable on Windows VPS. This enables AI-powered automated conversations during phone calls.

## Architecture

```
Google Voice (Browser Audio Output)
    ↓
Virtual Audio Cable 1 (Captures browser audio)
    ↓
Node.js Application (WebSocket Audio Stream)
    ↓
ElevenLabs Speech-to-Speech API (AI Processing)
    ↓
Node.js Application (Receives AI response)
    ↓
Virtual Audio Cable 2 (Plays to browser)
    ↓
Google Voice (Browser Audio Input - Microphone)
```

## Windows VPS Requirements

### Software Prerequisites

1. **Virtual Audio Cable (VB-Audio)**
   - Download: https://vb-audio.com/Cable/
   - Install VB-CABLE Driver
   - Creates virtual audio devices for routing

2. **Node.js 20+**
   - Already installed via Replit environment

3. **Chromium/Chrome Browser**
   - Installed automatically by Playwright

4. **PostgreSQL 14+**
   - For storing call recordings and transcripts

## Installation Steps

### 1. Install Virtual Audio Cable

```powershell
# Download and run VB-CABLE installer
# After installation, verify devices:
Get-PnpDevice -Class AudioEndpoint | Select-Object FriendlyName, Status
```

You should see:
- **CABLE Input (VB-Audio Virtual Cable)** - Playback device
- **CABLE Output (VB-Audio Virtual Cable)** - Recording device

### 2. Configure Windows Sound Settings

**Set Virtual Audio Cable as Default:**

1. Open **Windows Sound Settings** (Right-click speaker icon → Sounds)
2. **Playback Tab:**
   - Set "CABLE Input" as **Default Device**
3. **Recording Tab:**
   - Set "CABLE Output" as **Default Device**

### 3. Configure Environment Variables

Create or update `.env` file:

```env
# Google Voice Credentials
GOOGLE_VOICE_EMAIL=your-email@gmail.com
GOOGLE_VOICE_PASSWORD=your-password

# ElevenLabs API
ELEVENLABS_API_KEY=your-elevenlabs-api-key

# Virtual Audio Cable Device Names
VAC_INPUT_DEVICE=CABLE Output (VB-Audio Virtual Cable)
VAC_OUTPUT_DEVICE=CABLE Input (VB-Audio Virtual Cable)

# Database (already configured)
DATABASE_URL=postgresql://...
```

### 4. Verify Installation

Run the audio device validation:

```bash
npm run dev
```

Check server logs for:
```
[WebSocket] Server listening on port XXXX
Browser initialized successfully { audioInput: 'CABLE Output...', audioOutput: 'CABLE Input...' }
```

## How It Works

### 1. Campaign with AI Agent

When you create a campaign and assign an AI agent:

```typescript
{
  name: "Sales Campaign",
  agentId: "agent-123", // AI Agent with ElevenLabs voice
  status: "draft"
}
```

### 2. Automated Dialing Process

1. **Initialize Browser with Audio Devices:**
   ```typescript
   const dialer = await getDialer(
     'CABLE Output (VB-Audio Virtual Cable)',  // Capture audio
     'CABLE Input (VB-Audio Virtual Cable)'    // Play audio
   );
   ```

2. **Start Call:**
   - Playwright dials the contact via Google Voice
   - Browser runs in **visible mode** (required for audio)
   - Audio permissions granted automatically

3. **Audio Capture:**
   - WebSocket server created on random port (8080-9080)
   - Browser captures audio using MediaRecorder API
   - Audio chunks sent to Node.js via WebSocket

4. **ElevenLabs Processing:**
   - Audio chunks sent to ElevenLabs Speech-to-Speech API
   - AI processes audio using agent's personality and scripts
   - AI response audio received

5. **Audio Playback:**
   - AI response played back through Virtual Audio Cable
   - Routed to Google Voice as microphone input
   - Contact hears AI agent speaking

6. **Recording & Transcript:**
   - Both contact and AI audio saved to recordings
   - Conversation turns saved to database
   - Accessible in call history

## Audio Handler Features

### WebSocket Audio Streaming

- **Dynamic Port Allocation:** Prevents port conflicts (8080 + random)
- **Automatic Connection:** Browser connects after server starts
- **Base64 Audio Transport:** Efficient binary data transfer

### ElevenLabs Integration

- **Speech-to-Speech API:** Real-time audio processing
- **Contextual Prompts:** Uses AI agent personality and scripts
- **Voice Customization:** ElevenLabs voice ID from agent profile

### Call Recording

- **Full Conversation:** Captures both sides of conversation
- **MP3 Format:** Saved to `/recordings` directory
- **Database Storage:** Recording URL and duration in database

### Conversation Transcripts

- **Speaker Identification:** Tracks agent vs. contact
- **Timestamp Tracking:** Precise conversation timeline
- **Database Storage:** Full transcript accessible via API

## API Endpoints

### Campaign Dialing with Audio

```bash
POST /api/campaigns/:id/dial
```

**Behavior:**
- If campaign has AI agent + ELEVENLABS_API_KEY: Uses audio pipeline
- Otherwise: Uses simple automated dial without audio

### Call Recordings

```bash
GET /api/calls/:callId/recording
```

Returns recording metadata and file path.

### Conversation Transcripts

```bash
GET /api/calls/:callId/transcripts
```

Returns array of conversation turns with speaker, message, timestamp.

## Troubleshooting

### WebSocket Connection Issues

**Problem:** "WebSocket error: EADDRINUSE"

**Solution:**
- Random port allocation should prevent this
- Check that no other process is using ports 8080-9080
- Restart application to reset WebSocket server

### Audio Not Routing

**Problem:** AI audio not reaching Google Voice

**Solution:**
1. Verify Virtual Audio Cable is installed:
   ```powershell
   Get-PnpDevice -Class AudioEndpoint
   ```

2. Check device names in `.env` match exactly:
   ```env
   VAC_INPUT_DEVICE=CABLE Output (VB-Audio Virtual Cable)
   VAC_OUTPUT_DEVICE=CABLE Input (VB-Audio Virtual Cable)
   ```

3. Ensure Virtual Audio Cable is set as default in Windows Sound Settings

### Browser Not Starting

**Problem:** "Browser initialization failed"

**Solution:**
- Audio mode requires **visible browser** (headless: false)
- Ensure Windows has display capability (not headless VPS)
- Check Playwright installation: `npx playwright install chromium`

### ElevenLabs API Errors

**Problem:** "ElevenLabs API error: 401"

**Solution:**
- Verify ELEVENLABS_API_KEY in `.env`
- Check API key is valid: https://elevenlabs.io/app/settings
- Ensure sufficient credits in ElevenLabs account

**Problem:** "ElevenLabs API error: 400"

**Solution:**
- Check voice ID exists in agent profile
- Verify audio format is compatible (webm/opus)
- Review ElevenLabs API documentation for model requirements

### Recording Not Saving

**Problem:** No recording file created

**Solution:**
1. Verify `/recordings` directory exists (created automatically)
2. Check filesystem permissions
3. Review server logs for recording errors
4. Ensure call duration > 0 seconds

## Resource Management

### Cleanup Process

Each call properly cleans up resources:

1. **Audio Handler Cleanup:**
   - Stops audio capture
   - Closes WebSocket connections
   - Finalizes recording file

2. **Dialer Cleanup:**
   - Closes browser instance
   - Releases audio devices

3. **Error Handling:**
   - Finally blocks ensure cleanup even on errors
   - Prevents port conflicts on subsequent calls

### Memory Considerations

- **Per Call:** ~500MB (browser + audio processing)
- **Sequential Processing:** One call at a time prevents memory spikes
- **Automatic Cleanup:** Resources released between calls

## Performance Optimization

### Call Duration

Current implementation: 30 seconds per call

To adjust:
```typescript
// In server/routes.ts
await new Promise(resolve => setTimeout(resolve, 30000)); // Change this value
```

Better approach: Detect call end dynamically
- Monitor call status in Google Voice
- End when call disconnects naturally

### Audio Quality

Adjust ElevenLabs settings in `audio-handler.ts`:

```typescript
voice_settings: {
  stability: 0.5,        // 0-1 (higher = more consistent)
  similarity_boost: 0.8, // 0-1 (higher = more like training)
  style: 0.5,           // 0-1 (voice expressiveness)
  use_speaker_boost: true
}
```

### Batch Processing

Current: 5-second delay between calls

```typescript
await new Promise(resolve => setTimeout(resolve, 5000));
```

Adjust for your use case:
- Increase for rate limiting
- Decrease for faster campaigns

## Security Considerations

### API Keys

- **Never commit** `.env` file to version control
- Store credentials securely
- Rotate keys regularly

### Audio Privacy

- Call recordings contain sensitive information
- Implement access controls for `/recordings` directory
- Consider encryption for stored audio files

### Google Voice Terms

- Automated calling may violate Google's Terms of Service
- Use responsibly and within legal boundaries
- Consider explicit consent from call recipients

## Cost Considerations

### ElevenLabs Pricing

- Speech-to-Speech API charges per character/second
- Monitor usage in ElevenLabs dashboard
- Set budget limits to prevent overages

### VPS Resources

- Visible browser requires display capability
- Consider Windows VPS with GUI support
- Allocate sufficient RAM (4GB minimum, 8GB recommended)

## Advanced Configuration

### Custom Audio Devices

If using different virtual audio software:

1. List available devices:
   ```powershell
   Get-PnpDevice -Class AudioEndpoint
   ```

2. Update `.env` with exact device names:
   ```env
   VAC_INPUT_DEVICE=Your Custom Input Device Name
   VAC_OUTPUT_DEVICE=Your Custom Output Device Name
   ```

### Multiple Concurrent Calls

Current implementation: Sequential processing

For parallel calls:
- Create separate browser instances per call
- Allocate unique WebSocket ports
- Manage resource pools carefully

### Custom Call Duration Logic

Replace fixed duration with dynamic detection:

```typescript
// Monitor call status
while (await isCallActive(page)) {
  await new Promise(resolve => setTimeout(resolve, 1000));
}
```

## Support

For issues or questions:
1. Check server logs for detailed error messages
2. Review browser console logs for WebSocket errors
3. Verify all environment variables are set correctly
4. Test Virtual Audio Cable independently with other audio software

## Next Steps

### Recommended Enhancements

1. **Call End Detection:** Automatically detect when call completes
2. **Real-time Transcription:** Use speech-to-text for live transcripts
3. **Call Analytics:** Track AI agent performance metrics
4. **Multi-language Support:** Configure ElevenLabs for different languages
5. **Voice Training:** Fine-tune ElevenLabs voices for specific use cases
