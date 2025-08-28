#!/bin/sh
set -e

echo "Starting Jekyll Studio API..."

# Wait for dependencies
echo "Waiting for dependencies..."

# Wait for Redis (if using)
if [ -n "$REDIS_URL" ] || [ -n "$REDIS_HOST" ]; then
    echo "Waiting for Redis..."
    while ! nc -z ${REDIS_HOST:-redis} ${REDIS_PORT:-6379}; do
        sleep 1
    done
    echo "Redis is ready!"
fi

# Wait for PostgreSQL (if using)
if [ -n "$DATABASE_URL" ] || [ -n "$POSTGRES_HOST" ]; then
    echo "Waiting for PostgreSQL..."
    while ! nc -z ${POSTGRES_HOST:-postgres} ${POSTGRES_PORT:-5432}; do
        sleep 1
    done
    echo "PostgreSQL is ready!"
fi

# Initialize directories
echo "Initializing directories..."
mkdir -p /app/projects /app/templates

# Set proper permissions
chown -R nextjs:nodejs /app/projects /app/templates 2>/dev/null || true

# Validate environment variables
echo "Validating environment..."
if [ -z "$GEMINI_API_KEY" ]; then
    echo "WARNING: GEMINI_API_KEY is not set. AI features will not work."
fi

if [ -z "$NEXTAUTH_SECRET" ]; then
    echo "WARNING: NEXTAUTH_SECRET is not set. Using default (not secure for production)."
    export NEXTAUTH_SECRET="default-secret-change-in-production"
fi

# Start the application
echo "Starting Next.js server..."
exec node server.js