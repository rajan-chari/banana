# AgCom Documentation Index

Welcome to the AgCom (Agent Communication) documentation! This project provides both a Python library and a REST API for multi-agent communication.

## Quick Navigation

### Getting Started
- **[README.md](README.md)** - Start here! Main project overview, installation, and quick start guides
- **[REST_API_QUICKSTART.md](REST_API_QUICKSTART.md)** - Fast-track guide to get the REST API running (5 minutes)

### Specifications
- **[LIBRARY_SPEC.md](LIBRARY_SPEC.md)** - Complete specification for the AgCom Python library (1,748 lines)
- **[REST_API_SPEC.md](REST_API_SPEC.md)** - Complete REST API implementation specification (2,173 lines)

### Analysis & Design
- **[LIBRARY_ANALYSIS.md](LIBRARY_ANALYSIS.md)** - Critical analysis and improvement recommendations for the library

---

## Documentation by User Type

### For Python Developers (Using Library)
1. **[README.md](README.md)** - Quick start examples
2. **[LIBRARY_SPEC.md](LIBRARY_SPEC.md)** - Complete API reference
3. **[LIBRARY_ANALYSIS.md](LIBRARY_ANALYSIS.md)** - Design decisions and improvements

**Key sections in README:**
- Using as a Library
- Using the Console Application
- API Reference (Messaging, Address Book, Audit)
- Data Models

### For API Users (Using REST API)
1. **[REST_API_QUICKSTART.md](REST_API_QUICKSTART.md)** - Get up and running fast
2. **[README.md](README.md)#using-the-rest-api** - REST API overview
3. **[REST_API_SPEC.md](REST_API_SPEC.md)** - Complete API documentation

**Key sections in REST_API_SPEC:**
- Quick Start (5 minute setup)
- Authentication & Authorization
- API Endpoints (25+ endpoints)
- Request/Response Schemas
- Error Handling
- Rate Limiting
- Deployment Considerations

### For Operations/DevOps
1. **[REST_API_QUICKSTART.md](REST_API_QUICKSTART.md)#for-production** - Production checklist
2. **[REST_API_SPEC.md](REST_API_SPEC.md)#deployment-considerations** - Detailed deployment guide
3. **[README.md](README.md)#configuration** - Environment variables and settings

**Key topics:**
- Security checklist
- Database configuration
- Monitoring and logging
- Infrastructure requirements
- Known limitations

### For Contributors
1. **[README.md](README.md)#contributing** - Contribution guidelines
2. **[LIBRARY_ANALYSIS.md](LIBRARY_ANALYSIS.md)** - Known issues and improvement areas
3. **[LIBRARY_SPEC.md](LIBRARY_SPEC.md)** - Library architecture
4. **[REST_API_SPEC.md](REST_API_SPEC.md)** - REST API architecture

---

## Documentation Overview

### README.md (596 lines)
**The main entry point for all users**

Covers:
- Project overview and features
- Installation instructions
- Quick start for library, console app, and REST API
- Complete API reference with code examples
- Testing instructions
- Configuration options
- Production deployment guidance

### LIBRARY_SPEC.md (1,748 lines)
**Complete specification for the Python library**

Covers:
- System goals and non-goals
- Data model (Messages, Threads, Address Book, Audit Log)
- Storage layer (SQLite with WAL mode)
- Session API
- Console application
- Validation rules
- Architecture decisions

### REST_API_SPEC.md (2,173 lines)
**Complete specification for the REST API**

Covers:
- Architecture and deployment strategy
- JWT authentication
- 25+ API endpoints with examples
- Request/response schemas
- Error handling and retry logic
- Rate limiting strategy
- Implementation guide
- Configuration files
- Production deployment checklist
- Known limitations and scaling paths

### REST_API_QUICKSTART.md (211 lines)
**Fast-track guide to running the REST API**

Covers:
- 5-minute setup guide
- What's been completed (implementation status)
- Quick start commands
- All API endpoints at a glance
- Key features implemented
- Next steps for development and production

### LIBRARY_ANALYSIS.md (955 lines)
**Critical analysis and improvement recommendations**

Covers:
- Executive summary of issues
- API usability analysis
- Missing functionality
- Validation inconsistencies
- Search capabilities review
- Concrete improvement recommendations
- Priority assessment

---

## Common Use Cases

### I want to send messages between agents in Python
→ Start with **[README.md](README.md)#using-as-a-library**
→ Reference **[LIBRARY_SPEC.md](LIBRARY_SPEC.md)** for details

### I want to expose AgCom over HTTP
→ Start with **[REST_API_QUICKSTART.md](REST_API_QUICKSTART.md)**
→ Reference **[REST_API_SPEC.md](REST_API_SPEC.md)** for complete API

### I want to use the interactive console
→ See **[README.md](README.md)#using-the-console-application**

### I want to deploy to production
→ Read **[REST_API_QUICKSTART.md](REST_API_QUICKSTART.md)#for-production**
→ Follow checklist in **[REST_API_SPEC.md](REST_API_SPEC.md)#deployment-considerations**

