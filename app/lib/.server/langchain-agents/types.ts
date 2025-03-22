import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { type Messages } from '~/lib/.server/llm/stream-text';
import { type FileMap } from '~/lib/.server/llm/constants';
import type { IProviderSetting } from '~/types/model';
import type { DataStreamWriter } from '../agents/types';

// Agent role types
export enum AgentRole {
  PROMPT_ENHANCER = 'prompt_enhancer',
  CODE_GENERATOR = 'code_generator'
}

// Agent execution context
export interface AgentContext {
  env: any;
  apiKeys: Record<string, string>;
  providerSettings: Record<string, IProviderSetting>;
  files?: FileMap;
  promptId?: string;
  contextOptimization?: boolean;
  dataStream: DataStreamWriter;
  progressCounter: number;
}

// Agent execution result
export interface AgentResult {
  output: string;
  usage?: {
    completionTokens: number;
    promptTokens: number;
    totalTokens: number;
  };
  progressCounter: number;
}

// Agent execution options
export interface AgentOptions {
  messages: Messages;
  context: AgentContext;
}

// LangChain Agent interface
export interface LangChainAgent {
  execute(options: AgentOptions): Promise<AgentResult>;
}

// Helper to convert our API Messages to LangChain messages
export function convertToLangChainMessages(messages: Messages): BaseMessage[] {
  return messages.map(message => {
    if (message.role === 'user') {
      return new HumanMessage(message.content);
    } else if (message.role === 'assistant') {
      return new AIMessage(message.content);
    } else if (message.role === 'system') {
      return new SystemMessage(message.content);
    } else {
      // For unknown roles, default to HumanMessage
      return new HumanMessage(message.content);
    }
  });
}

// Helper to extract model and provider info from a message
export function extractModelInfo(message: any) {
  let content = '';
  
  if (typeof message.content === 'string') {
    content = message.content;
  } else if (Array.isArray(message.content)) {
    // Use type assertion to handle the array case
    type ContentItem = { type: string; text?: string };
    const contentArray = message.content as ContentItem[];
    const textItem = contentArray.find(c => c.type === 'text');
    content = textItem?.text || '';
  }
  
  const modelMatch = content.match(/\[Model: (.*?)\]/);
  const providerMatch = content.match(/\[Provider: (.*?)\]/);
  
  return {
    model: modelMatch ? modelMatch[1] : 'gpt-4o',
    providerName: providerMatch ? providerMatch[1] : 'OpenAI',
  };
} 