# ZONA Stage 13 — Timeweb Cloud Production

## Recommended architecture

One App Platform container:
- React frontend
- Express API
- Digit sync API

Separate Timeweb services:
- Managed PostgreSQL
- S3 bucket for product photos

This avoids two different domains for frontend/API and prevents uploaded photos
from disappearing on App Platform redeploys.

## 1. PostgreSQL
Create a PostgreSQL cluster in Timeweb Cloud.
Copy host, port, database, user, password.
TLS is recommended.

No manual schema import is required for a new empty database:
the application runs database/schema.sql at startup.

## 2. S3
Create a PUBLIC bucket for product images.
Copy:
- endpoint
- bucket
- Access Key
- Secret Key
- public URL

Without S3 the application falls back to local uploads, but App Platform
containers are ephemeral, so local uploaded files can disappear after redeploy.
For production use S3.

## 3. Git repository
Upload this project to GitHub/GitLab/Bitbucket.
Dockerfile must remain in the repository root.

## 4. App Platform
Timeweb Cloud -> App Platform -> Create -> Dockerfile.
Connect the repository.
Dockerfile is detected automatically.

Health check:
 /api/health

Add all environment variables from .env.production.example in the Timeweb panel.
Do NOT upload a real .env file to Git.

## 5. Domain
Attach your real ZONA domain to the App Platform app.
Set both:
FRONTEND_ORIGIN=https://domain.ru
PUBLIC_API_URL=https://domain.ru

One domain is enough because frontend and API are served by the same container.

## 6. Digit Учет
After production deployment change only one field:

URL API сайта:
https://domain.ru

API key:
must equal DIGIT_SYNC_API_KEY from Timeweb environment variables.

Then click:
Сохранить подключение
Синхронизировать сейчас

## 7. Verify
Open:
https://domain.ru/api/health

Then from PowerShell:
Invoke-RestMethod `
  -Uri "https://domain.ru/api/digit/status" `
  -Headers @{"X-DIGIT-API-KEY"="YOUR_KEY"}

Expected:
ok = True

## Important
Do not expose PostgreSQL 5432 publicly unless absolutely necessary.
The website container should connect to PostgreSQL; Digit Учет connects only
to the HTTPS Node API.