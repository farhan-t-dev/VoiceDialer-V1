/**
 * Simplified Call State Detector for Google Voice + ElevenLabs Integration
 *
 * This module implements a simple state machine that relies on ONE signal:
 * the presence of the "End call" button to determine call state.
 *
 * Flow:
 * 1. DIALING: After dial button clicked, wait 3 seconds
 * 2. Check for "End call" button:
 *    - If present → CONNECTED (call was answered)
 *    - If not present → FAILED (call didn't connect)
 * 3. CONNECTED: Poll every 500ms for "End call" button
 *    - When button disappears → ENDED (call finished)
 */

import { Page } from "playwright";

/**
 * Enum representing all possible call states
 */
export enum CallState {
  IDLE = "idle",
  DIALING = "dialing",
  CONNECTED = "connected",
  NO_ANSWER = "no_answer",
  FAILED = "failed",
  ENDED = "ended",
}

/**
 * State transition event with logging information
 */
export interface StateTransition {
  timestamp: number;
  fromState: CallState;
  toState: CallState;
  reason: string;
}

/**
 * Configuration for timeout guards
 */
export interface TimeoutConfig {
  initialWaitTime: number; // Time to wait before checking for End call button (3000ms)
  connectedCheckInterval: number; // How often to check if button still exists (500ms)
}

/**
 * Simplified Call State Detector
 *
 * Usage:
 *   const detector = new CallStateDetector(page, config);
 *   await detector.start();
 *
 *   detector.onStateChange((transition) => {
 *     console.log(`State: ${transition.fromState} → ${transition.toState}`);
 *   });
 *
 *   await detector.stop();
 */
export class CallStateDetector {
  private page: Page;
  private config: TimeoutConfig;
  private currentState: CallState = CallState.IDLE;
  private stateChangeCallbacks: Array<(transition: StateTransition) => void> =
    [];

  // Timing trackers
  private stateEnteredAt: number = 0;

  // Polling
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;

  // Transition history
  private transitionHistory: StateTransition[] = [];

  constructor(page: Page, config?: Partial<TimeoutConfig>) {
    this.page = page;
    this.config = {
      initialWaitTime: 3000, // 3 seconds
      connectedCheckInterval: 500, // Check every 500ms
      ...config,
    };
  }

  /**
   * Start monitoring call state
   */
  async start(): Promise<void> {
    if (this.isMonitoring) {
      console.log("[CallDetector] Already monitoring");
      return;
    }

    this.isMonitoring = true;
    this.stateEnteredAt = Date.now();
    this.transitionTo(CallState.DIALING, "Call initiated");

    console.log("[CallDetector] Started monitoring - waiting 3 seconds before checking...");
    
    // Wait 3 seconds after dialing
    await new Promise((resolve) => setTimeout(resolve, this.config.initialWaitTime));
    
    // Check if we should still continue (campaign might have been stopped)
    if (!this.isMonitoring) {
      console.log("[CallDetector] Monitoring stopped during initial wait");
      return;
    }
    
    // Check for End call button
    const hasEndCallButton = await this.checkForEndCallButton();
    
    if (hasEndCallButton) {
      console.log("[CallDetector] ✓ End call button found - call is CONNECTED");
      this.transitionTo(CallState.CONNECTED, "End call button present after 3 seconds");
      
      // Start continuous monitoring for button disappearance
      this.monitoringInterval = setInterval(async () => {
        if (!this.isMonitoring) {
          return;
        }
        
        const stillHasButton = await this.checkForEndCallButton();
        
        if (!stillHasButton) {
          console.log("[CallDetector] End call button disappeared - call ENDED");
          this.transitionTo(CallState.ENDED, "End call button disappeared");
          await this.stop();
        }
      }, this.config.connectedCheckInterval);
    } else {
      console.log("[CallDetector] ✗ End call button NOT found - call FAILED");
      this.transitionTo(CallState.FAILED, "End call button not present after 3 seconds");
      await this.stop();
    }
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.isMonitoring = false;
    console.log("[CallDetector] Stopped monitoring");
  }

  /**
   * Register callback for state changes
   */
  onStateChange(callback: (transition: StateTransition) => void): void {
    this.stateChangeCallbacks.push(callback);
  }

