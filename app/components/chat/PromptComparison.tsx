import React from 'react';
import { Card } from '~/components/ui/Card';

interface PromptComparisonProps {
  original: string;
  enhanced: string;
}

export function PromptComparison({ original, enhanced }: PromptComparisonProps) {
  return (
    <Card className="mt-2 mb-4 p-4 bg-gray-50 border border-gray-200 rounded-md">
      <div className="text-sm font-medium text-gray-700 mb-2">Prompt Enhancement</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-3 rounded border border-gray-200">
          <div className="text-xs font-medium text-gray-500 mb-1">Original Prompt</div>
          <div className="text-sm whitespace-pre-wrap">{original}</div>
        </div>
        <div className="bg-white p-3 rounded border border-gray-200">
          <div className="text-xs font-medium text-green-600 mb-1">Enhanced Prompt</div>
          <div className="text-sm whitespace-pre-wrap">{enhanced}</div>
        </div>
      </div>
    </Card>
  );
} 