// Content script for Instagram MLM Detector
// This runs on Instagram post pages

// Main configuration
const config = {
  // Time to wait for Instagram content to load
  loadDelay: 2000,
  
  // Auto-analyze configuration
  autoAnalyze: true,
  
  // Widget positioning
  widgetPosition: 'bottom-right', // 'top-right', 'bottom-right', 'top-left', 'bottom-left'
  
  // Analysis throttling (ms)
  minimumAnalysisInterval: 5000
};

// Track state
let lastAnalyzedUrl = '';
let lastAnalysisTime = 0;
let analysisInProgress = false;

// Initialize when page content is loaded
window.addEventListener('load', function() {
  // Check if we're on an Instagram post
  if (isInstagramPost(window.location.href)) {
    // Set a delay to allow Instagram's content to fully load
    setTimeout(initializeOnPost, config.loadDelay);
  }
});

// Watch for URL changes (Instagram is a single-page app)
let lastUrl = window.location.href;
new MutationObserver(() => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    
    // Check if new URL is an Instagram post
    if (isInstagramPost(currentUrl)) {
      // Set a delay to allow Instagram's content to fully load
      setTimeout(initializeOnPost, config.loadDelay);
    } else {
      // Hide or remove the widget when navigating away from a post
      const widget = document.getElementById('mlm-detector-widget');
      if (widget) {
        widget.classList.add('hidden');
      }
    }
  }
}).observe(document, { subtree: true, childList: true });

// Listen for messages from background or popup scripts
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  // Handle any custom messages here
  if (message.action === 'analyze') {
    analyzeCurrentPost();
  }
});

// Functions

// Initialize when on a post page
function initializeOnPost() {
  // Check if widget already exists
  if (document.getElementById('mlm-detector-widget')) {
    updateWidgetPosition();
    if (config.autoAnalyze) {
      checkAndAnalyzePost();
    }
    return;
  }
  
  // Create the MLM detector widget
  createWidget();
  
  // Auto-analyze if enabled
  if (config.autoAnalyze) {
    checkAndAnalyzePost();
  }
}

// Create the widget UI
function createWidget() {
  const widget = document.createElement('div');
  widget.id = 'mlm-detector-widget';
  widget.className = 'ig-mlm-detector';
  
  // Set initial positioning
  updateWidgetPosition(widget);
  
  // Build widget HTML
  widget.innerHTML = `
    <div class="ig-mlm-header">
      <h3>MLM Detector</h3>
      <button class="ig-mlm-close">&times;</button>
    </div>
    <div id="ig-mlm-content" class="ig-mlm-content">
      <div id="ig-mlm-status" class="ig-mlm-status">
        <div id="ig-mlm-loading" class="ig-mlm-loading">
          <div class="ig-mlm-spinner"></div>
          <p>Analyzing post...</p>
        </div>
        <div id="ig-mlm-result" class="ig-mlm-result hidden">
          <div class="ig-mlm-verdict">
            <span class="ig-mlm-verdict-label">MLM Detected:</span>
            <span id="ig-mlm-verdict-value" class="ig-mlm-verdict-value">No</span>
          </div>
          <div class="ig-mlm-certainty">
            <span class="ig-mlm-certainty-label">Certainty:</span>
            <div class="ig-mlm-meter">
              <div id="ig-mlm-certainty-bar" class="ig-mlm-meter-bar"></div>
            </div>
            <span id="ig-mlm-certainty-value" class="ig-mlm-certainty-value">0%</span>
          </div>
          <div class="ig-mlm-reasoning">
            <details>
              <summary>View Details</summary>
              <ul id="ig-mlm-reasoning-list"></ul>
            </details>
          </div>
        </div>
        <div id="ig-mlm-error" class="ig-mlm-error hidden">
          <p id="ig-mlm-error-message">Error analyzing post</p>
          <button id="ig-mlm-retry" class="ig-mlm-button">Retry</button>
        </div>
      </div>
    </div>
  `;
  
  // Add widget styles
  addWidgetStyles();
  
  // Append to body
  document.body.appendChild(widget);
  
  // Add event listeners
  document.querySelector('.ig-mlm-close').addEventListener('click', () => {
    widget.classList.add('hidden');
  });
  
  document.getElementById('ig-mlm-retry')?.addEventListener('click', () => {
    analyzeCurrentPost();
  });
}

