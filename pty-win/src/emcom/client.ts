export interface EmcomEmail {
  id: string;
  thread_id: string;
  sender: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  created_at: string;
  tags: string[];
}

export interface EmcomIdentity {
  name: string;
  description: string;
  location: string;
  last_seen: string;
  active: boolean;
}

export class EmcomClient {
  constructor(
    private server: string,
    private identity: string,
  ) {}

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.server}${path}`, {
      headers: { "X-Emcom-Name": this.identity },
    });
    if (!res.ok) throw new Error(`emcom ${path}: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  async getUnread(): Promise<EmcomEmail[]> {
    return this.get<EmcomEmail[]>(`/email/tags/unread`);
  }

  async getInbox(): Promise<EmcomEmail[]> {
    return this.get<EmcomEmail[]>(`/email/inbox`);
  }

  async getAll(): Promise<EmcomEmail[]> {
    return this.get<EmcomEmail[]>(`/email/all`);
  }

  async getWho(): Promise<EmcomIdentity[]> {
    const res = await fetch(`${this.server}/who`);
    if (!res.ok) throw new Error(`emcom /who: ${res.status}`);
    return res.json() as Promise<EmcomIdentity[]>;
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.server}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
