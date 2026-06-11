export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export type AssetKind = 'image' | 'file';

export interface Asset {
  id: string;
  kind: AssetKind;
  url: string;
  name: string;
  messageIndex: number;
  mimeType?: string;
  unavailable?: boolean;
}

export interface Conversation {
  title: string;
  platform: string;
  url: string;
  messages: Message[];
  exportedAt: string;
  assets?: Asset[];
}

export type Format = 'markdown' | 'text' | 'json' | 'html';