// Add the widget styles
function addWidgetStyles() {
  const styleSheet = document.createElement('style');
  styleSheet.id = 'mlm-detector-styles';
  styleSheet.textContent = `
    /* Global scrollbar hiding */
    .ig-mlm-detector, .ig-mlm-detector * {
      scrollbar-width: none; /* Firefox */
      -ms-overflow-style: none; /* IE and Edge */
    }
    
    .ig-mlm-detector *::-webkit-scrollbar {
      width: 0;
      height: 0;
      display: none; /* Chrome, Safari, Opera */
    }
    
    .ig-mlm-detector {
      position: fixed;
      z-index: 9999;
      width: 280px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #262626;
      overflow: hidden;
      transition: all 0.3s ease;
      max-height: calc(100vh - 40px);
      display: flex;
      flex-direction: column;
    }
    
    .ig-mlm-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid #efefef;
      background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
      color: white;
    }
    
    .ig-mlm-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }
    
    .ig-mlm-close {
      background: none;
      border: none;
      color: white;
      font-size: 18px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
    }
    
    .ig-mlm-content {
      padding: 16px;
      overflow-y: auto;
      scrollbar-width: none; /* Firefox */
      -ms-overflow-style: none; /* IE and Edge */
    }
    
    .ig-mlm-content::-webkit-scrollbar {
      display: none; /* Chrome, Safari, Opera */
    }
    
    .ig-mlm-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px 0;
    }
    
    .ig-mlm-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #efefef;
      border-top: 3px solid #0095f6;
      border-radius: 50%;
      animation: mlm-spin 1s linear infinite;
      margin-bottom: 12px;
    }
    
    @keyframes mlm-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    .ig-mlm-result {
      padding: 4px 0;
    }
    
    .ig-mlm-verdict {
      display: flex;
      align-items: center;
      margin-bottom: 16px;
    }
    
    .ig-mlm-verdict-label {
      font-weight: 600;
      margin-right: 8px;
    }
    
    .ig-mlm-verdict-value {
      font-weight: 600;
      padding: 4px 8px;
      border-radius: 4px;
      background-color: #2ecc71;
      color: white;
    }
    
    .ig-mlm-verdict-value.mlm-yes {
      background-color: #ed4956;
    }
    
    .ig-mlm-certainty {
      display: flex;
      align-items: center;
      margin-bottom: 16px;
    }
    
    .ig-mlm-certainty-label {
      font-weight: 600;
      margin-right: 8px;
      min-width: 70px;
    }
    
    .ig-mlm-meter {
      flex: 1;
      height: 6px;
      background-color: #efefef;
      border-radius: 3px;
      overflow: hidden;
      margin-right: 8px;
    }
    
    .ig-mlm-meter-bar {
      height: 100%;
      width: 0%;
      background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
      transition: width 0.5s ease;
    }
    
    .ig-mlm-certainty-value {
      font-weight: 600;
      font-size: 14px;
      width: 36px;
      text-align: right;
    }
    
    .ig-mlm-reasoning details {
      margin-top: 8px;
    }
    
    .ig-mlm-reasoning summary {
      font-weight: 600;
      cursor: pointer;
      padding: 8px 0;
    }
    
    .ig-mlm-reasoning ul {
      list-style: none;
      padding: 0;
      margin: 0;
      max-height: 200px;
      overflow-y: auto;
      scrollbar-width: none; /* Firefox */
      -ms-overflow-style: none; /* IE and Edge */
    }
    
    .ig-mlm-reasoning ul::-webkit-scrollbar {
      display: none;
    }
    
    .ig-mlm-reasoning li {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #efefef;
      font-size: 14px;
    }
    
    .ig-mlm-reasoning li:last-child {
      border-bottom: none;
    }
    
    .ig-mlm-reasoning-factor {
      font-weight: 500;
    }
    
    .ig-mlm-reasoning-value {
      font-weight: 600;
    }
    
    .ig-mlm-reasoning-value.positive {
      color: #ed4956;
    }
    
    .ig-mlm-reasoning-value.negative {
      color: #2ecc71;
    }
    
    .ig-mlm-error {
      text-align: center;
      padding: 16px 0;
    }
    
    .ig-mlm-error-message {
      color: #ed4956;
      margin-bottom: 12px;
    }
    
    .ig-mlm-button {
      background-color: #0095f6;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 8px 16px;
      font-weight: 600;
      cursor: pointer;
    }
    
    .ig-mlm-button:hover {
      background-color: #0089e8;
    }
    
    .hidden {
      display: none !important;
    }
  `;
  
  document.head.appendChild(styleSheet);
}

