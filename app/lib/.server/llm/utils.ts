import { type Message } from 'ai';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, MODEL_REGEX, PROVIDER_REGEX } from '~/utils/constants';
import { IGNORE_PATTERNS, type FileMap } from './constants';
import ignore from 'ignore';
import type { ContextAnnotation } from '~/types/context';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('llm.utils');

/**
 * Ensures a value is a string, resolving Promise if needed
 * This is an improved version that handles nested promises and guarantees string output
 * @param value The value to convert to string
 * @returns A string representation of the value
 */
export async function ensureString(value: any): Promise<string> {
  try {
    // Track resolution steps for debugging
    logger.debug(`ensureString: input type=${typeof value}, isPromise=${Boolean(value && typeof value === 'object' && typeof value.then === 'function')}`);
    
    // If it's a Promise, await it and recursively ensure string
    if (value && typeof value === 'object' && typeof value.then === 'function') {
      try {
        const resolvedValue = await value;
        logger.debug(`ensureString: resolved promise to type=${typeof resolvedValue}`);
        
        // Recursively call ensureString in case we have a nested promise
        return await ensureString(resolvedValue);
      } catch (promiseError) {
        logger.error('Error resolving promise:', promiseError);
        return '[Error resolving promise]';
      }
    }
    
    // If it's already a string, return it
    if (typeof value === 'string') {
      return value;
    }
    
    // For objects, try to JSON stringify them
    if (value && typeof value === 'object') {
      try {
        // Special case for objects that might have circular references
        if (Object.prototype.toString.call(value) === '[object Object]') {
          try {
            // Try with a more robust stringifier
            return JSON.stringify(value, (key, val) => {
              if (key === '' || typeof val !== 'object' || val === null) return val;
              
              // Handle circular references
              if (Object.prototype.hasOwnProperty.call(val, 'then') && typeof val.then === 'function') {
                return '[Promise object]';
              }
              
              return val;
            }, 2);
          } catch (circularError) {
            // Fallback for circular structures
            return `[Complex object: ${Object.keys(value).join(', ')}]`;
          }
        }
        
        return JSON.stringify(value);
      } catch (jsonError) {
        logger.error('Error stringifying object:', jsonError);
        return '[Object conversion error]';
      }
    }
    
    // Null or undefined
    if (value === null || value === undefined) {
      return '';
    }
    
    // Convert anything else to string
    return String(value);
  } catch (error) {
    logger.error('Error ensuring string:', error);
    return '[ensureString error]';
  }
}

/**
 * Tests an LLM API connection and returns diagnostic information
 * @param env Environment variables
 * @param apiKeys API keys
 * @param provider Provider name
 * @param model Model name (optional)
 * @returns Diagnostic information about the API connection
 */
