# Deployment Guide - Windows VPS

This guide walks you through deploying the Google Voice Dialer application on a fresh Windows VPS from scratch.

## 📋 Prerequisites

- Windows Server 2019+ or Windows 10/11
- Administrator access
- Remote Desktop Protocol (RDP) access
- At least 4GB RAM, 2 CPU cores
- 50GB+ storage

## 🚀 Complete Deployment Steps

### Step 1: Initial VPS Setup

1. **Connect via RDP**
   ```
   Use Remote Desktop Connection
   Host: your-vps-ip
   Username: Administrator
   Password: your-password
   ```

2. **Update Windows**
   - Run Windows Update
   - Install all critical updates
   - Restart if required

### Step 2: Install Node.js

1. **Download Node.js**
   - Visit: https://nodejs.org/
   - Download LTS version (20.x or higher)
   
2. **Install**
   ```cmd
   Run installer with default settings
   ```

3. **Verify Installation**
   ```cmd
   node --version
   npm --version
   ```

### Step 3: Install PostgreSQL

#### Option A: Using Installer (Recommended)

1. **Download PostgreSQL**
   - Visit: https://www.postgresql.org/download/windows/
   - Download version 14 or higher

2. **Install PostgreSQL**
   - Run installer
   - Set password for `postgres` user (save this!)
   - Port: 5432 (default)
   - Install Stack Builder components (optional)

3. **Verify Installation**
   ```cmd
   psql --version
   ```

4. **Create Database**
   ```cmd
   # Login to PostgreSQL
   psql -U postgres
   
   # Create database
   CREATE DATABASE google_voice_dialer;
   
   # Create user (optional - for better security)
   CREATE USER dialer_app WITH PASSWORD 'your_secure_password';
   GRANT ALL PRIVILEGES ON DATABASE google_voice_dialer TO dialer_app;
   
   # Exit
   \q
   ```

#### Option B: Using Docker (Alternative)

```cmd
# Install Docker Desktop for Windows
# Then run:
docker run -d \
  --name postgres \
  -e POSTGRES_PASSWORD=your_password \
  -e POSTGRES_DB=google_voice_dialer \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  postgres:14
```

### Step 4: Install Git (Optional but Recommended)

1. **Download Git**
   - Visit: https://git-scm.com/download/win
   
2. **Install**
   ```cmd
   Run installer with default settings
   ```

3. **Verify**
   ```cmd
   git --version
   ```

### Step 5: Install ffmpeg

#### Option A: Using Chocolatey (Recommended)

1. **Install Chocolatey**
   ```powershell
   # Open PowerShell as Administrator
   Set-ExecutionPolicy Bypass -Scope Process -Force
   [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
   iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
   ```

2. **Install ffmpeg**
   ```cmd
   choco install ffmpeg -y
   ```

3. **Verify**
   ```cmd
   ffmpeg -version
   ```

#### Option B: Manual Installation

1. Download from: https://www.gyan.dev/ffmpeg/builds/
2. Extract to `C:\ffmpeg`
3. Add `C:\ffmpeg\bin` to PATH
4. Restart Command Prompt and verify

### Step 6: Install Virtual Audio Cable

1. **Download VB-Audio Virtual Cable**
   - Primary: https://vb-audio.com/Cable/
   - Additional (for Line 2): https://vb-audio.com/Cable/

2. **Install Primary Cable**
   ```cmd
   # Extract ZIP
   # Right-click VBCABLE_Setup_x64.exe → Run as Administrator
   # Click "Install Driver"
   # Restart computer when prompted
   ```

3. **Install Second Cable (Line 2)**
   - Repeat process for second cable
   - This creates "Line 2" devices

4. **Verify Installation**
   ```powershell
   Get-PnpDevice -Class AudioEndpoint | Select-Object FriendlyName, Status
   ```
   
   You should see:
   - CABLE Input (VB-Audio Virtual Cable)
   - CABLE Output (VB-Audio Virtual Cable)
   - Line 2 Input
   - Line 2 Output

### Step 7: Configure Audio Devices

1. **Open Sound Settings**
   ```
   Right-click speaker icon → Sounds
   ```

