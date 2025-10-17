import { chromium, type Browser, type Page } from 'playwright';

interface GoogleVoiceConfig {
  email: string;
  password: string;
}

class GoogleVoiceDialer {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private isLoggedIn: boolean = false;
  private config: GoogleVoiceConfig;

  constructor(config: GoogleVoiceConfig) {
    this.config = config;
  }

  async initialize(audioInputDevice?: string, audioOutputDevice?: string) {
    try {
      const launchArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
        '--enable-features=VaapiVideoDecoder'
      ];

      if (audioInputDevice) {
        launchArgs.push(`--use-fake-device-for-media-stream`);
        launchArgs.push(`--audio-input-device=${audioInputDevice}`);
      }

      if (audioOutputDevice) {
        launchArgs.push(`--audio-output-device=${audioOutputDevice}`);
      }

      this.browser = await chromium.launch({
        headless: audioInputDevice || audioOutputDevice ? false : true,
        args: launchArgs
      });

      this.page = await this.browser.newPage();

      const context = this.page.context();
      await context.grantPermissions(['microphone', 'camera', 'speaker'], { 
        origin: 'https://voice.google.com' 
      });
      
      await this.page.setViewportSize({ width: 1280, height: 720 });
      await this.page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      });

      console.log('Browser initialized successfully', {
        audioInput: audioInputDevice || 'none',
        audioOutput: audioOutputDevice || 'none',
        headless: audioInputDevice || audioOutputDevice ? false : true
      });
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  async login() {
    if (!this.page) throw new Error('Browser not initialized');

    try {
      console.log('Navigating to Google Voice...');
      await this.page.goto('https://voice.google.com', { 
        waitUntil: 'networkidle',
        timeout: 60000 
      });

      // Check if already logged in
      const isAlreadyLoggedIn = await this.page.url().includes('voice.google.com/u/');
      if (isAlreadyLoggedIn) {
        console.log('Already logged in to Google Voice');
        this.isLoggedIn = true;
        return;
      }

      // Click sign in button if present
      const signInButton = await this.page.locator('text=Sign in').first();
      if (await signInButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await signInButton.click();
        await this.page.waitForTimeout(2000);
      }

      // Enter email
      console.log('Entering email...');
      const emailInput = this.page.locator('input[type="email"]');
      await emailInput.waitFor({ state: 'visible', timeout: 10000 });
      await emailInput.fill(this.config.email);
      await this.page.keyboard.press('Enter');
      await this.page.waitForTimeout(3000);

      // Enter password
      console.log('Entering password...');
      const passwordInput = this.page.locator('input[type="password"]');
      await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
      await passwordInput.fill(this.config.password);
      await this.page.keyboard.press('Enter');

      // Wait for navigation to Google Voice
      await this.page.waitForURL('**/voice.google.com/**', { timeout: 30000 });
      
      console.log('Successfully logged in to Google Voice');
      this.isLoggedIn = true;
    } catch (error) {
      console.error('Login failed:', error);
      throw new Error('Failed to login to Google Voice');
    }
  }

  async dialNumber(phoneNumber: string): Promise<boolean> {
    if (!this.page) throw new Error('Browser not initialized');
    if (!this.isLoggedIn) await this.login();

    try {
      console.log(`Dialing number: ${phoneNumber}`);

      // Navigate to the dialer/messages tab
      await this.page.goto('https://voice.google.com/u/0/messages', {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      // Click on "New conversation" or dial button
      const newConversationButton = this.page.locator('[aria-label*="New"], [data-test*="new"], button:has-text("New")').first();
      await newConversationButton.waitFor({ state: 'visible', timeout: 10000 });
      await newConversationButton.click();
      await this.page.waitForTimeout(1000);

      // Type the phone number in the search/dial field
      const dialInput = this.page.locator('input[aria-label*="phone"], input[placeholder*="phone"], input[type="tel"]').first();
      await dialInput.waitFor({ state: 'visible', timeout: 10000 });
      await dialInput.fill(phoneNumber);
      await this.page.waitForTimeout(1000);

      // Click the call button
      const callButton = this.page.locator('[aria-label*="Call"], button:has-text("Call"), [data-test*="call"]').first();
      await callButton.waitFor({ state: 'visible', timeout: 5000 });
      await callButton.click();

      console.log(`Successfully initiated call to ${phoneNumber}`);
      
      // Wait a moment for the call to connect
      await this.page.waitForTimeout(2000);

      return true;
    } catch (error) {
      console.error(`Failed to dial ${phoneNumber}:`, error);
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

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.isLoggedIn = false;
      console.log('Browser closed');
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

export async function getDialer(audioInputDevice?: string, audioOutputDevice?: string): Promise<GoogleVoiceDialer> {
  const email = process.env.GOOGLE_VOICE_EMAIL;
  const password = process.env.GOOGLE_VOICE_PASSWORD;

  if (!email || !password) {
    throw new Error('Google Voice credentials not configured. Set GOOGLE_VOICE_EMAIL and GOOGLE_VOICE_PASSWORD environment variables.');
  }

  if (!dialerInstance) {
    dialerInstance = new GoogleVoiceDialer({ email, password });
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
