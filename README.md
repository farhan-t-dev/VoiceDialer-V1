# Google Voice Dialer Dashboard

> **AI-Powered Automated Calling Platform** - Streamline outbound communication with Google Voice Business and ElevenLabs Conversational AI

A comprehensive web-based contact management and automated calling platform that integrates with Google Voice Business to enable AI-powered phone conversations. Features real-time call transcription, conversation analytics, and bulk campaign management.

## ✨ Features

- 📞 **Automated Dialing** - Bulk campaign execution with Google Voice Business integration
- 🤖 **AI Conversations** - Real-time bidirectional audio with ElevenLabs Conversational AI
- 📊 **Campaign Management** - Create, manage, and track multi-contact campaigns
- 💬 **Conversation Analytics** - View complete transcripts with AI-collected insights
- 🎙️ **Call Recordings** - Automatic recording and storage of all conversations
- 📈 **Dashboard Analytics** - Track call performance, success rates, and trends
- 🏷️ **Contact Management** - Import, organize, and tag contacts efficiently
- 🎯 **AI Data Collection** - Automatically capture interest level, callback preferences, and more

## 🏗️ Architecture

### Two-Cable Virtual Audio Routing
```
Google Voice (Browser) → Line 1 → AI (Hears caller)
                            ↓
AI Response → Line 2 → Google Voice (Caller hears AI)
```

### Tech Stack
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Shadcn UI
- **Backend**: Express.js, TypeScript, REST API
- **Database**: PostgreSQL with Drizzle ORM
- **Automation**: Playwright (browser automation)
- **AI**: ElevenLabs Conversational AI (real-time voice)
- **Audio**: Virtual Audio Cable, SoX (audio routing)

## 🚀 Quick Start

### Prerequisites

- **Node.js 20+**
- **PostgreSQL 14+**
- **Windows VPS** (for Virtual Audio Cable support)
- **Google Voice Business** account
- **ElevenLabs API** account
- **Virtual Audio Cable** (VB-Audio)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/google-voice-dialer.git
   cd google-voice-dialer
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install Virtual Audio Cable**
   - Download from: https://vb-audio.com/Cable/
   - Install VB-CABLE Driver (creates CABLE Input/Output)
   - Install additional VB-Audio Cable for Line 2
   - Restart your computer

4. **Install SoX (Sound eXchange)**
   - Download from: https://sourceforge.net/projects/sox/files/sox/
   - Extract all files to `tools/` directory
   - Verify: `tools\sox --version`

5. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and fill in your credentials (see Configuration section below)

6. **Set up PostgreSQL database**
   ```bash
   # Create database
   createdb google_voice_dialer
   
   # Push schema to database
   npm run db:push
   ```

7. **Configure Windows Sound Settings**
   - **Playback**: Set "CABLE Input" as Default Device
   - **Recording**: Set "CABLE Output" as Default Device
   - See `VIRTUAL_AUDIO_CABLE_SETUP.md` for detailed instructions

8. **Start the application**
   ```bash
   npm run dev
   ```

9. **Access the dashboard**
   ```
   http://localhost:5000
   ```

## ⚙️ Configuration

### Required Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/google_voice_dialer

# Google Voice
GOOGLE_VOICE_EMAIL=your-email@gmail.com
GOOGLE_VOICE_PASSWORD=your-password

# ElevenLabs
ELEVENLABS_API_KEY=your-api-key

# Virtual Audio Cable
VAC_CAPTURE_DEVICE=CABLE Output (VB-Audio Virtual Cable)
VAC_PLAYBACK_DEVICE=Line 2 (VB-Audio Virtual Cable)
VAC_BROWSER_OUTPUT=CABLE Input (VB-Audio Virtual Cable)
VAC_BROWSER_INPUT=Line 2 (VB-Audio Virtual Cable)

