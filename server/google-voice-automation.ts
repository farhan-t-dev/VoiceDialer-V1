import { chromium, type BrowserContext, type Page } from 'playwright';
import path from 'path';
import { CallStateMonitor, CallState, type CallStateChange, type CallMonitorConfig } from './call-state-monitor.js';
import { CallStateDetector, createCallDetector, type TimeoutConfig } from './call-state-detector.js';

interface GoogleVoiceConfig {
  email: string;
  password: string;
}

class GoogleVoiceDialer {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private isLoggedIn: boolean = false;
  private config: GoogleVoiceConfig;
  private loginRequiredCallback: (() => void | Promise<void>) | null = null;
  private loginSuccessCallback: (() => void | Promise<void>) | null = null;
  private shouldContinue: () => Promise<boolean> = async () => true;

  constructor(config: GoogleVoiceConfig) {
    this.config = config;
  }

  /**
   * Set a callback to check if automation should continue
   */
  setShouldContinueCallback(callback: () => Promise<boolean>) {
    this.shouldContinue = callback;
  }

  /**
   * Set a callback to be called when manual login is required
   */
  setLoginRequiredCallback(callback: () => void | Promise<void>) {
    this.loginRequiredCallback = callback;
  }

  /**
   * Set a callback to be called when login is successful
   */
  setLoginSuccessCallback(callback: () => void | Promise<void>) {
    this.loginSuccessCallback = callback;
  }

