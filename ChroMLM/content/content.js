// Content script for Instagram MLM Detector
// This runs on Instagram post pages

// Initialize the extension UI elements
function initializeUI() {
    // Check if we've already initialized to avoid duplicates
    if (document.getElementById('mlm-detector-widget')) {
      return;
    }
    
    // Create the MLM detector widget
    const widget = document.createElement('div');
    widget.id = 'mlm-detector-widget';
    widget.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background-color: #1e1e1e;
      color: #e0e0e0;
      border-radius: 10px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
      z-index: 9999;
      padding: 15px;
      max-width: 300px;
      font-family: Arial, sans-serif;
      display: none;
    `;
    
    // Add widget content
    widget.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <h3 style="margin: 0; font-size: 16px; color: #fff;">MLM Detector</h3>
        <span id="mlm-close-btn" style="cursor: pointer; font-size: 18px; color: #aaa;">&times;</span>
      </div>
      <div id="mlm-status">
        <button id="mlm-analyze-btn" style="
          background-color: #d32f2f;
          color: white;
          padding: 8px 15px;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
          width: 100%;
        ">Analyze This Post</button>
        <div id="mlm-loading" style="display: none; margin-top: 10px; text-align: center;">
          Analyzing post...
        </div>
      </div>
      <div id="mlm-result" style="display: none; margin-top: 10px;">
        <div style="padding: 10px; background: #2c2c2c; border-radius: 5px;">
          <p><strong>MLM Detected:</strong> <span id="mlm-verdict">Unknown</span></p>
          <p><strong>Certainty:</strong> <span id="mlm-certainty">0</span>%</p>
          <details>
            <summary style="cursor: pointer; margin-top: 5px;">View Reasoning</summary>
            <ul id="mlm-reasoning" style="margin-top: 5px; padding-left: 20px; font-size: 13px;"></ul>
          </details>
        </div>
      </div>
    `;
    
    // Append the widget to the body
    document.body.appendChild(widget);
    
    // Add event listeners
    document.getElementById('mlm-close-btn').addEventListener('click', function() {
      widget.style.display = 'none';
    });
    
    document.getElementById('mlm-analyze-btn').addEventListener('click', function() {
      analyzeCurrentPost();
    });
    
    // Show the widget
    widget.style.display = 'block';
  }
  
  // Function to analyze the current post
  function analyzeCurrentPost() {
    const widget = document.getElementById('mlm-detector-widget');
    const analyzeBtn = document.getElementById('mlm-analyze-btn');
    const loadingElement = document.getElementById('mlm-loading');
    const resultElement = document.getElementById('mlm-result');
    
    // Show loading state
    analyzeBtn.disabled = true;
    loadingElement.style.display = 'block';
    resultElement.style.display = 'none';
    
    // Get current URL
    const url = window.location.href;
    
    // Send message to background script to analyze the post
    chrome.runtime.sendMessage(
      { action: 'analyzePost', url: url },
      function(response) {
        // Hide loading state
        loadingElement.style.display = 'none';
        analyzeBtn.disabled = false;
        
        if (response && response.success) {
          // Display result
          displayResult(response.result);
        } else {
          // Display error
          const error = response ? response.error : 'Unknown error';
          alert('Error analyzing post: ' + error);
        }
      }
    );
  }
  
  // Function to display analysis result
  function displayResult(result) {
    const resultElement = document.getElementById('mlm-result');
    const verdictElement = document.getElementById('mlm-verdict');
    const certaintyElement = document.getElementById('mlm-certainty');
    const reasoningElement = document.getElementById('mlm-reasoning');
    
    if (result.error) {
      verdictElement.textContent = 'Error';
      certaintyElement.textContent = '0';
      reasoningElement.innerHTML = `<li style="color: #f44336;">Error: ${result.error}</li>`;
    } else {
      verdictElement.textContent = result.verdict;
      verdictElement.style.color = result.verdict === 'Yes' ? '#f44336' : '#4caf50';
      certaintyElement.textContent = result.certainty;
      
      // Display reasoning
      reasoningElement.innerHTML = '';
      Object.entries(result.reasoning).forEach(([key, value]) => {
        const formattedKey = key.replace(/_/g, ' ');
        const li = document.createElement('li');
        li.textContent = `${formattedKey}: ${typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value}`;
        reasoningElement.appendChild(li);
      });
    }
    
    resultElement.style.display = 'block';
  }
  
  // Listen for messages from background script
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.action === 'analyzeFromContextMenu') {
      // Initialize UI and analyze post when triggered from context menu
      initializeUI();
      analyzeCurrentPost();
    }
  });
  
  // Initialize UI when the page is fully loaded
  window.addEventListener('load', function() {
    // Check if this is an Instagram post page
    if (window.location.href.match(/https:\/\/www\.instagram\.com\/p\/[^/]+\/?/)) {
      // Wait a bit for Instagram's dynamic content to load
      setTimeout(initializeUI, 1500);
    }
  });
  
  // Create observer to detect URL changes (Instagram is a SPA)
  let lastUrl = window.location.href;
  new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      
      // Check if the new URL is an Instagram post
      if (currentUrl.match(/https:\/\/www\.instagram\.com\/p\/[^/]+\/?/)) {
        // Wait a bit for Instagram's dynamic content to load
        setTimeout(initializeUI, 1500);
      } else {
        // Hide the widget if we're no longer on a post page
        const widget = document.getElementById('mlm-detector-widget');
        if (widget) {
          widget.style.display = 'none';
        }
      }
    }
  }).observe(document, { subtree: true, childList: true });