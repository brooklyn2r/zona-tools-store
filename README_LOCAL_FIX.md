# Local development

Run:

npm install
npm run dev

Vite:
http://localhost:5173

Node API:
http://localhost:8788

In development Vite proxies:
- /api -> http://127.0.0.1:8788
- /uploads -> http://127.0.0.1:8788

In production the React frontend and Node API use the same domain.