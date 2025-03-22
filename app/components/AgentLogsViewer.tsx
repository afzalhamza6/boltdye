import React, { useState, useEffect } from 'react';
import { LogFilterMode, viewAgentLogs } from '~/utils/log-viewer';

interface AgentLogsViewerProps {
  filterMode?: LogFilterMode;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

const AgentLogsViewer: React.FC<AgentLogsViewerProps> = ({
  filterMode = LogFilterMode.ALL,
  autoRefresh = true,
  refreshInterval = 2000, // 2 seconds
}) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<LogFilterMode>(filterMode);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState<boolean>(autoRefresh);

  // Fetch logs
  const fetchLogs = () => {
    if (typeof window !== 'undefined' && (window as any).viewAgentLogs) {
      const agentLogs = (window as any).viewAgentLogs(selectedFilter);
      setLogs(agentLogs);
    }
  };

  // Set up auto-refresh
  useEffect(() => {
    fetchLogs();

    let intervalId: number | undefined;
    
    if (isAutoRefreshing) {
      intervalId = window.setInterval(fetchLogs, refreshInterval);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isAutoRefreshing, selectedFilter, refreshInterval]);

  // Handle filter change
  const handleFilterChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedFilter(event.target.value as LogFilterMode);
  };

  // Toggle auto-refresh
  const toggleAutoRefresh = () => {
    setIsAutoRefreshing(!isAutoRefreshing);
  };

  // Manual refresh
  const handleManualRefresh = () => {
    fetchLogs();
  };

  return (
    <div className="agent-logs-viewer p-4 bg-gray-100 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Agent Logs</h2>
        <div className="flex space-x-2">
          <select 
            value={selectedFilter} 
            onChange={handleFilterChange}
            className="px-2 py-1 border rounded"
          >
            <option value={LogFilterMode.ALL}>All Agents</option>
            <option value={LogFilterMode.ORCHESTRATOR}>Orchestrator</option>
            <option value={LogFilterMode.PROMPT_ENHANCER}>Prompt Enhancer</option>
            <option value={LogFilterMode.CODE_GENERATOR}>Code Generator</option>
            <option value={LogFilterMode.ERRORS}>Errors Only</option>
          </select>
          <button 
            onClick={toggleAutoRefresh}
            className={`px-2 py-1 border rounded ${isAutoRefreshing ? 'bg-green-500 text-white' : 'bg-gray-200'}`}
          >
            {isAutoRefreshing ? 'Auto Refresh On' : 'Auto Refresh Off'}
          </button>
          <button 
            onClick={handleManualRefresh}
            className="px-2 py-1 border rounded bg-blue-500 text-white"
          >
            Refresh Now
          </button>
        </div>
      </div>
      
      <div className="log-container h-96 overflow-y-auto bg-black text-green-400 p-4 font-mono text-sm">
        {logs.length > 0 ? (
          logs.map((log, index) => (
            <div key={index} className="log-entry whitespace-pre-wrap mb-1">
              {log}
            </div>
          ))
        ) : (
          <div className="text-gray-400">No logs found. Try changing the filter or running an agent.</div>
        )}
      </div>
      
      <div className="mt-2 text-sm text-gray-500">
        {logs.length} log entries found with filter: {selectedFilter}
      </div>
    </div>
  );
};

export default AgentLogsViewer; 