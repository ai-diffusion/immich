export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface Conversation {
  title: string;
  platform: string;
  url: string;
  messages: Message[];
  exportedAt: string;
}

export type Format = 'markdown' | 'text' | 'json' | 'html';
