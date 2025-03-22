import { generateId } from 'ai';
import { type Messages, type StreamingOptions } from '~/lib/.server/llm/stream-text';
import { type ProgressAnnotation } from '~/types/context';
import type { FileMap } from '~/lib/.server/llm/constants';
import type { IProviderSetting } from '~/types/model';

// Define the DataStreamWriter interface based on actual usage
export interface DataStreamWriter {
  write: (chunk: string | `0:${string}\n` | `2:${string}\n` | `3:${string}\n` | `8:${string}\n` | `9:${string}\n` | `a:${string}\n` | `b:${string}\n` | `c:${string}\n` | `d:${string}\n` | `e:${string}\n` | `f:${string}\n` | `g:${string}\n`) => void;
  writeData: (data: any) => void;
  writeMessageAnnotation: (annotation: any) => void;
}

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
  streamingOptions?: Partial<StreamingOptions>;
}

// Agent interface
export interface Agent {
  execute(options: AgentOptions): Promise<AgentResult>;
}

// Helper function to create a progress annotation
export function createProgressAnnotation(
  label: string, 
  message: string, 
  status: 'in-progress' | 'complete' | 'error',
  order: number
): ProgressAnnotation {
  // Convert 'error' to 'complete' for type compatibility
  const safeStatus = status === 'error' ? 'complete' as const : status;
  
  return {
    type: 'progress',
    label,
    status: safeStatus,
    order,
    message,
  };
} 