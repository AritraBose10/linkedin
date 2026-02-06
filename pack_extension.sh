#!/bin/bash

# Configuration
E_NAME="linkedin-copilot"
VERSION=$(grep '"version":' manifest.json | cut -d '"' -f 4)
ZIP_NAME="${E_NAME}-v${VERSION}.zip"

# Clean up old zip if exists
rm -f "$ZIP_NAME"

# Create the zip file
echo "📦 Packaging $E_NAME v$VERSION..."

zip -r "$ZIP_NAME" . \
    -x "*.git*" \
    -x "*.DS_Store" \
    -x "tests/*" \
    -x "extract_snippet.txt" \
    -x "pack_extension.sh" \
    -x "deployment_guide.md" \
    -x "README.md" \
    -x "tailwind.config.js" \
    -x "popup/input.css" \
    -x "package.json" \
    -x "package-lock.json" \
    -x "node_modules/*"

echo "✅ Done! Created $ZIP_NAME"
echo "   File size: $(du -h "$ZIP_NAME" | cut -f1)"
