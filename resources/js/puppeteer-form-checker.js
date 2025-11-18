#!/usr/bin/env node

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import RecaptchaPlugin from 'puppeteer-extra-plugin-recaptcha';
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker';
import UserDataDirPlugin from 'puppeteer-extra-plugin-user-data-dir';
import UserPreferencesPlugin from 'puppeteer-extra-plugin-user-preferences';

// Add stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

// Add adblocker to improve performance and avoid tracking
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

// Add user data dir plugin for persistent sessions
puppeteer.use(UserDataDirPlugin());

// Add user preferences plugin for realistic browser behavior
puppeteer.use(UserPreferencesPlugin({
  userPrefs: {
    'profile.default_content_setting_values.notifications': 2,
    'profile.default_content_settings.popups': 0,
    'profile.managed_default_content_settings.images': 1
  }
}));

// Add recaptcha plugin with multiple solver providers
puppeteer.use(
  RecaptchaPlugin({
    provider: {
      id: '2captcha',
      token: process.env.CAPTCHA_SOLVER_API_KEY || 'DEMO_KEY'
    },
    visualFeedback: true,
    solveScoreBased: true,
    solveInactiveChallenges: true,
    solveRecaptchaV3: true,
    solveRecaptchaV2: true,
    solveHCaptcha: true
  })
);

class PuppeteerFormChecker {
  constructor() {
    this.browser = null;
    this.page = null;
    this.initialUrl = null;
    this.lastFormSelector = null;
  }

