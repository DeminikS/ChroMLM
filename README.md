# ChroMLM - Instagram MLM Detector Chrome Extension

ChroMLM is a Chrome extension that uses machine learning to detect Multi-Level Marketing (MLM) content in Instagram posts. The extension analyzes posts in real-time, providing users with immediate feedback on whether the content shows characteristics of MLM promotional material.

## Features

- **Real-time MLM Detection**: Analyzes Instagram posts as you browse
- **Visual Overlay**: Non-intrusive widget that shows detection results directly on Instagram
- **Confidence Metrics**: View the certainty percentage of the detection
- **Detailed Reasoning**: See specific factors that contributed to the MLM classification
- **History Tracking**: Keep a record of previously analyzed posts
- **Statistics Dashboard**: Track detection patterns over time
- **Customizable Settings**: Configure widget position, notification levels, and auto-analysis options

## Architecture

The project consists of two main components:

1. **Chrome Extension** - Frontend interface that integrates with Instagram
2. **Python Backend Server** - Handles Instagram data scraping and LLM-based analysis

### System Flow

1. User visits an Instagram post
2. Content script injects the MLM detection widget
3. When analysis is triggered, the post URL is sent to the backend
4. Backend scrapes post content and user profile data
5. Data is standardized and sent to the LLM model (via LMStudio)
6. LLM analyzes the content for MLM characteristics
7. Results are returned to the extension and displayed to the user

## Installation

### Prerequisites

- Google Chrome browser
- Python 3.8+ for the backend server
- [LM Studio](https://lmstudio.ai/) with a running model for analysis

### Backend Server Setup

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/chromlm.git
   cd ChroMLM
   ```

2. Configure LM Studio:
   - Launch LM Studio and start a local server with your preferred model
   - Ensure it's running on http://localhost:1234
   - No authentication is required as the default API key "lm-studio" is used

3. Start the backend server:
   ```
   cd scripts
   chmod +x deploy-server.sh
   ./deploy-server.sh
   ```

### Chrome Extension Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top-right corner
3. Click "Load unpacked" and select the `ChroMLM` directory from the cloned repository
4. The extension icon should appear in your Chrome toolbar

## Usage

1. **Browsing Instagram**: Navigate to Instagram and visit any post page (URL pattern: instagram.com/p/*)

2. **Analyzing Posts**: 
   - The MLM detector widget appears automatically on Instagram post pages
   - If auto-analyze is enabled, the post will be analyzed automatically
   - Otherwise, click the "Analyze Post" button in the widget

3. **Viewing Results**:
   - The widget displays whether MLM content was detected
   - See the confidence percentage of the detection
   - Expand "View Details" to see specific reasoning

4. **Extension Popup**:
   - Click the extension icon in your Chrome toolbar
   - View current post analysis
   - Check history of previously analyzed posts
   - View statistics about detected MLM content
   - Configure extension settings

## Configuration Options

Access these settings through the extension popup's "Settings" tab:

- **Widget Visibility**: Enable/disable the on-page widget
- **Widget Position**: Choose where the widget appears (top-right, bottom-left, etc.)
- **Auto-Analyze**: Toggle automatic analysis when visiting posts
- **Notification Level**: 
  - All Results: Always show widget
  - MLM Posts Only: Only show widget when MLM is detected
  - High Confidence Only: Only show when MLM is detected with high certainty
  - None: Never show widget automatically (access via popup)

## Technical Details

### Backend Components

- **FastAPI Server**: Provides API endpoints for the extension
- **Instagram Scrapers**: Collects post and profile data
- **Data Standardizer**: Processes raw data into a consistent format
- **LMStudio Interface**: Communicates with the LLM for content analysis

### Extension Components

- **Content Script**: Integrates with Instagram pages
- **Background Service Worker**: Handles API communication
- **Popup Interface**: Provides user controls and information display
- **Storage Manager**: Maintains history and settings

## Development

### Backend Development

The server is built with FastAPI and uses asynchronous patterns for better performance:

```
Server/
├── requirements.txt         # Python dependencies
├── src/
    ├── Aggregators/         # Data collection modules
    ├── Backend/             # FastAPI server setup
    ├── DataStandardization/ # Data processing
    ├── Instagram/           # Instagram scrapers
    └── LLM/                 # LMStudio integration
```

### Extension Development

The Chrome extension follows standard Web Extension architecture:

```
ChroMLM/
├── manifest.json           # Extension configuration
├── background/             # Background service worker
├── content/                # Content scripts
└── popup/                  # User interface
```

## Troubleshooting

- **Widget Not Appearing**: Ensure the extension is enabled and check widget visibility in settings
- **Analysis Fails**: Verify the backend server is running and LM Studio is accessible
- **Instagram Changes**: Social media platforms frequently update their structure; if scraping fails, updates may be needed

## Privacy Note

This extension analyzes Instagram content locally through your backend server. No data is sent to external services beyond communicating with LM Studio on your local machine. All analysis history is stored in your browser's local storage.

## Acknowledgments

- This extension uses LM Studio for local LLM inference
- Instagram data is accessed via public GraphQL endpoints