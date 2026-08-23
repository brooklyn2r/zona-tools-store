# Stage 12 — Production deployment

Recommended public architecture:

zona-domain.ru
  -> frontend

api.zona-domain.ru
  -> Node.js API
  -> PostgreSQL

Digit Учет:
  API URL = https://api.zona-domain.ru
  API key = same DIGIT_SYNC_API_KEY configured on the server.

Important:
- Never expose PostgreSQL port 5432 to the public internet.
- Only the Node API should reach PostgreSQL.
- Put API behind HTTPS (reverse proxy / Timeweb).
- Use a long random DIGIT_SYNC_API_KEY.
- Keep FRONTEND_ORIGIN restricted to the real website origin in production.
- Keep daily PostgreSQL backups on the server.

Stage 12 endpoints:
POST /api/digit/sync   full or partial product sync
POST /api/digit/stock  lightweight stock/price update
GET  /api/digit/status connection status
GET  /api/digit/logs   recent sync journal