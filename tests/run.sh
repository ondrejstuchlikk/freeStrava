#!/bin/sh
# Runs the pure-JS tests with macOS's built-in JavaScriptCore (no Node needed).
set -e
cd "$(dirname "$0")"
/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m metrics.test.js
