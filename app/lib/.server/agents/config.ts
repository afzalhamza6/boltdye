import { createScopedLogger } from '~/utils/logger';
import { AgentImplementation } from './factory';

const logger = createScopedLogger('agent.config');

// Configuration for agent implementation
interface AgentConfig {
  implementation: AgentImplementation;
  useContextOptimization: boolean;
}

// Default configuration
const defaultConfig: AgentConfig = {
  implementation: AgentImplementation.LANGCHAIN, // Use LangChain by default
  useContextOptimization: true
};

// Get the current agent configuration
export function getAgentConfig(): AgentConfig {
  // This could eventually read from environment variables or other config sources
  return defaultConfig;
}

// Log the current configuration when the file is imported
logger.debug(`Using agent configuration: ${JSON.stringify(getAgentConfig())}`); 