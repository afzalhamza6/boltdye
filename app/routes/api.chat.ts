import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { createDataStream, generateId } from 'ai';
import { MAX_RESPONSE_SEGMENTS, MAX_TOKENS, type FileMap } from '~/lib/.server/llm/constants';
import { CONTINUE_PROMPT } from '~/lib/common/prompts/prompts';
import { streamText, type Messages, type StreamingOptions } from '~/lib/.server/llm/stream-text';
import SwitchableStream from '~/lib/.server/llm/switchable-stream';
import type { IProviderSetting } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';
import { getFilePaths, selectContext } from '~/lib/.server/llm/select-context';
import type { ContextAnnotation, ProgressAnnotation } from '~/types/context';
import { WORK_DIR } from '~/utils/constants';
import { createSummary } from '~/lib/.server/llm/create-summary';
import { ensureString, extractPropertiesFromMessage } from '~/lib/.server/llm/utils';
import { orchestrateAgents } from '~/lib/.server/agents';
import { executeAgents, AgentImplementation } from '~/lib/.server/agents/factory';
import { getAgentConfig } from '~/lib/.server/agents/config';

export async function action(args: ActionFunctionArgs) {
  return chatAction(args);
}

const logger = createScopedLogger('api.chat');

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  const items = cookieHeader.split(';').map((cookie) => cookie.trim());

  items.forEach((item) => {
    const [name, ...rest] = item.split('=');

    if (name && rest) {
      const decodedName = decodeURIComponent(name.trim());
      const decodedValue = decodeURIComponent(rest.join('=').trim());
      cookies[decodedName] = decodedValue;
    }
  });

  return cookies;
}

