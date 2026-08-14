import { Box, ChevronRight, Download, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import ExpandableContainer from '../../../components/common/ExpandableContainer';
import { Divider, LoadingRow } from './SettingsUI';

interface DownloadProgress {
  modelId: string;
  status: 'starting' | 'downloading' | 'success' | 'error';
  progress: number;
  message: string;
}

interface LocalModelsSectionProps {
  isLoading: boolean;
  isError: boolean;
  models: any[];
  downloads: Record<string, DownloadProgress>;
  onStartDownload: (modelId: string) => void;
  onDeleteModel: (modelId: string) => void;
  expandedModel: string | null;
  setExpandedModel: (id: string | null) => void;
}

export const LocalModelsSection = ({
  isLoading,
  isError,
  models,
  downloads,
  onStartDownload,
  onDeleteModel,
  expandedModel,
  setExpandedModel,
}: LocalModelsSectionProps) => {
  if (isLoading) return <LoadingRow />;
  if (isError) return <LoadingRow />;

  return (
    <div className="space-y-3">
      {(models ?? []).map((model, index) => (
        <div key={model.id} className="space-y-3">
          <button
            type="button"
            aria-expanded={expandedModel === model.id}
            onClick={() => setExpandedModel(expandedModel === model.id ? null : model.id)}
            className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-black/[0.035] active:bg-black/[0.07] dark:hover:bg-white/[0.04] dark:active:bg-white/[0.07]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${
                  model.id.toUpperCase().includes('QWEN') ? 'bg-blue-500' : 'bg-indigo-500'
                }`}
              >
                <Box className="h-[18px] w-[18px]" />
              </div>

              <div className="min-w-0">
                <div className="truncate text-[16px] leading-6">{model.name}</div>
                <div className="truncate text-[13px] leading-[18px] text-muted-foreground">
                  {model.isCached ? `${model.actualSize} MB` : `Requires ~${model.requiredRamGb} GB RAM`}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {downloads[model.id]?.status === 'downloading' && <Download className="h-4 w-4 animate-bounce text-blue-500" />}
              {downloads[model.id]?.status === 'downloading' && (
                <span className="text-[14px] tabular-nums text-muted-foreground">{downloads[model.id]?.progress}%</span>
              )}
              <ChevronRight
                className={`h-5 w-5 text-[#c7c7cc] transition-transform duration-200 dark:text-[#636366] ${expandedModel === model.id ? 'rotate-90' : ''}`}
              />
            </div>
          </button>

          {expandedModel === model.id && (
            <ExpandableContainer isExpanded={true}>
              <div className="border-t border-black/[0.06] bg-black/[0.018] px-4 py-4 pl-14 dark:border-white/[0.06] dark:bg-white/[0.018]">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-5 text-[13px]">
                    <span className="text-muted-foreground">Identifier</span>
                    <code className="break-all text-right text-foreground">{model.id}</code>
                  </div>

                  <div className="flex items-start justify-between gap-5 text-[13px]">
                    <span className="text-muted-foreground">Memory</span>
                    <span className="text-right text-foreground">
                      {model.requiredRamGb} GB required · {model.totalMemGb} GB available
                    </span>
                  </div>
                </div>

                {model.isCached && (
                  <div className="mt-5 flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteModel(model.id)}
                      className="h-9 rounded-full px-4 font-medium text-red-500 hover:bg-red-500/10"
                    >
                      <Trash2 className="mr-1.5 h-4 w-4" /> Delete Model
                    </Button>
                  </div>
                )}

                {!model.isCached && (
                  <div className="mt-5 flex justify-end">
                    <Button
                      size="sm"
                      disabled={!model.isCompatible || downloads[model.id]?.status === 'downloading'}
                      onClick={() => onStartDownload(model.id)}
                      className="h-9 rounded-full bg-blue-500 px-5 font-medium text-white shadow-none hover:bg-blue-600"
                    >
                      {downloads[model.id]?.status === 'downloading' ? 'Downloading...' : 'Download'}
                    </Button>
                  </div>
                )}
              </div>
            </ExpandableContainer>
          )}

          {index !== (models?.length ?? 0) - 1 && <Divider inset />}
        </div>
      ))}
    </div>
  );
};
