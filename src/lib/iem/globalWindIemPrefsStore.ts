import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { CompareWindIemSharedControls, WindFileSource } from './windIemPrefsShared';
import type { IemWindStationSelection } from './windStationTypes';

function defaultReferenceYear(): number {
  const y = new Date().getFullYear();
  return Math.max(1980, y - 1);
}

interface GlobalWindIemPrefs {
  source: WindFileSource;
  iemYearStart: number;
  iemYearEnd: number;
  iemStation: IemWindStationSelection | null;
  setupModalOpen: boolean;
  setupModalRevertOnCancel: boolean;
  stationPickerOpen: boolean;
  stationPickerRevertOnCancel: boolean;
}

let state: GlobalWindIemPrefs = {
  source: 'epw',
  iemYearStart: defaultReferenceYear(),
  iemYearEnd: defaultReferenceYear(),
  iemStation: null,
  setupModalOpen: false,
  setupModalRevertOnCancel: false,
  stationPickerOpen: false,
  stationPickerRevertOnCancel: false,
};

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeWindIemGlobalPrefs(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getWindIemGlobalPrefsSnapshot(): GlobalWindIemPrefs {
  return state;
}

function clampYear(y: number): boolean {
  const cap = new Date().getFullYear();
  return Number.isFinite(y) && y >= 1980 && y <= cap;
}

function stationsEqual(a: IemWindStationSelection | null, b: IemWindStationSelection | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && a.network === b.network && a.stationId === b.stationId;
}

export function setWindIemGlobalPrefs(patch: Partial<GlobalWindIemPrefs>): void {
  let next: GlobalWindIemPrefs = { ...state, ...patch };

  if (patch.iemYearStart !== undefined && !clampYear(patch.iemYearStart)) return;
  if (patch.iemYearEnd !== undefined && !clampYear(patch.iemYearEnd)) return;

  if (next.iemYearStart > next.iemYearEnd) {
    const t = next.iemYearStart;
    next = { ...next, iemYearStart: next.iemYearEnd, iemYearEnd: t };
  }

  if (
    next.source === state.source &&
    next.iemYearStart === state.iemYearStart &&
    next.iemYearEnd === state.iemYearEnd &&
    stationsEqual(next.iemStation, state.iemStation) &&
    next.setupModalOpen === state.setupModalOpen &&
    next.setupModalRevertOnCancel === state.setupModalRevertOnCancel &&
    next.stationPickerOpen === state.stationPickerOpen &&
    next.stationPickerRevertOnCancel === state.stationPickerRevertOnCancel
  ) {
    return;
  }

  state = next;
  emit();
}

export function openIemSetupModal(revertOnCancel: boolean): void {
  setWindIemGlobalPrefs({ setupModalOpen: true, setupModalRevertOnCancel: revertOnCancel });
}

export function closeIemSetupModal(): void {
  setWindIemGlobalPrefs({ setupModalOpen: false, setupModalRevertOnCancel: false });
}

export function openWindStationPicker(revertOnCancel: boolean): void {
  setWindIemGlobalPrefs({ stationPickerOpen: true, stationPickerRevertOnCancel: revertOnCancel });
}

export function closeWindStationPicker(): void {
  setWindIemGlobalPrefs({ stationPickerOpen: false, stationPickerRevertOnCancel: false });
}

/** Single-mode dashboard: keep wind source + IEM years in sync across Wind Explorer and Wind Rose. */
export function useWindIemGlobalPrefs(): CompareWindIemSharedControls & {
  setupModalOpen: boolean;
  setupModalRevertOnCancel: boolean;
  stationPickerOpen: boolean;
  stationPickerRevertOnCancel: boolean;
  openIemSetupModal: (revertOnCancel: boolean) => void;
  closeIemSetupModal: () => void;
  openWindStationPicker: (revertOnCancel: boolean) => void;
  closeWindStationPicker: () => void;
} {
  const snap = useSyncExternalStore(subscribeWindIemGlobalPrefs, getWindIemGlobalPrefsSnapshot, getWindIemGlobalPrefsSnapshot);

  const setSource = useCallback((v: WindFileSource) => {
    if (v === 'epw') {
      setWindIemGlobalPrefs({ source: v, iemStation: null });
    } else {
      setWindIemGlobalPrefs({ source: v });
    }
  }, []);

  const setIemYearRange = useCallback((start: number, end: number) => {
    if (!clampYear(start) || !clampYear(end)) return;
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    setWindIemGlobalPrefs({ iemYearStart: lo, iemYearEnd: hi });
  }, []);

  const setIemStation = useCallback((station: IemWindStationSelection | null) => {
    setWindIemGlobalPrefs({ iemStation: station });
  }, []);

  const openModal = useCallback((revertOnCancel: boolean) => {
    openIemSetupModal(revertOnCancel);
  }, []);

  const closeModal = useCallback(() => {
    closeIemSetupModal();
  }, []);

  const openPicker = useCallback((revertOnCancel: boolean) => {
    openWindStationPicker(revertOnCancel);
  }, []);

  const closePicker = useCallback(() => {
    closeWindStationPicker();
  }, []);

  return useMemo(
    () => ({
      source: snap.source,
      iemYearStart: snap.iemYearStart,
      iemYearEnd: snap.iemYearEnd,
      setSource,
      setIemYearRange,
      iemStation: snap.iemStation,
      setIemStation,
      setupModalOpen: snap.setupModalOpen,
      setupModalRevertOnCancel: snap.setupModalRevertOnCancel,
      stationPickerOpen: snap.stationPickerOpen,
      stationPickerRevertOnCancel: snap.stationPickerRevertOnCancel,
      openIemSetupModal: openModal,
      closeIemSetupModal: closeModal,
      openWindStationPicker: openPicker,
      closeWindStationPicker: closePicker,
    }),
    [snap, setSource, setIemYearRange, setIemStation, openModal, closeModal, openPicker, closePicker]
  );
}
