import type { Page } from 'playwright';

export enum CallState {
  IDLE = 'idle',
  DIALING = 'dialing',
  RINGING = 'ringing',
  CONNECTED = 'connected',
  VOICEMAIL = 'voicemail',
  ENDED = 'ended',
  FAILED = 'failed'
}

export interface CallStateChange {
  state: CallState;
  timestamp: Date;
  reason?: string;
}

export interface CallMonitorConfig {
  dialingTimeout: number; // Max time in dialing state before abort (default: 15s)
  ringingTimeout: number; // Max time to wait for pickup (default: 30s)
  voicemailTimeout: number; // Time to wait after detecting voicemail prompt (default: 5s)
  inactivityTimeout: number; // Max time without state change before abort (default: 20s)
  maxCallDuration: number; // Maximum total call duration (default: 10 minutes)
  hangupOnVoicemail: boolean; // If true, hang up immediately on voicemail
  enableAudioFallback: boolean; // Use silence detection as fallback
}

const DEFAULT_CONFIG: CallMonitorConfig = {
  dialingTimeout: 30000, // 30 seconds (increased from 15s for robustness)
  ringingTimeout: 45000, // 45 seconds (increased from 30s)
  voicemailTimeout: 5000, // 5 seconds
  inactivityTimeout: 15000, // 15 seconds (reduced from 20s for faster error detection)
  maxCallDuration: 600000, // 10 minutes
  hangupOnVoicemail: true,
  enableAudioFallback: true
};

export class CallStateMonitor {
  private page: Page;
  private config: CallMonitorConfig;
  private currentState: CallState = CallState.IDLE;
  private observer: any = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private ringingTimer: NodeJS.Timeout | null = null;
  private voicemailTimer: NodeJS.Timeout | null = null;
  private dialingTimer: NodeJS.Timeout | null = null;
  private inactivityTimer: NodeJS.Timeout | null = null;
  private maxDurationTimer: NodeJS.Timeout | null = null;
  private lastStateChangeTime: number = Date.now();
  private lastCallTimer: string = '';
  private stateChangeCallbacks: ((change: CallStateChange) => void)[] = [];
  private isAborting: boolean = false;
  private consoleListener: ((msg: any) => void) | null = null;

