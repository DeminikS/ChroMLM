document.addEventListener('DOMContentLoaded', function() {
    const analyzeBtn = document.getElementById('analyze-btn');
    const loadingElement = document.getElementById('loading');
    const resultContainer = document.getElementById('result-container');
    const currentUrlSpan = document.getElementById('current-url');
    const verdictSpan = document.getElementById('verdict');
    const certaintySpan = document.getElementById('certainty');
    const reasoningList = document.getElementById('reasoning-list');
    const historyList = document.getElementById('history-list');
    
    let currentUrl = '';
  
    console.log('Popup script loaded');
  
    // Check if current tab is an Instagram post
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      currentUrl = tabs[0].url;
      console.log('Current URL:', currentUrl);
      currentUrlSpan.textContent = currentUrl;
      
      // Enable the analyze button if we're on an Instagram post page
      if (isInstagramPost(currentUrl)) {
        console.log('Valid Instagram post detected');
        analyzeBtn.disabled = false;
      } else {
        console.log('Not a valid Instagram post URL');
      }
    });
  
    // Load history from storage
    loadHistory();
  
    // Add event listener to analyze button
    analyzeBtn.addEventListener('click', function() {
      console.log('Analyze button clicked');
      
      if (!isInstagramPost(currentUrl)) {
        alert('This is not an Instagram post URL');
        return;
      }
      
      // Show loading state
      analyzeBtn.disabled = true;
      loadingElement.classList.remove('hidden');
      resultContainer.classList.add('hidden');
      
      console.log('Sending message to analyze:', currentUrl);
      
      // Call backend API directly from popup instead of through background script
      analyzeInstagramPost(currentUrl)
        .then(result => {
          console.log('Analysis result received:', result);
          // Display result
          displayResult(result);
          
          // Save to history
          saveToHistory(currentUrl, result);
          
          // Refresh history display
          loadHistory();
        })
        .catch(error => {
          console.error('Analysis error:', error);
          alert('Error analyzing post: ' + error.message);
        })
        .finally(() => {
          // Hide loading state
          loadingElement.classList.add('hidden');
          analyzeBtn.disabled = false;
        });
    });
  
    // Function to check if URL is an Instagram post
    function isInstagramPost(url) {
      return url.match(/https:\/\/www\.instagram\.com\/p\/[^/]+\/?/);
    }
  
    // Function to analyze Instagram post
    async function analyzeInstagramPost(url) {
      console.log('Starting API request to:', url);
      const apiUrl = 'http://127.0.0.1:8000/analyze/';
      
      try {
        console.log('Fetching from API');
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ url: url })
        });
        
        console.log('API response status:', response.status);
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('API response data:', data);
        return data;
      } catch (error) {
        console.error('API request failed:', error);
        throw error;
      }
    }
  
    // Function to display result
    function displayResult(result) {
      if (result.error) {
        verdictSpan.textContent = 'Error';
        certaintySpan.textContent = '0';
        reasoningList.innerHTML = `<li class="error">Error: ${result.error}</li>`;
      } else {
        verdictSpan.textContent = result.verdict;
        verdictSpan.className = result.verdict === 'Yes' ? 'verdict-yes' : 'verdict-no';
        certaintySpan.textContent = result.certainty;
        
        // Display reasoning
        reasoningList.innerHTML = '';
        Object.entries(result.reasoning).forEach(([key, value]) => {
          const formattedKey = key.replace(/_/g, ' ');
          const li = document.createElement('li');
          li.textContent = `${formattedKey}: ${typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value}`;
          reasoningList.appendChild(li);
        });
      }
      
      resultContainer.classList.remove('hidden');
    }
  
    // Function to save to history
    function saveToHistory(url, result) {
      chrome.storage.local.get(['history'], function(data) {
        const history = data.history || [];
        
        // Add new item to the beginning of the array
        history.unshift({
          url: url,
          result: result,
          timestamp: new Date().toISOString()
        });
        
        // Keep only the last 10 items
        while (history.length > 10) {
          history.pop();
        }
        
        chrome.storage.local.set({ history: history });
      });
    }
  
    // Function to load history
    function loadHistory() {
      chrome.storage.local.get(['history'], function(data) {
        const history = data.history || [];
        
        historyList.innerHTML = '';
        
        if (history.length === 0) {
          historyList.innerHTML = '<p>No analysis history yet</p>';
          return;
        }
        
        history.forEach(item => {
          const historyItem = document.createElement('div');
          historyItem.className = 'history-item';
          
          // Extract post ID from URL for display
          const postId = extractPostId(item.url);
          
          historyItem.innerHTML = `
            <div class="history-url">Post: ${postId}</div>
            <div class="history-verdict ${item.result.verdict === 'Yes' ? 'verdict-yes' : 'verdict-no'}">
              MLM: ${item.result.verdict} (${item.result.certainty}%)
            </div>
          `;
          
          // Add click event to re-analyze this URL
          historyItem.addEventListener('click', function() {
            if (confirm('Do you want to open this post?')) {
              chrome.tabs.create({ url: item.url });
            }
          });
          
          historyList.appendChild(historyItem);
        });
      });
    }
    
    // Helper function to extract post ID from URL
    function extractPostId(url) {
      const match = url.match(/instagram\.com\/p\/([^/?]+)/);
      return match ? match[1] : 'unknown';
    }
  });