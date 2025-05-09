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

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

deploy_local() {
    print_status "Deploying MLM Detector server locally..."
    
    cd ../Server || { print_error "Server directory not found"; exit 1; }
    
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
    
    if [ ! -d ".venv" ]; then
        print_status "Creating Python virtual environment..."
        $PYTHON_CMD -m venv venv
    fi
    
    print_status "Activating virtual environment..."
    source .venv/bin/activate
    
    print_status "Installing dependencies..."
    pip install -q -r requirements.txt
    
    if ! curl -s http://localhost:1234/v1/models > /dev/null; then
        print_warning "LM Studio API doesn't appear to be running at http://localhost:1234/v1"
        print_warning "Make sure LM Studio is started with a model loaded."
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_status "Exiting. Please start LM Studio and try again."
            deactivate
            exit 0
        fi
    fi
    
    print_status "Starting backend server..."
    $PYTHON_CMD -m uvicorn src.Backend.backend:app --host 127.0.0.1 --port 8000 --reload
    
    deactivate
}

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

main "$@"