2. **Playback Tab**
   - Set "CABLE Input" as Default Device
   - Right-click → Properties → Levels → Set to 100%

3. **Recording Tab**
   - Set "CABLE Output" as Default Device
   - Right-click → Properties → Levels → Set to 100%

4. **Test Audio Routing**
   - Speak into microphone
   - Audio should route through virtual cables

### Step 8: Clone and Setup Application

1. **Create Working Directory**
   ```cmd
   mkdir C:\VoiceDialer
   cd C:\VoiceDialer
   ```

2. **Clone Repository**
   ```cmd
   git clone https://github.com/yourusername/google-voice-dialer.git
   cd google-voice-dialer
   ```
   
   **OR** Upload files via RDP:
   - Copy entire project folder to VPS
   - Place in `C:\VoiceDialer\google-voice-dialer`

3. **Install Dependencies**
   ```cmd
   npm install
   ```

### Step 9: Install SoX

1. **Download SoX**
   - Visit: https://sourceforge.net/projects/sox/files/sox/
   - Download latest Windows ZIP (e.g., `sox-14.4.2-win32.zip`)

2. **Extract to Tools Directory**
   ```cmd
   # Extract all files from ZIP to:
   C:\VoiceDialer\google-voice-dialer\tools\
   ```

3. **Verify SoX**
   ```cmd
   tools\sox --version
   ```

### Step 10: Configure Environment Variables

1. **Create .env file**
   ```cmd
   copy .env.example .env
   ```

2. **Edit .env file**
   ```cmd
   notepad .env
   ```

3. **Fill in values**
   ```env
   # Database
   DATABASE_URL=postgresql://postgres:your_pg_password@localhost:5432/google_voice_dialer
   
   # Or if you created a separate user:
   DATABASE_URL=postgresql://dialer_app:your_secure_password@localhost:5432/google_voice_dialer
   
   # Google Voice
   GOOGLE_VOICE_EMAIL=your-google-voice@gmail.com
   GOOGLE_VOICE_PASSWORD=your-google-voice-password
   
   # ElevenLabs
   ELEVENLABS_API_KEY=sk_your_api_key_here
   
   # Virtual Audio Cable (adjust device names if different)
   VAC_CAPTURE_DEVICE=CABLE Output (VB-Audio Virtual Cable)
   VAC_PLAYBACK_DEVICE=Line 2 (VB-Audio Virtual Cable)
   VAC_BROWSER_OUTPUT=CABLE Input (VB-Audio Virtual Cable)
   VAC_BROWSER_INPUT=Line 2 (VB-Audio Virtual Cable)
   
   # Session Secret (generate random string)
   SESSION_SECRET=your_random_32_character_secret_here
   
   # Server
   PORT=5000
   NODE_ENV=production
   ```

4. **Generate Session Secret**
   ```cmd
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

### Step 11: Initialize Database

1. **Push Database Schema**
   ```cmd
   npm run db:push
   ```

2. **Verify Database**
   ```cmd
   psql -U postgres -d google_voice_dialer
   \dt
   # Should show tables: contacts, calls, campaigns, etc.
   \q
   ```

### Step 12: Build Application

```cmd
npm run build
```

### Step 13: First Run & Google Voice Login

1. **Start Application**
   ```cmd
   npm start
   ```

2. **Access Dashboard**
   ```
   http://localhost:5000
   ```

3. **Google Voice First-Time Login**
   - Go to Settings page
   - Click "Launch Browser"
   - Manually login to Google Voice in Playwright browser
   - Session will be saved for future use

### Step 14: Setup Windows Service (Production)

To run the application as a Windows service that starts automatically:

1. **Install node-windows**
   ```cmd
   npm install -g node-windows
   ```

2. **Create Service Script** (`install-service.js`)
   ```javascript
   var Service = require('node-windows').Service;
   
   var svc = new Service({
     name: 'Google Voice Dialer',
     description: 'Automated calling platform with AI',
     script: 'C:\\VoiceDialer\\google-voice-dialer\\dist\\index.js',
     nodeOptions: [
       '--max_old_space_size=4096'
     ],
     env: [
       {
         name: "NODE_ENV",
         value: "production"
       }
     ]
   });
   
   svc.on('install', function(){
     svc.start();
     console.log('Service installed and started!');
   });
   
   svc.install();
   ```

3. **Install Service**
   ```cmd
   node install-service.js
   ```

4. **Manage Service**
   ```cmd
   # Open Services
   services.msc
   
   # Find "Google Voice Dialer"
   # Right-click → Properties
   # Startup type: Automatic
   ```

### Step 15: Firewall Configuration

1. **Allow Port 5000**
   ```powershell
   # Open PowerShell as Administrator
   New-NetFirewallRule -DisplayName "Google Voice Dialer" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow
   ```

2. **Access from Outside VPS**
   ```
   http://your-vps-ip:5000
   ```

## 🔒 Security Checklist

- [ ] Use strong PostgreSQL password
- [ ] Generate secure SESSION_SECRET (32+ characters)
- [ ] Keep .env file secure (never commit to Git)
- [ ] Enable Windows Firewall
- [ ] Only open necessary ports
- [ ] Use HTTPS in production (consider reverse proxy)
- [ ] Regular Windows Updates
- [ ] Regular backups of database

## 📦 Database Backup & Restore

### Backup

```cmd
# Backup database
pg_dump -U postgres google_voice_dialer > backup.sql