### I want to understand the architecture
→ See **[LIBRARY_SPEC.md](LIBRARY_SPEC.md)#architecture**
→ See **[REST_API_SPEC.md](REST_API_SPEC.md)#architecture--strategy**

### I want to contribute improvements
→ Read **[LIBRARY_ANALYSIS.md](LIBRARY_ANALYSIS.md)**
→ Follow **[README.md](README.md)#contributing**

### I need to troubleshoot issues
→ Check **[REST_API_SPEC.md](REST_API_SPEC.md)#error-handling**
→ Review **[REST_API_SPEC.md](REST_API_SPEC.md)#known-limitations--future-improvements**

---

## API Endpoint Quick Reference

All REST API endpoints are documented in **[REST_API_SPEC.md](REST_API_SPEC.md)**, but here's a quick overview:

### Authentication
- `POST /api/v1/auth/token` - Generate JWT token

### Messages (6 endpoints)
- `POST /api/v1/messages` - Send message
- `POST /api/v1/messages/{id}/reply` - Reply to message
- `POST /api/v1/messages/broadcast` - Broadcast message
- `GET /api/v1/messages` - List messages
- `GET /api/v1/messages/{id}` - Get message
- `GET /api/v1/messages/search` - Search messages

### Threads (8 endpoints)
- `GET /api/v1/threads` - List threads
- `GET /api/v1/threads/{id}` - Get thread
- `GET /api/v1/threads/{id}/messages` - List thread messages
- `POST /api/v1/threads/{id}/reply` - Reply to thread
- `PUT /api/v1/threads/{id}/metadata` - Update metadata
- `GET /api/v1/threads/{id}/metadata` - Get metadata
- `POST /api/v1/threads/{id}/archive` - Archive thread
- `POST /api/v1/threads/{id}/unarchive` - Unarchive thread

### Contacts (6 endpoints)
- `GET /api/v1/contacts` - List contacts
- `POST /api/v1/contacts` - Create contact
- `GET /api/v1/contacts/{handle}` - Get contact
- `PUT /api/v1/contacts/{handle}` - Update contact
- `DELETE /api/v1/contacts/{handle}` - Deactivate contact
- `GET /api/v1/contacts/search` - Search contacts

### Audit & Health (3 endpoints)
- `GET /api/v1/audit/events` - List audit events
- `GET /api/v1/health` - Health check
- `GET /api/v1/health/ready` - Readiness check

**Interactive API Docs**: http://127.0.0.1:8000/api/v1/docs (when server running)

---

## Technology Stack

### Core Library
- Python 3.10+
- SQLite (with WAL mode)
- python-ulid (for ULID generation)

### REST API
- FastAPI 0.109+ (web framework)
- Uvicorn 0.27+ (ASGI server)
- python-jose 3.3+ (JWT authentication)
- slowapi 0.1+ (rate limiting)
- pydantic-settings 2.1+ (configuration)

---

## File Organization

```
agcom2/
├── README.md                    # Main documentation
├── DOCS.md                      # This file - documentation index
├── LIBRARY_SPEC.md             # Library specification
├── LIBRARY_ANALYSIS.md         # Library analysis & improvements
├── REST_API_SPEC.md            # REST API specification
├── REST_API_QUICKSTART.md      # REST API quick start
├── .env.example                # Environment configuration template
├── requirements.txt            # Python dependencies
│
├── agcom/                      # Core library
│   ├── __init__.py
│   ├── session.py              # Session API
│   ├── storage.py              # SQLite storage layer
│   ├── models.py               # Data models
│   ├── validation.py           # Input validation
│   ├── console/                # Console application
│   └── tests/                  # Library tests
│
├── app/                        # REST API
│   ├── main.py                 # FastAPI application
│   ├── config.py               # Settings management
│   ├── dependencies.py         # Auth & session injection
│   ├── models/                 # Request/response models
│   ├── routers/                # API endpoints
│   └── utils/                  # Error handlers, converters
│
├── scripts/
│   └── init_db.py              # Database initialization
│
└── tests/
    └── test_api.py             # REST API test suite
```

---

## Version History

- **v1.2** (2026-01-24) - REST API implementation complete
  - Added 25+ REST API endpoints
  - JWT authentication
  - Rate limiting
  - Comprehensive error handling
  - Documentation reorganization

- **v1.1** (2026-01-24) - Library enhancements
  - Added thread metadata support
  - Broadcast and group messaging
  - Enhanced address book (tags, optimistic locking)
  - Improved search capabilities

- **v1.0** (Initial) - Core library
  - Email-like messaging
  - Threading
  - Address book
  - Audit log
  - Console application

---

## Need Help?

1. **Start with README** - Most questions answered there
2. **Check specifications** - Detailed documentation in LIBRARY_SPEC.md and REST_API_SPEC.md
3. **Review analysis** - Known issues in LIBRARY_ANALYSIS.md
4. **Test the API** - Run `python test_api.py` to see examples
5. **Interactive docs** - Visit http://127.0.0.1:8000/api/v1/docs when server is running

## License

MIT License - See LICENSE file for details