  /**
   * Get current state
   */
  getState(): CallState {
    return this.currentState;
  }

  /**
   * Get transition history
   */
  getHistory(): StateTransition[] {
    return [...this.transitionHistory];
  }

  /**
   * Check if the "End call" button is present
   * This is the ONE signal we use to determine call state
   */
  private async checkForEndCallButton(): Promise<boolean> {
    try {
      const result = await this.page.evaluate(`
        (function() {
          // Helper: Check if element is truly visible
          function isElementVisible(el) {
            if (!el) return false;
            var style = window.getComputedStyle(el);
            if (
              style.display === "none" ||
              style.visibility === "hidden" ||
              style.opacity === "0"
            ) {
              return false;
            }
            var rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }

          // Helper: Check if text contains target (case-insensitive)
          function containsText(text, target) {
            return text && text.toLowerCase().indexOf(target.toLowerCase()) !== -1;
          }

          // Look for "End call" button with aria-label attribute patterns
          var ariaLabelPatterns = [
            'button[aria-label*="End call"]',
            'button[aria-label*="end call"]',
            'button[aria-label*="END CALL"]',
            'button[aria-label*="Hang up"]',
            'button[aria-label*="hang up"]',
            'button[aria-label*="HANG UP"]',
            '[data-hangup-button]'
          ];

          for (var i = 0; i < ariaLabelPatterns.length; i++) {
            var button = document.querySelector(ariaLabelPatterns[i]);
            if (button && isElementVisible(button)) {
              return true;
            }
          }

          // Fallback: Query all buttons and check text content and aria-labels
          // Only match specific, unambiguous phrases to avoid false positives
          var allButtons = document.querySelectorAll('button');
          for (var j = 0; j < allButtons.length; j++) {
            var btn = allButtons[j];
            if (!isElementVisible(btn)) continue;
            
            var text = (btn.textContent || '').trim();
            var ariaLabel = (btn.getAttribute('aria-label') || '').trim();
            
            // Only match specific, complete phrases to avoid false positives like "Send"
            // Check for exact matches or phrases with word boundaries
            var textLower = text.toLowerCase();
            var ariaLabelLower = ariaLabel.toLowerCase();
            
            // Match whole phrases only
            if (textLower === 'end call' || 
                textLower === 'hang up' ||
                textLower === 'end' || 
                textLower === 'hangup' ||
                ariaLabelLower === 'end call' || 
                ariaLabelLower === 'hang up' ||
                ariaLabelLower === 'hangup') {
              return true;
            }
            
            // Also check if the phrase starts with these (e.g., "End call (Alt+E)")
            if (textLower.indexOf('end call') === 0 || 
                textLower.indexOf('hang up') === 0 ||
                ariaLabelLower.indexOf('end call') === 0 || 
                ariaLabelLower.indexOf('hang up') === 0) {
              return true;
            }
          }

          return false;
        })()
      `) as boolean;

      return result;
    } catch (error) {
      console.error("[CallDetector] Error checking for End call button:", error);
      return false;
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(
    newState: CallState,
    reason: string,
  ): void {
    if (newState === this.currentState) return;

    const transition: StateTransition = {
      timestamp: Date.now(),
      fromState: this.currentState,
      toState: newState,
      reason,
    };

    this.transitionHistory.push(transition);

    // Log transition with detailed context
    const timeInPreviousState = Date.now() - this.stateEnteredAt;
    console.log(
      `\n[CallDetector] STATE TRANSITION: ${this.currentState} → ${newState}`,
    );
    console.log(`  Reason: ${reason}`);
    console.log(
      `  Time in previous state: ${Math.round(timeInPreviousState / 1000)}s`,
    );

    // Update state
    this.currentState = newState;
    this.stateEnteredAt = Date.now();

    // Notify callbacks
    for (const callback of this.stateChangeCallbacks) {
      try {
        callback(transition);
      } catch (error) {
        console.error("[CallDetector] Error in state change callback:", error);
      }
    }
  }
}

/**
 * Helper: Create detector with default configuration
 */
export function createCallDetector(
  page: Page,
  config?: Partial<TimeoutConfig>,
): CallStateDetector {
  return new CallStateDetector(page, config);
}
