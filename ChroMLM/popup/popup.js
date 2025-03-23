document.addEventListener('DOMContentLoaded', function() {
    // Tab navigation
    setupTabs();
    
    // Initialize current tab
    let currentUrl = '';
    let currentPostID = '';
    let analysisInProgress = false;
    
    // Cache elements
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
    const settingsBtn = document.getElementById('settings-btn');
    
    // Initialize the extension
    initializeExtension();
    
    // Initialize stats
    updateStatistics();
    
    // Setup event listeners
    clearHistoryBtn.addEventListener('click', clearHistory);
    settingsBtn.addEventListener('click', openSettings);
    
    // Functions
    
    function setupTabs() {
      const tabButtons = document.querySelectorAll('.tab-btn');
      const tabPanes = document.querySelectorAll('.tab-pane');
      
      tabButtons.forEach(button => {
        button.addEventListener('click', () => {
          // Remove active class from all buttons and panes
          tabButtons.forEach(btn => btn.classList.remove('active'));
          tabPanes.forEach(pane => pane.classList.remove('active'));
          
          // Add active class to clicked button
          button.classList.add('active');
          
          // Show corresponding tab pane
          const tabName = button.getAttribute('data-tab');
          document.getElementById(`${tabName}-tab`).classList.add('active');
          
          // Update content if needed
          if (tabName === 'history') {
            refreshHistory();
          } else if (tabName === 'stats') {
            updateStatistics();
          }
        });
      });
    }
    
    function initializeExtension() {
      // Get current tab info
      chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        currentUrl = tabs[0].url;
        
        if (isInstagramPost(currentUrl)) {
          currentPostID = extractPostId(currentUrl);
          postIdElement.textContent = `Instagram Post: ${currentPostID}`;
          
          // Check if we already have analysis for this post
          checkExistingAnalysis(currentUrl).then(existingAnalysis => {
            if (existingAnalysis) {
              // Show cached results
              displayResult(existingAnalysis);
            } else {
              // Analyze automatically
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
        const apiUrl = 'http://127.0.0.1:8000/analyze/';
        
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
      
      // Update verdict
      verdictElement.textContent = result.verdict;
      verdictElement.className = result.verdict === 'Yes' ? 'verdict-value mlm-yes' : 'verdict-value';
      
      // Update certainty meter
      const certaintyPercentage = parseInt(result.certainty);
      certaintyBar.style.width = `${certaintyPercentage}%`;
      certaintyValue.textContent = `${certaintyPercentage}%`;
      
      // Display reasoning
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
        
        // Check if this URL is already in history
        const existingIndex = history.findIndex(item => item.url === url);
        
        if (existingIndex !== -1) {
          // Update existing entry
          history[existingIndex] = {
            url: url,
            postId: extractPostId(url),
            result: result,
            timestamp: new Date().toISOString()
          };
        } else {
          // Add new entry to the beginning
          history.unshift({
            url: url,
            postId: extractPostId(url),
            result: result,
            timestamp: new Date().toISOString()
          });
        }
        
        // Keep only the last 20 items
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
        return; // Don't refresh if tab isn't visible
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
          
          // Add click event to open this post
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
        
        // Update confidence chart
        updateConfidenceChart(history);
      });
    }
    
    function updateConfidenceChart(history) {
      // Skip if no history
      if (!history || history.length === 0) {
        confidenceChart.innerHTML = '<div class="chart-placeholder"><p>Analyze more posts to view statistics</p></div>';
        return;
      }
      
      // Clear previous chart
      confidenceChart.innerHTML = '';
      
      // Create ranges for certainty (0-20%, 21-40%, etc.)
      const ranges = [
        { min: 0, max: 20, count: 0, label: '0-20%' },
        { min: 21, max: 40, count: 0, label: '21-40%' },
        { min: 41, max: 60, count: 0, label: '41-60%' },
        { min: 61, max: 80, count: 0, label: '61-80%' },
        { min: 81, max: 100, count: 0, label: '81-100%' }
      ];
      
      // Count items in each range
      history.forEach(item => {
        if (item.result && !isNaN(item.result.certainty)) {
          const certainty = parseInt(item.result.certainty);
          const range = ranges.find(r => certainty >= r.min && certainty <= r.max);
          if (range) range.count++;
        }
      });
      
      // Find max count for scaling
      const maxCount = Math.max(...ranges.map(r => r.count));
      
      if (maxCount === 0) {
        confidenceChart.innerHTML = '<div class="chart-placeholder"><p>No valid certainty data available</p></div>';
        return;
      }
      
      // Create bars
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
      // This would open settings in the future
      alert('Settings functionality will be available in a future update.');
    }
    
    // Helper functions
    function isInstagramPost(url) {
      return url && url.match(/https:\/\/www\.instagram\.com\/p\/[^/]+\/?/);
    }
    
    function extractPostId(url) {
      if (!url) return 'unknown';
      const match = url.match(/instagram\.com\/p\/([^/?]+)/);
      return match ? match[1] : 'unknown';
    }
    
    function formatReasoningKey(key) {
      // Capitalize first letter of each word
      return key.replace(/\b\w/g, l => l.toUpperCase());
    }
  });