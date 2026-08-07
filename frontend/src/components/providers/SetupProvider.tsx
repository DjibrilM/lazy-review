import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import http from '../../lib/util/http';
import { useSocketEffect } from '../../lib/hooks/useSocketEffect';
import { QWEN_MODEL_ID, GTE_MODEL_ID } from '../../../../src/constants';

interface SetupContextState {
  isSetupComplete: boolean;
  loading: boolean;
}

const SetupContext = createContext<SetupContextState>({
  isSetupComplete: true,
  loading: true,
});

export const SetupProvider = ({ children }: { children: ReactNode }) => {
  const [isSetupComplete, setIsSetupComplete] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);

  const checkSetup = async () => {
    try {
      const res = await http.get<{ data: any[] }>('/qvac/models');
      const models = res.data.data || [];
      const qwenModel = models.find((m) => m.id === QWEN_MODEL_ID);
      const gteModel = models.find((m) => m.id === GTE_MODEL_ID);

      const isComplete = Boolean(qwenModel?.isCached && gteModel?.isCached);
      setIsSetupComplete(isComplete);
    } catch (err) {
      console.error('Failed to fetch models for setup check:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkSetup();
  }, []);

  useSocketEffect({
    onModelProgress: (data: any) => {
      if (data.status === 'success' || data.status === 'error') {
        checkSetup(); // Re-check when a download finishes
      }
    },
  });

  return (
    <SetupContext.Provider value={{ isSetupComplete, loading }}>
      {children}
    </SetupContext.Provider>
  );
};

export const useSetup = () => useContext(SetupContext);
