import { HardDrive } from 'lucide-react';
import { Divider, InfoRow } from './index';

interface StorageSectionContentProps {
  storage: {
    storageUsedGb: number;
    storageTotalGb: number;
    contextSizeLimit: number;
    totalModelSize: number;
    sqliteDbSize: number;
    applicationStorageBytes: number;
  } | undefined;
  modelInfo?: {
    llmModel?: { actualSize: number };
    embeddingModel?: { actualSize: number };
  };
  formatSize: (bytes: number) => string;
}

export const StorageSectionContent = ({
  storage,
  modelInfo,
  formatSize,
}: StorageSectionContentProps) => {
  if (!storage) return null;

  const storagePercentage = Math.min(100, Math.max(0, (storage.storageUsedGb / storage.storageTotalGb) * 100));

  return (
    <>
      <div className="px-4 py-3.5">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500 text-white">
            <HardDrive className="h-[18px] w-[18px]" />
          </div>

          <div className="flex flex-1 items-center justify-between gap-4">
            <span className="text-[16px]">Storage</span>

            <span className="text-[15px] tabular-nums text-muted-foreground">
              {storage.storageUsedGb} GB of{' '}
              {storage.storageTotalGb} GB
            </span>
          </div>
        </div>

        <div className="ml-11">
          <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/[0.1]">
            <div
              className="h-full rounded-full bg-blue-500 transition-[width] duration-300"
              style={{ width: `${storagePercentage}%` }}
            />
          </div>

          <div className="mt-1.5 text-[12px] tabular-nums text-muted-foreground">
            {storagePercentage.toFixed(1)}% used
          </div>
        </div>
      </div>

      <Divider inset={'row'} />
      <InfoRow label="Context Limit" value={`${storage.contextSizeLimit.toLocaleString()} tokens`} />
      <Divider />
      <InfoRow label="Application Storage" value={formatSize(storage.applicationStorageBytes)} />
      <Divider />

      <div className="px-4 py-2.5">
        <div className="text-[13px] text-muted-foreground">Breakdown:</div>
      </div>

      <InfoRow label="LLM Model" value={formatSize(modelInfo?.llmModel?.actualSize || 0)} />
      <Divider />
      <InfoRow label="Embedding Model" value={formatSize(modelInfo?.embeddingModel?.actualSize || 0)} />
      <Divider />
      <InfoRow label="SQLite Database" value={formatSize(storage.sqliteDbSize)} />
    </>
  );
};
