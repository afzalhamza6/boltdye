import { generateId } from 'ai';
import { createScopedLogger } from '~/utils/logger';
import { type Messages } from '~/lib/.server/llm/stream-text';
import type { FileMap } from '~/lib/.server/llm/constants';
import type { IProviderSetting } from '~/types/model';
import { AgentRole, type AgentContext, type DataStreamWriter } from '../agents/types';
import { PromptEnhancerAgent } from './prompt-enhancer';
import { CodeGeneratorAgent } from './code-generator';
import { ensureString } from '~/lib/.server/llm/utils';
import { extractModelInfo } from './types';

const logger = createScopedLogger('langchain.orchestrator');

// Available agents
const agents = {
  [AgentRole.PROMPT_ENHANCER]: new PromptEnhancerAgent(),
  [AgentRole.CODE_GENERATOR]: new CodeGeneratorAgent(),
};

// Orchestrator result
export interface OrchestratorResult {
  text: string;
  usage: {
    completionTokens: number;
    promptTokens: number;
    totalTokens: number;
  };
}

// Orchestrator options
export interface OrchestratorOptions {
  messages: Messages;
  files?: FileMap;
  env: any;
  apiKeys: Record<string, string>;
  providerSettings: Record<string, IProviderSetting>;
  promptId?: string;
  contextOptimization?: boolean;
  dataStream: DataStreamWriter;
}

/**
 * LangChain Agent orchestrator - manages the workflow between different agents
 */
