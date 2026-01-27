"""
Multi-agent team system for collaborative LLM-powered task execution.

This package provides a team of specialized LLM agents that communicate
via agcom to collaboratively complete complex tasks.

Architecture:
    User → Assistant → EM → Team (Planner, Coder, Reviewer, Security, Runner)

Agent Roles:
    - Assistant: User-facing agent (delegator)
    - EM: Engineering Manager - coordinates team, tracks progress
    - Planner: Breaks complex tasks into steps
    - Coder: Generates code from natural language
    - Reviewer: Reviews code for bugs and improvements
    - Security: Analyzes safety and explains risks
    - Runner: Executes code and interprets results
"""

from .base import BaseAgent, AgentConfig, AgentState
from .personas import PERSONAS, get_persona
from .em import EMAgent
from .coder import CoderAgent
from .runner import RunnerAgent
from .security import SecurityAgent
from .reviewer import ReviewerAgent
from .planner import PlannerAgent
from .orchestrator import TeamOrchestrator
from .delegation import EMDelegator, should_delegate_to_team

__all__ = [
    # Base
    "BaseAgent",
    "AgentConfig",
    "AgentState",
    # Personas
    "PERSONAS",
    "get_persona",
    # Agents
    "EMAgent",
    "CoderAgent",
    "RunnerAgent",
    "SecurityAgent",
    "ReviewerAgent",
    "PlannerAgent",
    # Orchestration
    "TeamOrchestrator",
    # Delegation
    "EMDelegator",
    "should_delegate_to_team",
]
