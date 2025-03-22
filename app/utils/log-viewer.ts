/**
 * Utility for filtering and viewing agent logs
 */

import { createScopedLogger } from './logger';

const logger = createScopedLogger('log-viewer');

/**
 * Filter modes for log viewing
 */
export enum LogFilterMode {
  ALL = 'all',
  ORCHESTRATOR = 'orchestrator',
  PROMPT_ENHANCER = 'prompt-enhancer',
  CODE_GENERATOR = 'code-generator',
  ERRORS = 'errors',
}

// Errors to suppress from console (we handle them gracefully)
const SUPPRESSED_ERRORS = [
  'GET https://api.github.com/repos',
  'Error fetching repo contents:',
  'HTTP error! status: 403',
];

/**
 * Get agent-specific logs
 * @param mode - The filter mode for logs
 */
export function viewAgentLogs(mode: LogFilterMode = LogFilterMode.ALL) {
  // Get all console logs
  const logs = (console as any).logs || [];
  
  logger.info(`Viewing agent logs with filter: ${mode}`);
  
  // Filter logs based on mode
  let filteredLogs: any[] = [];
  
  switch (mode) {
    case LogFilterMode.ORCHESTRATOR:
      filteredLogs = logs.filter((log: any) => 
        log.includes('agent.orchestrator')
      );
      break;
    case LogFilterMode.PROMPT_ENHANCER:
      filteredLogs = logs.filter((log: any) => 
        log.includes('agent.prompt-enhancer')
      );
      break;
    case LogFilterMode.CODE_GENERATOR:
      filteredLogs = logs.filter((log: any) => 
        log.includes('agent.code-generator')
      );
      break;
    case LogFilterMode.ERRORS:
      filteredLogs = logs.filter((log: any) => 
        log.includes('ERROR')
      );
      break;
    case LogFilterMode.ALL:
    default:
      filteredLogs = logs.filter((log: any) => 
        log.includes('agent.')
      );
      break;
  }
  
  // Print the filtered logs
  console.log('============ AGENT LOGS ============');
  console.log(`Filter: ${mode}`);
  console.log(`Found ${filteredLogs.length} logs`);
  console.log('===================================');
  
  filteredLogs.forEach((log: any, index: number) => {
    console.log(`[${index + 1}] ${log}`);
  });
  
  console.log('===================================');
  
  return filteredLogs;
}

/**
 * Monkey-patch console to store logs for viewing
 */
export function enableLogCapture() {
  if (typeof window !== 'undefined') {
    // Store original console methods
    const originalConsole = {
      log: console.log,
      info: console.info,
      debug: console.debug,
      warn: console.warn,
      error: console.error,
    };
    
    // Initialize logs array if not exists
    (console as any).logs = (console as any).logs || [];
    
    // Patch console methods to capture logs
    console.log = function(...args: any[]) {
      (console as any).logs.push(args.join(' '));
      originalConsole.log.apply(console, args);
    };
    
    console.info = function(...args: any[]) {
      (console as any).logs.push(args.join(' '));
      originalConsole.info.apply(console, args);
    };
    
    console.debug = function(...args: any[]) {
      (console as any).logs.push(args.join(' '));
      originalConsole.debug.apply(console, args);
    };
    
    console.warn = function(...args: any[]) {
      (console as any).logs.push(args.join(' '));
      originalConsole.warn.apply(console, args);
    };
    
    console.error = function(...args: any[]) {
      // Skip suppressed errors in browser console but still capture them
      const errorText = args.join(' ');
      const shouldSuppress = SUPPRESSED_ERRORS.some(err => errorText.includes(err));
      
      (console as any).logs.push(errorText);
      
      if (!shouldSuppress) {
        originalConsole.error.apply(console, args);
      } else {
        // Log as a warning instead
        originalConsole.warn.apply(console, ['[Suppressed Error]', ...args]);
      }
    };
    
    logger.info('Log capture enabled');
  }
}

/**
 * Create a global helper function to view agent logs
 */
export function setupLogViewer() {
  enableLogCapture();
  
  if (typeof window !== 'undefined') {
    (window as any).viewAgentLogs = viewAgentLogs;
    logger.info('Log viewer setup complete. Use window.viewAgentLogs() in the browser console to view agent logs.');
  }
} 