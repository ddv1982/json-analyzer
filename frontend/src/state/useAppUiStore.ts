import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type AppView = 'json-analyzer' | 'curl-executor'
export type ResultTab = 'statistics' | 'values' | 'duplicates'

interface AppUiState {
  activeView: AppView
  activeResultsTab: ResultTab
  setActiveView: (view: AppView) => void
  setActiveResultsTab: (tab: ResultTab) => void
  resetResultsNavigation: () => void
}

const initialState = {
  activeView: 'json-analyzer' as AppView,
  activeResultsTab: 'statistics' as ResultTab,
}

export const useAppUiStore = create<AppUiState>()(
  persist(
    (set) => ({
      ...initialState,
      setActiveView: (activeView) => set({ activeView }),
      setActiveResultsTab: (activeResultsTab) => set({ activeResultsTab }),
      resetResultsNavigation: () => set({ activeResultsTab: initialState.activeResultsTab }),
    }),
    {
      name: 'json-analyzer.ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ activeView: state.activeView }),
    },
  ),
)

export function resetAppUiStoreForTests() {
  useAppUiStore.setState({
    ...initialState,
    setActiveView: useAppUiStore.getState().setActiveView,
    setActiveResultsTab: useAppUiStore.getState().setActiveResultsTab,
    resetResultsNavigation: useAppUiStore.getState().resetResultsNavigation,
  })
}