  constructor(page: Page, config: Partial<CallMonitorConfig> = {}) {
    this.page = page;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start monitoring the call state
   */
  async startMonitoring(initialState: CallState = CallState.DIALING): Promise<void> {
    this.currentState = initialState;
    this.lastStateChangeTime = Date.now();
    this.isAborting = false;
    console.log(`[CallMonitor] Starting call state monitoring (initial state: ${initialState})`);

    // CRITICAL: Forward browser console logs to server console for visibility
    // Remove previous listener if exists to avoid duplicates
    if (this.consoleListener) {
      this.page.off('console', this.consoleListener);
    }
    
    this.consoleListener = (msg: any) => {
      const text = msg.text();
      // Only forward logs from our injected script to avoid spam
      if (text.includes('[Browser]')) {
        console.log(text);
      }
    };
    
    this.page.on('console', this.consoleListener);

    // Inject MutationObserver and polling logic into the browser
    await this.injectCallStateWatcher();

    // Start server-side polling as backup
    this.startPolling();

    // Start watchdog timers
    this.startDialingTimeout();
    this.startInactivityWatchdog();
    this.startMaxDurationTimer();

    // Set initial timeout for ringing state
    if (initialState === CallState.DIALING || initialState === CallState.RINGING) {
      this.startRingingTimeout();
    }

    this.emitStateChange(initialState, 'Monitoring started');
  }

  /**
   * Stop monitoring and cleanup
   */
  async stopMonitoring(): Promise<void> {
    console.log('[CallMonitor] Stopping call state monitoring');
    
    // Clear all timers
    this.clearAllTimers();

    // Remove console listener to prevent duplicate logs
    if (this.consoleListener) {
      this.page.off('console', this.consoleListener);
      this.consoleListener = null;
    }

    // Disconnect browser observer and clear interval
    try {
      await this.page.evaluate(() => {
        const win = window as any;
        if (win.callStateObserver) {
          win.callStateObserver.disconnect();
          delete win.callStateObserver;
        }
        if (win.callStateInterval) {
          clearInterval(win.callStateInterval);
          delete win.callStateInterval;
        }
        delete win.callStateData;
      });
    } catch (error) {
      // Ignore errors during cleanup
    }

    this.stateChangeCallbacks = [];
  }

  /**
   * Clear all timers
   */
  private clearAllTimers(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    if (this.ringingTimer) {
      clearTimeout(this.ringingTimer);
      this.ringingTimer = null;
    }
    if (this.voicemailTimer) {
      clearTimeout(this.voicemailTimer);
      this.voicemailTimer = null;
    }
    if (this.dialingTimer) {
      clearTimeout(this.dialingTimer);
      this.dialingTimer = null;
    }
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
  }

  /**
   * Register callback for state changes
   */
  onStateChange(callback: (change: CallStateChange) => void): void {
    this.stateChangeCallbacks.push(callback);
  }

  /**
   * Get current call state
   */
  getCurrentState(): CallState {
    return this.currentState;
  }

  /**
   * Physically click the hangup button to end the call with multiple fallback strategies
   */
  async hangupCall(): Promise<void> {
    try {
      console.log('[CallMonitor] Attempting to hangup call...');
      
      // Strategy 1: Try multiple selectors for hangup button (expanded list)
      const selectors = [
        'button[aria-label*="End call"]',
        'button[aria-label*="Hang up"]',
        'button[aria-label*="end call"]',
        'button[aria-label*="hang up"]',
        'button.hangup-button',
        '[gv-id="call-hangup"]',
        'button[data-action="hangup"]',
        'button.end-call',
        '[gv-id="hangup"]',
        'button[aria-label*="End Call"]',  // Capitalized variations
        'button[aria-label*="Hangup"]',
        'button[aria-label*="HANG UP"]'
      ];

      for (const selector of selectors) {
        try {
          const button = await this.page.$(selector);
          if (button) {
            await button.click();
            console.log(`[CallMonitor] ✓ Clicked hangup button using selector: ${selector}`);
            await this.page.waitForTimeout(1000); // Give UI time to update
            
            // Verify hangup worked
            const callUIGone = await this.verifyCallEnded();
            if (callUIGone) {
              console.log('[CallMonitor] ✓ Hangup successful - call UI disappeared');
              return;
            }
            console.log('[CallMonitor] Hangup button clicked but call UI still present, trying next method...');
          }
        } catch (err) {
          // Try next selector
        }
      }

      // Strategy 2: Try ESC key to close call dialog
      console.log('[CallMonitor] Button click failed, trying ESC key...');
      try {
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(1000);
        
        const callUIGone = await this.verifyCallEnded();
        if (callUIGone) {
          console.log('[CallMonitor] ✓ ESC key successfully ended call');
          return;
        }
      } catch (err) {
        console.log('[CallMonitor] ESC key failed:', err);
      }

      // Strategy 3: Try clicking outside the call UI (may close dialog)
      console.log('[CallMonitor] Trying to click outside call dialog...');
      try {
        await this.page.mouse.click(50, 50); // Click top-left corner
        await this.page.waitForTimeout(1000);
        
        const callUIGone = await this.verifyCallEnded();
        if (callUIGone) {
          console.log('[CallMonitor] ✓ Clicking outside dialog ended call');
          return;
        }
      } catch (err) {
        console.log('[CallMonitor] Clicking outside failed:', err);
      }

      // Strategy 4: Reload page as last resort
      console.log('[CallMonitor] ⚠️  All strategies failed, reloading page as last resort...');
      try {
        await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
        await this.page.waitForTimeout(2000);
        console.log('[CallMonitor] ✓ Page reloaded - call should be terminated');
      } catch (err) {
        console.error('[CallMonitor] ❌ Page reload failed:', err);
      }

    } catch (error) {
      console.error('[CallMonitor] Error during hangup attempt:', error);
    }
  }

  /**
   * Verify that the call UI has actually disappeared (call ended)
   */
  private async verifyCallEnded(): Promise<boolean> {
    try {
      const callUISelectors = [
        '[gv-id="ongoing-call-pane"]',
        '[data-call-pane]',
        '.call-container',
        '[data-call-active]',
        'button[aria-label*="End call"]',
        'button[aria-label*="Hang up"]',
        'button[aria-label*="end call"]',
        'button[aria-label*="hang up"]'
      ];

      for (const selector of callUISelectors) {
        const element = await this.page.$(selector);
        if (element) {
          const isVisible = await element.isVisible();
          if (isVisible) {
            return false; // Call UI still present
          }
        }
      }

      return true; // No call UI found - call ended
    } catch (error) {
      // Assume call ended if check fails
      return true;
    }
  }

  /**
   * Inject call state watcher into the browser
   */
  private async injectCallStateWatcher(): Promise<void> {
    const watcherScript = `
      (function() {
        // Storage for call state data
        window.callStateData = {
          lastState: 'dialing', // Start with dialing state
          lastUpdate: Date.now(),
          statusText: '',
          callTimer: '',
          hasVoicemailPrompt: false,
          callEverStarted: false, // Track if we've ever seen an active call
          waitingForUIStart: Date.now(), // Track when we started waiting for UI
          lastLogTime: 0, // Reduce log spam - only log every second
          lastCallUIActive: false, // Track previous UI active state for change detection
          errorDetected: false, // Track if we've detected a Google Voice error
          errorMessage: '' // Store the error message for logging
        };

        // Selectors to watch (comprehensive list for all scenarios)
        const SELECTORS = {
          // Main call UI elements (expanded with more patterns)
          callPane: '[gv-id="ongoing-call-pane"], [data-call-pane], .gv-call-pane, gv-call-pane',
          callContainer: '.call-container, .ongoing-call, [data-call-active], .active-call',
          
          // Status indicators (more comprehensive)
          statusChip: '[aria-live="polite"], [aria-live="assertive"], .call-status-chip, .status-text',
          statusText: '.call-status, [data-call-status], .status, [data-status]',
          
          // Call timer (CRITICAL: indicates active call) - expanded patterns
          callTimer: '.call-timer, [data-call-duration], .duration, .call-duration, .timer, .elapsed-time',
          
          // Buttons (more patterns for hangup detection)
          hangupButton: 'button.hangup-button, button[data-action="hangup"], button.end-call, [gv-id="hangup"]',
          
          // Voicemail detection (expanded)
          voicemailPrompt: '.voicemail-prompt, [data-voicemail-prompt]',
          voicemailIndicator: '.voicemail-detected, [data-voicemail], .voicemail',
          
          // Call banner/header (more comprehensive)
          callBanner: '.call-desktop, .call-header, [data-call-banner], .call-ui, .active-call-header',
          
          // Ringing indicators (expanded)
          ringingIndicator: '[data-call-ringing], .ringing, .call-ringing, .dialing',
          
          // Connection indicators (CRITICAL: proves call is connected)
          connectedIndicator: '[data-call-connected], .connected, .call-connected, .in-call',
          
          // Failure/busy indicators (expanded)
          busyIndicator: '.call-failed, [data-call-failed]',
          noAnswerIndicator: '.no-answer, [data-no-answer]',
          
          // Audio elements (NEW: detect active call via audio)
          audioElement: 'audio[src], audio[srcObject]',
          
          // Video elements (some calls may have video)
          videoElement: 'video[src], video[srcObject]',
          
          // ERROR POPUP DETECTION (NEW - CRITICAL for catching Google Voice errors)
          errorDialog: '[role="dialog"], [role="alertdialog"], .error-dialog, .alert-dialog',
          errorMessage: '.error-message, [data-error], .gv-error, .error-text',
          micErrorIndicator: '[data-error*="mic"], [data-error*="microphone"], [aria-label*="microphone"]',
          audioErrorIndicator: '[data-error*="audio"], [data-error*="sound"]',
          closeButton: 'button[aria-label*="Close"], button[aria-label*="close"], button[aria-label*="Dismiss"], button[aria-label*="dismiss"]'
        };
        
        // Helper to check if text matches case-insensitively
        function matchesTextCaseInsensitive(element, textPatterns) {
          if (!element) return false;
          const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
          const textContent = (element.textContent || '').toLowerCase();
          
          for (const pattern of textPatterns) {
            if (ariaLabel.includes(pattern.toLowerCase()) || textContent.includes(pattern.toLowerCase())) {
              return true;
            }
          }
          return false;
        }

        // Helper to check for audio/video elements (strong signal of active call)
        function hasActiveMediaElements() {
          const audioElements = document.querySelectorAll(SELECTORS.audioElement);
          const videoElements = document.querySelectorAll(SELECTORS.videoElement);
          
          // Check if any audio/video elements are actually playing
          for (const el of audioElements) {
            if (!el.paused && !el.ended) {
              console.log('[Browser] 🎵 Active audio element detected - call is connected!');
              return true;
            }
          }
          
          for (const el of videoElements) {
            if (!el.paused && !el.ended) {
              console.log('[Browser] 🎥 Active video element detected - call is connected!');
              return true;
            }
          }
          
          // Also check for elements with src/srcObject (even if not playing yet)
          if (audioElements.length > 0 || videoElements.length > 0) {
            console.log('[Browser] 📡 Media elements present (audio: ' + audioElements.length + ', video: ' + videoElements.length + ')');
            return true;
          }
          
          return false;
        }
        
        // Helper to find buttons by aria-label or text content (case-insensitive)
        function findButtonByText(textPatterns) {
          const allButtons = document.querySelectorAll('button');
          for (const button of allButtons) {
            if (matchesTextCaseInsensitive(button, textPatterns)) {
              return button;
            }
          }
          return null;
        }

        // NEW: Helper to detect Google Voice error popups/dialogs
        function detectGoogleVoiceError() {
          const data = window.callStateData;
          
          // Check for error dialogs
          const errorDialogs = document.querySelectorAll(SELECTORS.errorDialog);
          
          for (const dialog of errorDialogs) {
            if (!dialog) continue;
            
            // Check if dialog is visible
            const style = window.getComputedStyle(dialog);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            
            // Get all text content from the dialog
            const dialogText = (dialog.textContent || '').toLowerCase();
            
            // Check for common Google Voice error messages
            const errorPatterns = [
              'mic not working',
              'microphone is not working',
              'no sound was detected',
              'no sound detected',
              'microphone not detected',
              'audio device error',
              'unable to access microphone',
              'microphone access denied',
              'audio not available',
              'sound not detected through your microphone',
              'call failed',
              'unable to place call',
              'connection error'
            ];
            
            for (const pattern of errorPatterns) {
              if (dialogText.includes(pattern)) {
                // Found error dialog!
                console.log('[Browser] ❌❌❌ GOOGLE VOICE ERROR DETECTED: "' + pattern + '"');
                console.log('[Browser] Full error text: ' + dialogText.substring(0, 200));
                
                data.errorDetected = true;
                data.errorMessage = pattern;
                data.lastState = 'failed';
                data.lastUpdate = Date.now();
                
                return true;
              }
            }
          }
          
          // Also check for error messages outside of dialogs (inline errors)
          const errorMessages = document.querySelectorAll(SELECTORS.errorMessage);
          for (const errorEl of errorMessages) {
            if (!errorEl) continue;
            
            const errorText = (errorEl.textContent || '').toLowerCase();
            if (errorText.includes('mic') || errorText.includes('microphone') || 
                errorText.includes('audio') || errorText.includes('sound')) {
              console.log('[Browser] ⚠️  Inline error detected: ' + errorText.substring(0, 100));
              
              data.errorDetected = true;
              data.errorMessage = errorText.substring(0, 100);
              data.lastState = 'failed';
              data.lastUpdate = Date.now();
              
              return true;
            }
          }
          
          return false;
        }

        // Helper to extract call state from DOM
        function detectCallState() {
          const data = window.callStateData;
          
          // PRIORITY 1: Check for Google Voice errors FIRST (fail fast)
          // This detects "Mic not working" and other error popups immediately
          const hasError = detectGoogleVoiceError();
          if (hasError) {
            console.log('[Browser] ❌ Error detected - aborting call state detection');
            return; // Error already set state to 'failed', no need to continue
          }
          
          // Helper function to check if an element is ACTUALLY VISIBLE (not just in DOM)
          function isElementVisible(element) {
            if (!element) return false;
            
            // Check if element is hidden via CSS
            const style = window.getComputedStyle(element);
            if (style.display === 'none') return false;
            if (style.visibility === 'hidden') return false;
            if (style.opacity === '0') return false;
            
            // Check if element has dimensions
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return false;
            
            return true;
          }
          
          // MULTI-METHOD DETECTION: Try multiple ways to detect VISIBLE call UI
          // CRITICAL: Check visibility on EVERY poll, don't cache results
          
          // Method 1: Check for VISIBLE call pane
          let callPane = null;
          let callPaneVisible = false;
          const callPaneSelectors = SELECTORS.callPane.split(', ');
          for (const selector of callPaneSelectors) {
            const element = document.querySelector(selector);
            if (element && isElementVisible(element)) {
              callPane = element;
              callPaneVisible = true;
              console.log('[Browser] ✓ Found VISIBLE call pane with selector: ' + selector);
              break;
            }
          }
          
          // Method 2: Check for VISIBLE call container
          let callContainer = null;
          let callContainerVisible = false;
          const containerSelectors = SELECTORS.callContainer.split(', ');
          for (const selector of containerSelectors) {
            const element = document.querySelector(selector);
            if (element && isElementVisible(element)) {
              callContainer = element;
              callContainerVisible = true;
              console.log('[Browser] ✓ Found VISIBLE call container with selector: ' + selector);
              break;
            }
          }
          
          // Method 3: Check for active media elements (STRONG signal)
          const hasMedia = hasActiveMediaElements();
          
          // Method 4: Check for VISIBLE hangup button
          let hangupButton = document.querySelector(SELECTORS.hangupButton);
          let hangupButtonVisible = false;
          if (hangupButton && isElementVisible(hangupButton)) {
            hangupButtonVisible = true;
          } else {
            // Try case-insensitive text matching
            hangupButton = findButtonByText(['End call', 'Hang up', 'hangup', 'disconnect']);
            if (hangupButton && isElementVisible(hangupButton)) {
              hangupButtonVisible = true;
            }
          }
          
          // PRIORITY #1: Check for idle screen FIRST (before container checks)
          // If we see VISIBLE "all caught up" or "Hi [name]!", the call has FAILED - period.
          // CRITICAL: Must check visibility - Google Voice keeps hidden idle markup in DOM
          let foundIdleMessage = false;
          
          try {
            const elements = document.querySelectorAll('div, span, p, h1, h2');
            for (const el of elements) {
              // MUST verify element is actually visible, not just in DOM
              if (!isElementVisible(el)) continue;
              
              const text = el.textContent || '';
              // Check for "Hi daniel!" or similar greeting
              if (text.includes('Hi ') && text.includes('!') && text.length < 50) {
                console.log('[Browser] 🔍 Found VISIBLE idle greeting: "' + text.trim() + '"');
                foundIdleMessage = true;
                break;
              }
              // Check for "You're all caught up" message (PRIMARY failure indicator)
              if (text.includes("You're all caught up") || text.includes("all caught up")) {
                console.log('[Browser] 🔍 Found VISIBLE "all caught up" message');
                foundIdleMessage = true;
                break;
              }
            }
          } catch (e) {
            console.log('[Browser] Error checking for idle screen: ' + e);
          }
          
          // If VISIBLE idle screen detected, call has failed/ended - STOP HERE
          if (foundIdleMessage) {
            if (!data.callEverStarted) {
              console.log('[Browser] ❌ INSTANT FAILURE: Idle screen visible - call was rejected/blocked by Google Voice');
              console.log('[Browser]    Call never connected (likely audio/permissions/rate limit issue)');
              data.lastState = 'failed';
            } else {
              console.log('[Browser] ✓ Call ended - returned to idle screen');
              data.lastState = 'ended';
            }
            data.lastUpdate = Date.now();
            return;
          }
          
          // Determine if call UI is VISIBLE using ANY method
          const callUIActive = callPaneVisible || callContainerVisible || hasMedia || hangupButtonVisible;
          
          // Log visibility status for debugging
          const now = Date.now();
          if (now - data.lastLogTime > 1000 || callUIActive !== data.lastCallUIActive) {
            console.log('[Browser] 🔍 UI Visibility: pane=' + callPaneVisible + ', container=' + callContainerVisible + ', media=' + hasMedia + ', hangup=' + hangupButtonVisible + ' → Active=' + callUIActive);
            data.lastLogTime = now;
            data.lastCallUIActive = callUIActive;
          }
          
          // Calculate how long we've been waiting for call UI
          const waitingTime = Date.now() - data.waitingForUIStart;
          
          // Only mark as ended if we've previously seen an active call AND UI is now gone
          if (!callUIActive && data.callEverStarted) {
            console.log('[Browser] Call UI disappeared - marking as ended');
            data.lastState = 'ended';
            data.lastUpdate = Date.now();
            return;
          } else if (!callUIActive) {
            // Call UI not visible yet - check for timeout
            // REDUCED timeout from 3s to 2s for even faster failure detection
            if (waitingTime > 2000) {
              console.log('[Browser] ❌ FAST TIMEOUT: No call UI appeared after ' + Math.round(waitingTime / 1000) + 's');
              console.log('[Browser]    This indicates call was rejected immediately (likely audio/permissions issue)');
              data.lastState = 'failed';
              data.lastUpdate = Date.now();
              return;
            }
            
            // Reduce log spam - only log every 2 seconds (reduced from 5s for better visibility)
            const now = Date.now();
            if (now - data.lastLogTime > 2000) {
              console.log('[Browser] ⏳ Waiting for call UI... (' + Math.round(waitingTime / 1000) + 's) - callPane=' + !!callPane + ', container=' + !!callContainer + ', media=' + hasMedia + ', hangup=' + !!hangupButton);
              data.lastLogTime = now;
            }
            return;
          }
          
          // If we see any call UI, mark that call has started
          if (!data.callEverStarted) {
            console.log('[Browser] ✓✓✓ Call UI detected for first time - call has started!');
            console.log('[Browser]    callPane=' + !!callPane + ', callContainer=' + !!callContainer + ', hasMedia=' + hasMedia + ', hangupButton=' + !!hangupButton);
            data.callEverStarted = true;
            data.waitingForUIStart = 0; // Reset timeout
          }

          // Check status text from multiple sources
          const statusChip = document.querySelector(SELECTORS.statusChip);
          const statusTextEl = document.querySelector(SELECTORS.statusText);
          if (statusChip) {
            data.statusText = statusChip.textContent?.toLowerCase() || '';
            console.log('[Browser] Status detected: ' + data.statusText);
          } else if (statusTextEl) {
            data.statusText = statusTextEl.textContent?.toLowerCase() || '';
            console.log('[Browser] Status detected: ' + data.statusText);
          }
          
          // Check for busy/no answer indicators
          const busyIndicator = document.querySelector(SELECTORS.busyIndicator);
          const noAnswerIndicator = document.querySelector(SELECTORS.noAnswerIndicator);
          if (busyIndicator || noAnswerIndicator) {
            console.log('[Browser] Call failed - busy or no answer');
            data.lastState = 'failed';
            data.lastUpdate = Date.now();
            return;
          }

          // Check for call timer (CRITICAL: indicates active call with time elapsed)
          const callTimerSelectors = SELECTORS.callTimer.split(', ');
          let callTimer = null;
          for (const selector of callTimerSelectors) {
            callTimer = document.querySelector(selector);
            if (callTimer) {
              data.callTimer = callTimer.textContent || '';
              console.log('[Browser] Found call timer: "' + data.callTimer + '" with selector: ' + selector);
              
              // Check if timer shows elapsed time (indicates connected call)
              if (data.callTimer.match(/\\d+:\\d+/)) {
                console.log('[Browser] ✅ Call timer detected with time format - CONNECTED!');
                data.lastState = 'connected';
                data.lastUpdate = Date.now();
                return;
              }
              break;
            }
          }
          
          // NEW: Check for active media as a signal of connected call
          // If we have active audio/video, the call must be connected
          if (hasMedia && data.lastState !== 'connected') {
            console.log('[Browser] ✅ Active media detected - call is CONNECTED!');
            data.lastState = 'connected';
            data.lastUpdate = Date.now();
            return;
          }
          
          // NEW: Check for explicit "connected" indicator
          const connectedIndicator = document.querySelector(SELECTORS.connectedIndicator);
          if (connectedIndicator) {
            console.log('[Browser] ✅ Connected indicator found - call is CONNECTED!');
            data.lastState = 'connected';
            data.lastUpdate = Date.now();
            return;
          }

          // Check for voicemail prompt (be specific to avoid false positives)
          const voicemailPrompt = document.querySelector(SELECTORS.voicemailPrompt);
          const statusLower = data.statusText.toLowerCase();
          const isVoicemail = voicemailPrompt || 
                              statusLower.includes('leave a voicemail') || 
                              statusLower.includes('leave a message') ||
                              statusLower.includes('voicemail greeting');
          
          if (isVoicemail) {
            data.hasVoicemailPrompt = true;
            data.lastState = 'voicemail';
            data.lastUpdate = Date.now();
            return;
          }

          // Check for hangup button (already checked above, reuse)
          // If hangupButton is null at this point, the call might have ended
          if (!hangupButton && !hasMedia) {
            // Only mark as ended if we also don't have media
            data.lastState = 'ended';
            data.lastUpdate = Date.now();
            return;
          }

          // Check status text for known states
          if (data.statusText.includes('calling') || data.statusText.includes('dialing')) {
            data.lastState = 'dialing';
          } else if (data.statusText.includes('ringing') || data.statusText.includes('connecting')) {
            data.lastState = 'ringing';
          } else if (data.statusText.includes('connected') || data.statusText.includes('in call')) {
            data.lastState = 'connected';
          } else if (data.statusText.includes('busy') || data.statusText.includes('failed') || data.statusText.includes('unavailable')) {
            data.lastState = 'failed';
          } else if (hangupButton) {
            // If hangup button exists but no clear state, assume ringing
            data.lastState = 'ringing';
          }

          data.lastUpdate = Date.now();
        }

        // Setup MutationObserver (for event-driven detection)
        const observer = new MutationObserver(function(mutations) {
          detectCallState();
        });

        // Observe the entire document for changes
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['aria-label', 'aria-live', 'class', 'style', 'hidden']
        });

        window.callStateObserver = observer;
        
        // CRITICAL: Add aggressive interval-based polling (100ms = 10x per second)
        // This ensures we catch state changes even if MutationObserver doesn't fire
        // This is the PRIMARY detection mechanism for instant failures
        const pollingInterval = setInterval(function() {
          detectCallState();
        }, 100);
        
        window.callStateInterval = pollingInterval;
        
        // Initial state detection
        detectCallState();
        
        console.log('[Browser] ✅ Call state watcher initialized with 100ms aggressive polling (10x/sec)');
      })();
    `;

    try {
      await this.page.evaluate(watcherScript);
      console.log('[CallMonitor] Call state watcher injected into browser');
      
      // Test console forwarding
      await this.page.evaluate(() => {
        console.log('[Browser] TEST: Console forwarding active ✓');
      });
      
      // Give console listener time to capture logs
      await this.page.waitForTimeout(100);
    } catch (error) {
      console.error('[CallMonitor] Failed to inject call state watcher:', error);
      throw error;
    }
  }

  /**
   * Start polling the browser for call state
   */
  private startPolling(): void {
    this.pollingInterval = setInterval(async () => {
      try {
        const stateData = await this.page.evaluate(() => {
          const win = window as any;
          return win.callStateData || null;
        });

        if (stateData) {
          await this.handleStateUpdate(stateData);
        }
      } catch (error) {
        console.error('[CallMonitor] Error during polling:', error);
      }
    }, 100); // Poll every 100ms to match browser-side detection (10x/sec for <200ms total latency)
  }

  /**
   * Handle state update from browser
   */
  private async handleStateUpdate(stateData: any): Promise<void> {
    const detectedState = this.mapBrowserState(stateData.lastState);

    // Check for errors detected by browser and log prominently
    if (stateData.errorDetected && stateData.errorMessage) {
      console.log(`[CallMonitor] ❌❌❌ GOOGLE VOICE ERROR: "${stateData.errorMessage}"`);
      console.log(`[CallMonitor] This is likely a Virtual Audio Cable configuration issue`);
    }

    // Log all state data for debugging (only if not spamming)
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastStateChangeTime;
    
    // Reduce spam: Only log every 5 seconds if state hasn't changed
    if (detectedState !== this.currentState || timeSinceLastUpdate > 5000) {
      console.log(`[CallMonitor] Browser state: ${stateData.lastState}, Current: ${this.currentState}, Status: "${stateData.statusText}", Timer: "${stateData.callTimer}", CallStarted: ${stateData.callEverStarted}, Error: ${stateData.errorDetected}`);
    }

    // Reset inactivity watchdog ONLY if call timer actually changed
    // This detects real browser activity while catching frozen/stuck states
    const currentTimer = stateData.callTimer || '';
    if (currentTimer !== this.lastCallTimer) {
      this.lastCallTimer = currentTimer;
      this.resetInactivityWatchdog();
    }

    // Only process if state changed
    if (detectedState === this.currentState) {
      return;
    }

    const previousState = this.currentState;
    this.currentState = detectedState;

    console.log(`[CallMonitor] 🔄 State transition: ${previousState} → ${detectedState}`);
    if (stateData.errorDetected) {
      console.log(`[CallMonitor] Error reason: "${stateData.errorMessage}"`);
    } else {
      console.log(`[CallMonitor] Status text: "${stateData.statusText}"`);
    }

    // 📸 Take screenshot on state transitions for debugging
    await this.takeDebugScreenshot(`state-${detectedState}-from-${previousState}`);

    // Reset inactivity watchdog on any state change
    this.resetInactivityWatchdog();

    // Handle state-specific logic
    switch (detectedState) {
      case CallState.CONNECTED:
        this.clearRingingTimeout();
        // Clear dialing timer once connected
        if (this.dialingTimer) {
          clearTimeout(this.dialingTimer);
          this.dialingTimer = null;
        }
        this.emitStateChange(detectedState, 'Call answered');
        break;

      case CallState.VOICEMAIL:
        this.clearRingingTimeout();
        // Clear dialing timer
        if (this.dialingTimer) {
          clearTimeout(this.dialingTimer);
          this.dialingTimer = null;
        }
        this.emitStateChange(detectedState, 'Voicemail detected');
        if (this.config.hangupOnVoicemail) {
          this.startVoicemailTimeout();
        }
        break;

      case CallState.ENDED:
        this.clearAllTimers();
        this.emitStateChange(detectedState, 'Call ended');
        await this.stopMonitoring();
        break;

      case CallState.FAILED:
        this.clearAllTimers();
        this.emitStateChange(detectedState, 'Call failed');
        await this.stopMonitoring();
        break;

      case CallState.RINGING:
        // Clear dialing timer when ringing starts
        if (this.dialingTimer) {
          clearTimeout(this.dialingTimer);
          this.dialingTimer = null;
        }
        if (previousState === CallState.DIALING) {
          this.emitStateChange(detectedState, 'Ringing');
        }
        break;

      default:
        this.emitStateChange(detectedState);
    }
  }

  /**
   * Map browser state string to CallState enum
   */
  private mapBrowserState(browserState: string): CallState {
    switch (browserState.toLowerCase()) {
      case 'dialing':
        return CallState.DIALING;
      case 'ringing':
      case 'connecting':
        return CallState.RINGING;
      case 'connected':
        return CallState.CONNECTED;
      case 'voicemail':
        return CallState.VOICEMAIL;
      case 'ended':
        return CallState.ENDED;
      case 'failed':
        return CallState.FAILED;
      default:
        return this.currentState; // Keep current state if unknown
    }
  }

  /**
   * Start timeout for ringing state
   */
  private startRingingTimeout(): void {
    this.ringingTimer = setTimeout(() => {
      console.log(`[CallMonitor] Ringing timeout (${this.config.ringingTimeout}ms) - no answer`);
      this.currentState = CallState.FAILED;
      this.emitStateChange(CallState.FAILED, 'No answer within timeout');
      this.stopMonitoring();
    }, this.config.ringingTimeout);
  }

  /**
   * Clear ringing timeout
   */
  private clearRingingTimeout(): void {
    if (this.ringingTimer) {
      clearTimeout(this.ringingTimer);
      this.ringingTimer = null;
    }
  }

  /**
   * Start timeout for voicemail
   */
  private startVoicemailTimeout(): void {
    this.voicemailTimer = setTimeout(async () => {
      console.log(`[CallMonitor] Voicemail timeout - hanging up`);
      this.currentState = CallState.ENDED;
      this.emitStateChange(CallState.ENDED, 'Voicemail timeout - hanging up');
      await this.hangupCall();
      await this.stopMonitoring();
    }, this.config.voicemailTimeout);
  }

  /**
   * Start timeout for dialing state
   */
  private startDialingTimeout(): void {
    this.dialingTimer = setTimeout(async () => {
      if (this.currentState === CallState.DIALING && !this.isAborting) {
        console.log(`[CallMonitor] Dialing timeout (${this.config.dialingTimeout}ms) - call never connected`);
        await this.forceAbort('Dialing timeout - call never connected');
      }
    }, this.config.dialingTimeout);
  }

  /**
   * Start inactivity watchdog - aborts if no state change for too long
   */
  private startInactivityWatchdog(): void {
    this.inactivityTimer = setTimeout(async () => {
      const timeSinceLastChange = Date.now() - this.lastStateChangeTime;
      if (timeSinceLastChange >= this.config.inactivityTimeout && !this.isAborting) {
        console.log(`[CallMonitor] Inactivity timeout (${timeSinceLastChange}ms) - no state change detected`);
        await this.forceAbort('Inactivity timeout - system stuck');
      }
    }, this.config.inactivityTimeout);
  }

  /**
   * Start maximum call duration timer
   */
  private startMaxDurationTimer(): void {
    this.maxDurationTimer = setTimeout(async () => {
      if (!this.isAborting) {
        console.log(`[CallMonitor] Maximum call duration (${this.config.maxCallDuration}ms) reached`);
        await this.forceAbort('Maximum call duration exceeded');
      }
    }, this.config.maxCallDuration);
  }

  /**
   * Reset inactivity watchdog on state change
   */
  private resetInactivityWatchdog(): void {
    this.lastStateChangeTime = Date.now();
    
    // Clear and restart inactivity timer
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }
    
    // Don't restart if aborting
    if (!this.isAborting) {
      this.startInactivityWatchdog();
    }
  }

