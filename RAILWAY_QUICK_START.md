# Railway Quick Start Guide

This is a condensed guide for deploying Form Monitor on Railway. For detailed instructions, see [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md).

## Quick Deploy (5 Minutes)

### 1. Create Railway Project

1. Go to [railway.app](https://railway.app) and sign up
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository

### 2. Add Services

Add these services in Railway:

- **PostgreSQL** (or MySQL) - Database
- **Redis** - Queue and cache

### 3. Configure Environment Variables

In your web service, add these essential variables:

```env
# App
APP_ENV=production
APP_DEBUG=false
APP_URL=https://your-app.up.railway.app

# Database (use Railway's variable references)
DB_CONNECTION=pgsql
DB_HOST=${{Postgres.DB_HOST}}
DB_PORT=${{Postgres.DB_PORT}}
DB_DATABASE=${{Postgres.DB_DATABASE}}
DB_USERNAME=${{Postgres.DB_USER}}
DB_PASSWORD=${{Postgres.DB_PASSWORD}}

# Redis
REDIS_HOST=${{Redis.REDIS_HOST}}
REDIS_PASSWORD=${{Redis.REDIS_PASSWORD}}
REDIS_PORT=${{Redis.REDIS_PORT}}

# Drivers
CACHE_DRIVER=redis
SESSION_DRIVER=redis
QUEUE_CONNECTION=redis

# Generate APP_KEY
APP_KEY=
```

Then run: `railway run php artisan key:generate --force`

### 4. Deploy

Railway will automatically deploy when you push to GitHub, or run:
```bash
railway up
```

### 5. Run Migrations

```bash
railway run php artisan migrate --force
```

### 6. Add Workers (Important!)

You need to run three processes:

**Option A: Create Separate Services** (Recommended)
- Create 3 services from the same repo:
  1. Web service (already created) - runs `web` from Procfile
  2. Horizon service - start command: `php artisan horizon`
  3. Scheduler service - start command: `php artisan schedule:work`

**Option B: Use Procfile** (Single service)
- Railway will automatically run all processes from `Procfile`

## Required Environment Variables

| Variable | Value |
|----------|-------|
| `APP_KEY` | Generate with `php artisan key:generate` |
| `DB_CONNECTION` | `pgsql` or `mysql` |
| `DB_*` | Use `${{ServiceName.VAR}}` syntax |
| `REDIS_*` | Use `${{Redis.VAR}}` syntax |
| `CACHE_DRIVER` | `redis` |
| `QUEUE_CONNECTION` | `redis` |
| `SESSION_DRIVER` | `redis` |

## Troubleshooting

- **App won't start**: Check `APP_KEY` is set
- **Database error**: Verify DB variables use `${{}}` syntax
- **Queue not working**: Ensure Horizon service is running
- **Puppeteer errors**: Check Chrome is installed (handled by `nixpacks.toml`)

## Next Steps

- Set up custom domain in Railway settings
- Seed database: `railway run php artisan db:seed --class=AdminUserSeeder`
- Access Horizon: `https://your-app.up.railway.app/horizon`

For detailed instructions, see [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md).

