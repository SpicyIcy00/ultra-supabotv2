#!/bin/sh
# Railway Start Script
# This script is used if independent configuration fails

cd backend
# Install dependencies if they are missing (safety fallback)
pip install -r requirements.txt

# Start the application
exec uvicorn app.main:app --host 0.0.0.0 --port $PORT
