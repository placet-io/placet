#!/bin/sh
set -e

echo "Running Prisma db push..."
npx prisma db push

echo "Starting application..."
exec node dist/src/main.js
