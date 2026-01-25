#!/usr/bin/env python
"""Simple client for the AgCom REST API tour."""

import requests
import json
import sys

BASE_URL = "http://127.0.0.1:8000/api/v1"

def pretty_print(response):
    """Pretty print JSON response."""
    try:
        print(json.dumps(response.json(), indent=2))
    except:
        print(response.text)
    print(f"\nStatus Code: {response.status_code}")

def send_message(token, to_handles, subject, body, tags=None):
    """Send a message."""
    data = {
        "to_handles": to_handles,
        "subject": subject,
        "body": body
    }
    if tags:
        data["tags"] = tags

    response = requests.post(
        f"{BASE_URL}/messages",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        json=data
    )
    return response

def reply_to_message(token, message_id, body, tags=None):
    """Reply to a message."""
    data = {"body": body}
    if tags:
        data["tags"] = tags

    response = requests.post(
        f"{BASE_URL}/messages/{message_id}/reply",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        json=data
    )
    return response

def get_thread_messages(token, thread_id):
    """Get all messages in a thread."""
    response = requests.get(
        f"{BASE_URL}/threads/{thread_id}/messages",
        headers={"Authorization": f"Bearer {token}"}
    )
    return response

def list_threads(token):
    """List all threads."""
    response = requests.get(
        f"{BASE_URL}/threads",
        headers={"Authorization": f"Bearer {token}"}
    )
    return response

def add_contact(token, handle, display_name=None, description=None, tags=None):
    """Add a contact."""
    data = {"handle": handle}
    if display_name:
        data["display_name"] = display_name
    if description:
        data["description"] = description
    if tags:
        data["tags"] = tags

    response = requests.post(
        f"{BASE_URL}/contacts",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        json=data
    )
    return response

def update_contact(token, handle, expected_version, display_name=None, description=None, tags=None, is_active=True):
    """Update a contact."""
    data = {
        "expected_version": expected_version,
        "is_active": is_active
    }
    if display_name:
        data["display_name"] = display_name
    if description:
        data["description"] = description
    if tags:
        data["tags"] = tags

    response = requests.put(
        f"{BASE_URL}/contacts/{handle}",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        json=data
    )
    return response

def search_contacts(token, query):
    """Search contacts."""
    response = requests.get(
        f"{BASE_URL}/contacts/search",
        headers={"Authorization": f"Bearer {token}"},
        params={"query": query}
    )
    return response

def list_contacts(token):
    """List all contacts."""
    response = requests.get(
        f"{BASE_URL}/contacts",
        headers={"Authorization": f"Bearer {token}"}
    )
    return response

def update_thread_metadata(token, thread_id, key, value):
    """Update thread metadata."""
    data = {"key": key, "value": value}
    response = requests.put(
        f"{BASE_URL}/threads/{thread_id}/metadata",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        json=data
    )
    return response

def get_thread_metadata(token, thread_id):
    """Get all thread metadata."""
    response = requests.get(
        f"{BASE_URL}/threads/{thread_id}/metadata",
        headers={"Authorization": f"Bearer {token}"}
    )
    return response

def archive_thread(token, thread_id):
    """Archive a thread."""
    response = requests.post(
        f"{BASE_URL}/threads/{thread_id}/archive",
        headers={"Authorization": f"Bearer {token}"}
    )
    return response

def unarchive_thread(token, thread_id):
    """Unarchive a thread."""
    response = requests.post(
        f"{BASE_URL}/threads/{thread_id}/unarchive",
        headers={"Authorization": f"Bearer {token}"}
    )
    return response

def list_audit_events(token, target_handle=None, event_type=None):
    """List audit events."""
    params = {}
    if target_handle:
        params["target_handle"] = target_handle
    if event_type:
        params["event_type"] = event_type

    response = requests.get(
        f"{BASE_URL}/audit/events",
        headers={"Authorization": f"Bearer {token}"},
        params=params
    )
    return response

if __name__ == "__main__":
    # Demo
    print("AgCom REST API Tour Client")
    print("Use this script to interact with the API")
