type WSEventType =
  | 'message.new'
  | 'message.updated'
  | 'message.deleted'
  | 'message.link_previews'
  | 'typing.indicator'
  | 'message.reaction'
  | 'read.receipt'
  | 'chat.created'
  | 'connected'
  | 'disconnected';

type WSEventHandler = (payload: any) => void;

class ChatWebSocket {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<WSEventHandler>> = new Map();
  private reconnectAttempt = 0;
  private maxReconnectAttempts = 10;
  private maxReconnectDelay = 8000;
  private shouldReconnect = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private token: string | null = null;
  private everConnected = false;

  connect(token: string): void {
    this.token = token;
    this.shouldReconnect = true;
    this.reconnectAttempt = 0;
    this.everConnected = false;
    this.createConnection();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.emit('disconnected', {});
  }

  on(event: WSEventType, handler: WSEventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  sendMessage(chatId: string, content: string, replyTo?: string): void {
    this.send({
      type: 'message.send',
      id: crypto.randomUUID(),
      payload: { chatId, content, replyTo },
    });
  }

  editMessage(messageId: string, content: string): void {
    this.send({
      type: 'message.edit',
      id: crypto.randomUUID(),
      payload: { messageId, content },
    });
  }

  deleteMessage(messageId: string): void {
    this.send({
      type: 'message.delete',
      id: crypto.randomUUID(),
      payload: { messageId },
    });
  }

  startTyping(chatId: string): void {
    this.send({
      type: 'typing.start',
      payload: { chatId },
    });
  }

  stopTyping(chatId: string): void {
    this.send({
      type: 'typing.stop',
      payload: { chatId },
    });
  }

  private createConnection(): void {
    if (!this.token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${this.token}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      this.everConnected = true;
      this.emit('connected', {});
    };

    this.ws.onmessage = (event: MessageEvent) => {
      this.handleMessage(event);
    };

    this.ws.onclose = (event: CloseEvent) => {
      this.ws = null;
      this.emit('disconnected', {});

      // Don't reconnect on explicit auth failures
      if (event.code === 4001 || event.code === 4003) {
        this.shouldReconnect = false;
      }

      // If the connection never opened (handshake rejected, e.g. 403),
      // don't keep retrying — it's likely an auth error
      if (!this.everConnected && !event.wasClean) {
        this.shouldReconnect = false;
      }

      // Cap reconnect attempts
      if (this.reconnectAttempt >= this.maxReconnectAttempts) {
        this.shouldReconnect = false;
      }

      if (this.shouldReconnect) {
        this.reconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror, so reconnect logic is handled there
    };
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const frame = JSON.parse(event.data);
      const { type, payload } = frame;
      if (type) {
        this.emit(type as WSEventType, payload);
      }
    } catch {
      // ignore malformed frames
    }
  }

  private reconnect(): void {
    const baseDelay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), this.maxReconnectDelay);
    const jitter = Math.random() * 500;
    const delay = baseDelay + jitter;

    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.createConnection();
    }, delay);
  }

  private send(data: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private emit(event: WSEventType, payload: any): void {
    this.handlers.get(event)?.forEach((handler) => handler(payload));
  }
}

export const chatWS = new ChatWebSocket();
