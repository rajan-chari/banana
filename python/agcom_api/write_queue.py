"""
Async write queue for handling SQLite write operations.

SQLite has a single-writer limitation. This queue serializes all write
operations while allowing the API to respond immediately.
"""

import asyncio
import logging
from typing import Callable, Any, Coroutine
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class WriteTask:
    """Represents a write operation to be queued."""
    operation: Callable[[], Any]  # The actual write function to execute
    future: asyncio.Future  # Future to set result/exception
    timestamp: datetime = None

    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()


class WriteQueue:
    """
    Async queue for serializing SQLite write operations.

    Accepts write requests immediately and returns a Future, then processes
    them sequentially in the background to respect SQLite's single-writer limitation.
    """

    def __init__(self):
        self._queue: asyncio.Queue = asyncio.Queue()
        self._worker_task: asyncio.Task | None = None
        self._running = False
        self._processed_count = 0
        self._error_count = 0

    async def start(self):
        """Start the background worker."""
        if self._running:
            return

        self._running = True
        self._worker_task = asyncio.create_task(self._worker())
        logger.info("Write queue worker started")

    async def stop(self):
        """Stop the background worker and wait for queue to drain."""
        if not self._running:
            return

        self._running = False

        # Wait for queue to empty
        await self._queue.join()

        # Cancel worker
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass

        logger.info(
            f"Write queue stopped. Processed: {self._processed_count}, "
            f"Errors: {self._error_count}"
        )

    async def enqueue(self, operation: Callable[[], Any]) -> Any:
        """
        Enqueue a write operation and wait for it to complete.

        Args:
            operation: Callable that performs the write operation

        Returns:
            Result from the operation

        Raises:
            Exception: If the operation raises an exception
        """
        if not self._running:
            raise RuntimeError("Write queue is not running")

        # Create future to track completion
        future = asyncio.Future()

        # Create task and add to queue
        task = WriteTask(operation=operation, future=future)
        await self._queue.put(task)

        # Wait for operation to complete
        return await future

    async def _worker(self):
        """Background worker that processes write operations sequentially."""
        logger.info("Write queue worker loop started")

        while self._running:
            try:
                # Get next task (wait up to 1 second)
                try:
                    task = await asyncio.wait_for(self._queue.get(), timeout=1.0)
                except asyncio.TimeoutError:
                    continue

                # Execute the operation
                try:
                    result = task.operation()
                    task.future.set_result(result)
                    self._processed_count += 1
                except Exception as e:
                    task.future.set_exception(e)
                    self._error_count += 1
                    logger.error(f"Write operation failed: {e}", exc_info=True)
                finally:
                    self._queue.task_done()

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Worker error: {e}", exc_info=True)

        logger.info("Write queue worker loop stopped")

    def get_stats(self) -> dict:
        """Get queue statistics."""
        return {
            "queue_size": self._queue.qsize(),
            "processed_count": self._processed_count,
            "error_count": self._error_count,
            "is_running": self._running,
        }
