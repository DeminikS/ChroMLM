# Instagram MLM Detector - Chrome Extension

A Chrome extension that analyzes Instagram posts to detect Multi-Level Marketing (MLM) content using a backend AI model.

## Features

- Detects MLM content on Instagram posts
- Analyzes posts in real-time
- Provides confidence percentage and detailed reasoning
- Maintains history of previously analyzed posts
- Integrates with Instagram's UI

## Installation (Development)

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/instagram-mlm-detector.git
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top-right corner

4. Click "Load unpacked" and select the extension directory

5. Set up the backend API server (see Backend Setup section)

## Backend Setup

1. Ensure you have Python and the required packages installed
2. Navigate to the SERVER directory
3. Start the backend server:
   ```
   python -m uvicorn src.BACKEND.backend:app --host 127.0.0.1 --port 8000
   ```

## Usage

1. Visit an Instagram post page
2. Click the MLM Detector extension icon in the Chrome toolbar
3. Click "Analyze This Post" to detect MLM content
4. View the analysis results and reasoning
5. Access your history of previously analyzed posts

## Project Structure

- `manifest.json` - Extension configuration
- `popup/` - UI that appears when clicking the extension icon
- `background/` - Background scripts for handling API requests
- `content/` - Scripts that interact with Instagram pages
- `assets/` - Icons and other static files
