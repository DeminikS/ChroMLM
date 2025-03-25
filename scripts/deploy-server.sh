#!/bin/bash

# Server deployment script for MLM Detector
# This script specifically handles server deployment

set -e  # Exit on error

# Define colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Environment variable for deployment target, default is local
DEPLOY_TARGET=${DEPLOY_TARGET:-local}

# Print header
echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}= MLM Detector Server Deploy Script =${NC}"
echo -e "${BLUE}=====================================${NC}"
echo

# Function to print status messages
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

# Function to print warning messages
print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Function to print error messages
print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Deploy locally using Python virtual environment
deploy_local() {
    print_status "Deploying MLM Detector server locally..."
    
    cd ../Server || { print_error "Server directory not found"; exit 1; }
    
    # Determine the correct Python command (python or python3)
    PYTHON_CMD="python"
    if ! command -v python &> /dev/null; then
        if command -v python3 &> /dev/null; then
            PYTHON_CMD="python3"
            print_status "Using python3 command instead of python"
        else
            print_error "Python is not installed or not in your PATH"
            print_status "Please install Python 3 and try again"
            exit 1
        fi
    fi
    
    # Check if Python virtual environment exists, create if it doesn't
    if [ ! -d ".venv" ]; then
        print_status "Creating Python virtual environment..."
        $PYTHON_CMD -m venv venv
    fi
    
    # Activate virtual environment
    print_status "Activating virtual environment..."
    source .venv/bin/activate
    
    # Install dependencies
    print_status "Installing dependencies..."
    pip install -r requirements.txt
    
    # Check if LM Studio is running
    if ! curl -s http://localhost:1234/v1/models > /dev/null; then
        print_warning "LM Studio API doesn't appear to be running at http://localhost:1234/v1"
        print_warning "Make sure LM Studio is started with the Llama 3.2 3B Instruct model loaded."
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_status "Exiting. Please start LM Studio and try again."
            deactivate
            exit 0
        fi
    fi
    
    # Start the server
    print_status "Starting backend server..."
    $PYTHON_CMD -m uvicorn src.Backend.backend:app --host 127.0.0.1 --port 8000 --reload
    
    # Deactivate virtual environment (this will only run if the server is stopped)
    deactivate
}

# Main function
main() {
    case "$DEPLOY_TARGET" in
        local)
            deploy_local
            ;;
        *)
            print_error "Unknown deployment target: $DEPLOY_TARGET"
            print_status "Valid targets are: local"
            exit 1
            ;;
    esac
}

# Execute main function
main "$@"