export async function orchestrateLangChainAgents(options: OrchestratorOptions): Promise<OrchestratorResult> {
  const { 
    messages, 
    files, 
    env, 
    apiKeys, 
    providerSettings, 
    promptId, 
    contextOptimization, 
    dataStream 
  } = options;
  
  logger.debug('=============== LANGCHAIN AGENT ORCHESTRATION STARTED ===============');
  logger.debug(`Prompt ID: ${promptId || 'none'}`);
  logger.debug(`Context Optimization: ${contextOptimization ? 'enabled' : 'disabled'}`);
  logger.debug(`Message count: ${messages.length}`);
  logger.debug(`Files provided: ${files ? Object.keys(files).length : 0}`);
  
  // Log provider settings
  logger.debug('Provider settings:', JSON.stringify(providerSettings, null, 2));
  
  let progressCounter = 0;
  
  // Create agent context
  const agentContext: AgentContext = {
    env,
    apiKeys,
    providerSettings,
    files,
    promptId,
    contextOptimization,
    dataStream,
    progressCounter,
  };
  
  try {
    // Find the original user prompt
    const lastUserMessage = [...messages].reverse().find(msg => msg.role === 'user');
    const originalPrompt = lastUserMessage?.content || '';
    logger.debug('Original prompt: ' + (typeof originalPrompt === 'string' ? originalPrompt : JSON.stringify(originalPrompt)));
    
    // Get the model and provider info from the user's selection
    const modelInfo = messages.length > 0 
      ? extractModelInfo(messages[messages.length - 1]) 
      : { model: 'gpt-4o', providerName: 'OpenAI' };
    
    logger.debug(`User selected model: ${modelInfo.model}, provider: ${modelInfo.providerName}`);
    
    // Debug API keys availability (without logging the actual keys)
    logger.debug(`API keys provided: ${Object.keys(apiKeys).join(', ')}`);
    logger.debug(`Env keys available: ${env ? Object.keys(env).filter(k => k.includes('API_KEY')).join(', ') : 'none'}`);
    
    // Step 1: Run the prompt enhancer agent
    logger.debug('=============== RUNNING LANGCHAIN PROMPT ENHANCER AGENT ===============');
    logger.debug(`Input message count: ${messages.length}`);
    
    const enhancerStartTime = Date.now();
    const enhancerResult = await agents[AgentRole.PROMPT_ENHANCER].execute({
      messages,
      context: agentContext,
    });
    const enhancerDuration = Date.now() - enhancerStartTime;
    
    // Ensure the output is a string
    const enhancedPrompt = await ensureString(enhancerResult.output);
    
    logger.debug(`Prompt enhancer completed in ${enhancerDuration}ms`);
    logger.debug('Enhanced prompt: ' + enhancedPrompt);
    logger.debug('Enhancer usage:', JSON.stringify(enhancerResult.usage || 'No usage data'));
    
    // Add prompt comparison to data stream for UI visibility
    dataStream.writeData({
      type: 'prompt-comparison',
      original: typeof originalPrompt === 'string' ? originalPrompt : JSON.stringify(originalPrompt),
      enhanced: enhancedPrompt
    });
    
    // Update progress counter from result
    progressCounter = enhancerResult.progressCounter;
    
    // Create a new message with the enhanced prompt and preserve the model/provider info
    const enhancedUserMessage = {
      role: 'user' as const,
      content: `[Model: ${modelInfo.model}]\n\n[Provider: ${modelInfo.providerName}]\n\n${enhancedPrompt}`,
      id: generateId()
    };
    
    // Create a new message array with the enhanced prompt replacing the last user message
    const messagesWithEnhancedPrompt = [...messages];
    // Find and replace the last user message
    const lastUserIndex = messagesWithEnhancedPrompt
      .map((msg, idx) => ({ role: msg.role, idx }))
      .filter(item => item.role === 'user')
      .pop()?.idx;
    
    if (lastUserIndex !== undefined) {
      messagesWithEnhancedPrompt[lastUserIndex] = enhancedUserMessage;
      logger.debug(`Replaced user message at index ${lastUserIndex} with enhanced prompt`);
    } else {
      // If no user message found, append the enhanced message
      messagesWithEnhancedPrompt.push(enhancedUserMessage);
      logger.debug('No user message found, appended enhanced prompt as new message');
    }
    
    // Update context with new progress counter
    const updatedContext = {
      ...agentContext,
      progressCounter,
    };
    
    // Step 2: Run the code generator agent with the enhanced prompt
    logger.debug('=============== RUNNING LANGCHAIN CODE GENERATOR AGENT ===============');
    logger.debug(`Input message count: ${messagesWithEnhancedPrompt.length}`);
    logger.debug(`Using the same model: ${modelInfo.model}, provider: ${modelInfo.providerName} for code generation`);
    
    const codeGenStartTime = Date.now();
    const codeGenResult = await agents[AgentRole.CODE_GENERATOR].execute({
      messages: messagesWithEnhancedPrompt,
      context: updatedContext,
    });
    const codeGenDuration = Date.now() - codeGenStartTime;
    
    // Ensure the output is a string
    const generatedCode = await ensureString(codeGenResult.output);
    
    // Log code generator results
    logger.debug(`Code generator completed in ${codeGenDuration}ms`);
    logger.debug('Code generator usage:', JSON.stringify(codeGenResult.usage || 'No usage data'));
    logger.debug(`Generated code length: ${generatedCode.length} characters`);
    
    // Combine usage from both agents
    const combinedUsage = {
      completionTokens: (enhancerResult.usage?.completionTokens || 0) + (codeGenResult.usage?.completionTokens || 0),
      promptTokens: (enhancerResult.usage?.promptTokens || 0) + (codeGenResult.usage?.promptTokens || 0),
      totalTokens: (enhancerResult.usage?.totalTokens || 0) + (codeGenResult.usage?.totalTokens || 0),
    };
    
    logger.debug('=============== LANGCHAIN AGENT ORCHESTRATION COMPLETED ===============');
    logger.debug('Combined usage:', JSON.stringify(combinedUsage));
    logger.debug(`Total execution time: ${enhancerDuration + codeGenDuration}ms`);
    
    // Return the result
    return {
      text: String(generatedCode),
      usage: combinedUsage,
    };
  } catch (error) {
    logger.error('=============== ERROR IN LANGCHAIN AGENT ORCHESTRATION ===============');
    logger.error('Error details:', error);
    throw error;
  }
} 