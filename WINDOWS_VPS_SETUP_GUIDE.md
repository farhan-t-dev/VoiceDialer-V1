# Windows VPS Setup Guide for Google Voice Dialer

This guide will help you set up the Google Voice Dialer application on your Windows VPS with Virtual Audio Cable integration.

## Prerequisites

- Windows Server 2019 or later (or Windows 10/11)
- Administrator access to the VPS
- Remote Desktop Connection to access the VPS
- Google Voice Business account
- ElevenLabs API account

## Step 1: Install Required Software

### 1.1 Install Node.js

1. Download Node.js from: https://nodejs.org/
2. Choose the LTS (Long Term Support) version
3. Run the installer
4. Accept all defaults and complete installation
5. Open Command Prompt and verify:
   ```cmd
   node --version
   npm --version
   ```

### 1.2 Install Git (Optional but Recommended)

1. Download Git from: https://git-scm.com/download/win
2. Run the installer
3. Accept all defaults
4. Verify installation:
   ```cmd
   git --version
   ```

### 1.3 Install ffmpeg

**Option A: Using Chocolatey (Recommended)**

1. Install Chocolatey package manager:
   - Open PowerShell as Administrator
   - Run:
     ```powershell
     Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
     ```

2. Install ffmpeg:
   ```cmd
   choco install ffmpeg -y
   ```

3. Verify installation:
   ```cmd
   ffmpeg -version
   ```

**Option B: Manual Installation**

1. Download ffmpeg from: https://www.gyan.dev/ffmpeg/builds/
2. Download the "release essentials" build
3. Extract to `C:\ffmpeg`
4. Add to PATH:
   - Right-click "This PC" → Properties
   - Advanced System Settings → Environment Variables
   - Under System Variables, find "Path"
   - Click Edit → New
   - Add: `C:\ffmpeg\bin`
   - Click OK on all dialogs
5. Restart Command Prompt and verify:
   ```cmd
   ffmpeg -version
   ```

### 1.4 Install VB-Audio Virtual Cable

1. Download from: https://vb-audio.com/Cable/
2. Extract the ZIP file
3. Right-click `VBCABLE_Setup_x64.exe` (or x86 for 32-bit)
4. Select "Run as administrator"
5. Click Install Driver
6. Restart your computer when prompted

**After Restart:**

1. Open Sound Settings:
   - Right-click speaker icon in taskbar → Sounds
   
2. Recording Tab:
   - Find "CABLE Output" (this is your virtual microphone)
   - Right-click → Set as Default Device
   - Right-click → Properties → Advanced
   - Note the full device name (e.g., "CABLE Output (VB-Audio Virtual Cable)")

3. Playback Tab:
   - Find "CABLE Input" (this is your virtual speaker)
   - Right-click → Properties → Advanced
   - Note the full device name (e.g., "CABLE Input (VB-Audio Virtual Cable)")

## Step 2: Download the Application

### Option A: From Replit (Download ZIP)

1. In Replit, go to the three-dot menu → Download as ZIP
2. Extract to your VPS (e.g., `C:\GoogleVoiceDialer`)

### Option B: Using Git

1. Open Command Prompt
2. Navigate to where you want the project:
   ```cmd
   cd C:\
   git clone <YOUR_REPLIT_GIT_URL> GoogleVoiceDialer
   cd GoogleVoiceDialer
   ```

## Step 3: Install Dependencies

1. Open Command Prompt in the project directory:
   ```cmd
   cd C:\GoogleVoiceDialer
   ```

2. Install all required packages:
   ```cmd
   npm install
   ```

   This will install:
   - Express server
   - Playwright for browser automation
   - ElevenLabs SDK
   - Audio processing libraries
   - All other dependencies

3. Install Playwright browsers:
   ```cmd
   npx playwright install chromium
   ```

## Step 4: Set Up Environment Variables

1. Create a file named `.env` in the project root:
   ```cmd
   notepad .env
   ```

2. Add the following (replace with your actual values):
   ```env
   # Database (if using PostgreSQL, otherwise leave blank for in-memory)
   DATABASE_URL=your_database_url_here

   # Google Voice Credentials
   GOOGLE_VOICE_EMAIL=your_google_voice_email@gmail.com
   GOOGLE_VOICE_PASSWORD=your_google_voice_password

   # ElevenLabs API
   ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

   # Virtual Audio Cable Device Names
   VAC_INPUT_DEVICE=CABLE Input (VB-Audio Virtual Cable)
   VAC_OUTPUT_DEVICE=CABLE Output (VB-Audio Virtual Cable)

   # Session Secret (generate a random string)
   SESSION_SECRET=your_random_session_secret_here

   # Server Port
   PORT=5000
   ```

3. Save and close the file

**Important Notes:**
- Get your ElevenLabs API key from: https://elevenlabs.io/app/settings/api-keys
- The VAC device names MUST match exactly what you saw in Sound Settings (Step 1.4)
- Generate a random SESSION_SECRET using: https://www.random.org/strings/

## Step 5: Configure Database (Optional)

**Option A: Use In-Memory Storage (Default)**
- No additional setup needed
- Data is lost when server restarts
- Good for testing

**Option B: Use PostgreSQL Database**

1. Install PostgreSQL:
   - Download from: https://www.postgresql.org/download/windows/
   - Run installer and set a password
   
2. Create database:
   ```sql
   CREATE DATABASE google_voice_dialer;
   ```

3. Update DATABASE_URL in `.env`:
   ```env
   DATABASE_URL=postgresql://postgres:your_password@localhost:5432/google_voice_dialer
   ```

4. Push database schema:
   ```cmd
   npm run db:push
   ```

## Step 6: Test the Application

