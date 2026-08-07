import { useRef, useCallback } from 'react';

interface UseOptimisticLockOptions {
  onConflict: () => void;
}

export function useOptimisticLock({ onConflict }: UseOptimisticLockOptions) {
  const versionCache = useRef<Map<string, number>>(new Map());

  const getVersion = useCallback((resourceId: string) => {
    return versionCache.current.get(resourceId);
  }, []);

  const setVersion = useCallback((resourceId: string, version: number) => {
    versionCache.current.set(resourceId, version);
  }, []);

  const handleSuccess = useCallback((resourceId: string, newVersion: number) => {
    setVersion(resourceId, newVersion);
  }, [setVersion]);

  const handleConflictResponse = useCallback(() => {
    onConflict();
  }, [onConflict]);

  return { getVersion, handleSuccess, handleConflictResponse };
}
