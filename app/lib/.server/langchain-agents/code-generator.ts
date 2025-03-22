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
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createFilesContext } from '~/lib/.server/llm/utils';

const logger = createScopedLogger('langchain.code-generator');

export class CodeGeneratorAgent implements LangChainAgent {
  async execute({ messages, context }: AgentOptions): Promise<AgentResult> {
    const { 
      dataStream, 
      progressCounter, 
      files, 
      env, 
      apiKeys, 
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
    
    logger.debug('=============== LANGCHAIN CODE GENERATOR STARTED ===============');
    logger.debug(`Message count: ${messages.length}`);
    logger.debug(`Progress counter: ${progressCounter} -> ${newProgressCounter}`);
    logger.debug(`Context optimization: ${contextOptimization ? 'enabled' : 'disabled'}`);
    logger.debug(`Files provided: ${files ? Object.keys(files).length : 0}`);
    
    try {
      // Extract the last user message to use as input
      const lastUserMessage = [...messages].reverse().find((msg: any) => msg.role === 'user');
      if (!lastUserMessage) {
        logger.error('No user message found in messages array');
        throw new Error('No user message found for code generation');
      }
      
      // Extract message content
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
      
      // Generate context from files if available
      let filesContext = '';
      if (files && Object.keys(files).length > 0) {
        logger.debug(`Processing ${Object.keys(files).length} files for context`);
        
        // Create context from files
        filesContext = createFilesContext(files, true);
        logger.debug(`Files context created: ${filesContext.length} characters`);
      }
      
      // Extract model and provider info from the message
      const modelInfo = extractModelInfo(lastUserMessage);
      logger.debug(`Using model: ${modelInfo.model}, provider: ${modelInfo.providerName}`);
      
      // Get API key for the provider
      const apiKey = getApiKey(context, modelInfo.providerName);
      logger.debug(`API key for ${modelInfo.providerName} provider: ${apiKey ? 'available' : 'not available'}`);
      
      if (!apiKey) {
        throw new Error(`No API key available for provider: ${modelInfo.providerName}`);
      }
      
      // Create LangChain model with lower temperature for code generation
      const llm = createLangChainModel({
        provider: modelInfo.providerName,
        model: modelInfo.model,
        apiKey,
        temperature: 0
      });
      
      // Create the system message with file context if available
      let systemMessage = "You are a senior software principal architect. Generate high-quality code based on the user's requirements.";
      if (filesContext) {
        systemMessage += `\n\nHere is the context from the existing files:\n${filesContext}`;
      }
      
      // Create prompt template for code generation
      const promptTemplate = createPromptForAgent(AgentRole.CODE_GENERATOR);
      
      // Format the prompt with the message content
      const prompt = await promptTemplate.format({ input: messageContent });
      
      // Start code generation
      logger.debug('Starting code generation...');
      const startTime = Date.now();
      
      // Create messages for the model
      const messagesToSend = [
        new SystemMessage(systemMessage),
        new HumanMessage(prompt)
      ];
      
      // Invoke the model
      const response = await llm.invoke(messagesToSend);
      
      const duration = Date.now() - startTime;
      logger.debug(`Code generation completed in ${duration}ms`);
      
      // Extract the generated code
      const generatedCode = response.content.toString().trim();
      
      logger.debug(`Generated code length: ${generatedCode.length} characters`);
      
      // Estimate token usage
      const estimatedUsage = {
        promptTokens: Math.ceil((systemMessage.length + prompt.length) / 4),
        completionTokens: Math.ceil(generatedCode.length / 4),
        totalTokens: Math.ceil((systemMessage.length + prompt.length + generatedCode.length) / 4)
      };
      
      // Mark code generation as complete
      dataStream.writeData(
        createProgressAnnotation(
          'code-gen',
          'Code generated successfully',
          'complete',
          newProgressCounter
        )
      );
      
      logger.debug('=============== LANGCHAIN CODE GENERATOR COMPLETED ===============');
      
      return {
        output: generatedCode,
        usage: estimatedUsage,
        progressCounter: newProgressCounter
      };
    } catch (error) {
      logger.error('=============== ERROR IN LANGCHAIN CODE GENERATOR ===============');
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