web: bash .railway/start.sh
horizon: export LD_LIBRARY_PATH=$(find /nix/store -name 'libglib-2.0.so*' -type f 2>/dev/null | head -1 | xargs dirname 2>/dev/null):$(find /nix/store -name 'libnss3.so*' -type f 2>/dev/null | head -1 | xargs dirname 2>/dev/null):$LD_LIBRARY_PATH && php artisan horizon
scheduler: export LD_LIBRARY_PATH=$(find /nix/store -name 'libglib-2.0.so*' -type f 2>/dev/null | head -1 | xargs dirname 2>/dev/null):$(find /nix/store -name 'libnss3.so*' -type f 2>/dev/null | head -1 | xargs dirname 2>/dev/null):$LD_LIBRARY_PATH && php artisan schedule:work