  async initialize(audioInputDevice?: string, audioOutputDevice?: string) {
    try {
      // Create a persistent user data directory to save login session
      const userDataDir = path.join(process.cwd(), 'playwright-data', 'google-voice-profile');
      
      const launchArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--autoplay-policy=no-user-gesture-required',
        '--enable-features=VaapiVideoDecoder'
      ];

      // REMOVED: --use-fake-ui-for-media-stream (this flag creates fake audio devices)
      // Browser will now use real Windows default audio devices (Line 1 and Line 2)

      // Use launchPersistentContext to save cookies and session data
      this.context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,  // Always visible so user can see Google Voice UI
        args: launchArgs,
        permissions: ['microphone', 'camera'],
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      });

      // Grant permissions for Google Voice
      await this.context.grantPermissions(['microphone', 'camera'], { 
        origin: 'https://voice.google.com' 
      });

      // Get the first page (or create one if none exists)
      const pages = this.context.pages();
      if (pages.length > 0) {
        this.page = pages[0];
      } else {
        this.page = await this.context.newPage();
      }

      console.log('Browser initialized successfully with persistent profile', {
        userDataDir,
        audioDevices: 'Using Windows default devices (NOT fake Playwright devices)',
        headless: false
      });
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  /**
   * Robust login state detection using multiple methods
   */
  private async isCurrentlyLoggedIn(): Promise<boolean> {
    if (!this.page) return false;

    try {
      const currentUrl = this.page.url();
      
      // Method 1: Check URL pattern (most reliable)
      if (currentUrl.includes('voice.google.com/u/')) {
        console.log('[Login Check] Logged in (URL contains /u/)');
        return true;
      }

      // Method 2: Check for Google Voice UI elements
      const voiceUISelectors = [
        '[gv-id="navigation"]',
        'gv-side-nav',
        'button[aria-label*="Make a call"]',
        'button[aria-label*="make a call"]',
        '.dialpad',
        '[data-test-id="voicemail-tab"]'
      ];

      for (const selector of voiceUISelectors) {
        try {
          const element = this.page.locator(selector).first();
          if (await element.isVisible({ timeout: 2000 })) {
            console.log(`[Login Check] Logged in (found UI element: ${selector})`);
            return true;
          }
        } catch (e) {
          // Continue checking
        }
      }

      // Method 3: Check for login/signin buttons (indicates NOT logged in)
      const loginIndicators = [
        'text=Sign in',
        'button:has-text("Sign in")',
        'input[type="email"]',
        'input[type="password"]'
      ];

      for (const selector of loginIndicators) {
        try {
          const element = this.page.locator(selector).first();
          if (await element.isVisible({ timeout: 1000 })) {
            console.log(`[Login Check] NOT logged in (found login element: ${selector})`);
            return false;
          }
        } catch (e) {
          // Continue checking
        }
      }

      // Method 4: Check cookies for Google authentication
      const cookies = await this.context?.cookies() || [];
      const hasAuthCookies = cookies.some(cookie => 
        (cookie.name.includes('SID') || cookie.name.includes('SSID')) && 
        cookie.domain.includes('google.com')
      );

      if (hasAuthCookies) {
        console.log('[Login Check] Logged in (found authentication cookies)');
        return true;
      }

      console.log('[Login Check] NOT logged in (no indicators found)');
      return false;
    } catch (error) {
      console.error('[Login Check] Error during login check:', error);
      return false;
    }
  }

  /**
   * Manual login - prompts user to login in the browser window
   */
  async login() {
    if (!this.page) throw new Error('Browser not initialized');

    try {
      console.log('Navigating to Google Voice...');
      await this.page.goto('https://voice.google.com', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      // Give the page a moment to fully load
      await this.page.waitForTimeout(3000);

      // Check if already logged in with robust detection
      const alreadyLoggedIn = await this.isCurrentlyLoggedIn();
      
      if (alreadyLoggedIn) {
        console.log('✓ Already logged in to Google Voice (session restored from previous login)');
        this.isLoggedIn = true;
        return;
      }

      // Not logged in - prompt for manual login
      console.log('\n╔════════════════════════════════════════════════════════════════╗');
      console.log('║               MANUAL LOGIN REQUIRED                            ║');
      console.log('╚════════════════════════════════════════════════════════════════╝');
      console.log('');
      console.log('Please complete the Google login in the browser window:');
      console.log('');
      console.log('  1. Enter your Google email address');
      console.log('  2. Click "Next"');
      console.log('  3. Enter your password');
      console.log('  4. Click "Next"');
      console.log('  5. Complete any 2FA verification (if enabled)');
      console.log('  6. Accept any terms or security prompts');
      console.log('  7. Wait for Google Voice interface to load');
      console.log('');
      console.log('NOTE: Your login session will be saved for future use.');
      console.log('      You will only need to login once unless you clear browser data.');
      console.log('');
      console.log('════════════════════════════════════════════════════════════════');
      console.log('Waiting for you to complete login (checking every 20 seconds)...');
      console.log('');

      // Notify the app that login is required
      if (this.loginRequiredCallback) {
        try {
          await this.loginRequiredCallback();
        } catch (error) {
          console.error('Error triggering login notification:', error);
        }
      }

      // Try to click "Sign in" button if present to help user
      try {
        const signInButton = await this.page.locator('text=Sign in').first();
        if (await signInButton.isVisible({ timeout: 5000 }).catch(() => false)) {
          await signInButton.click();
          await this.page.waitForTimeout(2000);
          console.log('ℹ Clicked "Sign in" button for you');
        }
      } catch (e) {
        // Ignore - user can click it manually
      }
      
      // Wait for manual login with robust checking
      const maxWaitTime = 180000; // 3 minutes (reduced from 5 for better UX)
      const checkInterval = 20000; // 20 seconds (reduced frequency for better performance)
      const maxAttempts = maxWaitTime / checkInterval;
      
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          await this.page.waitForTimeout(checkInterval);
        } catch (error) {
          // Browser/page was closed - campaign was stopped
          if (error instanceof Error && (
            error.message.includes('Target page, context or browser has been closed') ||
            error.message.includes('Browser closed')
          )) {
            console.log('');
            console.log('╔════════════════════════════════════════════════════════════════╗');
            console.log('║          LOGIN WAIT CANCELLED (BROWSER CLOSED)                 ║');
            console.log('╚════════════════════════════════════════════════════════════════╝');
            throw new Error('Campaign stopped by user');
          }
          throw error;
        }
        
        // Check if we should continue (campaign might have been stopped)
        const continueWaiting = await this.shouldContinue();
        if (!continueWaiting) {
          console.log('');
          console.log('╔════════════════════════════════════════════════════════════════╗');
          console.log('║          LOGIN WAIT CANCELLED                                  ║');
          console.log('╚════════════════════════════════════════════════════════════════╝');
          throw new Error('Campaign stopped by user');
        }
        
        // Use robust login check
        const isLoggedIn = await this.isCurrentlyLoggedIn();
        
        if (isLoggedIn) {
          console.log('');
          console.log('╔════════════════════════════════════════════════════════════════╗');
          console.log('║          ✓ LOGIN SUCCESSFUL                                    ║');
          console.log('╚════════════════════════════════════════════════════════════════╝');
          console.log('');
          console.log('Your session has been saved. Future logins will be automatic.');
          console.log('Continuing with automation...');
          console.log('');
          this.isLoggedIn = true;
          
          // Notify that login is successful
          if (this.loginSuccessCallback) {
            await this.loginSuccessCallback();
          }
          
          return;
        }
        
        // Show progress approximately every 45 seconds
        const elapsedSeconds = Math.round((attempt + 1) * checkInterval / 1000);
        
        // Show at 40s (2 checks), then every 60s after that (to average ~45s updates)
        if (elapsedSeconds === 40 || (elapsedSeconds > 40 && (elapsedSeconds - 40) % 60 === 0)) {
          const remainingSeconds = Math.round((maxWaitTime - (attempt + 1) * checkInterval) / 1000);
          console.log(`⏱  Still waiting... (${elapsedSeconds}s elapsed, ${remainingSeconds}s remaining)`);
        }
      }
      
      // If we got here, manual login timed out
      // DO NOT throw error - keep browser open and campaign paused so user can still login
      console.log('');
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║          ⏸  LOGIN TIMEOUT - CAMPAIGN PAUSED                    ║');
      console.log('╚════════════════════════════════════════════════════════════════╝');
      console.log('');
      console.log('The browser will remain open so you can complete login anytime.');
      console.log('After logging in, restart the campaign to continue.');
      console.log('');
      
      // Return gracefully without throwing - campaign stays in 'waiting_for_login' status
      return;
      
    } catch (error) {
      // Handle specific error cases gracefully
      if (error instanceof Error) {
        if (error.message.includes('Campaign stopped by user')) {
          // Don't throw - this is a normal stop operation
          console.log('[Login] Campaign stopped by user during login wait');
          return;
        }
      }
      console.error('Login process failed:', error);
      throw new Error(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify login status before performing operations
   */
  private async ensureLoggedIn(): Promise<void> {
    // First check our internal flag
    if (this.isLoggedIn) {
      // Double-check with robust detection
      const stillLoggedIn = await this.isCurrentlyLoggedIn();
      if (stillLoggedIn) {
        return; // All good
      } else {
        console.log('[Warning] Session expired, re-login required');
        this.isLoggedIn = false;
      }
    }

    // Need to login
    await this.login();
  }

  /**
   * Validate that audio devices are accessible and properly configured
   * This helps detect Virtual Audio Cable issues BEFORE making a call
   */
  private async validateAudioDevices(): Promise<{ valid: boolean; error?: string }> {
    if (!this.page) {
      return { valid: false, error: 'Browser not initialized' };
    }

    try {
      console.log('[Audio Check] Validating audio device configuration...');

      const audioCheck = await this.page.evaluate(`
        (async function() {
          try {
            // Check if mediaDevices API is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
              return { valid: false, error: 'Media devices API not available' };
            }

            // Enumerate all media devices
            var devices = await navigator.mediaDevices.enumerateDevices();
            
            // Filter audio inputs using traditional for loop
            var audioInputs = [];
            for (var i = 0; i < devices.length; i++) {
              if (devices[i].kind === 'audioinput') {
                audioInputs.push(devices[i]);
              }
            }
            
            // Filter audio outputs using traditional for loop
            var audioOutputs = [];
            for (var j = 0; j < devices.length; j++) {
              if (devices[j].kind === 'audiooutput') {
                audioOutputs.push(devices[j]);
              }
            }

            console.log('[Browser Audio] Found ' + audioInputs.length + ' input devices, ' + audioOutputs.length + ' output devices');
            
            // Log device details using traditional for loop
            for (var k = 0; k < audioInputs.length; k++) {
              var device = audioInputs[k];
              console.log('[Browser Audio] Input ' + (k + 1) + ': "' + (device.label || 'Unknown') + '" (ID: ' + device.deviceId.substring(0, 20) + '...)');
            }
            
            for (var m = 0; m < audioOutputs.length; m++) {
              var device = audioOutputs[m];
              console.log('[Browser Audio] Output ' + (m + 1) + ': "' + (device.label || 'Unknown') + '" (ID: ' + device.deviceId.substring(0, 20) + '...)');
            }

            // Check if any audio inputs are available
            if (audioInputs.length === 0) {
              return { valid: false, error: 'No audio input devices found' };
            }

            // Try to get user media access (this will trigger permissions if needed)
            try {
              var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              console.log('[Browser Audio] Successfully accessed microphone');
              
              // Check if we're getting audio data
              var audioTracks = stream.getAudioTracks();
              if (audioTracks.length === 0) {
                // Stop all tracks using traditional for loop
                var tracks = stream.getTracks();
                for (var n = 0; n < tracks.length; n++) {
                  tracks[n].stop();
                }
                return { valid: false, error: 'No audio tracks available' };
              }

              console.log('[Browser Audio] Active audio track: "' + audioTracks[0].label + '"');
              console.log('[Browser Audio] Track state: ' + audioTracks[0].readyState);
              console.log('[Browser Audio] Track enabled: ' + audioTracks[0].enabled);
              console.log('[Browser Audio] Track muted: ' + audioTracks[0].muted);

              // Check if the microphone track is actually receiving audio
              var audioTrack = audioTracks[0];
              if (audioTrack.muted) {
                // Stop all tracks using traditional for loop
                var tracks = stream.getTracks();
                for (var p = 0; p < tracks.length; p++) {
                  tracks[p].stop();
                }
                return { valid: false, error: 'Microphone is muted' };
              }

              // Clean up stream using traditional for loop
              var tracks = stream.getTracks();
              for (var q = 0; q < tracks.length; q++) {
                tracks[q].stop();
              }
              
              return { valid: true };
            } catch (getUserMediaError) {
              return { valid: false, error: 'Microphone access denied: ' + getUserMediaError.message };
            }
          } catch (error) {
            return { valid: false, error: 'Audio check failed: ' + error.message };
          }
        })()
      `) as { valid: boolean; error?: string };

      if (!audioCheck.valid) {
        console.log(`[Audio Check] ❌ Audio validation failed: ${audioCheck.error}`);
        console.log('[Audio Check] This indicates a Virtual Audio Cable configuration issue');
        console.log('[Audio Check] ');
        console.log('[Audio Check] TROUBLESHOOTING STEPS:');
        console.log('[Audio Check] 1. Open Windows Sound Settings (right-click speaker icon)');
        console.log('[Audio Check] 2. Playback tab → Set "Line 1 (Virtual Audio Cable)" as Default');
        console.log('[Audio Check] 3. Recording tab → Set "Line 2 (Virtual Audio Cable)" as Default');
        console.log('[Audio Check] 4. Close and reopen the Playwright browser');
        console.log('[Audio Check] 5. Restart the campaign');
        console.log('[Audio Check] ');
        return audioCheck;
      }

      console.log('[Audio Check] ✓ Audio devices validated successfully');
      console.log('[Audio Check] ✓ Browser can access microphone and speaker');
      console.log('[Audio Check] ✓ Ready to start call with AI audio processing');
      return { valid: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.log(`[Audio Check] ❌ Audio validation error: ${errorMsg}`);
      return { valid: false, error: errorMsg };
    }
  }

  async dialNumber(phoneNumber: string): Promise<boolean> {
    if (!this.page) throw new Error('Browser not initialized');
    
    // Ensure we're logged in before attempting to dial
    await this.ensureLoggedIn();

    try {
      console.log(`Dialing number: ${phoneNumber}`);

      // VALIDATE AUDIO DEVICES BEFORE DIALING (detect VAC issues early)
      const audioStatus = await this.validateAudioDevices();
      if (!audioStatus.valid) {
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('❌ AUDIO DEVICE ERROR - Cannot make call');
        console.log(`   Reason: ${audioStatus.error}`);
        console.log('   Action: Check Virtual Audio Cable configuration');
        console.log('═══════════════════════════════════════════════════════════════');
        throw new Error(`Audio device validation failed: ${audioStatus.error}`);
      }

      // Navigate to the CALLS tab (not messages) - this has the dedicated dial pad
      console.log('Navigating to Calls section...');
      await this.page.goto('https://voice.google.com/u/0/calls', {
        waitUntil: 'load',
        timeout: 20000
      });
      
      // Wait for page to stabilize
      await this.page.waitForTimeout(2000);
      
      // Trigger a resize to ensure Google Voice UI renders properly
      await this.page.setViewportSize({ width: 1920, height: 1080 });
      await this.page.waitForTimeout(1000);

      // Take a screenshot to see initial state
      try {
        await this.page.screenshot({ path: `debug-calls-page-${Date.now()}.png`, fullPage: true });
        console.log('Screenshot of calls page saved');
      } catch (e) {}

      // CRITICAL: Open the dial pad and verify it's visible
      console.log('Ensuring dial pad is open...');
      
      // Helper function to check if dial pad is visible
      const isDialPadVisible = async (): Promise<boolean> => {
        const dialPadIndicators = [
          'input[placeholder*="Enter a name"]',
          'input[placeholder*="enter a name"]',
          'input[placeholder*="name or number"]',
          '[gv-id="dialpad"]',
          '.dialpad',
          'gv-dialpad'
        ];
        
        for (const indicator of dialPadIndicators) {
          try {
            const element = this.page!.locator(indicator).first();
            if (await element.isVisible({ timeout: 500 })) {
              return true;
            }
          } catch (e) {
            // Try next
          }
        }
        return false;
      };
      
      // Check if dial pad is already visible
      let dialPadVisible = await isDialPadVisible();
      
      if (!dialPadVisible) {
        console.log('Dial pad not visible, trying to open it...');
        
        const dialPadOpenerSelectors = [
          'button[aria-label*="Make a call"]',
        'button[aria-label*="make a call"]',
          'button[aria-label*="Dial"]',
          'button[aria-label*="dial"]',
          'button:has-text("Make a call")',
          'div[role="button"]:has-text("Make a call")',
          'gv-fab-button',
          '[gv-id="dialpad-button"]',
          'button.gmat-mdc-button[aria-label*="call"]',
          'button.gmat-mdc-button[aria-label*="Call"]',
          'button:has(gv-icon[icon="dialpad"])',
          'button:has(mat-icon:has-text("dialpad"))'
        ];
        
        let clickedOpener = false;
        for (const selector of dialPadOpenerSelectors) {
          try {
            const element = this.page.locator(selector).first();
            if (await element.isVisible({ timeout: 2000 })) {
              const ariaLabel = await element.getAttribute('aria-label') || '';
              console.log(`Found dial pad opener: "${ariaLabel}"`);
              await element.click();
              await this.page.waitForTimeout(2000);
              clickedOpener = true;
              
              // Verify dial pad actually opened
              dialPadVisible = await isDialPadVisible();
              if (dialPadVisible) {
                console.log('Dial pad opened successfully');
                break;
              } else {
                console.log(' Clicked opener but dial pad not visible, trying next selector...');
              }
            }
          } catch (e) {
            // Try next selector
          }
        }
        
        if (!clickedOpener) {
          console.log('Could not find dial pad opener button');
        }
      } else {
        console.log('Dial pad already visible');
      }
      
      // Final check - if dial pad still not visible, fail clearly
      if (!dialPadVisible) {
        throw new Error('Dial pad did not open. Cannot proceed with dialing. Check debug screenshot.');
      }

      // Now find the input field in the dial pad
      console.log('Looking for dial pad input field...');
      const numberInputSelectors = [
        'input[placeholder*="Enter a name"]',
        'input[placeholder*="enter a name"]',
        'input[placeholder*="name or number"]',
        'input[aria-label*="Phone number"]',
        'input[aria-label*="phone number"]',
        'input[placeholder*="Phone number"]',
        'input[placeholder*="phone number"]',
        'input[type="tel"]',
        'input[aria-label*="Enter"]',
        'input[aria-label*="enter"]',
        'input.gv-dial-input',
        '#dialpad-input',
        '[gv-id="dialpad-input"]'
      ];
      
      let numberInputFound = false;
      for (const selector of numberInputSelectors) {
        try {
          const elements = this.page.locator(selector);
          const count = await elements.count();
          
          // Try each matching input
          for (let i = 0; i < count; i++) {
            const element = elements.nth(i);
            if (await element.isVisible({ timeout: 2000 })) {
              const placeholder = await element.getAttribute('placeholder') || '';
              const ariaLabel = await element.getAttribute('aria-label') || '';
              const bbox = await element.boundingBox();
              
              console.log(`Found input: placeholder="${placeholder}", aria-label="${ariaLabel}", position=${bbox ? `x=${Math.round(bbox.x)}` : 'unknown'}`);
              
              // Click to focus
              await element.click();
              await this.page.waitForTimeout(500);
              
              // Clear and enter phone number
              await element.fill('');
              await this.page.waitForTimeout(300);
              await element.fill(phoneNumber);
              await this.page.waitForTimeout(500);
              
              // Verify the number was entered (normalize both by removing non-digits)
              const value = await element.inputValue();
              const valueDigits = value.replace(/[^\d]/g, '');
              const phoneDigits = phoneNumber.replace(/[^\d]/g, '');
              
              // Require exact match (both must be non-empty and equal)
              if (valueDigits.length > 0 && valueDigits === phoneDigits) {
                console.log(`Successfully entered phone number: ${phoneNumber} (displayed as: "${value}")`);
                numberInputFound = true;
                break;
              } else if (valueDigits.length === 0) {
                console.log(` Input field is empty, trying next input...`);
              } else {
                console.log(` Number mismatch. Expected: "${phoneDigits}", got: "${valueDigits}", trying next input...`);
              }
            }
          }
          
          if (numberInputFound) break;
        } catch (e) {
          // Try next selector
        }
      }
      
      if (!numberInputFound) {
        throw new Error('Could not find or fill dial pad input field. Dial pad may not have opened properly.');
      }
      
      // Take another screenshot after entering number
      try {
        await this.page.screenshot({ path: `debug-after-number-${Date.now()}.png`, fullPage: true });
        console.log('Screenshot after entering number saved');
      } catch (e) {}

      // Now click the call button to initiate the call
      console.log('Looking for call button to start the call...');
      await this.page.waitForTimeout(2000);
      
      // First, try to find ALL buttons and identify the call button more intelligently
      console.log('Searching for call button in dial pad area...');
      
      const callButtonSelectors = [
        // Main call button in dial pad - look for green phone icon button
        'button[aria-label="Call"]',
        'button[aria-label="Voice call"]',
        'button[aria-label="Make call"]',
        'button[aria-label*="Start call"]',
        'button[aria-label*="start call"]',
        'button[aria-label*="Call"]',
        'button[aria-label*="call"]',
        'div[role="button"][aria-label="Call"]',
        
        // Icon-based selectors - phone icon
        'button:has(gv-icon[icon="phone"])',
        'button:has(gv-icon[icon="call"])',
        'button:has(mat-icon:has-text("phone"))',
        'button:has(mat-icon:has-text("call"))',
        
        // Material button with specific classes
        'gv-icon-button[aria-label="Call"]',
        'button.gv-call-button',
        'button.call-button',
        
        // Try finding by icon color/style (green call button)
        'button[style*="rgb(26, 115, 232)"]', // Google blue
        'button[style*="rgb(15, 157, 88)"]'   // Google green
      ];
      
      let callInitiated = false;
      
      // Try each selector
      for (const selector of callButtonSelectors) {
        try {
          const elements = this.page.locator(selector);
          const count = await elements.count();
          
          for (let i = 0; i < count; i++) {
            const element = elements.nth(i);
            if (await element.isVisible({ timeout: 1000 })) {
              const ariaLabel = await element.getAttribute('aria-label') || '';
              const text = (await element.textContent() || '').trim();
              
              console.log(`Found button: selector="${selector}", aria-label="${ariaLabel}", text="${text}"`);
              
              // Strict filtering to avoid wrong buttons
              const rejectPatterns = [
                'learn more', 'settings', 'audio settings', 'video settings',
                'more options', 'menu', 'help', 'close', 'cancel', 'availability',
                'hide keypad', 'show keypad', 'search'
              ];
              
              const lowerLabel = ariaLabel.toLowerCase();
              const lowerText = text.toLowerCase();
              
              let shouldReject = false;
              for (const pattern of rejectPatterns) {
                if (lowerLabel.includes(pattern) || lowerText.includes(pattern)) {
                  console.log(`  REJECTED: Contains "${pattern}"`);
                  shouldReject = true;
                  break;
                }
              }
              
              if (shouldReject) continue;
              
              // Text should be very short for icon buttons
              if (text.length > 30) {
                console.log(`  REJECTED: Text too long (${text.length} chars)`);
                continue;
              }
              
              // Click it!
              console.log(`  CLICKING CALL BUTTON`);
              await element.click();
              callInitiated = true;
              break;
            }
          }
          
          if (callInitiated) break;
        } catch (e) {
          // Try next selector
        }
      }
      
      if (!callInitiated) {
        // Last resort: look for any button with a phone icon on the right side
        console.log('Trying alternative approach: looking for any phone icon button...');
        try {
          // Find all buttons with icons
          const iconButtons = this.page.locator('button:has(gv-icon), button:has(mat-icon), gv-icon-button');
          const count = await iconButtons.count();
          console.log(`Found ${count} icon buttons`);
          
          for (let i = 0; i < count; i++) {
            const btn = iconButtons.nth(i);
            if (await btn.isVisible({ timeout: 500 })) {
              const bbox = await btn.boundingBox();
              // Check if button is on the right side of screen (x > 600)
              if (bbox && bbox.x > 600) {
                const ariaLabel = await btn.getAttribute('aria-label') || '';
                console.log(`Right-side icon button: aria-label="${ariaLabel}", x=${bbox.x}`);
                
                // If it doesn't have a reject pattern, try clicking it
                if (!ariaLabel.toLowerCase().includes('settings') && 
                    !ariaLabel.toLowerCase().includes('help') &&
                    !ariaLabel.toLowerCase().includes('menu')) {
                  console.log(`  Trying this button`);
                  await btn.click();
                  callInitiated = true;
                  break;
                }
              }
            }
          }
        } catch (e) {
          console.error('Alternative approach failed:', e);
        }
      }
      
      if (!callInitiated) {
        // Debug: enumerate all buttons
        console.log(' Could not find call button. Enumerating all visible buttons:');
        try {
          const allButtons = this.page.locator('button:visible, div[role="button"]:visible');
          const count = await allButtons.count();
          console.log(`Found ${count} visible buttons on page:`);
          
          for (let i = 0; i < Math.min(count, 30); i++) {
            const btn = allButtons.nth(i);
            const ariaLabel = await btn.getAttribute('aria-label') || '';
            const text = (await btn.textContent() || '').trim().substring(0, 50);
            const tagName = await btn.evaluate(el => el.tagName);
            const bbox = await btn.boundingBox().catch(() => null);
            const pos = bbox ? `x=${Math.round(bbox.x)}, y=${Math.round(bbox.y)}` : 'no position';
            console.log(`  [${i}] <${tagName}> aria-label="${ariaLabel}", text="${text}", ${pos}`);
          }
        } catch (e) {
          console.error('Failed to enumerate buttons:', e);
        }
        
        throw new Error('Could not find call button in dial pad. Check debug screenshots.');
      }

      console.log(`Successfully initiated call to ${phoneNumber}`);
      
      // Wait for call to connect
      await this.page.waitForTimeout(3000);

      return true;
    } catch (error) {
      console.error(`Failed to dial ${phoneNumber}:`, error);
      
      // Take final error screenshot
      const screenshotPath = `debug-dial-error-${Date.now()}.png`;
      try {
        await this.page?.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`Debug screenshot saved to: ${screenshotPath}`);
      } catch (e) {
        // Ignore screenshot errors
      }
      
      throw error;
    }
  }

  async hangup() {
    if (!this.page) return;

    try {
      // Look for hangup/end call button
      const hangupButton = this.page.locator('[aria-label*="Hang up"], [aria-label*="End call"], button:has-text("End")').first();
      if (await hangupButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await hangupButton.click();
        await this.page.waitForTimeout(1000);
      }
    } catch (error) {
      console.error('Failed to hangup:', error);
    }
  }

  getPage(): Page | null {
    return this.page;
  }

  /**
   * Create a call state monitor for the current page (LEGACY - use createCallDetector instead)
   */
  createCallStateMonitor(config?: Partial<CallMonitorConfig>): CallStateMonitor {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
    return new CallStateMonitor(this.page, config);
  }

  /**
   * Create a robust call state detector for the current page (NEW - state machine based)
   */
  createCallDetector(config?: Partial<TimeoutConfig>): CallStateDetector {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }
    return createCallDetector(this.page, config);
  }

  async close() {
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.page = null;
      this.isLoggedIn = false;
      console.log('Browser context closed');
    }
  }

  async screenshot(path: string) {
    if (this.page) {
      await this.page.screenshot({ path, fullPage: true });
      console.log(`Screenshot saved to ${path}`);
    }
  }
}

