from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db.engine import init_db
from .auth.router import router as auth_router
from .api.chats import router as chats_router
from .api.messages import router as messages_router
from .api.attachments import router as attachments_router
from .api.users import router as users_router
from .ws.handler import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(chats_router, prefix="/api/v1/chats", tags=["chats"])
app.include_router(messages_router, prefix="/api/v1/chats", tags=["messages"])
app.include_router(attachments_router, prefix="/api/v1/chats", tags=["attachments"])
app.include_router(users_router, prefix="/api/v1/users", tags=["users"])
app.include_router(ws_router, tags=["websocket"])


@app.get("/health")
async def health_check():
    return {"status": "ok"}
