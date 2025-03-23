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
  });
  
  // Listen for messages from content scripts or popup
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.action === 'analyzePost') {
      analyzePost(message.url)
        .then(result => {
          sendResponse({ success: true, result: result });
        })
        .catch(error => {
          console.error('Error analyzing post:', error);
          sendResponse({ success: false, error: error.message });
        });
      
      // Return true to indicate that the response is async
      return true;
    }
  });
  
  // Function to analyze a post via the backend API
  async function analyzePost(url) {
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
      console.error('Error in analyzePost:', error);
      throw error;
    }
  }
  
  // Optional: Add context menu functionality
  chrome.contextMenus.create({
    id: 'analyze-instagram-post',
    title: 'Analyze for MLM content',
    contexts: ['link'],
    documentUrlPatterns: ['https://www.instagram.com/*']
  });
  
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'analyze-instagram-post') {
      // Check if the clicked link is an Instagram post
      if (info.linkUrl && info.linkUrl.match(/https:\/\/www\.instagram\.com\/p\/[^/]+\/?/)) {
        // Open the link in a new tab and analyze it
        chrome.tabs.create({ url: info.linkUrl }, (newTab) => {
          // Wait for the tab to load and then analyze
          chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
            if (tabId === newTab.id && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              
              // Execute content script to analyze the post
              chrome.tabs.sendMessage(tabId, { action: 'analyzeFromContextMenu' });
            }
          });
        });
      }
    }
  });
