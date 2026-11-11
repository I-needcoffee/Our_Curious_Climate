import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type TutorialUtciMode = 'categories' | 'comfortTime' | 'gradient';

export interface TutorialLiveSnapshot {
  aggregation?: 'hour' | 'day' | 'week' | 'month';
  colorVarId?: string;
  colorVarName?: string;
  utciColorMode?: TutorialUtciMode;
  includeSun?: boolean;
  includeWind?: boolean;
  /** Per-hour best of the four sun/wind exposure combos. */
  optimizeMode?: boolean;
  /** Ground surface for the radiant model. Null/absent keeps the simple sun boost. */
  utciGroundLabel?: string | null;
  utciGroundReflectance?: number;
  utciGroundEmissivity?: number;
  utciGroundEvaporates?: boolean;
  utciGroundIrrigation?: number;
  utciGroundThicknessM?: number;
  utciGroundVolumetricHeat?: number;
  utciGroundConductivity?: number;
  utciRadiantMode?: 'station' | 'reflectance' | 'surface';
  /** Guided comfort table: period row id to highlight on the UTCI heatmap/bars. */
  utciFocusPeriodId?: string | null;
  windRoseBins?: number;
  radiusVarId?: string;
  radiusVarName?: string;
  /** Natural ventilation chart: active temp/RH criteria for guided quick numbers. */
  nvCriteria?: {
    tempMinC: number;
    tempMaxC: number;
    maxRhPct: number;
  };
}

type Ctx = {
  enabled: boolean;
  snapshot: TutorialLiveSnapshot;
  report: (p: Partial<TutorialLiveSnapshot>) => void;
  /** Guided UTCI panel: apply exposure + timeframe focus on the chart card. */
  requestUtciSelection: (selection: {
    periodId: string;
    includeSun?: boolean;
    includeWind?: boolean;
    optimizeMode?: boolean;
  }) => void;
  /** Remove period highlight on the UTCI 12×24 heatmap (keeps sun/wind toggles). */
  clearUtciFocus: () => void;
  clear: () => void;
};

const TutorialLiveContext = createContext<Ctx | null>(null);

function snapshotPatchUnchanged(prev: TutorialLiveSnapshot, p: Partial<TutorialLiveSnapshot>): boolean {
  for (const key of Object.keys(p) as (keyof TutorialLiveSnapshot)[]) {
    if (prev[key] !== p[key]) return false;
  }
  return true;
}

export function TutorialLiveProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<TutorialLiveSnapshot>({});
  const clear = useCallback(() => setSnapshot({}), []);
  const report = useCallback(
    (p: Partial<TutorialLiveSnapshot>) => {
      if (!enabled) return;
      setSnapshot(prev => {
        if (snapshotPatchUnchanged(prev, p)) return prev;
        return { ...prev, ...p };
      });
    },
    [enabled]
  );
  const requestUtciSelection = useCallback(
    (selection: {
      periodId: string;
      includeSun?: boolean;
      includeWind?: boolean;
      optimizeMode?: boolean;
    }) => {
      if (!enabled) return;
      setSnapshot(prev => {
        const nextOptimize = selection.optimizeMode ?? false;
        const nextSun = selection.includeSun ?? prev.includeSun;
        const nextWind = selection.includeWind ?? prev.includeWind;
        if (
          prev.optimizeMode === nextOptimize &&
          prev.includeSun === nextSun &&
          prev.includeWind === nextWind &&
          prev.utciFocusPeriodId === selection.periodId
        ) {
          return prev;
        }
        return {
          ...prev,
          optimizeMode: nextOptimize,
          includeSun: nextSun,
          includeWind: nextWind,
          utciFocusPeriodId: selection.periodId,
        };
      });
    },
    [enabled]
  );
  const clearUtciFocus = useCallback(() => {
    if (!enabled) return;
    setSnapshot(prev => {
      if (prev.utciFocusPeriodId == null) return prev;
      return { ...prev, utciFocusPeriodId: null };
    });
  }, [enabled]);
  useEffect(() => {
    if (!enabled) clear();
  }, [enabled, clear]);
  const value = useMemo(
    () => ({ enabled, snapshot, report, requestUtciSelection, clearUtciFocus, clear }),
    [enabled, snapshot, report, requestUtciSelection, clearUtciFocus, clear]
  );
  return <TutorialLiveContext.Provider value={value}>{children}</TutorialLiveContext.Provider>;
}

export function useTutorialLive(): Ctx {
  const v = useContext(TutorialLiveContext);
  if (!v) throw new Error('useTutorialLive must be used within TutorialLiveProvider');
  return v;
}

export function useTutorialLiveOptional(): Ctx | null {
  return useContext(TutorialLiveContext);
}