1. Start the development server:
   ```cmd
   npm run dev
   ```

2. Open browser and go to: http://localhost:5000

3. You should see the Google Voice Dialer dashboard

4. Test creating a contact and AI agent

## Step 7: Configure for Production

### 7.1 Build the Application

```cmd
npm run build
```

### 7.2 Create a Windows Service (Keep Running)

**Option A: Using PM2 (Recommended)**

1. Install PM2 globally:
   ```cmd
   npm install -g pm2
   npm install -g pm2-windows-startup
   ```

2. Configure PM2 to start on boot:
   ```cmd
   pm2-startup install
   ```

3. Start the application:
   ```cmd
   pm2 start npm --name "google-voice-dialer" -- start
   ```

4. Save the PM2 configuration:
   ```cmd
   pm2 save
   ```

5. Manage the service:
   ```cmd
   pm2 status          # Check status
   pm2 logs            # View logs
   pm2 restart google-voice-dialer
   pm2 stop google-voice-dialer
   ```

**Option B: Using NSSM (Non-Sucking Service Manager)**

1. Download NSSM from: https://nssm.cc/download

2. Extract to `C:\nssm`

3. Open Command Prompt as Administrator:
   ```cmd
   cd C:\nssm\win64
   nssm install GoogleVoiceDialer
   ```

4. In the NSSM GUI:
   - Path: `C:\Program Files\nodejs\node.exe`
   - Startup directory: `C:\GoogleVoiceDialer`
   - Arguments: `server/index.js`
   - Click "Install service"

5. Start the service:
   ```cmd
   nssm start GoogleVoiceDialer
   ```

## Step 8: Configure Firewall

1. Open Windows Firewall with Advanced Security

2. Click "Inbound Rules" → "New Rule"

3. Select "Port" → Next

4. TCP, Specific local ports: `5000` → Next

5. Allow the connection → Next

6. Check all profiles → Next

7. Name: "Google Voice Dialer" → Finish

## Step 9: Access from Remote Computer (Optional)

If you want to access the dashboard from another computer:

1. Find your VPS public IP address

2. Access via: `http://YOUR_VPS_IP:5000`

3. For security, consider setting up:
   - VPN access
   - Reverse proxy with SSL (using nginx or IIS)
   - Authentication middleware

## Step 10: Test Automated Calling

1. Open the dashboard: http://localhost:5000

2. Create contacts:
   - Go to Contacts page
   - Add phone numbers

3. Create an AI Agent:
   - Go to AI Agents page
   - Configure personality and conversation script
   - Select ElevenLabs voice

4. Create a Campaign:
   - Go to Campaigns page
   - Create new campaign
   - Select your AI agent
   - Add contacts to campaign

5. Start Dialing:
   - Open campaign
   - Click "Start Dialing"
   - Browser will open and automate Google Voice
   - Calls will be made with 5-minute delays between each

## Troubleshooting

### Issue: "Cannot find module" errors
**Solution:** Run `npm install` again

### Issue: ffmpeg not found
**Solution:** Verify PATH includes ffmpeg bin directory, restart Command Prompt

### Issue: Virtual Audio Cable not working
**Solution:** 
- Verify device names in `.env` match Sound Settings exactly
- Check that CABLE Output is set as default recording device
- Restart the application

### Issue: Playwright browser won't open
**Solution:** 
```cmd
npx playwright install chromium --with-deps
```

### Issue: Google Voice login fails
**Solution:**
- Verify GOOGLE_VOICE_EMAIL and GOOGLE_VOICE_PASSWORD in `.env`
- Try logging in manually first in a browser on the VPS
- Google may require 2FA - you may need to use an app-specific password

### Issue: ElevenLabs API errors
**Solution:**
- Verify ELEVENLABS_API_KEY is correct
- Check your ElevenLabs account has credits
- Check API quota limits

### Issue: Port 5000 already in use
**Solution:**
- Change PORT in `.env` to different number (e.g., 3000, 8080)
- Update firewall rule accordingly

### Issue: Audio recording files are corrupt
**Solution:**
- Verify ffmpeg is properly installed
- Check that recordings folder exists and has write permissions
- Review server logs for transcoding errors

## Maintenance

### View Logs
```cmd
# If using PM2
pm2 logs google-voice-dialer

# If using NSSM
# Logs are in Windows Event Viewer under Application
```

### Update the Application
```cmd
cd C:\GoogleVoiceDialer
git pull  # If using Git
npm install  # Install any new dependencies
npm run build  # Rebuild
pm2 restart google-voice-dialer  # Restart service
```

### Backup Database
```cmd
# If using PostgreSQL
pg_dump -U postgres google_voice_dialer > backup.sql
```

## Security Recommendations

1. **Change default passwords** - Update SESSION_SECRET regularly

2. **Use HTTPS** - Set up SSL certificate with reverse proxy

3. **Firewall rules** - Only allow necessary ports

4. **Keep software updated** - Regularly update Node.js, npm packages

5. **Monitor logs** - Check for suspicious activity

6. **Limit access** - Use VPN or IP whitelist for dashboard access

7. **Secure credentials** - Never commit `.env` file to version control

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review server logs
3. Verify all environment variables are set correctly
4. Ensure Virtual Audio Cable is properly configured

## Summary

You should now have:
- ✅ Node.js, ffmpeg, and Virtual Audio Cable installed
- ✅ Application installed and configured
- ✅ Environment variables set up
- ✅ Database configured (optional)
- ✅ Application running as a service
- ✅ Firewall configured
- ✅ Automated calling working with AI agents

The application will now run continuously on your Windows VPS, making automated calls through Google Voice with ElevenLabs AI conversations!
