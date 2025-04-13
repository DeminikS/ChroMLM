let settings = {
  widgetEnabled: true,
  widgetPosition: 'bottom-right',
  autoAnalyze: true,
  notificationLevel: 'all'
};
let lastAnalyzedUrl = '';
let lastAnalysisTime = 0;
let analysisInProgress = false;
let widgetVisible = false;
let observingContent = false;
initializeExtension();
function initializeExtension() {
  chrome.storage.local.get(['settings'], function(data) {
    if (data.settings) {
      settings = data.settings;
    }
    setupPageObservers();
    if (isInstagramPost(window.location.href)) {
      setupWidgetForCurrentPage();
    }
  });
}
function setupPageObservers() {
  if (observingContent) return;
  let lastUrl = window.location.href;
  const observer = new MutationObserver((mutations) => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      handleUrlChange(currentUrl);
    }
    if (isInstagramPost(currentUrl) && !widgetVisible && settings.widgetEnabled) {
      const postContent = document.querySelector('article[role="presentation"]');
      if (postContent) {
        setupWidgetForCurrentPage();
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  observingContent = true;
  console.log('MLM Detector: Page observers initialized');
}
function handleUrlChange(url) {
  console.log('MLM Detector: URL changed to', url);
  if (isInstagramPost(url)) {
    if (settings.widgetEnabled) {
      attemptWidgetSetup();
    }
  } else {
    hideWidget();
  }
}
function attemptWidgetSetup(attempt = 0) {
  if (attempt >= 5) return; 
  const delay = Math.pow(2, attempt) * 100;
  setTimeout(() => {
    if (document.querySelector('article[role="presentation"]')) {
      setupWidgetForCurrentPage();
    } else {
      attemptWidgetSetup(attempt + 1);
    }
  }, delay);
}
function setupWidgetForCurrentPage() {
  const currentUrl = window.location.href;
  if (!isInstagramPost(currentUrl) || !settings.widgetEnabled) {
    return;
  }
  console.log('MLM Detector: Setting up widget for current page');
  let widget = document.getElementById('mlm-detector-widget');
  if (widget) {
    updateWidgetPosition(widget);
    widget.classList.remove('hidden');
    widgetVisible = true;
  } else {
    createWidget();
  }
  if (settings.autoAnalyze) {
    checkAndAnalyzePost(currentUrl);
  }
}
function createWidget() {
  const widget = document.createElement('div');
  widget.id = 'mlm-detector-widget';
  widget.className = 'ig-mlm-detector';
  updateWidgetPosition(widget);
  widget.innerHTML = `
    <div class="ig-mlm-header">
      <h3>MLM Detector</h3>
      <div class="ig-mlm-header-actions">
        <button class="ig-mlm-minimize" aria-label="Minimize">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <button class="ig-mlm-close" aria-label="Close">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
    <div id="ig-mlm-content" class="ig-mlm-content">
      <div id="ig-mlm-status" class="ig-mlm-status">
        <div id="ig-mlm-loading" class="ig-mlm-loading hidden">
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
              <summary>
                <span>View Details</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </summary>
              <ul id="ig-mlm-reasoning-list"></ul>
            </details>
          </div>
        </div>
        <div id="ig-mlm-error" class="ig-mlm-error hidden">
          <p id="ig-mlm-error-message">Error analyzing post</p>
          <button id="ig-mlm-retry" class="ig-mlm-button">
            <span>Retry</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 2v6h-6"></path>
              <path d="M3 12a9 9 0 0 1 15-6.7l3 2.7"></path>
              <path d="M3 22v-6h6"></path>
              <path d="M21 12a9 9 0 0 1-15 6.7l-3-2.7"></path>
            </svg>
          </button>
        </div>
        <div id="ig-mlm-waiting" class="ig-mlm-waiting">
          <p>Click to analyze this post for MLM content</p>
          <button id="ig-mlm-analyze" class="ig-mlm-button">
            <span>Analyze Post</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
  addWidgetStyles();
  document.body.appendChild(widget);
  widgetVisible = true;
  document.querySelector('.ig-mlm-close').addEventListener('click', hideWidget);
  document.querySelector('.ig-mlm-minimize').addEventListener('click', minimizeWidget);
  document.getElementById('ig-mlm-retry')?.addEventListener('click', () => {
    analyzeCurrentPost();
  });
  document.getElementById('ig-mlm-analyze')?.addEventListener('click', () => {
    analyzeCurrentPost();
  });
  console.log('MLM Detector: Widget created');
}
function addWidgetStyles() {
  if (document.getElementById('mlm-detector-styles')) return;
  const styleSheet = document.createElement('style');
  styleSheet.id = 'mlm-detector-styles';
  styleSheet.textContent = `
    .ig-mlm-detector, .ig-mlm-detector * {
      scrollbar-width: none; 
      -ms-overflow-style: none; 
    }
    .ig-mlm-detector *::-webkit-scrollbar {
      width: 0;
      height: 0;
      display: none; 
    }
    .ig-mlm-detector {
      --icon-size: 20px;
      --icon-stroke-width: 2.5px;
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
    .ig-mlm-detector.minimized {
      height: 40px;
      overflow: hidden;
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
    .ig-mlm-header-actions {
      display: flex;
      gap: 8px;
    }
    .ig-mlm-close, .ig-mlm-minimize {
      background: none;
      border: none;
      color: white;
      padding: 0;
      cursor: pointer;
      line-height: 1;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .ig-mlm-content {
      padding: 16px;
      overflow-y: auto;
      scrollbar-width: none; 
      -ms-overflow-style: none; 
    }
    .ig-mlm-content::-webkit-scrollbar {
      display: none; 
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
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .ig-mlm-reasoning ul {
      list-style: none;
      padding: 0;
      margin: 0;
      max-height: 200px;
      overflow-y: auto;
      scrollbar-width: none; 
      -ms-overflow-style: none; 
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
    .ig-mlm-waiting {
      text-align: center;
      padding: 16px 0;
    }
    .ig-mlm-button {
      background-color: #0095f6;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 8px 16px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 12px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
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
function updateWidgetPosition(widget = null) {
  widget = widget || document.getElementById('mlm-detector-widget');
  if (!widget) return;
  switch (settings.widgetPosition) {
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
function hideWidget() {
  const widget = document.getElementById('mlm-detector-widget');
  if (widget) {
    widget.classList.add('hidden');
    widgetVisible = false;
  }
}
function showWidget() {
  const widget = document.getElementById('mlm-detector-widget');
  if (widget) {
    widget.classList.remove('hidden');
    widget.classList.remove('minimized');
    widgetVisible = true;
  } else if (settings.widgetEnabled && isInstagramPost(window.location.href)) {
    createWidget();
  }
}
function minimizeWidget() {
  const widget = document.getElementById('mlm-detector-widget');
  if (widget) {
    widget.classList.toggle('minimized');
  }
}
function isInstagramPost(url) {
  return url && url.match(/https:\/\/www\.instagram\.com\/p\/[^/]+\/?/);
}
function checkAndAnalyzePost(url = window.location.href) {
  if (!isInstagramPost(url) || analysisInProgress) {
    return;
  }
  if (url === lastAnalyzedUrl && 
      Date.now() - lastAnalysisTime < 5000) {
    return;
  }
  chrome.storage.local.get(['history'], function(data) {
    const history = data.history || [];
    const existingAnalysis = history.find(item => item.url === url);
    if (existingAnalysis) {
      displayResult(existingAnalysis.result);
      const waitingElement = document.getElementById('ig-mlm-waiting');
      if (waitingElement) waitingElement.classList.add('hidden');
    } else if (settings.autoAnalyze) {
      analyzeCurrentPost();
    } else {
      const waitingElement = document.getElementById('ig-mlm-waiting');
      const loadingElement = document.getElementById('ig-mlm-loading');
      const resultElement = document.getElementById('ig-mlm-result');
      const errorElement = document.getElementById('ig-mlm-error');
      if (waitingElement) waitingElement.classList.remove('hidden');
      if (loadingElement) loadingElement.classList.add('hidden');
      if (resultElement) resultElement.classList.add('hidden');
      if (errorElement) errorElement.classList.add('hidden');
    }
  });
}
function analyzeCurrentPost() {
  const currentUrl = window.location.href;
  if (!isInstagramPost(currentUrl)) {
    return;
  }
  lastAnalyzedUrl = currentUrl;
  lastAnalysisTime = Date.now();
  analysisInProgress = true;
  showWidget();
  const waitingElement = document.getElementById('ig-mlm-waiting');
  const loadingElement = document.getElementById('ig-mlm-loading');
  const resultElement = document.getElementById('ig-mlm-result');
  const errorElement = document.getElementById('ig-mlm-error');
  if (waitingElement) waitingElement.classList.add('hidden');
  if (loadingElement) loadingElement.classList.remove('hidden');
  if (resultElement) resultElement.classList.add('hidden');
  if (errorElement) errorElement.classList.add('hidden');
  chrome.runtime.sendMessage(
    { action: 'analyzePost', url: currentUrl },
    function(response) {
      analysisInProgress = false;
      if (response && response.success) {
        displayResult(response.result);
        saveToHistory(currentUrl, response.result);
      } else {
        displayError(response ? response.error : 'Unknown error');
      }
    }
  );
}
function displayResult(result) {
  const waitingElement = document.getElementById('ig-mlm-waiting');
  const loadingElement = document.getElementById('ig-mlm-loading');
  const resultElement = document.getElementById('ig-mlm-result');
  const errorElement = document.getElementById('ig-mlm-error');
  const verdictElement = document.getElementById('ig-mlm-verdict-value');
  const certaintyBar = document.getElementById('ig-mlm-certainty-bar');
  const certaintyValue = document.getElementById('ig-mlm-certainty-value');
  const reasoningList = document.getElementById('ig-mlm-reasoning-list');
  if (result.error) {
    displayError(result.error);
    return;
  }
  if (waitingElement) waitingElement.classList.add('hidden');
  if (loadingElement) loadingElement.classList.add('hidden');
  if (errorElement) errorElement.classList.add('hidden');
  if (verdictElement) {
    verdictElement.textContent = result.verdict;
    verdictElement.className = result.verdict === 'Yes' ? 
                             'ig-mlm-verdict-value mlm-yes' : 
                             'ig-mlm-verdict-value';
  }
  const certaintyPercentage = parseInt(result.certainty);
  if (certaintyBar) certaintyBar.style.width = `${certaintyPercentage}%`;
  if (certaintyValue) certaintyValue.textContent = `${certaintyPercentage}%`;
  if (reasoningList) {
    reasoningList.innerHTML = '';
    Object.entries(result.reasoning).forEach(([key, value]) => {
      if (key === 'error') return;
      const formattedKey = key.replace(/_/g, ' ');
      const li = document.createElement('li');
      const factorSpan = document.createElement('span');
      factorSpan.className = 'ig-mlm-reasoning-factor';
      factorSpan.textContent = formatReasoningKey(formattedKey);
      const valueSpan = document.createElement('span');
      valueSpan.className = 'ig-mlm-reasoning-value';
      if (typeof value === 'boolean' || value === 'Yes' || value === 'No' || 
          value === 'yes' || value === 'no') {
        const isPositive = value === true || value === 'Yes' || value === 'yes';
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
  let shouldShowWidget = true;
  if (settings.notificationLevel === 'mlm-only' && result.verdict !== 'Yes') {
    shouldShowWidget = false;
  } else if (settings.notificationLevel === 'high-confidence' && 
             (result.verdict !== 'Yes' || parseInt(result.certainty) < 70)) {
    shouldShowWidget = false;
  } else if (settings.notificationLevel === 'none') {
    shouldShowWidget = false;
  }
  if (!shouldShowWidget) {
    hideWidget();
  }
  if (resultElement) resultElement.classList.remove('hidden');
}
function displayError(message) {
  const waitingElement = document.getElementById('ig-mlm-waiting');
  const loadingElement = document.getElementById('ig-mlm-loading');
  const resultElement = document.getElementById('ig-mlm-result');
  const errorElement = document.getElementById('ig-mlm-error');
  const errorMessage = document.getElementById('ig-mlm-error-message');
  if (waitingElement) waitingElement.classList.add('hidden');
  if (loadingElement) loadingElement.classList.add('hidden');
  if (resultElement) resultElement.classList.add('hidden');
  if (errorMessage) errorMessage.textContent = message || 'Error analyzing post';
  if (errorElement) errorElement.classList.remove('hidden');
}
function saveToHistory(url, result) {
  chrome.storage.local.get(['history'], function(data) {
    const history = data.history || [];
    const existingIndex = history.findIndex(item => item.url === url);
    if (existingIndex !== -1) {
      history[existingIndex] = {
        url: url,
        postId: extractPostId(url),
        result: result,
        timestamp: new Date().toISOString()
      };
    } else {
      history.unshift({
        url: url,
        postId: extractPostId(url),
        result: result,
        timestamp: new Date().toISOString()
      });
    }
    while (history.length > 20) {
      history.pop();
    }
    chrome.storage.local.set({ history: history });
  });
}
function extractPostId(url) {
  if (!url) return 'unknown';
  const match = url.match(/instagram\.com\/p\/([^/?]+)/);
  return match ? match[1] : 'unknown';
}
function formatReasoningKey(key) {
  return key.replace(/\b\w/g, l => l.toUpperCase());
}
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'updateSettings') {
    settings = message.settings;
    console.log('MLM Detector: Settings updated', settings);
    const widget = document.getElementById('mlm-detector-widget');
    if (widget) {
      if (settings.widgetEnabled) {
        updateWidgetPosition(widget);
        showWidget();
      } else {
        hideWidget();
      }
    } else if (settings.widgetEnabled && isInstagramPost(window.location.href)) {
      createWidget();
    }
  } else if (message.action === 'showWidget') {
    showWidget();
  } else if (message.action === 'hideWidget') {
    hideWidget();
  } else if (message.action === 'analyze') {
    analyzeCurrentPost();
  }
});