  /**
   * Force abort the call with comprehensive cleanup
   */
  private async forceAbort(reason: string): Promise<void> {
    if (this.isAborting) {
      return; // Already aborting
    }
    
    this.isAborting = true;
    console.log(`[CallMonitor] FORCE ABORT: ${reason}`);
    
    try {
      // Try to click hangup button
      await this.hangupCall();
      
      // Wait a moment for UI to update
      await this.page.waitForTimeout(1000);
      
      // Check if hangup worked by looking for call UI
      const callUIExists = await this.page.evaluate(() => {
        const selectors = [
          '[gv-id="ongoing-call-pane"]',
          '.call-container',
          '[data-call-active="true"]'
        ];
        return selectors.some(sel => document.querySelector(sel) !== null);
      });
      
      if (callUIExists) {
        console.log('[CallMonitor] Hangup button click failed - reloading page as fallback');
        await this.page.reload();
        await this.page.waitForTimeout(2000);
      }
    } catch (error) {
      console.error('[CallMonitor] Error during force abort:', error);
      try {
        await this.page.reload();
        await this.page.waitForTimeout(2000);
      } catch (reloadError) {
        console.error('[CallMonitor] Failed to reload page:', reloadError);
      }
    }
    
    // Emit failed state and stop monitoring
    this.currentState = CallState.FAILED;
    this.emitStateChange(CallState.FAILED, reason);
    await this.stopMonitoring();
  }

  /**
   * Take a debug screenshot for troubleshooting
   */
  private async takeDebugScreenshot(label: string): Promise<void> {
    try {
      const timestamp = Date.now();
      const filename = `debug-${label}-${timestamp}.png`;
      await this.page.screenshot({ 
        path: filename, 
        fullPage: false // Just viewport for faster screenshots
      });
      console.log(`[CallMonitor] 📸 Screenshot saved: ${filename}`);
    } catch (error) {
      // Don't let screenshot failures disrupt call monitoring
      console.log(`[CallMonitor] Screenshot failed (non-critical):`, error);
    }
  }

  /**
   * Emit state change to all callbacks
   */
  private emitStateChange(state: CallState, reason?: string): void {
    const change: CallStateChange = {
      state,
      timestamp: new Date(),
      reason
    };

    this.stateChangeCallbacks.forEach(callback => {
      try {
        callback(change);
      } catch (error) {
        console.error('[CallMonitor] Error in state change callback:', error);
      }
    });
  }

}
