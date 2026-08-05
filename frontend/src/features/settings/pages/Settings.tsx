import { useEffect, useState } from 'react';
import http from '../../../lib/util/http';

import { useSocketEffect } from '../../../lib/hooks/useSocketEffect';
import { Button } from '../../../components/ui/button';
import ExpandableContainer from '../../../components/common/ExpandableContainer';
import { Download, Trash2, Cpu, AlertTriangle, Box, ChevronRight } from 'lucide-react';

interface ModelInfo {
  id: string;
  name: string;
  requiredRamGb: number;
  totalMemGb: number;
  isCompatible: boolean;
  isCached: boolean;
  expectedSize: number;
  actualSize: number;
  isLoaded: boolean;
}

interface DownloadProgress {
  modelId: string;
  status: 'starting' | 'downloading' | 'success' | 'error';
  progress: number;
  message: string;
}

export const Settings = () => {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloads, setDownloads] = useState<Record<string, DownloadProgress>>({});
  const [expandedModel, setExpandedModel] = useState<string | null>(null);

  const fetchModels = async () => {
    try {
      const res = await http.get<{ data: ModelInfo[] }>('/qvac/models');
      setModels(res.data.data);
    } catch (err) {
      console.error('Failed to fetch models:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  useSocketEffect({
    onModelProgress: (data: any) => {
      setDownloads((prev) => ({
        ...prev,
        [data.modelId]: data as DownloadProgress,
      }));

      if (data.status === 'success' || data.status === 'error') {
        fetchModels();
      }
    },
  });

  const startDownload = async (modelId: string) => {
    try {
      setDownloads((prev) => ({
        ...prev,
        [modelId]: { modelId, status: 'starting', progress: 0, message: 'Initiating...' },
      }));
      const socketId = localStorage.getItem('socketId') || Math.random().toString(36).substring(7);
      await http.post('/qvac/models/download', { modelId, socketId });
    } catch (err) {
      console.error('Failed to start download:', err);
      setDownloads((prev) => ({
        ...prev,
        [modelId]: {
          modelId,
          status: 'error',
          progress: 0,
          message: 'Failed to initiate download',
        },
      }));
    }
  };

  const deleteModel = async (modelId: string) => {
    if (!window.confirm('Are you sure you want to delete this model to free up space?')) return;
    try {
      await http.delete(`/qvac/models/${modelId}`);
      fetchModels();
    } catch (err) {
      console.error('Failed to delete model:', err);
      alert('Failed to delete model');
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 MB';
    const mb = bytes / 1024 / 1024;
    if (mb > 1024) return (mb / 1024).toFixed(2) + ' GB';
    return mb.toFixed(2) + ' MB';
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading settings...</div>;
  }

  return (
    <div className="min-h-screen bg-[#f2f2f7] dark:bg-black p-4 md:p-8 animate-in fade-in duration-300">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight mb-6 px-2">Settings</h1>

        <div className="mb-2 px-4 text-[13px] font-normal text-muted-foreground uppercase tracking-wide">
          Local AI Models
        </div>

        <div className="bg-white dark:bg-[#1c1c1e] rounded-xl overflow-hidden shadow-sm border border-black/5 dark:border-white/5">
          {models.map((model, index) => {
            const download = downloads[model.id];
            const isDownloading =
              download && (download.status === 'downloading' || download.status === 'starting');
            const isExpanded = expandedModel === model.id;

            return (
              <div key={model.id} className="flex flex-col">
                {/* Main Row */}
                <div
                  className="flex items-center justify-between p-3 pl-4 pr-4 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 active:bg-black/10 dark:active:bg-white/10 transition-colors"
                  onClick={() => setExpandedModel(isExpanded ? null : model.id)}
                >
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`p-1.5 rounded-md text-white shadow-sm flex-shrink-0 ${model.id.toUpperCase().includes('QWEN') ? 'bg-blue-500' : 'bg-indigo-500'}`}
                    >
                      <Box className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[17px] font-normal tracking-tight text-foreground">
                        {model.name}
                      </span>
                      {model.isCached && (
                        <span className="text-[13px] text-muted-foreground">
                          Downloaded • {formatSize(model.actualSize)}
                        </span>
                      )}
                      {!model.isCached && (
                        <span className="text-[13px] text-muted-foreground">
                          Requires ~{model.requiredRamGb}GB RAM
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {isDownloading ? (
                      <div className="text-[15px] text-muted-foreground flex items-center gap-2">
                        <span className="hidden sm:inline">{download.progress}%</span>
                        <Download className="w-4 h-4 animate-bounce text-primary" />
                      </div>
                    ) : (
                      <div className="text-[15px] text-muted-foreground">
                        {model.isCached ? 'Installed' : 'Not Installed'}
                      </div>
                    )}
                    <ChevronRight
                      className={`w-5 h-5 text-[#c7c7cc] dark:text-[#5c5c5e] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                  </div>
                </div>

                <ExpandableContainer isExpanded={isExpanded}>
                  <div className="bg-black/5 dark:bg-black/40 px-4 py-4 pl-[3.25rem] border-t border-black/5 dark:border-white/5 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">Model Identifier</span>
                      <span className="text-sm font-mono text-muted-foreground bg-black/10 dark:bg-white/10 px-2 py-0.5 rounded">
                        {model.id}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-foreground">Memory Requirement</span>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {model.requiredRamGb} GB (Device has {model.totalMemGb} GB)
                      </span>
                    </div>

                    {!model.isCompatible && !model.isCached && (
                      <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 dark:bg-red-950/20 p-3 rounded-md border border-red-200 dark:border-red-900/50">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        <p>
                          This model exceeds your system's memory capacity and may cause severe lag.
                        </p>
                      </div>
                    )}

                    {isDownloading && download && (
                      <div className="space-y-1.5 pt-2">
                        <div className="flex justify-between text-xs text-muted-foreground font-medium">
                          <span>{download.message}</span>
                        </div>
                        <div className="h-1.5 w-full bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all duration-300 ease-out rounded-full"
                            style={{ width: `${download.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {download?.status === 'error' && (
                      <div className="text-sm text-red-500 flex items-center gap-2 pt-2">
                        <AlertTriangle className="w-4 h-4" /> {download.message}
                      </div>
                    )}

                    <div className="pt-2 flex justify-end">
                      {model.isCached ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteModel(model.id);
                          }}
                          className="rounded-full px-5 font-medium"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Model
                        </Button>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          className="bg-blue-500 hover:bg-blue-600 text-white rounded-full px-6 font-medium shadow-sm"
                          disabled={!model.isCompatible || isDownloading}
                          onClick={(e) => {
                            e.stopPropagation();
                            startDownload(model.id);
                          }}
                        >
                          {isDownloading ? 'Downloading...' : 'Download'}
                        </Button>
                      )}
                    </div>
                  </div>
                </ExpandableContainer>

                {/* Separator Line between items (not shown on last item) */}
                {index !== models.length - 1 && (
                  <div className="ml-[3.25rem] border-b border-[#c6c6c8] dark:border-[#38383a]" />
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-4 px-4 text-[13px] text-muted-foreground text-center">
          These models run entirely on your device. Ensure you have enough disk space and memory
          before downloading.
        </p>
      </div>
    </div>
  );
};
