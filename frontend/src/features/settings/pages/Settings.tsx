import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import http from '../../../lib/util/http';
import { useSocketEffect } from '../../../lib/hooks/useSocketEffect';


import { ModelItem } from '../components/ModelItem';
import { Divider, InfoRow, LoadingRow, SectionError, SettingsSection } from '../components';
import { HardwareSectionContent } from '../components/HardwareSectionContent';

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
  const [downloads, setDownloads] = useState<Record<string, DownloadProgress>>({});

  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [useExperimentalGpu, setUseExperimentalGpu] = useState(false);
  const [isUpdatingGpu, setIsUpdatingGpu] = useState(false);
  const [gpuError, setGpuError] = useState<string | null>(null);

  const [modelErrors, setModelErrors] = useState<Record<string, string | undefined>>({});

  const {
    data: models,
    isLoading: isLoadingModels,
    isError: isErrorModels,
    refetch: refetchModels,
  } = useQuery({
    queryKey: ['models'],
    queryFn: async () => {
      const res = await http.get<{ data: ModelInfo[] }>('/qvac/models');
      return res.data.data;
    },
  });

  const {
    data: hardware,
    isLoading: isLoadingHardware,
    isError: isErrorHardware,
    refetch: refetchHardware,
  } = useQuery({
    queryKey: ['hardware'],
    queryFn: async () => {
      const res = await http.get<{
        data: { cpuCores: number; totalRamGb: number; availableRamGb: number; gpuRamGb: number };
      }>('/settings/hardware');
      return res.data.data;
    },
  });

  const {
    data: storage,
  } = useQuery({
    queryKey: ['storage'],
    queryFn: async () => {
      const res = await http.get<{
        data: { storageUsedGb: number; storageTotalGb: number; contextSizeLimit: number; totalModelSize: number; sqliteDbSize: number; applicationStorageBytes: number };
      }>('/settings/storage');
      return res.data.data;
    },
  });

  const {
    data: modelInfo,
    isLoading: isLoadingModelInfo,
    isError: isErrorModelInfo,
    refetch: refetchModelInfo,
  } = useQuery({
    queryKey: ['modelInfo'],
    queryFn: async () => {
      const res = await http.get<{
        data: {
          llmModel: any | null;
          embeddingModel: any | null;
          totalModelSize: number;
          models: any[];
        };
      }>('/settings/models');
      return res.data.data;
    },
  });

  const toggleGpuSetting = async (checked: boolean) => {
    setGpuError(null);
    setUseExperimentalGpu(checked);
    setIsUpdatingGpu(true);

    try {
      await http.put('/settings', { useExperimentalGpu: checked });
    } catch (error) {
      console.error('Failed to update GPU setting', error);
      setUseExperimentalGpu(!checked);
      setGpuError('GPU inference could not be updated. Your previous setting was restored.');
    } finally {
      setIsUpdatingGpu(false);
    }
  };

  useSocketEffect({
    onModelProgress: (data: any) => {
      const progress = data as DownloadProgress;
      setDownloads((prev) => ({ ...prev, [progress.modelId]: progress }));
      if (progress.status === 'error') setExpandedModel(progress.modelId);
      if (progress.status === 'success' || progress.status === 'error') refetchModels();
    },
  });

  const startDownload = async (modelId: string) => {
    setModelErrors((prev) => ({ ...prev, [modelId]: undefined }));
    setDownloads((prev) => ({
      ...prev,
      [modelId]: { modelId, status: 'starting', progress: 0, message: 'Preparing download…' },
    }));

    try {
      const socketId = localStorage.getItem('socketId') || Math.random().toString(36).substring(7);
      await http.post('/qvac/models/download', { modelId, socketId });
    } catch (error) {
      setDownloads((prev) => ({
        ...prev,
        [modelId]: { modelId, status: 'error', progress: 0, message: 'Download could not be started.' },
      }));
    }
  };

  const deleteModel = async (modelId: string) => {
    if (!window.confirm('Are you sure you want to delete this model to free up space?')) return;
    setModelErrors((prev) => ({ ...prev, [modelId]: undefined }));

    try {
      await http.delete(`/qvac/models/${modelId}`);
      refetchModels();
    } catch (error) {
      setModelErrors((prev) => ({ ...prev, [modelId]: 'This model could not be deleted. Please try again.' }));
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 MB';
    const mb = bytes / 1024 / 1024;
    return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(2)} MB`;
  };

  return (
    <div className="min-h-screen bg-[#f2f2f7] px-4 py-8 text-foreground dark:bg-black md:px-8 md:py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-7 px-1">
          <h1 className="text-[34px] font-bold tracking-[-0.025em]">Settings</h1>
        </header>

        <SettingsSection title="Local AI Models" footer="Larger models require more memory and disk space. Incompatible models are disabled automatically.">
          {isLoadingModels && <LoadingRow />}
          {isErrorModels && <SectionError message="Available models couldn't be loaded." onRetry={refetchModels} />}
          {(models ?? []).map((model, index) => (
            <React.Fragment key={model.id}>
              <ModelItem 
                model={model}
                isDownloading={!!downloads[model.id] && downloads[model.id]?.status === 'downloading'}
                download={downloads[model.id]}
                isExpanded={expandedModel === model.id}
                onToggleExpand={() => setExpandedModel(expandedModel === model.id ? null : model.id)}
                status={downloads[model.id]?.status === 'downloading' ? `${downloads[model.id]?.progress}%` : model.isLoaded ? 'Loaded' : model.isCached ? 'Installed' : null}
                downloadError={downloads[model.id]?.message}
                actionError={modelErrors[model.id]}
                onDelete={deleteModel}
                onDownload={startDownload}
              />
              {index !== (models?.length ?? 0) - 1 && <Divider inset={'row'} />}
            </React.Fragment>
          ))}
        </SettingsSection>

        <SettingsSection title="Hardware" footer={<>CPU inference is the default and most stable option. Experimental GPU acceleration may behave differently depending on your hardware.</>}>
          <HardwareSectionContent 
            useExperimentalGpu={useExperimentalGpu}
            isUpdatingGpu={isUpdatingGpu}
            toggleGpuSetting={toggleGpuSetting}
            gpuError={gpuError}
            hardware={hardware}
          />
          {isLoadingHardware && <LoadingRow />}
          {isErrorHardware && <SectionError message="Hardware information couldn't be loaded." onRetry={refetchHardware} />}
        </SettingsSection>


        <SettingsSection title="Model Information" footer="The LLM and embedding models power code review and semantic search.">
          {isLoadingModelInfo && <LoadingRow />}
          {isErrorModelInfo && <SectionError message="Model information couldn't be loaded." onRetry={refetchModelInfo} />}
          {modelInfo && (
            <>
              <InfoRow label="LLM Model" value={modelInfo.llmModel?.name || 'Not loaded'} />
              <Divider />
              <InfoRow label="LLM Context Size" value={`${storage?.contextSizeLimit.toLocaleString() || '128,000'} tokens`} />
              <Divider />
              <InfoRow label="LLM Storage" value={formatSize(modelInfo.llmModel?.actualSize || 0)} />
              <Divider />
              <InfoRow label="Embedding Model" value={modelInfo.embeddingModel?.name || 'Not loaded'} />
              <Divider />
              <InfoRow label="Embedding Storage" value={formatSize(modelInfo.embeddingModel?.actualSize || 0)} />
              <Divider />
              <InfoRow label="Total Model Storage" value={formatSize(modelInfo.totalModelSize)} />
            </>
          )}
        </SettingsSection>

     
      </div>
    </div>
  );
};
