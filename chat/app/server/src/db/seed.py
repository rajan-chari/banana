"""Seed the database with test users for development."""

import asyncio

import bcrypt as _bcrypt

from .engine import async_session, init_db
from .models import User


def _hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


TEST_USERS = [
    {"display_name": "Alice Johnson", "email": "alice@example.com", "password": "password123"},
    {"display_name": "Bob Smith", "email": "bob@example.com", "password": "password123"},
    {"display_name": "Carol Davis", "email": "carol@example.com", "password": "password123"},
    {"display_name": "Dave Wilson", "email": "dave@example.com", "password": "password123"},
]


async def seed():
    await init_db()
    async with async_session() as session:
        for user_data in TEST_USERS:
            user = User(
                display_name=user_data["display_name"],
                email=user_data["email"],
                password_hash=_hash_password(user_data["password"]),
            )
            session.add(user)
        await session.commit()
        print(f"Seeded {len(TEST_USERS)} test users.")


if __name__ == "__main__":
    asyncio.run(seed())