# Session
SESSION_SECRET=your-random-secret
```

See `.env.example` for complete configuration options.

### ElevenLabs Setup

1. Create account at https://elevenlabs.io
2. Create a Conversational AI agent in the dashboard
3. Configure agent with your desired voice and prompt
4. Copy API key to `.env`
5. Create an AI Agent in the app Settings page

### Google Voice Setup

1. Sign up for Google Voice Business
2. First-time login: Run the app and manually log in via Playwright browser
3. Session persists across restarts in `playwright-data/` directory

## 📖 Usage

### Creating a Campaign

1. Navigate to **Campaigns** page
2. Click **Create Campaign**
3. Add campaign details (name, AI agent, contacts)
4. Click **Start Campaign** to begin automated dialing

### Managing Contacts

1. Go to **Dashboard** or **Contacts** section
2. Click **Add Contact** or **Import CSV**
3. Add tags for organization
4. Assign to campaigns

### Viewing Call History

1. Navigate to **Dashboard**
2. View recent calls in the call history table
3. Click any call to view:
   - Complete transcript (AI + caller)
   - AI-collected insights (interest, callback, concerns)
   - Call recording playback

### Creating AI Agents

1. Go to **Settings** page
2. Click **Manage AI Agents**
3. Create agent with:
   - Name (e.g., "Rachel")
   - ElevenLabs Agent ID
   - Voice configuration

## 🎯 Call Flow & Timing

The system uses intelligent timing to ensure natural conversations:

1. **Call Initiated** - Playwright clicks "Call" button in Google Voice
2. **Connection Detection (3s)** - Waits for "End call" button to confirm connection
3. **Answer Delay (8s)** - Gives recipient time to physically answer phone
4. **AI Greeting** - AI starts speaking after 11 seconds total
5. **Conversation** - Real-time bidirectional audio streaming
6. **Auto-Hangup** - Detects goodbye keywords, waits for audio completion, adds 8s buffer

### Early Hangup Protection

If recipient hangs up during the 8-second delay, the system:
- Immediately cancels AI startup
- Prevents wasted ElevenLabs credits
- Cleans up all resources

## 🔧 Development

### Available Scripts

```bash
npm run dev         # Start development server
npm run build       # Build for production
npm start           # Start production server
npm run check       # TypeScript type checking
npm run db:push     # Push schema changes to database
```

### Project Structure

```
├── client/          # React frontend
│   ├── src/
│   │   ├── components/  # UI components
│   │   ├── pages/       # Route pages
│   │   └── lib/         # Utilities
├── server/          # Express backend
│   ├── routes.ts        # API routes
│   ├── storage.ts       # Database interface
│   ├── audio-handler.ts # Audio processing
│   └── elevenlabs-conversational.ts # AI integration
├── shared/          # Shared types
│   └── schema.ts        # Database schema
└── tools/           # External tools (SoX)
```

## 📚 Additional Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - VPS deployment guide
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Common issues and solutions
- **[VIRTUAL_AUDIO_CABLE_SETUP.md](VIRTUAL_AUDIO_CABLE_SETUP.md)** - Detailed audio routing setup
- **[WINDOWS_VPS_SETUP_GUIDE.md](WINDOWS_VPS_SETUP_GUIDE.md)** - Complete Windows VPS setup

## 🔐 Security

- Never commit `.env` file to version control
- Store database credentials securely
- Use strong SESSION_SECRET (generate with `crypto.randomBytes(32)`)
- Keep ElevenLabs API key private
- Google Voice credentials stored in environment only

## 🐛 Troubleshooting

### Audio Issues
```bash
# Verify audio devices
npm run dev
# Check logs for "Audio devices validated successfully"
```

### Database Connection
```bash
# Test PostgreSQL connection
psql -d google_voice_dialer
```

### Google Voice Login
- If session expires, delete `playwright-data/` and re-login
- Browser opens automatically for manual authentication

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for complete guide.

## 📝 License

MIT

## 🙏 Acknowledgments

- **ElevenLabs** - Conversational AI API
- **Playwright** - Browser automation
- **VB-Audio** - Virtual Audio Cable
- **SoX** - Audio processing

## 📞 Support

For issues, questions, or contributions, please open an issue on GitHub.

---

**Note**: This application is designed for Windows VPS deployment. Linux/Mac support requires alternative audio routing solutions.