// Update widget position based on configuration
function updateWidgetPosition(widget = null) {
  widget = widget || document.getElementById('mlm-detector-widget');
  if (!widget) return;
  
  // Remove all position classes
  widget.classList.remove('top-right', 'bottom-right', 'top-left', 'bottom-left');
  
  // Set position based on config
  switch (config.widgetPosition) {
    case 'top-right':
      widget.style.top = '20px';
      widget.style.right = '20px';
      widget.style.bottom = 'auto';
      widget.style.left = 'auto';
      break;
    case 'top-left':
      widget.style.top = '20px';
      widget.style.left = '20px';
      widget.style.bottom = 'auto';
      widget.style.right = 'auto';
      break;
    case 'bottom-left':
      widget.style.bottom = '20px';
      widget.style.left = '20px';
      widget.style.top = 'auto';
      widget.style.right = 'auto';
      break;
    case 'bottom-right':
    default:
      widget.style.bottom = '20px';
      widget.style.right = '20px';
      widget.style.top = 'auto';
      widget.style.left = 'auto';
      break;
  }
}

// Check if a URL is an Instagram post
function isInstagramPost(url) {
  return url && url.match(/https:\/\/www\.instagram\.com\/p\/[^/]+\/?/);
}

// Check if we need to analyze the current post and do so if needed
function checkAndAnalyzePost() {
  const currentUrl = window.location.href;
  
  // Skip if not an Instagram post
  if (!isInstagramPost(currentUrl)) {
    return;
  }
  
  // Skip if we've already analyzed this URL recently or analysis is in progress
  if (analysisInProgress || (currentUrl === lastAnalyzedUrl && 
      Date.now() - lastAnalysisTime < config.minimumAnalysisInterval)) {
    return;
  }
  
  // Check if we already have analysis for this post in storage
  chrome.storage.local.get(['history'], function(data) {
    const history = data.history || [];
    const existingAnalysis = history.find(item => item.url === currentUrl);
    
    if (existingAnalysis) {
      // Show cached results
      displayResult(existingAnalysis.result);
      
      // Show the widget
      const widget = document.getElementById('mlm-detector-widget');
      if (widget) widget.classList.remove('hidden');
    } else {
      // Analyze the post
      analyzeCurrentPost();
    }
  });
}

