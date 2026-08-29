import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import http from '../../../lib/util/http';
import { useSocketEffect } from '../../../lib/hooks/useSocketEffect';


import { ModelItem } from '../components/ModelItem';
import { Divider, InfoRow, LoadingRow, SectionError, SettingsSection } from '../components';
import { HardwareSectionContent } from '../components/HardwareSectionContent';
import Visible from "@/components/common/Visible";
import { authService } from '@/services/auth.service';
import { githubService } from '@/services/github.service';
import { GithubLoginModal } from '../../../components/GithubLoginModal';

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

    const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({});
    const [useExperimentalGpu, setUseExperimentalGpu] = useState(false);
    const [isUpdatingGpu, setIsUpdatingGpu] = useState(false);
    const [gpuError, setGpuError] = useState<string | null>(null);

    const { data: baseSettings } = useQuery({
        queryKey: ['baseSettings'],
        queryFn: async () => {
            const res = await http.get<{ data: { useExperimentalGpu: boolean } }>('/settings');
            return res.data.data;
        },
    });

    React.useEffect(() => {
        if (baseSettings !== undefined) {
            setUseExperimentalGpu(baseSettings.useExperimentalGpu);
        }
    }, [baseSettings]);

    const [modelErrors, setModelErrors] = useState<Record<string, string | undefined>>({});
    const [loginModalOpen, setLoginModalOpen] = useState(false);

    const { data: userProfile, refetch: refetchProfile } = useQuery({
        queryKey: ['github-authenticated-user'],
        queryFn: () => githubService.getUserProfile('me'),
        retry: false,
    });

    const handleLogout = async () => {
        if (!window.confirm('Are you sure you want to log out from GitHub?')) return;
        try {
            await authService.logout();
            window.location.reload();
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

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

    React.useEffect(() => {
        if (models && models.length > 0) {
            const hasCachedModel = models.some(m => m.isCached);
            if (!hasCachedModel) {
                setExpandedModels(prev => {
                    if (Object.keys(prev).length === 0) {
                        const allModels: Record<string, boolean> = {};
                        models.forEach(m => { allModels[m.id] = true; });
                        return allModels;
                    }
                    return prev;
                });
            }
        }
    }, [models]);

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
            if (progress.status === 'error') setExpandedModels(prev => ({ ...prev, [progress.modelId]: true }));
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
                    <Visible visible={isLoadingModels}>
                        <LoadingRow />
                    </Visible>
                    <Visible visible={isErrorModels}>
                        <SectionError message="Available models couldn't be loaded." onRetry={refetchModels} />
                    </Visible>
                    {(models ?? []).map((model, index) => (
                        <React.Fragment key={model.id}>
                            <ModelItem
                                model={model}
                                isDownloading={!!downloads[model.id] && downloads[model.id]?.status === 'downloading'}
                                download={downloads[model.id]}
                                isExpanded={!!expandedModels[model.id]}
                                onToggleExpand={() => setExpandedModels(prev => ({ ...prev, [model.id]: !prev[model.id] }))}
                                status={downloads[model.id]?.status === 'downloading' ? `${downloads[model.id]?.progress}%` : model.isLoaded ? 'Loaded' : model.isCached ? 'Installed' : null}
                                downloadError={downloads[model.id]?.message}
                                actionError={modelErrors[model.id]}
                                onDelete={deleteModel}
                                onDownload={startDownload}
                            />
                            <Visible visible={index !== (models?.length ?? 0) - 1}>
                                <Divider inset={'row'} />
                            </Visible>
                        </React.Fragment>
                    ))}
                </SettingsSection>

                <SettingsSection title="GitHub Authentication" footer="Lazy Review needs access to your GitHub account to read repositories and post PR reviews.">
                    <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                            <Visible visible={!!userProfile?.avatar_url} fallback={<div className="h-10 w-10 rounded-full bg-accent animate-pulse" />}>
                                <img src={userProfile?.avatar_url} alt={userProfile?.login} className="h-10 w-10 rounded-full border border-border" />
                            </Visible>
                            <div className="flex flex-col">
                                <span className="text-[17px] font-medium tracking-[-0.41px] text-foreground">
                                    {userProfile?.name || userProfile?.login || 'Loading...'}
                                </span>
                                <span className="text-[15px] tracking-[-0.24px] text-muted-foreground">
                                    @{userProfile?.login}
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setLoginModalOpen(true)}
                                className="text-[15px] font-medium text-primary hover:text-primary/80 transition-colors"
                            >
                                Re-authenticate
                            </button>
                            <button
                                onClick={handleLogout}
                                className="text-[15px] font-medium text-destructive hover:text-destructive/80 transition-colors"
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                </SettingsSection>
                <GithubLoginModal
                    open={loginModalOpen}
                    onOpenChange={setLoginModalOpen}
                    onSuccess={() => refetchProfile()}
                />

                <SettingsSection title="Hardware" footer={<>CPU inference is the default and most stable option. Experimental GPU acceleration may behave differently depending on your hardware.</>}>
                    <HardwareSectionContent
                        useExperimentalGpu={useExperimentalGpu}
                        isUpdatingGpu={isUpdatingGpu}
                        toggleGpuSetting={toggleGpuSetting}
                        gpuError={gpuError}
                        hardware={hardware}
                    />
                    <Visible visible={isLoadingHardware}>
                        <LoadingRow />
                    </Visible>
                    <Visible visible={isErrorHardware}>
                        <SectionError message="Hardware information couldn't be loaded." onRetry={refetchHardware} />
                    </Visible>
                </SettingsSection>


                <SettingsSection title="Model Information" footer="The LLM and embedding models power code review and semantic search.">
                    <Visible visible={isLoadingModelInfo}>
                        <LoadingRow />
                    </Visible>
                    <Visible visible={isErrorModelInfo}>
                        <SectionError message="Model information couldn't be loaded." onRetry={refetchModelInfo} />
                    </Visible>
                    <Visible visible={!!modelInfo}>
                        <>
                            <InfoRow label="LLM Model" value={modelInfo?.llmModel?.name || 'Not loaded'} />
                            <Divider />
                            <InfoRow label="LLM Context Size" value={`${storage?.contextSizeLimit?.toLocaleString() || '128,000'} tokens`} />
                            <Divider />
                            <InfoRow label="LLM Storage" value={formatSize(modelInfo?.llmModel?.actualSize || 0)} />
                            <Divider />
                            <InfoRow label="Embedding Model" value={modelInfo?.embeddingModel?.name || 'Not loaded'} />
                            <Divider />
                            <InfoRow label="Embedding Storage" value={formatSize(modelInfo?.embeddingModel?.actualSize || 0)} />
                            <Divider />
                            <InfoRow label="Total Model Storage" value={formatSize(modelInfo?.totalModelSize || 0)} />
                        </>
                    </Visible>
                </SettingsSection>


            </div>
        </div>
    );
};