# Or with timestamp
pg_dump -U postgres google_voice_dialer > backup_%date:~-4,4%%date:~-10,2%%date:~-7,2%.sql
```

### Restore

```cmd
# Drop existing database (careful!)
psql -U postgres -c "DROP DATABASE google_voice_dialer;"
psql -U postgres -c "CREATE DATABASE google_voice_dialer;"

# Restore from backup
psql -U postgres google_voice_dialer < backup.sql
```

### Automated Backup Script

Create `backup.bat`:
```batch
@echo off
set BACKUP_DIR=C:\VoiceDialer\backups
set TIMESTAMP=%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%
set FILENAME=google_voice_dialer_%TIMESTAMP%.sql

pg_dump -U postgres google_voice_dialer > %BACKUP_DIR%\%FILENAME%

echo Backup created: %FILENAME%
```

Schedule with Task Scheduler for daily backups.

## 🔄 Updates & Maintenance

### Updating Application

```cmd
# Pull latest changes
git pull origin main

# Install new dependencies
npm install

# Rebuild
npm run build

# Push any schema changes
npm run db:push

# Restart service
services.msc → Restart "Google Voice Dialer"
```

### Viewing Logs

```cmd
# Application logs
type C:\VoiceDialer\google-voice-dialer\app.log

# Service logs (if using node-windows)
type C:\VoiceDialer\google-voice-dialer\daemon\*.log
```

## 🐛 Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues and solutions.

### Quick Checks

1. **Database Connection**
   ```cmd
   psql -U postgres -d google_voice_dialer
   ```

2. **Audio Devices**
   ```powershell
   Get-PnpDevice -Class AudioEndpoint | Where-Object Status -eq "OK"
   ```

3. **Port Availability**
   ```cmd
   netstat -ano | findstr :5000
   ```

4. **SoX Working**
   ```cmd
   tools\sox --version
   ```

## 📊 Monitoring

### Resource Usage

```powershell
# Check CPU/Memory
Get-Process node | Format-Table Name, CPU, WorkingSet -AutoSize
```

### Database Size

```sql
SELECT pg_size_pretty(pg_database_size('google_voice_dialer'));
```

## ✅ Production Checklist

- [ ] PostgreSQL installed and running
- [ ] Database created and schema pushed
- [ ] Virtual Audio Cable installed and configured
- [ ] SoX installed in tools/ directory
- [ ] All environment variables configured
- [ ] Google Voice login completed
- [ ] ElevenLabs API key valid
- [ ] Application builds successfully
- [ ] Windows service installed (optional)
- [ ] Firewall configured
- [ ] Backups scheduled
- [ ] Monitoring setup

## 🎯 Next Steps

1. Create AI agents in Settings page
2. Import contacts
3. Create your first campaign
4. Test with a single call
5. Monitor call logs and transcripts

---

**Note**: This is a Windows-specific deployment guide. For Linux/Mac, alternative audio routing solutions are required.
