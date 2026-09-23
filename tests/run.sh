#!/bin/sh
# Runs the pure-JS tests with macOS's built-in JavaScriptCore (no Node needed).
set -e
cd "$(dirname "$0")"
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
for t in *.test.js; do echo "$t:"; "$JSC" -m "$t"; done
