# Chat Application

A Teams-like chat application with real-time messaging.

## Structure

```
app/
├── server/    # Python FastAPI backend
└── client/    # React + TypeScript frontend
```

## Server

```bash
cd server
pip install -e ".[dev]"
uvicorn src.main:app --reload
```

Server runs at http://localhost:8000

## Client

```bash
cd client
npm install
npm run dev
```

Client runs at http://localhost:5173 with proxy to the backend.
