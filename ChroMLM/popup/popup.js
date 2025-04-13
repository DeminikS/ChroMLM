document.addEventListener('DOMContentLoaded', function() {
  setupTabs();
  let currentUrl = '';
  let currentPostID = '';
  let analysisInProgress = false;
  const postIdElement = document.getElementById('post-id');
  const loadingContainer = document.getElementById('loading-container');
  const resultContainer = document.getElementById('result-container');
  const verdictElement = document.getElementById('verdict');
  const certaintyBar = document.getElementById('certainty-bar');
  const certaintyValue = document.getElementById('certainty-value');
  const reasoningList = document.getElementById('reasoning-list');
  const historyList = document.getElementById('history-list');
  const mlmPercentageElement = document.getElementById('mlm-percentage');
  const totalAnalyzedElement = document.getElementById('total-analyzed');
  const confidenceChart = document.getElementById('confidence-chart');
  const clearHistoryBtn = document.getElementById('clear-history');
  const showWidgetBtn = document.getElementById('show-widget-btn');
  const DEFAULT_SETTINGS = {
    widgetEnabled: true,
    widgetPosition: 'bottom-right',
    autoAnalyze: true,
    notificationLevel: 'all'
  };
  initializeExtension();
  initializeSettings();
  updateStatistics();
  clearHistoryBtn.addEventListener('click', clearHistory);
  showWidgetBtn.addEventListener('click', showWidget);
  document.getElementById('save-settings').addEventListener('click', saveSettings);
  function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabPanes.forEach(pane => pane.classList.remove('active'));
        button.classList.add('active');
        const tabName = button.getAttribute('data-tab');
        document.getElementById(`${tabName}-tab`).classList.add('active');
        if (tabName === 'history') {
          refreshHistory();
        } else if (tabName === 'stats') {
          updateStatistics();
        } else if (tabName === 'settings') {
          initializeSettings();
        }
      });
    });
  }
  function initializeExtension() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      currentUrl = tabs[0].url;
      if (isInstagramPost(currentUrl)) {
        currentPostID = extractPostId(currentUrl);
        postIdElement.textContent = `Instagram Post: ${currentPostID}`;
        checkExistingAnalysis(currentUrl).then(existingAnalysis => {
          if (existingAnalysis) {
            displayResult(existingAnalysis);
          } else {
            analyzeCurrentPost();
          }
        });
      } else {
        postIdElement.textContent = 'Not an Instagram post';
        loadingContainer.classList.add('hidden');
        resultContainer.classList.add('hidden');
      }
    });
  }
  function initializeSettings() {
    chrome.storage.local.get(['settings'], function(data) {
      const settings = data.settings || DEFAULT_SETTINGS;
      document.getElementById('widget-enabled').checked = settings.widgetEnabled;
      document.getElementById('widget-position').value = settings.widgetPosition;
      document.getElementById('auto-analyze').checked = settings.autoAnalyze;
      document.getElementById('notification-level').value = settings.notificationLevel;
    });
  }
  function saveSettings() {
    const settings = {
      widgetEnabled: document.getElementById('widget-enabled').checked,
      widgetPosition: document.getElementById('widget-position').value,
      autoAnalyze: document.getElementById('auto-analyze').checked,
      notificationLevel: document.getElementById('notification-level').value
    };
    chrome.storage.local.set({ settings: settings }, function() {
      chrome.tabs.query({}, function(tabs) {
        tabs.forEach(tab => {
          if (tab.url && tab.url.includes('instagram.com')) {
            chrome.tabs.sendMessage(tab.id, { 
              action: 'updateSettings', 
              settings: settings 
            }).catch(err => console.log('Could not send message to tab', err));
          }
        });
      });
      const saveBtn = document.getElementById('save-settings');
      const originalText = saveBtn.textContent;
      saveBtn.textContent = 'Settings Saved!';
      saveBtn.disabled = true;
      setTimeout(() => {
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
      }, 2000);
    });
  }
  function showWidget() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0].url && tabs[0].url.includes('instagram.com')) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'showWidget'
        }).catch(err => console.log('Could not show widget', err));
      }
    });
  }
  async function checkExistingAnalysis(url) {
    return new Promise(resolve => {
      chrome.storage.local.get(['history'], function(data) {
        const history = data.history || [];
        const existingAnalysis = history.find(item => item.url === url);
        resolve(existingAnalysis ? existingAnalysis.result : null);
      });
    });
  }
  function analyzeCurrentPost() {
    if (analysisInProgress) return;
    analysisInProgress = true;
    loadingContainer.classList.remove('hidden');
    resultContainer.classList.add('hidden');
    analyzeInstagramPost(currentUrl)
      .then(result => {
        displayResult(result);
        saveToHistory(currentUrl, result);
        updateStatistics();
      })
      .catch(error => {
        console.error('Analysis error:', error);
        displayError(error.message);
      })
      .finally(() => {
        analysisInProgress = false;
      });
  }
  async function analyzeInstagramPost(url) {
    try {
      const apiUrl = 'http://127.0.0.1:8000/analyze/'
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: url })
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      throw error;
    }
  }
  function displayResult(result) {
    loadingContainer.classList.add('hidden');
    if (result.error) {
      displayError(result.error);
      return;
    }
    verdictElement.textContent = result.verdict;
    verdictElement.className = result.verdict === 'Yes' ? 'verdict-value mlm-yes' : 'verdict-value';
    const certaintyPercentage = parseInt(result.certainty);
    certaintyBar.style.width = `${certaintyPercentage}%`;
    certaintyValue.textContent = `${certaintyPercentage}%`;
    reasoningList.innerHTML = '';
    Object.entries(result.reasoning).forEach(([key, value]) => {
      const formattedKey = key.replace(/_/g, ' ');
      const isRelevantFactor = typeof value === 'boolean' || 
                               (typeof value === 'string' && (value.toLowerCase() === 'yes' || value.toLowerCase() === 'no'));
      const li = document.createElement('li');
      const factorSpan = document.createElement('span');
      factorSpan.className = 'reasoning-factor';
      factorSpan.textContent = formatReasoningKey(formattedKey);
      const valueSpan = document.createElement('span');
      valueSpan.className = 'reasoning-value';
      if (isRelevantFactor) {
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
    resultContainer.classList.remove('hidden');
  }
  function displayError(message) {
    loadingContainer.classList.add('hidden');
    reasoningList.innerHTML = `<li><span class="reasoning-factor">Error</span><span class="reasoning-value positive">${message}</span></li>`;
    verdictElement.textContent = 'Error';
    verdictElement.className = 'verdict-value mlm-yes';
    certaintyBar.style.width = '0%';
    certaintyValue.textContent = '0%';
    resultContainer.classList.remove('hidden');
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
      chrome.storage.local.set({ history: history }, function() {
        refreshHistory();
      });
    });
  }
  function refreshHistory() {
    if (!document.getElementById('history-tab').classList.contains('active')) {
      return;
    }
    chrome.storage.local.get(['history'], function(data) {
      const history = data.history || [];
      historyList.innerHTML = '';
      if (history.length === 0) {
        historyList.innerHTML = '<div class="empty-history">No analysis history yet</div>';
        return;
      }
      history.forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        const postInfo = document.createElement('div');
        postInfo.className = 'history-post-id';
        postInfo.textContent = `Post: ${item.postId || extractPostId(item.url)}`;
        const resultInfo = document.createElement('div');
        resultInfo.className = 'history-result';
        const verdict = document.createElement('div');
        verdict.className = 'history-verdict';
        const verdictLabel = document.createElement('span');
        verdictLabel.className = 'history-verdict-label';
        verdictLabel.textContent = 'MLM:';
        const verdictValue = document.createElement('span');
        verdictValue.className = item.result.verdict === 'Yes' ? 
                               'history-verdict-value mlm-yes' : 
                               'history-verdict-value';
        verdictValue.textContent = item.result.verdict;
        verdict.appendChild(verdictLabel);
        verdict.appendChild(verdictValue);
        const certainty = document.createElement('div');
        certainty.className = 'history-certainty';
        certainty.textContent = `${item.result.certainty}% certainty`;
        resultInfo.appendChild(verdict);
        resultInfo.appendChild(certainty);
        historyItem.appendChild(postInfo);
        historyItem.appendChild(resultInfo);
        historyItem.addEventListener('click', function() {
          chrome.tabs.create({ url: item.url });
        });
        historyList.appendChild(historyItem);
      });
    });
  }
  function updateStatistics() {
    chrome.storage.local.get(['history'], function(data) {
      const history = data.history || [];
      if (history.length === 0) {
        mlmPercentageElement.textContent = '0%';
        totalAnalyzedElement.textContent = '0';
        return;
      }
      const totalAnalyzed = history.length;
      const mlmDetected = history.filter(item => 
        item.result && item.result.verdict === 'Yes'
      ).length;
      const mlmPercentage = Math.round((mlmDetected / totalAnalyzed) * 100);
      mlmPercentageElement.textContent = `${mlmPercentage}%`;
      totalAnalyzedElement.textContent = totalAnalyzed.toString();
      updateConfidenceChart(history);
    });
  }
  function updateConfidenceChart(history) {
    if (!history || history.length === 0) {
      confidenceChart.innerHTML = '<div class="chart-placeholder"><p>Analyze more posts to view statistics</p></div>';
      return;
    }
    confidenceChart.innerHTML = '';
    const ranges = [
      { min: 0, max: 20, count: 0, label: '0-20%' },
      { min: 21, max: 40, count: 0, label: '21-40%' },
      { min: 41, max: 60, count: 0, label: '41-60%' },
      { min: 61, max: 80, count: 0, label: '61-80%' },
      { min: 81, max: 100, count: 0, label: '81-100%' }
    ];
    history.forEach(item => {
      if (item.result && !isNaN(item.result.certainty)) {
        const certainty = parseInt(item.result.certainty);
        const range = ranges.find(r => certainty >= r.min && certainty <= r.max);
        if (range) range.count++;
      }
    });
    const maxCount = Math.max(...ranges.map(r => r.count));
    if (maxCount === 0) {
      confidenceChart.innerHTML = '<div class="chart-placeholder"><p>No valid certainty data available</p></div>';
      return;
    }
    ranges.forEach(range => {
      const barHeight = maxCount > 0 ? (range.count / maxCount) * 100 : 0;
      const barElement = document.createElement('div');
      barElement.className = 'chart-bar';
      barElement.style.height = `${barHeight}%`;
      const labelElement = document.createElement('div');
      labelElement.className = 'chart-bar-label';
      labelElement.textContent = range.label;
      barElement.appendChild(labelElement);
      confidenceChart.appendChild(barElement);
    });
  }
  function clearHistory() {
    if (confirm('Are you sure you want to clear all analysis history?')) {
      chrome.storage.local.set({ history: [] }, function() {
        refreshHistory();
        updateStatistics();
      });
    }
  }
  function openSettings() {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
    const settingsTabBtn = document.querySelector('[data-tab="settings"]');
    if (settingsTabBtn) {
      settingsTabBtn.classList.add('active');
      document.getElementById('settings-tab').classList.add('active');
      initializeSettings();
    }
  }
  function isInstagramPost(url) {
    return url && url.match(/https:\/\/www\.instagram\.com\/p\/[^/]+\/?/);
  }
  function extractPostId(url) {
    if (!url) return 'unknown';
    const match = url.match(/instagram\.com\/p\/([^/?]+)/);
    return match ? match[1] : 'unknown';
  }
  function formatReasoningKey(key) {
    return key.replace(/\b\w/g, l => l.toUpperCase());
  }
});