// Analyze the current post
function analyzeCurrentPost() {
  // Check if we're on an Instagram post
  const currentUrl = window.location.href;
  if (!isInstagramPost(currentUrl)) {
    return;
  }
  
  // Update state
  lastAnalyzedUrl = currentUrl;
  lastAnalysisTime = Date.now();
  analysisInProgress = true;
  
  // Show the widget
  const widget = document.getElementById('mlm-detector-widget');
  if (widget) widget.classList.remove('hidden');
  
  // Update UI to loading state
  const loadingElement = document.getElementById('ig-mlm-loading');
  const resultElement = document.getElementById('ig-mlm-result');
  const errorElement = document.getElementById('ig-mlm-error');
  
  if (loadingElement) loadingElement.classList.remove('hidden');
  if (resultElement) resultElement.classList.add('hidden');
  if (errorElement) errorElement.classList.add('hidden');
  
  // Send message to background script to analyze the post
  chrome.runtime.sendMessage(
    { action: 'analyzePost', url: currentUrl },
    function(response) {
      analysisInProgress = false;
      
      if (response && response.success) {
        // Display result
        displayResult(response.result);
      } else {
        // Display error
        displayError(response ? response.error : 'Unknown error');
      }
    }
  );
}

// Display analysis result in the widget
function displayResult(result) {
  const loadingElement = document.getElementById('ig-mlm-loading');
  const resultElement = document.getElementById('ig-mlm-result');
  const errorElement = document.getElementById('ig-mlm-error');
  const verdictElement = document.getElementById('ig-mlm-verdict-value');
  const certaintyBar = document.getElementById('ig-mlm-certainty-bar');
  const certaintyValue = document.getElementById('ig-mlm-certainty-value');
  const reasoningList = document.getElementById('ig-mlm-reasoning-list');
  
  if (result.error) {
    // Handle error
    displayError(result.error);
    return;
  }
  
  // Update UI elements
  if (loadingElement) loadingElement.classList.add('hidden');
  if (errorElement) errorElement.classList.add('hidden');
  
  // Update verdict
  if (verdictElement) {
    verdictElement.textContent = result.verdict;
    verdictElement.className = result.verdict === 'Yes' ? 
                             'ig-mlm-verdict-value mlm-yes' : 
                             'ig-mlm-verdict-value';
  }
  
  // Update certainty
  const certaintyPercentage = parseInt(result.certainty);
  if (certaintyBar) certaintyBar.style.width = `${certaintyPercentage}%`;
  if (certaintyValue) certaintyValue.textContent = `${certaintyPercentage}%`;
  
  // Update reasoning
  if (reasoningList) {
    reasoningList.innerHTML = '';
    
    Object.entries(result.reasoning).forEach(([key, value]) => {
      const formattedKey = key.replace(/_/g, ' ');
      const li = document.createElement('li');
      
      const factorSpan = document.createElement('span');
      factorSpan.className = 'ig-mlm-reasoning-factor';
      factorSpan.textContent = formatReasoningKey(formattedKey);
      
      const valueSpan = document.createElement('span');
      valueSpan.className = 'ig-mlm-reasoning-value';
      
      // Format the value appropriately
      if (typeof value === 'boolean' || value === 'Yes' || value === 'No') {
        const isPositive = value === true || value === 'Yes';
        valueSpan.textContent = isPositive ? 'Yes' : 'No';
        valueSpan.classList.add(isPositive ? 'positive' : 'negative');
      } else {
        valueSpan.textContent = value;
      }
      
      li.appendChild(factorSpan);
      li.appendChild(valueSpan);
      reasoningList.appendChild(li);
    });
  }
  
  // Show result container
  if (resultElement) resultElement.classList.remove('hidden');
}

// Display error in the widget
function displayError(message) {
  const loadingElement = document.getElementById('ig-mlm-loading');
  const resultElement = document.getElementById('ig-mlm-result');
  const errorElement = document.getElementById('ig-mlm-error');
  const errorMessage = document.getElementById('ig-mlm-error-message');
  
  if (loadingElement) loadingElement.classList.add('hidden');
  if (resultElement) resultElement.classList.add('hidden');
  
  if (errorMessage) errorMessage.textContent = message || 'Error analyzing post';
  if (errorElement) errorElement.classList.remove('hidden');
}

// Format reasoning key for display
function formatReasoningKey(key) {
  return key.replace(/\b\w/g, l => l.toUpperCase());
}