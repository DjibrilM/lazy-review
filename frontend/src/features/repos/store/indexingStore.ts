import { atom } from 'jotai';

export type IndexingStatus = 'running' | 'success' | 'error' | 'cancelled';

export interface IndexingProgressEvent {
  projectId?: string | number;
  status: IndexingStatus;
  message?: string;
  isStreamChunk?: boolean;
  facts?: unknown;
}

export interface IndexingState {
  isReindexing: boolean;
  indexingError: string | null;
  indexingLog: string[];
  indexingThinking: string;
  indexingDuration: number;
}

export type GlobalIndexingState = Record<string, IndexingState>;

export const defaultIndexingState: IndexingState = {
  isReindexing: false,
  indexingError: null,
  indexingLog: [],
  indexingThinking: '',
  indexingDuration: 0,
};

export const globalIndexingAtom = atom<GlobalIndexingState>({});
