# app/main.py
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.routers import messages, threads, contacts, audit, health, auth
from app.utils.errors import setup_exception_handlers
from app.config import settings
from app.dependencies import get_agent_handle

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="AgCom REST API",
    description="REST API for multi-agent communication",
    version="1.0.0",
    docs_url="/api/v1/docs",
    redoc_url="/api/v1/redoc",
    openapi_url="/api/v1/openapi.json"
)

# Setup rate limiting
limiter = Limiter(key_func=get_agent_handle)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup exception handlers
setup_exception_handlers(app)

# Include routers
app.include_router(auth.router, prefix="/api/v1", tags=["auth"])
app.include_router(messages.router, prefix="/api/v1", tags=["messages"])
app.include_router(threads.router, prefix="/api/v1", tags=["threads"])
app.include_router(contacts.router, prefix="/api/v1", tags=["contacts"])
app.include_router(audit.router, prefix="/api/v1", tags=["audit"])
app.include_router(health.router, prefix="/api/v1", tags=["health"])

@app.get("/")
async def root():
    logger.info("Root endpoint accessed")
    return {
        "message": "AgCom REST API",
        "version": "1.0.0",
        "docs": "/api/v1/docs"
    }

@app.on_event("startup")
async def startup_event():
    logger.info("AgCom REST API starting up")
    logger.info(f"Database path: {settings.DB_PATH}")
    logger.info(f"CORS origins: {settings.CORS_ORIGINS}")