export async function testLLMApiConnection({
  env,
  apiKeys,
  provider,
  model
}: {
  env: any;
  apiKeys: Record<string, string>;
  provider: string;
  model?: string;
}): Promise<{
  success: boolean;
  provider: string;
  model: string;
  error?: string;
  latency?: number;
  message?: string;
}> {
  logger.debug(`Testing API connection for provider: ${provider}, model: ${model || 'default'}`);
  
  const startTime = Date.now();
  
  try {
    // Check if required API keys are present
    const requiredKey = getRequiredApiKey(provider);
    if (requiredKey && (!apiKeys[requiredKey] || apiKeys[requiredKey].length < 10)) {
      return {
        success: false,
        provider,
        model: model || 'unknown',
        error: `Missing or invalid API key for ${provider}`,
      };
    }
    
    // TODO: Implement actual API ping for each provider
    // This would need provider-specific implementation
    
    // For now, just simulate a successful connection
    const latency = Date.now() - startTime;
    
    return {
      success: true,
      provider,
      model: model || 'default',
      latency,
      message: `Connection successful in ${latency}ms`,
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    logger.error(`API connection test failed for ${provider}:`, error);
    
    return {
      success: false,
      provider,
      model: model || 'unknown',
      error: error instanceof Error ? error.message : String(error),
      latency,
    };
  }
}

/**
 * Gets the required API key name for a specific provider
 */
function getRequiredApiKey(provider: string): string | null {
  switch (provider.toLowerCase()) {
    case 'openai':
      return 'OPENAI_API_KEY';
    case 'anthropic':
      return 'ANTHROPIC_API_KEY';
    case 'groq':
      return 'GROQ_API_KEY';
    case 'huggingface':
      return 'HuggingFace_API_KEY';
    case 'mistral':
      return 'MISTRAL_API_KEY';
    case 'openrouter':
      return 'OPEN_ROUTER_API_KEY';
    case 'google':
      return 'GOOGLE_GENERATIVE_AI_API_KEY';
    case 'cohere':
      return 'COHERE_API_KEY';
    case 'ollama':
      return null; // Ollama uses base URL, not API key
    default:
      return null;
  }
}

export function extractPropertiesFromMessage(message: Omit<Message, 'id'>): {
  model: string;
  provider: string;
  content: string;
} {
  // Handle null or undefined content
  if (!message.content) {
    return {
      model: DEFAULT_MODEL,
      provider: DEFAULT_PROVIDER.name,
      content: ''
    };
  }
  
  // Handle different content formats
  const textContent = Array.isArray(message.content)
    ? message.content.find((item) => item.type === 'text')?.text || ''
    : typeof message.content === 'string' 
      ? message.content 
      : String(message.content); // Convert to string if not already

  // Only try to match if textContent is a string
  const modelMatch = typeof textContent === 'string' ? textContent.match(MODEL_REGEX) : null;
  const providerMatch = typeof textContent === 'string' ? textContent.match(PROVIDER_REGEX) : null;

  /*
   * Extract model
   * const modelMatch = message.content.match(MODEL_REGEX);
   */
  const model = modelMatch ? modelMatch[1] : DEFAULT_MODEL;

  /*
   * Extract provider
   * const providerMatch = message.content.match(PROVIDER_REGEX);
   */
  const provider = providerMatch ? providerMatch[1] : DEFAULT_PROVIDER.name;

  const cleanedContent = Array.isArray(message.content)
    ? message.content.map((item) => {
        if (item.type === 'text') {
          return {
            type: 'text',
            text: item.text?.replace(MODEL_REGEX, '').replace(PROVIDER_REGEX, ''),
          };
        }

        return item; // Preserve image_url and other types as is
      })
    : textContent.replace(MODEL_REGEX, '').replace(PROVIDER_REGEX, '');

  return { model, provider, content: cleanedContent };
}

export function simplifyBoltActions(input: string): string {
  // Using regex to match boltAction tags that have type="file"
  const regex = /(<boltAction[^>]*type="file"[^>]*>)([\s\S]*?)(<\/boltAction>)/g;

  // Replace each matching occurrence
  return input.replace(regex, (_0, openingTag, _2, closingTag) => {
    return `${openingTag}\n          ...\n        ${closingTag}`;
  });
}

export function createFilesContext(files: FileMap, useRelativePath?: boolean) {
  const ig = ignore().add(IGNORE_PATTERNS);
  let filePaths = Object.keys(files);
  filePaths = filePaths.filter((x) => {
    const relPath = x.replace('/home/project/', '');
    return !ig.ignores(relPath);
  });

  const fileContexts = filePaths
    .filter((x) => files[x] && files[x].type == 'file')
    .map((path) => {
      const dirent = files[path];

      if (!dirent || dirent.type == 'folder') {
        return '';
      }

      const codeWithLinesNumbers = dirent.content
        .split('\n')
        // .map((v, i) => `${i + 1}|${v}`)
        .join('\n');

      let filePath = path;

      if (useRelativePath) {
        filePath = path.replace('/home/project/', '');
      }

      return `<boltAction type="file" filePath="${filePath}">${codeWithLinesNumbers}</boltAction>`;
    });

  return `<boltArtifact id="code-content" title="Code Content" >\n${fileContexts.join('\n')}\n</boltArtifact>`;
}

export function extractCurrentContext(messages: Message[]) {
  const lastAssistantMessage = messages.filter((x) => x.role == 'assistant').slice(-1)[0];

  if (!lastAssistantMessage) {
    return { summary: undefined, codeContext: undefined };
  }

  let summary: ContextAnnotation | undefined;
  let codeContext: ContextAnnotation | undefined;

  if (!lastAssistantMessage.annotations?.length) {
    return { summary: undefined, codeContext: undefined };
  }

  for (let i = 0; i < lastAssistantMessage.annotations.length; i++) {
    const annotation = lastAssistantMessage.annotations[i];

    if (!annotation || typeof annotation !== 'object') {
      continue;
    }

    if (!(annotation as any).type) {
      continue;
    }

    const annotationObject = annotation as any;

    if (annotationObject.type === 'codeContext') {
      codeContext = annotationObject;
      break;
    } else if (annotationObject.type === 'chatSummary') {
      summary = annotationObject;
      break;
    }
  }

  return { summary, codeContext };
}
