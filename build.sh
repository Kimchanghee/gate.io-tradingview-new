#!/bin/bash

echo "Building Gate.io Trading Bot..."

# Remove package-lock.json if it exists
rm -f package-lock.json

# Clean install
rm -rf node_modules

# Install dependencies
npm install

# Generate new package-lock.json
npm shrinkwrap

# Build Docker image
docker build -t gate-bot:latest .

echo "Build complete!"
