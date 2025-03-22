import { type Agent, type AgentOptions, type AgentResult, createProgressAnnotation } from './types';
import { streamText } from '~/lib/.server/llm/stream-text';
import { stripIndents } from '~/utils/stripIndent';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('agent.prompt-enhancer');

export class PromptEnhancerAgent implements Agent {
  async execute({ messages, context, streamingOptions }: AgentOptions): Promise<AgentResult> {
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
    
    logger.debug('=============== PROMPT ENHANCER STARTED ===============');
    logger.debug(`Message count: ${messages.length}`);
    logger.debug(`Progress counter: ${progressCounter} -> ${newProgressCounter}`);
    
    // Extract message content (handle both string and array formats)
    let messageContent = '';
    if (typeof lastUserMessage.content === 'string') {
      messageContent = lastUserMessage.content;
    } else if (Array.isArray(lastUserMessage.content)) {
      const textItem = lastUserMessage.content.find((c: any) => c.type === 'text');
      messageContent = textItem?.text || '';
    }
    
    logger.debug(`Original prompt length: ${messageContent.length} characters`);
    logger.debug('Original prompt: ' + messageContent);
    
    // Extract model and provider info from the last message if available
    const modelInfo = messages.length > 0 
      ? extractModelInfo(messages[messages.length - 1]) 
      : { model: 'gpt-4', providerName: 'openai' };
    
    logger.debug(`Using model: ${modelInfo.model}, provider: ${modelInfo.providerName}`);
    
    try {
      logger.debug('Sending prompt to LLM for enhancement...');
      const startTime = Date.now();
      
      // Use streamText to enhance the prompt
      const result = await streamText({
        messages: [
          {
            role: 'user',
            content:
              `[Model: ${modelInfo.model}]\n\n[Provider: ${modelInfo.providerName}]\n\n` +
              stripIndents`
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
                ${messageContent}
              </original_prompt>
              `,
          },
        ],
        env: context.env,
        apiKeys: context.apiKeys,
        providerSettings: context.providerSettings,
        options: {
          system:
            'You are a senior software principal architect, you should help the user analyse the user query and enrich it with the necessary context and constraints to make it more specific, actionable, and effective. You should also ensure that the prompt is self-contained and uses professional language. Your response should ONLY contain the enhanced prompt text. Do not include any explanations, metadata, or wrapper tags.',
          ...streamingOptions,
        },
      });
      
      const duration = Date.now() - startTime;
      logger.debug(`LLM processing completed in ${duration}ms`);
      
      // Ensure result.text is fully resolved and a string
      // Wait for any Promise to resolve and convert to string
      const enhancedText = await (
        typeof result.text === 'object' && result.text !== null && typeof result.text.then === 'function'
          ? result.text
          : Promise.resolve(result.text || '')
      );
      
      // Convert to string if it's not already
      const finalEnhancedText = typeof enhancedText === 'string' ? enhancedText : String(enhancedText || '');
      
      logger.debug(`Enhanced prompt length: ${finalEnhancedText.length} characters`);
      logger.debug('Enhanced prompt: ' + finalEnhancedText);
      
      // Also resolve the usage object if it's a Promise
      const resolvedUsage = result.usage ? await Promise.resolve(result.usage) : undefined;
      
      if (resolvedUsage) {
        logger.debug('Prompt enhancement token usage:', JSON.stringify(resolvedUsage));
      } else {
        logger.debug('No token usage data available for prompt enhancement');
      }
      
      // Mark enhancement as complete
      dataStream.writeData(
        createProgressAnnotation(
          'enhance',
          'Prompt enhanced successfully',
          'complete',
          newProgressCounter
        )
      );
      
      logger.debug('=============== PROMPT ENHANCER COMPLETED ===============');
      
      return {
        output: finalEnhancedText,
        usage: resolvedUsage ? {
          completionTokens: resolvedUsage.completionTokens || 0,
          promptTokens: resolvedUsage.promptTokens || 0,
          totalTokens: resolvedUsage.totalTokens || 0
        } : undefined,
        progressCounter: newProgressCounter,
      };
    } catch (error) {
      logger.error('=============== ERROR IN PROMPT ENHANCER ===============');
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

// Helper function to extract model info from a message
function extractModelInfo(message: any) {
  let content = '';
  
  if (typeof message.content === 'string') {
    content = message.content;
  } else if (Array.isArray(message.content)) {
    const textItem = message.content.find((c: any) => c.type === 'text');
    content = textItem?.text || '';
  }
  
  const modelMatch = content.match(/\[Model: (.*?)\]/);
  const providerMatch = content.match(/\[Provider: (.*?)\]/);
  
  return {
    model: modelMatch ? modelMatch[1] : 'gpt-4',
    providerName: providerMatch ? providerMatch[1] : 'openai',
  };
} 