  async waitFor(ms = 1000) {
    if (this.page && typeof this.page.waitForTimeout === 'function') {
      await this.page.waitForTimeout(ms);
    } else {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }

  async initialize() {
    const launchOptions = {
      headless: process.env.PUPPETEER_HEADLESS !== 'false',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-field-trial-config',
        '--disable-back-forward-cache',
        '--disable-ipc-flooding-protection',
        '--enable-features=NetworkService,NetworkServiceLogging',
        '--force-color-profile=srgb',
        '--metrics-recording-only',
        '--use-mock-keychain',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-pings',
        '--password-store=basic',
        '--use-mock-keychain',
        '--disable-component-extensions-with-background-pages',
        '--disable-background-networking',
        '--disable-client-side-phishing-detection',
        '--disable-hang-monitor',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-domain-reliability',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection'
      ],
      ignoreDefaultArgs: ['--disable-extensions'],
      ignoreHTTPSErrors: true,
      defaultViewport: null
    };

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    if (process.env.PUPPETEER_PRODUCT) {
      launchOptions.product = process.env.PUPPETEER_PRODUCT;
    }

    this.browser = await puppeteer.launch(launchOptions);
    
    this.page = await this.browser.newPage();
    
    // Set realistic user agent
    await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set viewport to common desktop resolution
    await this.page.setViewport({ 
      width: 1366, 
      height: 768,
      deviceScaleFactor: 1,
      hasTouch: false,
      isLandscape: true,
      isMobile: false
    });

    // Set extra headers to appear more human
    await this.page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    });

    // Enable JavaScript execution
    await this.page.setJavaScriptEnabled(true);

    // Set timeouts
    this.page.setDefaultNavigationTimeout(60000);
    this.page.setDefaultTimeout(30000);

    // Intercept and modify requests if needed
    await this.page.setRequestInterception(true);
    this.page.on('request', (request) => {
      // Block unnecessary resources to improve performance
      const resourceType = request.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        request.continue();
      } else {
        request.continue();
      }
    });

    // Handle console messages for debugging
    this.page.on('console', (msg) => {
      if (process.env.PUPPETEER_DEBUG === 'true') {
        console.error(`Browser Console ${msg.type()}: ${msg.text()}`);
      }
    });

    // Handle page errors
    this.page.on('pageerror', (error) => {
      console.error(`Page Error: ${error.message}`);
    });

    // Handle request failures
    this.page.on('requestfailed', (request) => {
      console.error(`Request Failed: ${request.url()} - ${request.failure().errorText}`);
    });
  }

  async checkForm(config) {
    try {
      const {
        url,
        selectorType,
        selectorValue,
        fieldMappings = [],
        successSelector = null,
        errorSelector = null,
        timeout = 30000,
        waitForJavaScript = true,
        executeJavaScript = null,
        waitForElements = [],
        customActions = []
      } = config;

      // Use stderr for logging to avoid interfering with JSON output
      console.error(`Visiting: ${url}`);
      await this.page.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: timeout 
      });
      
      // Store initial URL for comparison
      this.initialUrl = this.page.url();

      // Wait for JavaScript to load if required
      if (waitForJavaScript) {
        console.error('Waiting for JavaScript to load...');
        await this.page.waitForFunction(() => document.readyState === 'complete', { timeout: 10000 });
        await this.waitFor(1000); // Additional wait for dynamic content
      }

      // Wait for specific elements if specified
      if (waitForElements && waitForElements.length > 0) {
        console.error(`Waiting for ${waitForElements.length} elements...`);
        for (const elementSelector of waitForElements) {
          try {
            await this.page.waitForSelector(elementSelector, { timeout: 10000 });
            console.error(`Element found: ${elementSelector}`);
          } catch (waitError) {
            console.error(`Element not found: ${elementSelector}`);
          }
        }
      }

      // Execute custom JavaScript if provided
      if (executeJavaScript) {
        console.error('Executing custom JavaScript...');
        try {
          await this.page.evaluate(executeJavaScript);
          console.error('Custom JavaScript executed successfully');
        } catch (jsError) {
          console.error('Custom JavaScript execution failed:', jsError.message);
        }
      }

      // Wait for form to be present
      const formSelector = this.buildFormSelector(selectorType, selectorValue);
      await this.page.waitForSelector(formSelector, { timeout: 30000 });
      
      // Store form selector for later comparison
      this.lastFormSelector = formSelector;

      console.error(`Form found with selector: ${formSelector}`);

      // Execute custom actions before form filling
      if (customActions && customActions.length > 0) {
        console.error(`Executing ${customActions.length} custom actions...`);
        for (const action of customActions) {
          try {
            await this.executeCustomAction(action);
          } catch (actionError) {
            console.error(`Custom action failed:`, actionError.message);
          }
        }
      }

      // Check for reCAPTCHA and solve if present
      const captchaDetected = await this.detectAndSolveCaptcha();
      if (captchaDetected) {
        console.error('CAPTCHA detected and solving...');
        // Wait a bit more for CAPTCHA solution to be processed
        await this.page.waitForNetworkIdle({ timeout: 10000 });
      }

      // Fill form fields with advanced interaction
      if (fieldMappings && fieldMappings.length > 0) {
        console.error(`Filling ${fieldMappings.length} form fields...`);
        await this.fillFormFieldsAdvanced(fieldMappings);
      } else {
        console.error('No form fields to fill');
      }

      // Submit form with advanced methods
      console.error('Attempting to submit form...');
      await this.submitFormAdvanced(formSelector);
      console.error('Form submission completed');

      // Wait for response and check for form submission indicators
      console.error('Waiting for page response...');
      try {
        await this.page.waitForNetworkIdle({ timeout: 30000 });
        console.error('Network is idle');
      } catch (networkError) {
        console.error('Network idle timeout, continuing...');
      }
      
      try {
        await this.page.waitForFunction(() => document.readyState === 'complete', { timeout: 30000 });
        console.error('Page is fully loaded');
      } catch (loadError) {
        console.error('Page load timeout, continuing...');
      }

      // Additional wait for form processing
      console.error('Waiting for form processing...');
      try {
        await this.waitFor(3000); // Wait 3 seconds for form processing
      } catch (timeoutError) {
        console.error('Form processing wait timeout');
      }

      // Get final HTML and URL
      const finalHtml = await this.page.content();
      const finalUrl = this.page.url();

      // Take screenshot for debugging
      let screenshot = null;
      try {
        screenshot = await this.page.screenshot({ 
          type: 'png', 
          fullPage: true,
          encoding: 'base64'
        });
      } catch (screenshotError) {
        console.error('Screenshot failed:', screenshotError.message);
      }

      // Validate form submission
      const submissionValidated = await this.validateFormSubmission(formSelector);
      console.error(`Form submission validation: ${submissionValidated}`);

      // Classify result
      const status = await this.classifyResult(successSelector, errorSelector);

      // Extract message
      const message = await this.extractMessage(successSelector, errorSelector);

      // Only mark as success if form submission was validated
      const finalSuccess = submissionValidated && status === 'success';
      
      return {
        success: finalSuccess,
        status: finalSuccess ? status : 'failure',
        finalUrl,
        message: finalSuccess ? message : 'Form submission failed or could not be validated',
        html: finalHtml,
        screenshot: screenshot,
        captchaDetected,
        submissionValidated,
        debugInfo: {
          initialUrl: this.initialUrl,
          finalUrl: finalUrl,
          formSelector: formSelector,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('Form check failed:', error.message);
      console.error('Error stack:', error.stack);
      
      // Try to get current page info for debugging
      let currentUrl = 'unknown';
      let pageContent = 'unknown';
      let screenshot = null;
      try {
        currentUrl = this.page.url();
        pageContent = await this.page.content();
        screenshot = await this.page.screenshot({ 
          type: 'png', 
          fullPage: true,
          encoding: 'base64'
        });
      } catch (debugError) {
        console.error('Could not get debug info:', debugError.message);
      }

      return {
        success: false,
        error: error.message,
        stack: error.stack,
        debugInfo: {
          currentUrl,
          pageContent: pageContent.substring(0, 1000) + '...', // First 1000 chars
          screenshot: screenshot,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  buildFormSelector(selectorType, selectorValue) {
    switch (selectorType) {
      case 'id':
        return `#${selectorValue}`;
      case 'class':
        return `.${selectorValue}`;
      case 'css':
        return selectorValue;
      default:
        return selectorValue;
    }
  }

  async detectAndSolveCaptcha() {
    try {
      // Check for various CAPTCHA types
      const captchaSelectors = [
        '.g-recaptcha',
        '.h-captcha',
        '#captcha',
        '[data-sitekey]',
        'iframe[src*="recaptcha"]',
        'iframe[src*="hcaptcha"]'
      ];

      let captchaFound = false;
      for (const selector of captchaSelectors) {
        const element = await this.page.$(selector);
        if (element) {
          console.error(`CAPTCHA found with selector: ${selector}`);
          captchaFound = true;
          break;
        }
      }

      if (captchaFound) {
        // Use the recaptcha plugin to solve
        await this.page.solveRecaptchas();
        console.log('CAPTCHA solving attempted');
        
        // Wait a bit for the solution to be processed
        await this.page.waitForNetworkIdle({ timeout: 5000 });
        
        return true;
      }

      return false;
    } catch (error) {
      console.error('CAPTCHA detection/solving failed:', error.message);
      return false;
    }
  }

  async fillFormFieldsAdvanced(fieldMappings) {
    for (const mapping of fieldMappings) {
      try {
        const { selector, value, type = 'text', clearFirst = true, delay = 100 } = mapping;
        
        // Try different selector strategies
        const selectors = [
          selector,
          `[name="${selector}"]`,
          `#${selector}`,
          `.${selector}`,
          `input[name="${selector}"]`,
          `textarea[name="${selector}"]`,
          `select[name="${selector}"]`,
          `input[placeholder*="${selector}"]`,
          `input[id*="${selector}"]`,
          `textarea[id*="${selector}"]`,
          `select[id*="${selector}"]`
        ];

        let filled = false;
        for (const selectorToTry of selectors) {
          try {
            const element = await this.page.$(selectorToTry);
            if (element) {
              const isVisible = await element.isVisible();
              const isEnabled = await element.isEnabled();
              
              if (!isVisible || !isEnabled) {
                console.error(`Element not visible/enabled: ${selectorToTry}`);
                continue;
              }

              const tagName = await element.evaluate(el => el.tagName.toLowerCase());
              const inputType = await element.evaluate(el => el.type || 'text');
              
              console.error(`Filling ${tagName}[${inputType}]: ${selectorToTry} = ${value}`);

              // Scroll element into view
              await element.scrollIntoView();
              await this.waitFor(200);

              // Focus the element
              await element.focus();

              if (clearFirst) {
                // Clear existing value
                await element.click({ clickCount: 3 });
                await this.page.keyboard.press('Backspace');
              }

              // Fill based on element type
              switch (tagName) {
                case 'select':
                  await this.handleSelectElement(element, value);
                  break;
                case 'input':
                  await this.handleInputElement(element, value, inputType, delay);
                  break;
                case 'textarea':
                  await this.handleTextareaElement(element, value, delay);
                  break;
                default:
                  await element.type(value, { delay });
              }

              // Trigger change events
              await element.evaluate(el => {
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
              });

              console.error(`Successfully filled field: ${selectorToTry}`);
              filled = true;
              break;
            }
          } catch (elementError) {
            console.error(`Error with selector ${selectorToTry}:`, elementError.message);
            continue;
          }
        }

        if (!filled) {
          console.error(`Could not find field: ${selector}`);
        }
      } catch (error) {
        console.error(`Error filling field ${mapping.selector}:`, error.message);
      }
    }
  }

  async handleSelectElement(element, value) {
    try {
      // Try to select by visible text first
      await element.select(value);
    } catch (selectError) {
      try {
        // Try to select by value attribute
        await element.evaluate((el, val) => {
          const options = el.querySelectorAll('option');
          for (const option of options) {
            if (option.value === val || option.textContent.trim() === val) {
              option.selected = true;
              return;
            }
          }
        }, value);
      } catch (valueError) {
        console.error('Could not select option:', valueError.message);
      }
    }
  }

  async handleInputElement(element, value, inputType, delay) {
    switch (inputType) {
      case 'checkbox':
      case 'radio':
        if (value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'checked') {
          await element.click();
        }
        break;
      case 'file':
        // Handle file uploads (would need file path)
        console.error('File input detected - file upload not implemented');
        break;
      case 'date':
      case 'datetime-local':
      case 'time':
        // Handle date/time inputs
        await element.type(value, { delay });
        break;
      default:
        await element.type(value, { delay });
    }
  }

  async handleTextareaElement(element, value, delay) {
    await element.type(value, { delay });
  }

  async executeCustomAction(action) {
    const { type, selector, value, waitTime = 1000 } = action;
    
    switch (type) {
      case 'click':
        const clickElement = await this.page.$(selector);
        if (clickElement) {
          await clickElement.click();
          await this.waitFor(waitTime);
        }
        break;
      case 'type':
        const typeElement = await this.page.$(selector);
        if (typeElement) {
          await typeElement.type(value);
          await this.waitFor(waitTime);
        }
        break;
      case 'select':
        const selectElement = await this.page.$(selector);
        if (selectElement) {
          await selectElement.select(value);
          await this.waitFor(waitTime);
        }
        break;
      case 'wait':
        await this.waitFor(waitTime);
        break;
      case 'waitForSelector':
        await this.page.waitForSelector(selector, { timeout: 10000 });
        break;
      case 'evaluate':
        await this.page.evaluate(value);
        break;
      default:
        console.error(`Unknown action type: ${type}`);
    }
  }

  async submitFormAdvanced(formSelector) {
    try {
      console.error(`Looking for submit elements with form selector: ${formSelector}`);
      
      // Try different submission methods with advanced strategies
      const submitSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button[type="button"]',
        'input[type="button"]',
        'button:not([type])',
        '[role="button"]',
        '.submit-button',
        '.btn-submit',
        '#submit',
        '.submit',
        'button:contains("Submit")',
        'button:contains("Send")',
        'button:contains("Send Message")',
        'input[value*="Submit"]',
        'input[value*="Send"]'
      ];

      let submitted = false;
      for (const selector of submitSelectors) {
        try {
          console.error(`Trying selector: ${selector}`);
          
          // Try to find element within the form context
          const element = await this.page.evaluateHandle((formSel, submitSel) => {
            const form = document.querySelector(formSel);
            if (form) {
              return form.querySelector(submitSel);
            }
            return document.querySelector(submitSel);
          }, formSelector, selector);

          if (element && element.asElement) {
            const elementHandle = element.asElement();
            console.error(`Found element with selector: ${selector}`);
            
            // Check if element is visible and clickable
            const isVisible = await elementHandle.isVisible();
            const isEnabled = await elementHandle.isEnabled();
            const isIntersectingViewport = await elementHandle.isIntersectingViewport();
            
            console.error(`Element visible: ${isVisible}, enabled: ${isEnabled}, in viewport: ${isIntersectingViewport}`);
            
            if (isVisible && isEnabled) {
              // Scroll element into view if needed
              if (!isIntersectingViewport) {
                await elementHandle.scrollIntoView();
                await this.waitFor(500);
              }

              // Try different click methods
              try {
                await elementHandle.click();
                console.error(`Form submitted using click: ${selector}`);
                submitted = true;
                break;
              } catch (clickError) {
                console.error(`Click failed, trying hover + click: ${clickError.message}`);
                try {
                  await elementHandle.hover();
                  await this.waitFor(200);
                  await elementHandle.click();
                  console.error(`Form submitted using hover + click: ${selector}`);
                  submitted = true;
                  break;
                } catch (hoverClickError) {
                  console.error(`Hover + click failed: ${hoverClickError.message}`);
                }
              }
            } else {
              console.error(`Element not clickable: ${selector}`);
            }
          } else {
            console.error(`No element found with selector: ${selector}`);
          }
        } catch (clickError) {
          console.error(`Click failed for ${selector}:`, clickError.message);
          continue;
        }
      }

      if (!submitted) {
        console.error('No submit button found, trying advanced submission methods...');
        
        // Try JavaScript-based submission
        try {
          const result = await this.page.evaluate((selector) => {
            const form = document.querySelector(selector);
            if (form && form.tagName === 'FORM') {
              console.error('Found form element, submitting...');
              
              // Try different submission methods
              try {
                form.submit();
                return 'form_submitted';
              } catch (submitError) {
                console.error('Direct submit failed, trying dispatchEvent...');
                
                // Try dispatching submit event
                const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
                const dispatched = form.dispatchEvent(submitEvent);
                
                if (dispatched) {
                  return 'form_submit_event_dispatched';
                } else {
                  return 'form_submit_event_cancelled';
                }
              }
            } else {
              // Look for parent form
              const element = document.querySelector(selector);
              if (element) {
                const parentForm = element.closest('form');
                if (parentForm) {
                  console.error('Found parent form, submitting...');
                  parentForm.submit();
                  return 'parent_form_submitted';
                }
              }
            }
            return 'no_form_found';
          }, formSelector);
          
          console.error(`JavaScript form submission result: ${result}`);
          if (result !== 'no_form_found') {
            submitted = true;
          }
        } catch (submitError) {
          console.error('JavaScript form submission failed:', submitError.message);
        }
      }

      if (!submitted) {
        console.error('All submission methods failed');
        throw new Error('Could not submit form using any method');
      }
      
      console.error('Form submission successful');
    } catch (error) {
      console.error('Form submission failed:', error.message);
      throw error;
    }
  }

  async classifyResult(successSelector, errorSelector) {
    try {
      // Check for success indicators
      if (successSelector) {
        const successElement = await this.page.$(successSelector);
        if (successElement) {
          console.error(`Success indicator found: ${successSelector}`);
          return 'success';
        }
      }

      // Check for error indicators
      if (errorSelector) {
        const errorElement = await this.page.$(errorSelector);
        if (errorElement) {
          console.error(`Error indicator found: ${errorSelector}`);
          return 'failure';
        }
      }

      // Check for common success/error patterns
      const commonSuccessSelectors = [
        '.success',
        '.alert-success',
        '.message-success',
        '[class*="success"]',
        '.wpcf7-response-output:not(.wpcf7-validation-errors)',
        '.wpcf7-mail-sent-ok',
        '.wpcf7-mail-sent-ng:not(.wpcf7-validation-errors)'
      ];

      for (const selector of commonSuccessSelectors) {
        const element = await this.page.$(selector);
        if (element) {
          const text = await element.textContent();
          if (text && text.trim()) {
            console.error(`Common success indicator found: ${selector} - "${text.trim()}"`);
            return 'success';
          }
        }
      }

      const commonErrorSelectors = [
        '.error',
        '.alert-error',
        '.alert-danger',
        '.message-error',
        '[class*="error"]',
        '.wpcf7-validation-errors',
        '.wpcf7-spam-blocked',
        '.wpcf7-mail-sent-ng'
      ];

      for (const selector of commonErrorSelectors) {
        const element = await this.page.$(selector);
        if (element) {
          const text = await element.textContent();
          if (text && text.trim()) {
            console.error(`Common error indicator found: ${selector} - "${text.trim()}"`);
            return 'failure';
          }
        }
      }

      // Check if form is still present (indicates submission failure)
      const formStillPresent = await this.page.$(this.lastFormSelector);
      if (formStillPresent) {
        console.error('Form is still present after submission attempt - likely failed');
        return 'failure';
      }

      // Check for URL changes that might indicate success
      const currentUrl = this.page.url();
      if (currentUrl !== this.initialUrl) {
        console.error(`URL changed from ${this.initialUrl} to ${currentUrl} - possible success`);
        return 'success';
      }

      // Check for common form submission success patterns
      const submissionSuccess = await this.page.evaluate(() => {
        // Look for any text that suggests successful submission
        const pageText = document.body.innerText.toLowerCase();
        const successPhrases = [
          'thank you',
          'message sent',
          'form submitted',
          'successfully',
          'received',
          'sent successfully',
          'submitted successfully'
        ];
        
        for (const phrase of successPhrases) {
          if (pageText.includes(phrase)) {
            return true;
          }
        }
        
        return false;
      });
      
      if (submissionSuccess) {
        console.error('Success phrases found in page text');
        return 'success';
      }

      // If we can't determine, be conservative and assume failure
      console.error('Could not determine form submission result - assuming failure');
      return 'failure';
    } catch (error) {
      console.error('Result classification failed:', error.message);
      return 'failure'; // Default to failure instead of success
    }
  }

  async validateFormSubmission(formSelector) {
    try {
      // Check if form is still present (indicates submission failure)
      const formStillPresent = await this.page.$(formSelector);
      if (formStillPresent) {
        console.error('Form is still present after submission - likely failed');
        return false;
      }

      // Check for URL changes
      const currentUrl = this.page.url();
      if (currentUrl !== this.initialUrl) {
        console.error(`URL changed from ${this.initialUrl} to ${currentUrl} - possible success`);
        return true;
      }

      // Check for form submission success messages
      const successMessages = await this.page.evaluate(() => {
        const pageText = document.body.innerText.toLowerCase();
        const successPhrases = [
          'thank you',
          'message sent',
          'form submitted',
          'successfully',
          'received',
          'sent successfully',
          'submitted successfully',
          'email sent',
          'contact form submitted'
        ];
        
        for (const phrase of successPhrases) {
          if (pageText.includes(phrase)) {
            return true;
          }
        }
        
        return false;
      });
      
      if (successMessages) {
        console.error('Success messages found in page text');
        return true;
      }

      // Check for form reset or disappearance
      const formInputs = await this.page.evaluate((selector) => {
        const form = document.querySelector(selector);
        if (!form) return 'form_gone';
        
        const inputs = form.querySelectorAll('input, textarea, select');
        let hasValues = false;
        for (const input of inputs) {
          if (input.value && input.value.trim()) {
            hasValues = true;
            break;
          }
        }
        
        if (!hasValues) {
          return 'form_cleared';
        }
        
        return 'form_with_values';
      }, formSelector);
      
      if (formInputs === 'form_gone') {
        console.error('Form disappeared after submission - likely success');
        return true;
      }
      
      if (formInputs === 'form_cleared') {
        console.error('Form was cleared after submission - possible success');
        return true;
      }

      console.error('Form submission validation failed - form still present with values');
      return false;
    } catch (error) {
      console.error('Form submission validation failed:', error.message);
      return false;
    }
  }

  async extractMessage(successSelector, errorSelector) {
    try {
      // Try to extract message from success/error selectors
      const selectors = [successSelector, errorSelector].filter(Boolean);
      
      for (const selector of selectors) {
        const element = await this.page.$(selector);
        if (element) {
          const text = await element.textContent();
          if (text && text.trim()) {
            return text.trim();
          }
        }
      }

      // Try common message selectors
      const messageSelectors = [
        '.message',
        '.alert',
        '.notification',
        '.flash-message',
        '[role="alert"]'
      ];

      for (const selector of messageSelectors) {
        const element = await this.page.$(selector);
        if (element) {
          const text = await element.textContent();
          if (text && text.trim()) {
            return text.trim();
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Message extraction failed:', error.message);
      return null;
    }
  }

  async cleanup() {
    try {
      if (this.page) {
        await this.page.close();
      }
      if (this.browser) {
        await this.browser.close();
      }
    } catch (error) {
      console.error('Cleanup failed:', error.message);
    }
  }
}

// CLI interface
async function main() {
  if (process.argv.length < 3) {
    console.error('Usage: node puppeteer-form-checker.js <config-json>');
    process.exit(1);
  }

  const configJson = process.argv[2];
  let config;
  
  try {
    config = JSON.parse(configJson);
  } catch (error) {
    console.error('Invalid JSON configuration:', error.message);
    process.exit(1);
  }

  const checker = new PuppeteerFormChecker();
  
  try {
    await checker.initialize();
    const result = await checker.checkForm(config);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error('Form checking failed:', error.message);
    console.log(JSON.stringify({ success: false, error: error.message }));
  } finally {
    await checker.cleanup();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}

export default PuppeteerFormChecker;
