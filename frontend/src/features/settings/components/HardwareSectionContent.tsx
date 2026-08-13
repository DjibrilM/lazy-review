import { AlertTriangle, FlaskRound, Loader2 } from 'lucide-react';
import { Divider, InfoRow } from './index';

interface HardwareSectionContentProps {
  useExperimentalGpu: boolean;
  isUpdatingGpu: boolean;
  toggleGpuSetting: (checked: boolean) => void;
  gpuError: string | null;
  hardware:
    | {
        cpuCores: number;
        totalRamGb: number;
        availableRamGb: number;
        gpuRamGb: number;
      }
    | undefined;
}

export const HardwareSectionContent = ({
  useExperimentalGpu,
  isUpdatingGpu,
  toggleGpuSetting,
  gpuError,
  hardware,
}: HardwareSectionContentProps) => {
  return (
    <>
      <div className="flex min-h-[64px] items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] bg-orange-500 text-white">
            <FlaskRound className="h-[17px] w-[17px]" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-normal leading-5 text-foreground">
                GPU Inference
              </span>

              <span className="text-[11px] leading-4 text-orange-500">
                Experimental
              </span>
            </div>

            <p className="mt-0.5 max-w-xl text-[12px] leading-[16px] text-muted-foreground">
              Accelerate supported models using your GPU.
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={useExperimentalGpu}
          aria-label="Enable GPU inference"
          disabled={isUpdatingGpu}
          onClick={() => toggleGpuSetting(!useExperimentalGpu)}
          className={[
            'relative h-[31px] w-[51px] shrink-0 rounded-full',
            'transition-colors duration-200 ease-out',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:opacity-50',
            useExperimentalGpu
              ? 'bg-[#34C759]'
              : 'bg-black/15 dark:bg-white/20',
          ].join(' ')}
        >
          <span
            className={[
              'absolute top-[2px] flex h-[27px] w-[27px] items-center justify-center',
              'rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)]',
              'transition-transform duration-200 ease-out',
              useExperimentalGpu
                ? 'translate-x-[22px]'
                : 'translate-x-[2px]',
            ].join(' ')}
          >
            {isUpdatingGpu && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-black/40" />
            )}
          </span>
        </button>
      </div>

      {gpuError && (
        <>
          <Divider inset={'row'} />

          <div className="flex gap-2 px-4 py-2.5 pl-[58px]">
            <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0 text-red-500" />

            <p className="text-[12px] leading-[16px] text-red-500">
              {gpuError}
            </p>
          </div>
        </>
      )}

      <Divider />

      {hardware ? (
        <>
          <InfoRow label="CPU Cores" value={hardware.cpuCores} />
          <Divider inset={'row'} />

          <InfoRow
            label="Memory"
            value={`${hardware.totalRamGb} GB`}
          />
          <Divider inset={'row'} />

          <InfoRow
            label="Available"
            value={`${hardware.availableRamGb} GB`}
          />
          <Divider inset={'row'} />

          <InfoRow
            label="GPU Memory"
            value={`${hardware.gpuRamGb} GB`}
          />
        </>
      ) : (
        <div className="px-4 py-3 text-[13px] text-muted-foreground">
          Hardware information unavailable
        </div>
      )}
    </>
  );
};