// Background script for Instagram MLM Detector extension

// Listen for installation
chrome.runtime.onInstalled.addListener(function() {
  console.log('Instagram MLM Detector extension installed.');
  
  // Initialize storage
  chrome.storage.local.get(['history'], function(data) {
    if (!data.history) {
      chrome.storage.local.set({ history: [] });
    }
  });

  // Set default settings if not already set
  chrome.storage.local.get(['settings'], function(data) {
    if (!data.settings) {
      console.log('Setting default settings');
      chrome.storage.local.set({ 
        settings: {
          widgetEnabled: true,
          widgetPosition: 'bottom-right',
          autoAnalyze: true,
          notificationLevel: 'all'
        }
      });
    }
  });
});

// Listen for tab updates to inject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('instagram.com/p/')) {
    console.log('Tab updated with Instagram post URL:', tab.url);
    
    // Check if content script needs injection
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        // Check if our widget exists already
        const widgetExists = !!document.getElementById('mlm-detector-widget');
        return { 
          url: window.location.href, 
          widgetExists: widgetExists 
        };
      }
    }).then(results => {
      if (results && results[0] && !results[0].result.widgetExists) {
        console.log('Widget not found, notifying content script to initialize');
        // Notify content script to initialize
        chrome.tabs.sendMessage(tabId, { 
          action: 'initializeWidget'
        }).catch(err => {
          console.log('Could not send message to content script, might need to be injected');
        });
      }
    }).catch(err => {
      console.error('Error executing script: ', err);
    });
  }
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'analyzePost') {
    console.log('Background received analyze request for: ', message.url);
    analyzePost(message.url)
      .then(result => {
        console.log('Analysis complete: ', result);
        sendResponse({ success: true, result: result });
      })
      .catch(error => {
        console.error('Error analyzing post:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    // Return true to indicate that the response is async
    return true;
  } else if (message.action === 'contentScriptReady') {
    // Content script is ready and checking in
    console.log('Content script reported ready on: ', message.url);
    sendResponse({ acknowledged: true });
    return false;
  }
});

// Function to analyze a post via the backend API
async function analyzePost(url) {
  try {
    console.log('Sending request to API:', url);
    const apiUrl = 'http://127.0.0.1:8000/analyze/';
    
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
    
    // More careful handling of the JSON response
    try {
      const jsonData = await response.json();
      console.log('API response data:', jsonData);
      return jsonData;
    } catch (jsonError) {
      console.error('Error parsing JSON response:', jsonError);
      throw new Error('Failed to parse API response');
    }
  } catch (error) {
    console.error('Error in analyzePost:', error);
    throw error;
  }
}