import { useEffect, type ReactNode } from 'react';
import { atom, useAtomValue, useSetAtom } from 'jotai';
import { useSocketEffect } from '../../lib/hooks/useSocketEffect';
import { LLM_MODEL_ID, EMBEDDING_MODEL_ID } from '../../../../src/constants';
import { qvacService } from '@/services/qvac.service';

const setupStateAtom = atom({ isSetupComplete: true, loading: true });

export const useSetup = () => useAtomValue(setupStateAtom);

export const SetupProvider = ({ children }: { children: ReactNode }) => {
  const setSetupState = useSetAtom(setupStateAtom);

  const checkSetup = async () => {
    try {
      const models = await qvacService.getModels();
      const gemmaModel = models.find((m: any) => m.id === LLM_MODEL_ID);
      const gteModel = models.find((m: any) => m.id === EMBEDDING_MODEL_ID);

      const isComplete = Boolean(gemmaModel?.isCached && gteModel?.isCached);
      setSetupState({ isSetupComplete: isComplete, loading: false });
    } catch (err) {
      console.error('Failed to fetch models for setup check:', err);
      setSetupState((prev) => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    checkSetup();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useSocketEffect({
    onModelProgress: (data: any) => {
      if (data.status === 'success' || data.status === 'error') {
        checkSetup(); // Re-check when a download finishes
      }
    },
  });

  return <>{children}</>;
};
