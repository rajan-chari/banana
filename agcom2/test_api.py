#!/usr/bin/env python
"""Test script for AgCom REST API"""

import requests
import json

BASE_URL = "http://127.0.0.1:8003/api/v1"

def print_result(title, response):
    """Print test result."""
    status_color = "\033[92m" if response.status_code < 400 else "\033[91m"
    reset = "\033[0m"
    print(f"\n{status_color}[{response.status_code}] {title}{reset}")
    if response.status_code < 400:
        try:
            print(json.dumps(response.json(), indent=2)[:500])
        except:
            print(response.text[:500])
    else:
        print("Error:", response.text[:200])

def main():
    print("=" * 60)
    print("AgCom REST API Test Suite")
    print("=" * 60)

    # Test 1: Health check
    response = requests.get(f"{BASE_URL}/health")
    print_result("Health Check", response)

    # Test 2: Readiness check
    response = requests.get(f"{BASE_URL}/health/ready")
    print_result("Readiness Check", response)

    # Test 3: Generate token for alice
    response = requests.post(f"{BASE_URL}/auth/token",
        json={"agent_handle": "alice", "agent_secret": "test_secret_123"})
    print_result("Generate Token (Alice)", response)
    alice_token = response.json()["access_token"]
    alice_headers = {"Authorization": f"Bearer {alice_token}"}

    # Test 4: Generate token for bob
    response = requests.post(f"{BASE_URL}/auth/token",
        json={"agent_handle": "bob", "agent_secret": "test_secret_123"})
    print_result("Generate Token (Bob)", response)
    bob_token = response.json()["access_token"]
    bob_headers = {"Authorization": f"Bearer {bob_token}"}

    # Test 5: Send message from alice to bob
    response = requests.post(f"{BASE_URL}/messages",
        json={
            "to_handles": ["bob"],
            "subject": "Test Message",
            "body": "Hello Bob!",
            "tags": ["test"]
        },
        headers=alice_headers)
    print_result("Send Message (Alice -> Bob)", response)
    if response.status_code == 201:
        message_id = response.json()["message_id"]
        thread_id = response.json()["thread_id"]

        # Test 6: Reply to message
        response = requests.post(f"{BASE_URL}/messages/{message_id}/reply",
            json={"body": "Thanks Alice!", "tags": ["reply"]},
            headers=bob_headers)
        print_result("Reply to Message (Bob -> Alice)", response)

        # Test 7: Get thread
        response = requests.get(f"{BASE_URL}/threads/{thread_id}", headers=alice_headers)
        print_result("Get Thread", response)

        # Test 8: List messages in thread
        response = requests.get(f"{BASE_URL}/threads/{thread_id}/messages", headers=alice_headers)
        print_result("List Thread Messages", response)

    # Test 9: List threads
    response = requests.get(f"{BASE_URL}/threads", headers=alice_headers)
    print_result("List Threads", response)

    # Test 10: List messages
    response = requests.get(f"{BASE_URL}/messages", headers=bob_headers)
    print_result("List Messages (Bob)", response)

    # Test 11: Add contact
    response = requests.post(f"{BASE_URL}/contacts",
        json={
            "handle": "charlie",
            "display_name": "Charlie Brown",
            "description": "Test user",
            "tags": ["friend"]
        },
        headers=alice_headers)
    print_result("Add Contact (Charlie)", response)

    # Test 12: Get contact
    response = requests.get(f"{BASE_URL}/contacts/charlie", headers=alice_headers)
    print_result("Get Contact (Charlie)", response)

    # Test 13: List contacts
    response = requests.get(f"{BASE_URL}/contacts", headers=alice_headers)
    print_result("List Contacts", response)

    # Test 14: Update contact
    if response.status_code == 200:
        contacts = response.json()["contacts"]
        charlie = next((c for c in contacts if c["handle"] == "charlie"), None)
        if charlie:
            response = requests.put(f"{BASE_URL}/contacts/charlie",
                json={
                    "display_name": "Charles Brown",
                    "description": "Updated description",
                    "tags": ["friend", "colleague"],
                    "is_active": True,
                    "expected_version": charlie["version"]
                },
                headers=alice_headers)
            print_result("Update Contact (Charlie)", response)

    # Test 15: Archive thread
    response = requests.get(f"{BASE_URL}/threads", headers=alice_headers)
    if response.status_code == 200:
        threads = response.json()["threads"]
        if threads:
            thread_id = threads[0]["thread_id"]
            response = requests.post(f"{BASE_URL}/threads/{thread_id}/archive",
                headers=alice_headers)
            print_result("Archive Thread", response)

            # Test 16: Unarchive thread
            response = requests.post(f"{BASE_URL}/threads/{thread_id}/unarchive",
                headers=alice_headers)
            print_result("Unarchive Thread", response)

    # Test 17: Broadcast message
    response = requests.post(f"{BASE_URL}/messages/broadcast",
        json={
            "to_handles": ["bob", "charlie"],
            "subject": "Broadcast Test",
            "body": "Hello everyone!",
            "tags": ["broadcast"]
        },
        headers=alice_headers)
    print_result("Broadcast Message", response)

    # Test 18: Search messages
    response = requests.get(f"{BASE_URL}/messages/search?query=Hello",
        headers=alice_headers)
    print_result("Search Messages", response)

    print("\n" + "=" * 60)
    print("Test suite completed!")
    print("=" * 60)

if __name__ == "__main__":
    main()
