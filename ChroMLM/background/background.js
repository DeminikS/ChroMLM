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