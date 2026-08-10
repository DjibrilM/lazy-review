import { useState } from 'react';
 import { FileText, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { useSocketEffect } from '@/lib/hooks/useSocketEffect';
import { useParams } from 'react-router-dom';

type IndexingStatus = 'idle' | 'running' | 'success' | 'error';

interface CodebaseSummaryProps {
  initialFacts?: any;
}

export function CodebaseSummary({ initialFacts }: CodebaseSummaryProps) {
  const { id: repoId } = useParams<{ id: string }>();
  const [statusMessage, setStatusMessage] = useState('');
  const [indexingStatus, setIndexingStatus] = useState<IndexingStatus>('idle');
  const [facts, setFacts] = useState<any>(initialFacts || null);

  useSocketEffect({
    onIndexingProgress: (data: any) => {
      if (data.projectId && repoId && data.projectId !== repoId) return;

      if (data.status === 'running') {
        setIndexingStatus('running');
        setStatusMessage(data.message || 'Scanning codebase...');
      } else if (data.status === 'success') {
        setIndexingStatus('success');
        setStatusMessage('Indexing complete!');
        if (data.facts) setFacts(data.facts);
      } else if (data.status === 'error') {
        setIndexingStatus('error');
        setStatusMessage(data.message || 'An unknown error occurred during indexing.');
      }
    }
  });

  const StatusBadge = () => {
    if (indexingStatus === 'running') {
      return (
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {statusMessage}
        </span>
      );
    }
    if (indexingStatus === 'success') {
      return (
        <span className="flex items-center gap-1.5 text-sm text-green-500">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {statusMessage}
        </span>
      );
    }
    if (indexingStatus === 'error') {
      return (
        <span className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle className="w-3.5 h-3.5" />
          Indexing failed
        </span>
      );
    }
    return null;
  };

  const currentFacts = facts;

  if (!currentFacts) {
    return (
      <div className="space-y-6">
        <Card className="bg-muted/10 border-border">
          <CardHeader>
            <div className="flex justify-between items-center w-full">
              <div>
                <CardTitle>Architectural Manifest</CardTitle>
                <CardDescription>
                  No codebase facts have been indexed yet.
                </CardDescription>
              </div>
              <StatusBadge />
            </div>
          </CardHeader>
        </Card>
        {indexingStatus === 'error' && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="p-4">
              <div className="flex gap-3 items-start">
                <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-destructive mb-1">Indexing Error</p>
                  <p className="text-sm text-muted-foreground font-mono break-all">{statusMessage}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const markdownContent = `
# ${currentFacts.project_name || 'Project'} - Architectural Manifest

## Overview
This is a ${currentFacts.application_type || 'software application'} built using the ${currentFacts.architecture_pattern || 'Unknown'} architecture pattern.

${currentFacts.explanation || 'No detailed explanation provided.'}

## Technology Stack
${(currentFacts.tech_stack || []).map((tech: string) => `- ${tech}`).join('\n')}

## Core Modules
${(currentFacts.core_modules || []).map((m: any) => `- \`${m.path}\`: ${m.desc}`).join('\n')}

## Key Conventions
${(currentFacts.key_conventions || []).map((k: string) => `- ${k}`).join('\n')}

## Required Secrets & Environment Variables
${(currentFacts.required_secrets || []).map((s: any) => `- **${s.key}**: ${s.description}`).join('\n')}
  `;

  return (
    <div className="space-y-6">
      <Card className="bg-muted/10 border-border">
        <CardHeader>
          <div className="flex justify-between items-center w-full">
            <div>
              <CardTitle>Architectural Manifest</CardTitle>
              <CardDescription>
                The AI's local understanding of this repository's structure and rules.
              </CardDescription>
            </div>
            <StatusBadge />
          </div>
        </CardHeader>
      </Card>

      {indexingStatus === 'error' && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex gap-3 items-start">
              <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-destructive mb-1">Re-indexing Failed</p>
                <p className="text-sm text-muted-foreground font-mono break-all">{statusMessage}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden shadow-md border-border bg-card">
        <div className="border-b border-border px-4 py-2 text-muted-foreground flex items-center text-sm font-mono">
          <FileText className="w-4 h-4 mr-2" />
          CODEBASE_FACTS.md
        </div>
        <CardContent className="p-6 overflow-x-auto">
          <MarkdownPreview
            source={markdownContent}
            style={{ backgroundColor: 'transparent' }}
            className="text-sm! md:text-base!"
          />
        </CardContent>
      </Card>
    </div>
  );
}
