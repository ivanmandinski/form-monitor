#!/bin/bash
set -e

# Set up library path for Puppeteer/Chromium
# Find all required libraries in Nix store and add their directories to LD_LIBRARY_PATH
LIB_PATHS=""

# Function to find and add library path
add_lib_path() {
    local lib_name=$1
    local lib_path=$(find /nix/store -name "$lib_name" -type f 2>/dev/null | head -1 | xargs dirname 2>/dev/null || true)
    if [ -n "$lib_path" ]; then
        LIB_PATHS="$LIB_PATHS:$lib_path"
    fi
}

# Add all required libraries
add_lib_path "libglib-2.0.so*"
add_lib_path "libnss3.so*"
add_lib_path "libatk-1.0.so*"
add_lib_path "libatspi.so*"
add_lib_path "libdrm.so*"
add_lib_path "libXcomposite.so*"
add_lib_path "libXdamage.so*"
add_lib_path "libXrandr.so*"
add_lib_path "libGL.so*"
add_lib_path "libXss.so*"
add_lib_path "libasound.so*"
add_lib_path "libatk-bridge-2.0.so*"
add_lib_path "libcairo.so*"
add_lib_path "libpango*.so*"
add_lib_path "libgdk_pixbuf*.so*"
add_lib_path "libgtk-3.so*"
add_lib_path "libxkbcommon.so*"

# Export LD_LIBRARY_PATH
if [ -n "$LIB_PATHS" ]; then
    export LD_LIBRARY_PATH="${LIB_PATHS#:}:$LD_LIBRARY_PATH"
fi

# Clear cache
rm -rf bootstrap/cache/*.php

# Discover packages
php artisan package:discover --ansi

# Run migrations (continue even if they fail)
php artisan migrate --force || echo 'Migrations failed, continuing...'

# Start the server
php artisan serve --host=0.0.0.0 --port=$PORT

