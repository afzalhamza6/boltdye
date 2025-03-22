import { type Agent, type AgentOptions, type AgentResult, createProgressAnnotation } from './types';
import { streamText } from '~/lib/.server/llm/stream-text';
import { createFilesContext } from '~/lib/.server/llm/utils';
import { selectContext } from '~/lib/.server/llm/select-context';
import { createScopedLogger } from '~/utils/logger';
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '~/utils/constants';

const logger = createScopedLogger('agent.code-generator');

export class CodeGeneratorAgent implements Agent {
  async execute({ messages, context, streamingOptions }: AgentOptions): Promise<AgentResult> {
    const { 
      dataStream, 
      progressCounter, 
      files, 
      env, 
      apiKeys, 
      providerSettings, 
      promptId,
      contextOptimization 
    } = context;
    
    const newProgressCounter = progressCounter + 1;
    
    // Create a progress annotation for the code generation process
    dataStream.writeData(
      createProgressAnnotation(
        'code-gen',
        'Generating code...',
        'in-progress',
        newProgressCounter
      )
    );
    
    logger.debug('=============== CODE GENERATOR STARTED ===============');
    logger.debug(`Message count: ${messages.length}`);
    logger.debug(`Progress counter: ${progressCounter} -> ${newProgressCounter}`);
    logger.debug(`Context optimization: ${contextOptimization ? 'enabled' : 'disabled'}`);
    logger.debug(`Files provided: ${files ? Object.keys(files).length : 0}`);
    
    try {
      // Generate context from files if available
      let filesContext = '';
      let selectedContext = '';
      const contextStartTime = Date.now();
      
      if (files && Object.keys(files).length > 0) {
        logger.debug(`Processing ${Object.keys(files).length} files for context`);
        
        // Create context from files
        filesContext = createFilesContext(files, true);
        logger.debug(`Full files context created: ${filesContext.length} characters`);
        
        if (contextOptimization) {
          logger.debug('Starting context optimization...');
          // Use selectContext to optimize context for the LLM
          // Note: We're passing needed parameters according to the function's requirements
          selectedContext = await selectContext({
            messages,
            files,
            env,
            apiKeys,
            providerSettings,
            promptId,
            contextOptimization,
            // Add required parameter
            summary: 'Context for code generation',
          });
          logger.debug(`Optimized context: ${selectedContext.length} characters (${Math.round(selectedContext.length / filesContext.length * 100)}% of original)`);
        } else {
          // Use full files context if no optimization
          selectedContext = filesContext;
          logger.debug('Using full unoptimized context');
        }
      } else {
        logger.debug('No files provided for context');
      }
      
      const contextDuration = Date.now() - contextStartTime;
      logger.debug(`Context preparation completed in ${contextDuration}ms`);
      
      // Add context to the messages
      const messagesWithContext = [...messages];
      if (selectedContext) {
        logger.debug('Adding context to messages');
        messagesWithContext.push({
          role: 'system',
          content: `Context from the project files:\n${selectedContext}`,
          id: crypto.randomUUID(),
        });
      }
      
      logger.debug(`Final message count with context: ${messagesWithContext.length}`);
      logger.debug('Sending enhanced prompt with context to LLM for code generation...');
      
      const llmStartTime = Date.now();
      
      // Use streamText to generate code
      const result = await streamText({
        messages: messagesWithContext,
        env,
        apiKeys,
        providerSettings,
        options: {
          system: 'You are a senior software principal architect. Generate high-quality, accurate, and optimized code based on the user\'s enhanced prompt. Consider the context provided from project files when available. Your primary goal is to produce code that is functional, maintainable, and follows best practices.',
          ...streamingOptions,
          // Remove provider/model from options object as they're not part of StreamingOptions
        },
      });
      
      const llmDuration = Date.now() - llmStartTime;
      logger.debug(`LLM processing completed in ${llmDuration}ms`);
      
      // Ensure result.text is fully resolved and a string
      // Wait for any Promise to resolve and convert to string
      const enhancedText = await (
        typeof result.text === 'object' && result.text !== null && typeof result.text.then === 'function'
          ? result.text
          : Promise.resolve(result.text || '')
      );
      
      // Convert to string if it's not already
      const generatedCode = typeof enhancedText === 'string' ? enhancedText : String(enhancedText || '');
      
      logger.debug(`Generated code length: ${generatedCode.length} characters`);
      
      // Also resolve the usage object if it's a Promise
      const resolvedUsage = result.usage ? await Promise.resolve(result.usage) : undefined;
      
      if (resolvedUsage) {
        logger.debug('Code generation token usage:', JSON.stringify(resolvedUsage));
      } else {
        logger.debug('No token usage data available for code generation');
      }
      
      // Mark code generation as complete
      dataStream.writeData(
        createProgressAnnotation(
          'code-gen',
          'Code generated successfully',
          'complete',
          newProgressCounter
        )
      );
      
      logger.debug('=============== CODE GENERATOR COMPLETED ===============');
      logger.debug(`Total execution time: ${Date.now() - contextStartTime}ms`);
      
      return {
        output: generatedCode,
        usage: resolvedUsage ? {
          completionTokens: resolvedUsage.completionTokens || 0,
          promptTokens: resolvedUsage.promptTokens || 0,
          totalTokens: resolvedUsage.totalTokens || 0
        } : undefined,
        progressCounter: newProgressCounter,
      };
    } catch (error) {
      logger.error('=============== ERROR IN CODE GENERATOR ===============');
      logger.error('Error details:', error);
      
      // Mark code generation as failed
      dataStream.writeData(
        createProgressAnnotation(
          'code-gen',
          'Failed to generate code',
          'error',
          newProgressCounter
        )
      );
      
      throw error;
    }
  }
} 