async function chatAction({ context, request }: ActionFunctionArgs) {
  const { messages, files, promptId, contextOptimization } = await request.json<{
    messages: Messages;
    files: any;
    promptId?: string;
    contextOptimization: boolean;
  }>();

  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = JSON.parse(parseCookies(cookieHeader || '').apiKeys || '{}');
  const providerSettings: Record<string, IProviderSetting> = JSON.parse(
    parseCookies(cookieHeader || '').providers || '{}',
  );

  const stream = new SwitchableStream();

  const cumulativeUsage = {
    completionTokens: 0,
    promptTokens: 0,
    totalTokens: 0,
  };
  const encoder: TextEncoder = new TextEncoder();
  let progressCounter: number = 1;

  try {
    const totalMessageContent = messages.reduce((acc, message) => acc + message.content, '');
    logger.debug(`Total message length: ${totalMessageContent.split(' ').length}, words`);

    let lastChunk: string | undefined = undefined;

    const dataStream = createDataStream({
      async execute(dataStream) {
        const filePaths = getFilePaths(files || {});
        let filteredFiles: FileMap | undefined = undefined;
        let summary: string | undefined = undefined;
        let messageSliceId = 0;

        if (messages.length > 3) {
          messageSliceId = messages.length - 3;
        }

        if (filePaths.length > 0 && contextOptimization) {
          logger.debug('Generating Chat Summary');
          dataStream.writeData({
            type: 'progress',
            label: 'summary',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Analysing Request',
          } satisfies ProgressAnnotation);

          // Create a summary of the chat
          console.log(`Messages count: ${messages.length}`);

          summary = await createSummary({
            messages: [...messages],
            env: context.cloudflare?.env,
            apiKeys,
            providerSettings,
            promptId,
            contextOptimization,
            onFinish(resp) {
              if (resp.usage) {
                logger.debug('createSummary token usage', JSON.stringify(resp.usage));
                cumulativeUsage.completionTokens += resp.usage.completionTokens || 0;
                cumulativeUsage.promptTokens += resp.usage.promptTokens || 0;
                cumulativeUsage.totalTokens += resp.usage.totalTokens || 0;
              }
              
              dataStream.writeData({
                type: 'progress',
                label: 'summary',
                status: 'complete',
                order: progressCounter++,
                message: 'Analysis Complete',
              } satisfies ProgressAnnotation);
            },
          });

          dataStream.writeMessageAnnotation({
            type: 'chatSummary',
            summary,
            chatId: messages.slice(-1)?.[0]?.id,
          } as ContextAnnotation);

          // Update context buffer
          logger.debug('Updating Context Buffer');
          dataStream.writeData({
            type: 'progress',
            label: 'context',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Determining Files to Read',
          } satisfies ProgressAnnotation);

          // Select context files
          console.log(`Messages count: ${messages.length}`);
          filteredFiles = await selectContext({
            messages: [...messages],
            env: context.cloudflare?.env,
            apiKeys,
            files,
            providerSettings,
            promptId,
            contextOptimization,
            summary,
            onFinish(resp) {
              if (resp.usage) {
                logger.debug('selectContext token usage', JSON.stringify(resp.usage));
                cumulativeUsage.completionTokens += resp.usage.completionTokens || 0;
                cumulativeUsage.promptTokens += resp.usage.promptTokens || 0;
                cumulativeUsage.totalTokens += resp.usage.totalTokens || 0;
              }
            },
          });

          if (filteredFiles) {
            logger.debug(`files in context : ${JSON.stringify(Object.keys(filteredFiles))}`);
          }

          dataStream.writeMessageAnnotation({
            type: 'codeContext',
            files: Object.keys(filteredFiles).map((key) => {
              let path = key;

              if (path.startsWith(WORK_DIR)) {
                path = path.replace(WORK_DIR, '');
              }

              return path;
            }),
          } as ContextAnnotation);

          dataStream.writeData({
            type: 'progress',
            label: 'context',
            status: 'complete',
            order: progressCounter++,
            message: 'Code Files Selected',
          } satisfies ProgressAnnotation);
        }

        // Use the multi-agent system instead of direct model call
        dataStream.writeData({
          type: 'progress',
          label: 'response',
          status: 'in-progress',
          order: progressCounter++,
          message: 'Starting multi-agent processing',
        } satisfies ProgressAnnotation);

        try {
          // Get agent configuration
          const agentConfig = getAgentConfig();
          logger.debug(`Using agent implementation: ${agentConfig.implementation}`);
          
          // Ensure API keys are accessible
          const enrichedEnv = {
            ...(context.cloudflare?.env || {}),
            ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
            OPENAI_API_KEY: process.env.OPENAI_API_KEY,
            GROQ_API_KEY: process.env.GROQ_API_KEY,
            GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
            MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
            // Add any other API keys your agents might need
          };
          
          // Run the multi-agent orchestration with configured implementation
          const result = await (executeAgents as any)({
            messages,
            files: filteredFiles || files,
            env: enrichedEnv, // Use enriched environment
            apiKeys,
            providerSettings,
            promptId,
            contextOptimization,
            dataStream,
          }, agentConfig.implementation);

          // Handle the result
          if (result) {
            // Update cumulative usage with results from both agents
            cumulativeUsage.completionTokens += result.usage.completionTokens;
            cumulativeUsage.promptTokens += result.usage.promptTokens;
            cumulativeUsage.totalTokens += result.usage.totalTokens;

            // Ensure result.text is a properly resolved string
            const textResult = await ensureString(result.text);
            
            // Stream the text result
            const textChunks = textResult.split('');
            for (const chunk of textChunks) {
              dataStream.write(`0:${chunk}\n`);
              await new Promise((resolve) => setTimeout(resolve, 0));
            }

            // Add usage annotation
            dataStream.writeMessageAnnotation({
              type: 'usage',
              value: {
                completionTokens: cumulativeUsage.completionTokens,
                promptTokens: cumulativeUsage.promptTokens,
                totalTokens: cumulativeUsage.totalTokens,
              },
            });

            // Mark process as complete
            dataStream.writeData({
              type: 'progress',
              label: 'response',
              status: 'complete',
              order: progressCounter++,
              message: 'Response Generated',
            } satisfies ProgressAnnotation);
          }
        } catch (err) {
          logger.error('Error in multi-agent execution:', err);
          
          dataStream.writeData({
            type: 'progress',
            label: 'response',
            status: 'error' as 'complete', // Type assertion to avoid TS error
            order: progressCounter++,
            message: 'Error generating response',
          } satisfies ProgressAnnotation);
          
          // Handle error by writing to stream
          const errorMessage = `An error occurred while processing your request: ${(err as Error).message}`;
          dataStream.write(`0:${errorMessage}\n`);
        }
      },
      onError: (error: any) => `Custom error: ${error.message}`,
    });

    stream.switchSource(dataStream);

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({
        error: {
          message: 'There was an error processing your request',
        },
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );
  }
}