// Singleton instance
let dialerInstance: GoogleVoiceDialer | null = null;

interface GetDialerOptions {
  audioInputDevice?: string;
  audioOutputDevice?: string;
  loginRequiredCallback?: () => void | Promise<void>;
  loginSuccessCallback?: () => void | Promise<void>;
  shouldContinueCallback?: () => Promise<boolean>;
}

export async function getDialer(
  audioInputDevice?: string, 
  audioOutputDevice?: string,
  callbacks?: GetDialerOptions
): Promise<GoogleVoiceDialer> {
  const email = process.env.GOOGLE_VOICE_EMAIL;
  const password = process.env.GOOGLE_VOICE_PASSWORD;

  if (!email || !password) {
    throw new Error('Google Voice credentials not configured. Set GOOGLE_VOICE_EMAIL and GOOGLE_VOICE_PASSWORD environment variables.');
  }

  if (!dialerInstance) {
    dialerInstance = new GoogleVoiceDialer({ email, password });
    
    // Set callbacks BEFORE initialization so they're available during login check
    if (callbacks?.loginRequiredCallback) {
      dialerInstance.setLoginRequiredCallback(callbacks.loginRequiredCallback);
    }
    if (callbacks?.loginSuccessCallback) {
      dialerInstance.setLoginSuccessCallback(callbacks.loginSuccessCallback);
    }
    if (callbacks?.shouldContinueCallback) {
      dialerInstance.setShouldContinueCallback(callbacks.shouldContinueCallback);
    }
    
    await dialerInstance.initialize(audioInputDevice, audioOutputDevice);
    await dialerInstance.login();
  }

  return dialerInstance;
}

export async function closeDialer() {
  if (dialerInstance) {
    await dialerInstance.close();
    dialerInstance = null;
  }
}

export async function automatedDial(phoneNumber: string): Promise<boolean> {
  const dialer = await getDialer();
  return await dialer.dialNumber(phoneNumber);
}
