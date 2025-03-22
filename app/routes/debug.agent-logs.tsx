import React from 'react';
import AgentLogsViewer from '~/components/AgentLogsViewer';

export default function AgentLogsDebugPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Agent System Debug Console</h1>
      
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Instructions</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Make sure <code className="bg-gray-200 px-2 py-1 rounded">VITE_LOG_LEVEL=debug</code> is set in your <code className="bg-gray-200 px-2 py-1 rounded">.env</code> file</li>
          <li>Run the app with <code className="bg-gray-200 px-2 py-1 rounded">npm run dev:debug</code> to enable detailed logging</li>
          <li>Use the agent system as normal</li>
          <li>Return to this page to view detailed logs</li>
          <li>You can also type <code className="bg-gray-200 px-2 py-1 rounded">window.viewAgentLogs()</code> in the browser console to see logs</li>
        </ul>
      </div>
      
      <AgentLogsViewer />
      
      <div className="mt-8 text-sm text-gray-500">
        <h3 className="font-semibold mb-2">Additional Console Commands:</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><code className="bg-gray-200 px-2 py-1 rounded">window.viewAgentLogs('orchestrator')</code> - View orchestrator logs only</li>
          <li><code className="bg-gray-200 px-2 py-1 rounded">window.viewAgentLogs('prompt-enhancer')</code> - View prompt enhancer logs only</li>
          <li><code className="bg-gray-200 px-2 py-1 rounded">window.viewAgentLogs('code-generator')</code> - View code generator logs only</li>
          <li><code className="bg-gray-200 px-2 py-1 rounded">window.viewAgentLogs('errors')</code> - View error logs only</li>
        </ul>
      </div>
    </div>
  );
} 