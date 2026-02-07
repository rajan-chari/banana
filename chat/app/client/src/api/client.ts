const BASE_URL = '/api/v1';

function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

function setToken(token: string): void {
  localStorage.setItem('auth_token', token);
}

function clearToken(): void {
  localStorage.removeItem('auth_token');
}

export class ApiError extends Error {
  existingChatId?: string;
  constructor(public status: number, message: string, detail?: any) {
    super(message);
    this.name = 'ApiError';
    if (detail && typeof detail === 'object' && detail.existing_chat_id) {
      this.existingChatId = detail.existing_chat_id;
    }
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    let message = 'Request failed';
    const detail = error.detail;
    if (typeof detail === 'string') {
      message = detail;
    } else if (Array.isArray(detail) && detail.length > 0) {
      message = detail.map((e: any) => e.msg || String(e)).join(', ');
    } else if (typeof detail === 'object' && detail?.message) {
      message = detail.message;
    }
    throw new ApiError(res.status, message, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// --- Auth ---

interface AuthResponse {
  user: {
    id: string;
    display_name: string;
    email: string;
    avatar_url?: string;
    status: string;
  };
  token: string;
}

export interface UserResponse {
  id: string;
  display_name: string;
  email: string;
  avatar_url?: string;
  status: string;
}

export async function register(displayName: string, email: string, password: string): Promise<AuthResponse> {
  const data = await request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ display_name: displayName, email, password }),
  });
  setToken(data.token);
  return data;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const data = await request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
}

export async function getMe(): Promise<UserResponse> {
  return request<UserResponse>('/auth/me');
}

export function logout(): void {
  clearToken();
}

export { getToken };

// --- Chats ---

export interface ChatListResponse {
  chats: any[];
  total: number;
}

export interface ChatResponse {
  id: string;
  type: string;
  title: string;
  members: any[];
  created_at: string;
  updated_at: string;
  last_message?: any;
  unread_count: number;
  is_muted: boolean;
  is_pinned: boolean;
}

export async function getChats(limit?: number): Promise<ChatListResponse> {
  const params = limit ? `?limit=${limit}` : '';
  return request<ChatListResponse>(`/chats${params}`);
}

export async function getChat(chatId: string): Promise<ChatResponse> {
  return request<ChatResponse>(`/chats/${chatId}`);
}

export async function createChat(type: 'direct' | 'group', memberIds: string[], title?: string) {
  return request('/chats', {
    method: 'POST',
    body: JSON.stringify({ type, member_ids: memberIds, title }),
  });
}

// --- Messages ---

export interface MessageListResponse {
  messages: any[];
  has_more: boolean;
}

export interface MentionResponse {
  user_id: string;
  display_name: string;
  offset: number;
  length: number;
}

export interface ReactionResponse {
  emoji: string;
  count: number;
  users: { id: string; display_name: string }[];
  reacted_by_me: boolean;
}

export interface AttachmentResponse {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  url: string;
  width?: number;
  height?: number;
}

export interface LinkPreviewResponse {
  url: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  domain: string;
}

export interface MessageResponse {
  id: string;
  chat_id: string;
  sender: any;
  content: string;
  type: string;
  reply_to_id?: string;
  reply_to?: any;
  mentions?: MentionResponse[];
  reactions?: ReactionResponse[];
  attachments?: AttachmentResponse[];
  link_previews?: LinkPreviewResponse[];
  is_edited: boolean;
  created_at: string;
  updated_at: string;
}

export async function getMessages(chatId: string, limit?: number, before?: string): Promise<MessageListResponse> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (before) params.set('before', before);
  const qs = params.toString();
  return request<MessageListResponse>(`/chats/${chatId}/messages${qs ? `?${qs}` : ''}`);
}

export interface SendMention {
  user_id: string;
  offset: number;
  length: number;
}

export async function sendMessage(
  chatId: string,
  content: string,
  replyToId?: string,
  mentions?: SendMention[],
  attachmentIds?: string[],
): Promise<MessageResponse> {
  return request<MessageResponse>(`/chats/${chatId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content,
      reply_to_id: replyToId,
      ...(mentions && mentions.length > 0 ? { mentions } : {}),
      ...(attachmentIds && attachmentIds.length > 0 ? { attachment_ids: attachmentIds } : {}),
    }),
  });
}

export async function editMessage(chatId: string, messageId: string, content: string): Promise<MessageResponse> {
  return request<MessageResponse>(`/chats/${chatId}/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });
}

export async function deleteMessage(chatId: string, messageId: string): Promise<void> {
  return request<void>(`/chats/${chatId}/messages/${messageId}`, {
    method: 'DELETE',
  });
}

// --- Attachments ---

export async function uploadAttachment(
  chatId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<AttachmentResponse> {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}/chats/${chatId}/attachments`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        const err = JSON.parse(xhr.responseText).detail ?? 'Upload failed';
        reject(new ApiError(xhr.status, err));
      }
    };

    xhr.onerror = () => reject(new ApiError(0, 'Network error'));
    xhr.send(formData);
  });
}

export function getAttachmentUrl(chatId: string, attachmentId: string): string {
  return `${BASE_URL}/chats/${chatId}/attachments/${attachmentId}/download`;
}

// --- Reactions ---

export async function toggleReaction(chatId: string, messageId: string, emoji: string): Promise<void> {
  return request<void>(`/chats/${chatId}/messages/${messageId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ emoji }),
  });
}

// --- User Search ---

export interface UserSearchResult {
  id: string;
  display_name: string;
  avatar_url?: string;
}

export interface UserSearchResponse {
  users: UserSearchResult[];
}

export async function searchUsers(query: string, chatId?: string): Promise<UserSearchResponse> {
  const params = new URLSearchParams({ q: query });
  if (chatId) params.set('chat_id', chatId);
  return request<UserSearchResponse>(`/users/search?${params.toString()}`);
}

// --- Read Receipts ---

export interface ReadReceiptResponse {
  user_id: string;
  display_name: string;
  last_read_message_id: string;
}

export interface ReadReceiptsListResponse {
  receipts: ReadReceiptResponse[];
}

export async function markAsRead(chatId: string, messageId: string): Promise<void> {
  return request<void>(`/chats/${chatId}/read`, {
    method: 'POST',
    body: JSON.stringify({ message_id: messageId }),
  });
}

export async function getReadReceipts(chatId: string): Promise<ReadReceiptsListResponse> {
  return request<ReadReceiptsListResponse>(`/chats/${chatId}/read-receipts`);
}
