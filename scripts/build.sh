#!/bin/bash
# Build script for GSuite CLI Linux project

set -e

echo "=== Building GSuite CLI Linux Project ==="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "Error: package.json not found. Are you in the project root?"
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
else
    echo "Dependencies already installed."
fi

# Build the project
echo "Building TypeScript..."
npm run build

# Check if build succeeded
if [ -d "dist" ]; then
    echo ""
    echo "✅ Build successful!"
    echo "Dist directory created at: $(pwd)/dist"
    echo ""
    echo "To run the CLI:"
    echo "  npm run dev          # Development mode (tsx)"
    echo "  npm start            # Production mode (node dist/index.js)"
    echo "  npx gsuite --help    # If linked globally"
else
    echo "❌ Build failed - dist directory not created"
    exit 1
fi