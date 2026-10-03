import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";

export type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function useAsyncData<T>(loader: () => Promise<T>, dependencies: DependencyList = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stateDependencies, setStateDependencies] = useState<DependencyList>(() => [...dependencies]);
  const requestVersion = useRef(0);
  const reload = useCallback(async () => {
    const version = ++requestVersion.current;
    setStateDependencies([...dependencies]);
    setData(null);
    setLoading(true);
    setError(null);
    try {
      const result = await loader();
      if (version === requestVersion.current) setData(result);
    } catch (reason) {
      if (version === requestVersion.current) setError(reason instanceof Error ? reason.message : "加载失败，请稍后重试");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, dependencies);

  useEffect(() => {
    void reload();
    return () => { requestVersion.current += 1; };
  }, [reload]);

  const current = dependencies.length === stateDependencies.length && dependencies.every((value, index) => Object.is(value, stateDependencies[index]));
  return { data: current ? data : null, loading: current ? loading : true, error: current ? error : null, reload };
}
