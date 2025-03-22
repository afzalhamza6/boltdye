import { createScopedLogger } from '~/utils/logger';
import { 
  type AgentOptions, 
  type AgentResult, 
  type LangChainAgent, 
  extractModelInfo 
} from './types';
import { 
  createLangChainModel, 
  createProgressAnnotation, 
  createPromptForAgent, 
  getApiKey 
} from './utils';
import { AgentRole } from './types';
import { HumanMessage } from '@langchain/core/messages';

const logger = createScopedLogger('langchain.prompt-enhancer');

export class PromptEnhancerAgent implements LangChainAgent {
  async execute({ messages, context }: AgentOptions): Promise<AgentResult> {
    // Extract the last user message to enhance
    const lastUserMessage = [...messages].reverse().find((msg: any) => msg.role === 'user');
    if (!lastUserMessage) {
      logger.error('No user message found in messages array');
      throw new Error('No user message found to enhance');
    }
    
    // Create a progress annotation for the enhancement process
    const { dataStream, progressCounter } = context;
    const newProgressCounter = progressCounter + 1;
    
    dataStream.writeData(
      createProgressAnnotation(
        'enhance',
        'Enhancing prompt...',
        'in-progress',
        newProgressCounter
      )
    );
    
    logger.debug('=============== LANGCHAIN PROMPT ENHANCER STARTED ===============');
    logger.debug(`Message count: ${messages.length}`);
    logger.debug(`Progress counter: ${progressCounter} -> ${newProgressCounter}`);
    
    // Extract message content (handle both string and array formats)
    let messageContent = '';
    if (typeof lastUserMessage.content === 'string') {
      messageContent = lastUserMessage.content;
    } else if (Array.isArray(lastUserMessage.content)) {
      // Use type assertion to handle the array case
      type ContentItem = { type: string; text?: string };
      const contentArray = lastUserMessage.content as ContentItem[];
      const textItem = contentArray.find(c => c.type === 'text');
      messageContent = textItem?.text || '';
    }
    
    logger.debug(`Original prompt length: ${messageContent.length} characters`);
    logger.debug('Original prompt: ' + messageContent);
    
    // Extract model and provider info from the last message if available
    const modelInfo = messages.length > 0 
      ? extractModelInfo(messages[messages.length - 1]) 
      : { model: 'gpt-4o', providerName: 'OpenAI' };
    
    logger.debug(`Using model: ${modelInfo.model}, provider: ${modelInfo.providerName}`);
    
    try {
      // Get API key for the provider
      const apiKey = getApiKey(context, modelInfo.providerName);
      if (!apiKey) {
        throw new Error(`No API key available for provider: ${modelInfo.providerName}`);
      }
      
      // Create LangChain model
      const llm = createLangChainModel({
        provider: modelInfo.providerName,
        model: modelInfo.model,
        apiKey,
        temperature: 0.2
      });
      
      // Create prompt template
      const promptTemplate = createPromptForAgent(AgentRole.PROMPT_ENHANCER);
      
      // Create a formatted prompt
      const prompt = await promptTemplate.format({ input: messageContent });
      
      logger.debug('Sending prompt to LLM for enhancement...');
      const startTime = Date.now();
      
      // Invoke the model with the prompt
      const response = await llm.invoke([new HumanMessage(prompt)]);
      
      const duration = Date.now() - startTime;
      logger.debug(`LLM processing completed in ${duration}ms`);
      
      // Extract the enhanced text from the response
      const enhancedText = response.content.toString().trim();
      
      logger.debug(`Enhanced prompt length: ${enhancedText.length} characters`);
      logger.debug('Enhanced prompt: ' + enhancedText);
      
      // Estimate token usage (since LangChain may not provide exact counts)
      const estimatedUsage = {
        promptTokens: Math.ceil(prompt.length / 4),
        completionTokens: Math.ceil(enhancedText.length / 4),
        totalTokens: Math.ceil((prompt.length + enhancedText.length) / 4)
      };
      
      // Mark enhancement as complete
      dataStream.writeData(
        createProgressAnnotation(
          'enhance',
          'Prompt enhanced successfully',
          'complete',
          newProgressCounter
        )
      );
      
      logger.debug('=============== LANGCHAIN PROMPT ENHANCER COMPLETED ===============');
      
      return {
        output: enhancedText,
        usage: estimatedUsage,
        progressCounter: newProgressCounter
      };
    } catch (error) {
      logger.error('=============== ERROR IN LANGCHAIN PROMPT ENHANCER ===============');
      logger.error('Error details:', error);
      
      // Mark enhancement as failed
      dataStream.writeData(
        createProgressAnnotation(
          'enhance',
          'Failed to enhance prompt',
          'error',
          newProgressCounter
        )
      );
      
      throw error;
    }
  }
} 