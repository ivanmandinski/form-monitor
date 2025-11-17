web: rm -rf bootstrap/cache/*.php && php artisan package:discover --ansi && (php artisan migrate --force || echo 'Migrations failed, continuing...') && php artisan serve --host=0.0.0.0 --port=$PORT
horizon: php artisan horizon
scheduler: php artisan schedule:work

