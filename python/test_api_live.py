#!/usr/bin/env python3
"""
Simple script to test the agcom REST API manually.
Make sure the API server is running first: agcom-api
"""

import requests
import json

BASE_URL = "http://localhost:8000"


def test_api():
    """Test the API endpoints."""
    print("Testing agcom REST API...")
    print("=" * 60)

    # Health check
    print("\n1. Health check...")
    response = requests.get(f"{BASE_URL}/api/health")
    print(f"   Status: {response.status_code}")
    print(f"   Response: {response.json()}")

    # Login
    print("\n2. Login as alice...")
    response = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"handle": "alice", "display_name": "Alice Smith"}
    )
    print(f"   Status: {response.status_code}")
    data = response.json()
    token = data["token"]
    print(f"   Token: {token[:20]}...")
    print(f"   Identity: {data['identity']}")

    # Who am I
    print("\n3. Who am I...")
    response = requests.get(
        f"{BASE_URL}/api/auth/whoami",
        headers={"Authorization": f"Bearer {token}"}
    )
    print(f"   Status: {response.status_code}")
    print(f"   Response: {response.json()}")

    # Send message
    print("\n4. Send a message...")
    response = requests.post(
        f"{BASE_URL}/api/messages/send",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "to_handles": ["bob"],
            "subject": "Hello from API",
            "body": "This is a test message sent via the REST API!",
            "tags": ["test", "api"]
        }
    )
    print(f"   Status: {response.status_code}")
    message = response.json()
    print(f"   Message ID: {message['message_id']}")
    print(f"   Thread ID: {message['thread_id']}")

    # List messages
    print("\n5. List messages...")
    response = requests.get(
        f"{BASE_URL}/api/messages",
        headers={"Authorization": f"Bearer {token}"}
    )
    print(f"   Status: {response.status_code}")
    data = response.json()
    print(f"   Total messages: {len(data['messages'])}")

    # List threads
    print("\n6. List threads...")
    response = requests.get(
        f"{BASE_URL}/api/threads",
        headers={"Authorization": f"Bearer {token}"}
    )
    print(f"   Status: {response.status_code}")
    data = response.json()
    print(f"   Total threads: {len(data['threads'])}")

    # Add contact
    print("\n7. Add a contact...")
    response = requests.post(
        f"{BASE_URL}/api/contacts",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "handle": "charlie",
            "display_name": "Charlie Brown",
            "description": "Test contact",
            "tags": ["friend"]
        }
    )
    print(f"   Status: {response.status_code}")
    if response.status_code == 201:
        contact = response.json()
        print(f"   Contact: {contact['handle']} - {contact['display_name']}")

    # List contacts
    print("\n8. List contacts...")
    response = requests.get(
        f"{BASE_URL}/api/contacts",
        headers={"Authorization": f"Bearer {token}"}
    )
    print(f"   Status: {response.status_code}")
    data = response.json()
    print(f"   Total contacts: {len(data['contacts'])}")

    # View OpenAPI docs
    print("\n9. OpenAPI documentation available at:")
    print(f"   {BASE_URL}/docs")

    print("\n" + "=" * 60)
    print("✓ All tests completed successfully!")


if __name__ == "__main__":
    try:
        test_api()
    except requests.exceptions.ConnectionError:
        print("Error: Could not connect to API server.")
        print("Make sure the server is running: agcom-api")
    except Exception as e:
        print(f"Error: {e}")
