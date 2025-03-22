import { generateId } from 'ai';
import { createScopedLogger } from '~/utils/logger';
import { type Messages } from '~/lib/.server/llm/stream-text';
import { orchestrateAgents } from './orchestrator';
import { AgentRole } from './types';

const logger = createScopedLogger('agent.tester');

class MemoryDataStream {
  private data: any[] = [];
  private logs: string[] = [];

  writeData(data: any) {
    this.data.push(data);
    this.logs.push(`[DataStream] ${JSON.stringify(data)}`);
  }

  getData() {
    return this.data;
  }

  getLogs() {
    return this.logs;
  }
}

/**
 * AgentTester - A utility for testing the agent system
 */
export default class AgentTester {
  /**
   * Test the entire agent system with a sample prompt
   */
  async testAgentSystem({
    env,
    apiKeys,
    provider = 'anthropic',
    model = 'claude-3-sonnet-20240229',
    testPrompt = 'Create a simple React component',
  }: {
    env: any;
    apiKeys: Record<string, string>;
    provider?: string;
    model?: string;
    testPrompt?: string;
  }) {
    const logs: string[] = [];
    const startTime = Date.now();
    const dataStream = new MemoryDataStream();
    
    // Add log capture
    const addLog = (message: string) => {
      logs.push(message);
      logger.debug(message);
    };
    
    addLog(`Starting agent system test with provider: ${provider}, model: ${model}`);
    addLog(`Test prompt: "${testPrompt}"`);

    try {
      // Create test messages
      const messages: Messages = [
        {
          id: generateId(),
          role: 'system',
          content: `You are a helpful AI coding assistant. You're running in test mode.`,
        },
        {
          id: generateId(),
          role: 'user',
          content: `[Model: ${model}]

[Provider: ${provider}]

${testPrompt}`,
        },
      ];

      // Create provider settings
      const providerSettings = {
        [provider]: {
          id: provider,
          name: provider,
          models: [
            {
              id: model,
              name: model,
              contextWindow: 16000,
              maxOutputTokens: 4000,
            },
          ],
        },
      };

      // Run agent orchestration
      addLog('Starting agent orchestration...');
      
      const result = await orchestrateAgents({
        messages,
        env,
        apiKeys,
        providerSettings,
        contextOptimization: true,
        dataStream: dataStream,
        promptId: generateId(),
      });

      const endTime = Date.now();
      const duration = endTime - startTime;
      
      addLog(`Agent orchestration completed in ${duration}ms`);
      addLog(`Total tokens: ${result.usage.totalTokens}`);
      
      // Validate the result
      const success = result.text && result.text.length > 20;
      
      if (success) {
        addLog('Test completed successfully');
      } else {
        addLog('Test failed: Generated text is too short or empty');
      }
      
      // Include data stream logs
      logs.push(...dataStream.getLogs());
      
      return {
        success,
        prompt: testPrompt,
        provider,
        model,
        duration,
        generatedText: result.text,
        usage: result.usage,
        logs,
        dataStreamItems: dataStream.getData(),
      };
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      addLog(`Agent test failed with error: ${error instanceof Error ? error.message : String(error)}`);
      
      // Include data stream logs even if there's an error
      if (dataStream) {
        logs.push(...dataStream.getLogs());
      }
      
      return {
        success: false,
        prompt: testPrompt,
        provider,
        model,
        duration,
        error: error instanceof Error ? error.message : String(error),
        logs,
        dataStreamItems: dataStream ? dataStream.getData() : [],
      };
    }
  }
  
  /**
   * Test individual agents
   */
  async testAgent(agentRole: AgentRole, {
    env,
    apiKeys,
    provider = 'anthropic',
    model = 'claude-3-sonnet-20240229',
    testPrompt = 'Create a simple React component',
  }: {
    env: any;
    apiKeys: Record<string, string>;
    provider?: string;
    model?: string;
    testPrompt?: string;
  }) {
    const logs: string[] = [];
    const startTime = Date.now();
    const dataStream = new MemoryDataStream();
    
    // Add log capture
    const addLog = (message: string) => {
      logs.push(message);
      logger.debug(message);
    };
    
    addLog(`Starting test for agent: ${agentRole}`);
    addLog(`Test prompt: "${testPrompt}"`);

    try {
      // Import the specific agent dynamically
      let AgentClass;
      if (agentRole === AgentRole.PROMPT_ENHANCER) {
        const { PromptEnhancerAgent } = await import('./prompt-enhancer');
        AgentClass = PromptEnhancerAgent;
      } else if (agentRole === AgentRole.CODE_GENERATOR) {
        const { CodeGeneratorAgent } = await import('./code-generator');
        AgentClass = CodeGeneratorAgent;
      } else {
        throw new Error(`Unknown agent role: ${agentRole}`);
      }

      // Create agent instance
      const agent = new AgentClass();
      
      // Create test messages
      const messages: Messages = [
        {
          id: generateId(),
          role: 'system',
          content: `You are a helpful AI coding assistant. You're running in test mode.`,
        },
        {
          id: generateId(),
          role: 'user',
          content: `[Model: ${model}]

[Provider: ${provider}]

${testPrompt}`,
        },
      ];

      // Create provider settings
      const providerSettings = {
        [provider]: {
          id: provider,
          name: provider,
          models: [
            {
              id: model,
              name: model,
              contextWindow: 16000,
              maxOutputTokens: 4000,
            },
          ],
        },
      };

      // Run agent
      addLog(`Executing agent: ${agentRole}...`);
      
      const result = await agent.execute({
        messages,
        context: {
          env,
          apiKeys,
          providerSettings,
          contextOptimization: true,
          dataStream: dataStream,
          progressCounter: 0,
          promptId: generateId(),
        },
      });

      const endTime = Date.now();
      const duration = endTime - startTime;
      
      addLog(`Agent execution completed in ${duration}ms`);
      
      // Validate the result
      const outputText = typeof result.output === 'string' 
        ? result.output 
        : JSON.stringify(result.output);
        
      const success = outputText && outputText.length > 20;
      
      if (success) {
        addLog('Agent test completed successfully');
      } else {
        addLog('Agent test failed: Output is too short or empty');
      }
      
      // Include data stream logs
      logs.push(...dataStream.getLogs());
      
      return {
        success,
        agent: agentRole,
        prompt: testPrompt,
        provider,
        model,
        duration,
        output: outputText,
        usage: result.usage,
        logs,
        dataStreamItems: dataStream.getData(),
      };
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      addLog(`Agent test failed with error: ${error instanceof Error ? error.message : String(error)}`);
      
      // Include data stream logs even if there's an error
      if (dataStream) {
        logs.push(...dataStream.getLogs());
      }
      
      return {
        success: false,
        agent: agentRole,
        prompt: testPrompt,
        provider,
        model,
        duration,
        error: error instanceof Error ? error.message : String(error),
        logs,
        dataStreamItems: dataStream ? dataStream.getData() : [],
      };
    }
  }
} 