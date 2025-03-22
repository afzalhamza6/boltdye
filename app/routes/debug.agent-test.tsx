import React, { useState } from 'react';
import { json } from '@remix-run/node';
import { useFetcher } from '@remix-run/react';

interface TestResult {
  success: boolean;
  message: string;
  details?: any;
  logs?: string[];
  duration?: number;
}

export const action = async () => {
  try {
    // Import needed functions from server-side code
    const { testLLMApiConnection } = await import('~/lib/.server/llm/utils');
    const { AgentRole } = await import('~/lib/.server/agents/types');
    const { default: AgentTester } = await import('~/lib/.server/agents/tester');
    
    // Load environment variables (replace with your actual env loading)
    const env = process.env;
    
    // Create API key map from env
    const apiKeys: Record<string, string> = {
      OPENAI_API_KEY: env.OPENAI_API_KEY || '',
      ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY || '',
      GROQ_API_KEY: env.GROQ_API_KEY || '',
      HuggingFace_API_KEY: env.HuggingFace_API_KEY || '',
      MISTRAL_API_KEY: env.MISTRAL_API_KEY || '',
      OPEN_ROUTER_API_KEY: env.OPEN_ROUTER_API_KEY || '',
    };

    // Test API connections
    const apiTestResults = await Promise.all([
      testLLMApiConnection({
        env,
        apiKeys,
        provider: 'openai',
        model: 'gpt-3.5-turbo',
      }),
      testLLMApiConnection({
        env,
        apiKeys,
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229',
      }),
      testLLMApiConnection({
        env,
        apiKeys,
        provider: 'groq',
        model: 'llama3-8b-8192',
      }),
    ]);
    
    // Test the agent system
    const tester = new AgentTester();
    const agentTestResult = await tester.testAgentSystem({
      env,
      apiKeys,
      provider: 'anthropic',
      model: 'claude-3-sonnet-20240229',
      testPrompt: "Create a simple Counter component in React using hooks",
    });
    
    return json({
      success: true,
      message: 'Tests completed',
      details: {
        apiTests: apiTestResults,
        agentTest: agentTestResult,
      },
      logs: agentTestResult.logs,
      duration: agentTestResult.duration,
    });
  } catch (error) {
    console.error('Error running tests:', error);
    return json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

export default function AgentTestPage() {
  const fetcher = useFetcher<TestResult>();
  const [isOpen, setIsOpen] = useState<Record<string, boolean>>({});
  
  const toggleSection = (section: string) => {
    setIsOpen({
      ...isOpen,
      [section]: !isOpen[section],
    });
  };
  
  const isLoading = fetcher.state !== 'idle';
  const data = fetcher.data;
  
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Agent System Test Console</h1>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Instructions</h2>
        <p className="mb-4">
          This tool will test your agent system by:
        </p>
        <ul className="list-disc pl-5 space-y-2 mb-4">
          <li>Testing API connections to various LLM providers</li>
          <li>Running a test prompt through the agent system</li>
          <li>Collecting logs and timing information</li>
          <li>Validating that everything is working correctly</li>
        </ul>
        <p>
          Click the button below to start testing the agent system:
        </p>
      </div>
      
      <div className="mb-8">
        <fetcher.Form method="post">
          <button
            type="submit"
            disabled={isLoading}
            className={`px-4 py-2 rounded font-semibold ${
              isLoading 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-500 hover:bg-blue-600 text-white'
            }`}
          >
            {isLoading ? 'Running Tests...' : 'Run Agent System Tests'}
          </button>
        </fetcher.Form>
      </div>
      
      {data && (
        <div className="mt-8">
          <div className={`p-4 rounded mb-4 ${data.success ? 'bg-green-100' : 'bg-red-100'}`}>
            <h3 className={`font-bold ${data.success ? 'text-green-700' : 'text-red-700'}`}>
              {data.success ? 'Tests Passed' : 'Tests Failed'}
            </h3>
            <p>{data.message}</p>
            {data.duration && (
              <p className="text-sm mt-1">Duration: {data.duration}ms</p>
            )}
          </div>
          
          {data.details?.apiTests && (
            <div className="mb-6">
              <div 
                className="font-semibold mb-2 cursor-pointer flex items-center" 
                onClick={() => toggleSection('apiTests')}
              >
                <span className="mr-2">{isOpen.apiTests ? '▼' : '►'}</span>
                API Connection Tests
              </div>
              
              {isOpen.apiTests && (
                <div className="pl-6">
                  {data.details.apiTests.map((test: any, i: number) => (
                    <div 
                      key={i} 
                      className={`p-3 mb-2 rounded ${test.success ? 'bg-green-50' : 'bg-red-50'}`}
                    >
                      <div className="font-medium">
                        Provider: {test.provider}, Model: {test.model}
                      </div>
                      <div className={test.success ? 'text-green-600' : 'text-red-600'}>
                        {test.success ? '✓ Connected' : '✗ Failed'}
                        {test.latency && ` (${test.latency}ms)`}
                      </div>
                      {test.error && (
                        <div className="text-red-500 text-sm mt-1">{test.error}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {data.details?.agentTest && (
            <div className="mb-6">
              <div 
                className="font-semibold mb-2 cursor-pointer flex items-center" 
                onClick={() => toggleSection('agentTest')}
              >
                <span className="mr-2">{isOpen.agentTest ? '▼' : '►'}</span>
                Agent System Test
              </div>
              
              {isOpen.agentTest && (
                <div className="pl-6">
                  <div className={`p-3 mb-2 rounded ${data.details.agentTest.success ? 'bg-green-50' : 'bg-red-50'}`}>
                    <div className="font-medium">
                      Test Prompt: {data.details.agentTest.prompt}
                    </div>
                    <div className={data.details.agentTest.success ? 'text-green-600' : 'text-red-600'}>
                      {data.details.agentTest.success ? '✓ Success' : '✗ Failed'}
                      {data.details.agentTest.duration && ` (${data.details.agentTest.duration}ms)`}
                    </div>
                    {data.details.agentTest.error && (
                      <div className="text-red-500 text-sm mt-1">{data.details.agentTest.error}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {data.logs && (
            <div className="mb-6">
              <div 
                className="font-semibold mb-2 cursor-pointer flex items-center" 
                onClick={() => toggleSection('logs')}
              >
                <span className="mr-2">{isOpen.logs ? '▼' : '►'}</span>
                System Logs
              </div>
              
              {isOpen.logs && (
                <div className="bg-black text-green-400 p-4 rounded font-mono text-sm overflow-x-auto">
                  {data.logs.map((log, i) => (
                    <div key={i} className="whitespace-pre-wrap mb-1">
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
} 