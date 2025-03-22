import { createScopedLogger } from '~/utils/logger';
import type { OrchestratorOptions } from './orchestrator';
import { orchestrateAgents } from './orchestrator';
import { orchestrateLangChainAgents } from '../langchain-agents/orchestrator';
import type { DataStreamWriter } from './types';

const logger = createScopedLogger('agent.factory');

// Implementation type
export enum AgentImplementation {
  STANDARD = 'standard',
  LANGCHAIN = 'langchain'
}

// Create an adapter for DataStreamWriter compatibility
function createDataStreamAdapter(originalStream: DataStreamWriter): DataStreamWriter {
  return {
    write: (chunk: string | `0:${string}\n` | `2:${string}\n` | `3:${string}\n` | `8:${string}\n` | `9:${string}\n` | `a:${string}\n` | `b:${string}\n` | `c:${string}\n` | `d:${string}\n` | `e:${string}\n` | `f:${string}\n` | `g:${string}\n`) => originalStream.write(chunk),
    writeData: originalStream.writeData,
    writeMessageAnnotation: originalStream.writeMessageAnnotation
  };
}

// Factory to create and execute the appropriate agent implementation
export async function executeAgents(options: OrchestratorOptions, implementation = AgentImplementation.STANDARD) {
  logger.debug(`Executing agent implementation: ${implementation}`);
  
  try {
    switch (implementation) {
      case AgentImplementation.LANGCHAIN:
        logger.debug('Using LangChain agent implementation');
        return await orchestrateLangChainAgents(options as any);
        
      case AgentImplementation.STANDARD:
      default:
        logger.debug('Using standard agent implementation');
        return await orchestrateAgents(options);
    }
  } catch (error) {
    logger.error(`Error executing ${implementation} agent implementation:`, error);
    throw error;
  }
} 