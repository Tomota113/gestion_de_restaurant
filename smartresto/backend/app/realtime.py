import asyncio
from fastapi import WebSocket

class Hub:
    """One bounded queue and one writer per socket. One Uvicorn worker only."""
    def __init__(self):
        self.peers = {}

    def subscribe(self, ws: WebSocket, role):
        queue = asyncio.Queue(maxsize=64)
        self.peers[ws] = (role, queue)
        return queue

    def discard(self, ws):
        self.peers.pop(ws, None)

    async def publish(self, event, staff_only=False):
        # Persisted DB is authoritative; event is an invalidation, never an order acknowledgement.
        for ws, (role, queue) in list(self.peers.items()):
            if staff_only and role == 'client':
                continue
            try:
                queue.put_nowait({'type':event})
            except asyncio.QueueFull:
                self.discard(ws)
                try:
                    await asyncio.wait_for(ws.close(code=1013), timeout=1)
                except Exception:
                    pass

hub = Hub()
