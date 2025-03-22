import { createScopedLogger } from '~/utils/logger';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from "@langchain/core/prompts";
import { AgentRole, type AgentContext } from './types';
import { type ProgressAnnotation } from '~/types/context';

const logger = createScopedLogger('langchain.utils');

// Create a progress annotation to display in the UI
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

// Create a LangChain model based on provider name and model name
export function createLangChainModel({ 
  provider, 
  model, 
  apiKey, 
  temperature = 0 
}: { 
  provider: string; 
  model: string; 
  apiKey: string; 
  temperature?: number 
}) {
  logger.debug(`Creating LangChain model: ${model} (${provider})`);
  
  // Create the appropriate LangChain model based on provider
  switch (provider.toLowerCase()) {
    case 'anthropic':
      return new ChatAnthropic({
        apiKey,
        modelName: model,
        temperature,
      });
    case 'openai':
      return new ChatOpenAI({
        apiKey,
        modelName: model,
        temperature,
      });
    case 'groq':
      // Use OpenAI with Groq base URL
      return new ChatOpenAI({
        apiKey,
        modelName: model,
        temperature,
        configuration: {
          baseURL: 'https://api.groq.com/openai/v1',
        },
      });
    default:
      // For unknown providers, try to use Anthropic if key is available, otherwise fall back to OpenAI
      logger.warn(`Unsupported provider: ${provider}, attempting to use Anthropic as fallback`);
      if (process.env.ANTHROPIC_API_KEY) {
        return new ChatAnthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
          modelName: 'claude-3-sonnet-20240229', // Default to Claude 3 Sonnet
          temperature,
        });
      } else {
        logger.warn(`No Anthropic key available, falling back to OpenAI`);
        return new ChatOpenAI({
          apiKey,
          modelName: model || 'gpt-4o',
          temperature,
        });
      }
  }
}

// Get an API key from context for a specific provider
export function getApiKey(context: AgentContext, provider: string): string {
  const { apiKeys, env } = context;
  
  let apiKey = '';
  
  // Try to get the API key from various sources
  switch (provider.toLowerCase()) {
    case 'anthropic':
      apiKey = apiKeys?.['Anthropic'] || 
               env?.['ANTHROPIC_API_KEY'] || 
               process.env.ANTHROPIC_API_KEY || 
               '';
      break;
    case 'openai':
      apiKey = apiKeys?.['OpenAI'] || 
               env?.['OPENAI_API_KEY'] || 
               process.env.OPENAI_API_KEY || 
               '';
      break;
    case 'groq':
      apiKey = apiKeys?.['Groq'] || 
               env?.['GROQ_API_KEY'] || 
               process.env.GROQ_API_KEY || 
               '';
      break;
    default:
      // Try to get key from env using provider name
      const envKeyName = `${provider.toUpperCase()}_API_KEY`;
      apiKey = apiKeys?.[provider] || 
               env?.[envKeyName] || 
               process.env[envKeyName] || 
               '';
  }
  
  if (!apiKey) {
    logger.warn(`No API key found for provider ${provider}`);
  } else {
    logger.debug(`API key found for provider ${provider}`);
  }
  
  return apiKey;
}

// Create prompts for different agent types
export function createPromptForAgent(role: AgentRole): PromptTemplate {
  switch (role) {
    case AgentRole.PROMPT_ENHANCER:
      return PromptTemplate.fromTemplate(`
        You are a professional prompt engineer specializing in crafting precise, effective prompts.
        Your task is to enhance prompts by making them more specific, actionable, and effective.

        I want you to improve the user prompt that is wrapped in \`<original_prompt>\` tags.

        For valid prompts:
        - Make instructions explicit and unambiguous
        - Add relevant context and constraints 
        - Remove redundant information
        - Maintain the core intent
        - Ensure the prompt is self-contained
        - Use professional language

        For invalid or unclear prompts:
        - Respond with clear, professional guidance
        - Keep responses concise and actionable
        - Maintain a helpful, constructive tone
        - Focus on what the user should provide
        - Use a standard template for consistency

        IMPORTANT: Your response must ONLY contain the enhanced prompt text.
        Do not include any explanations, metadata, or wrapper tags.

        <original_prompt>
          {input}
        </original_prompt>
      `);
    case AgentRole.CODE_GENERATOR:
      return PromptTemplate.fromTemplate(`
        You are a senior software principal architect. Your task is to generate high-quality, clean, and efficient code based on the user's requirements.
        
        The user has provided the following prompt:

        {input}

        Please generate code that:
        - Is well-structured and maintainable
        - Follows best practices and coding standards
        - Includes helpful comments where necessary
        - Is secure and handles edge cases
        - Matches the user's requirements exactly
        
        Focus solely on generating the code and any necessary explanations related to the code, without additional comments about your process.
      `);
    default:
      return PromptTemplate.fromTemplate("{input}");
  }
} 