import { create } from "zustand";
import { ChromeLocalStorage } from "zustand-chrome-storage";
import { createJSONStorage, persist } from "zustand/middleware";

export const SETTING_STORAGE_KEY = "user-setting";

export const NEXT_CHECK_AT_STORAGE_KEY = "jira-next-check-at";
export const DEFAULT_JIRA_JQL =
  "resolution = Unresolved AND assignee in (currentUser()) ORDER BY updated DESC";

export enum NotificationType {
  None = 0,
  System = 2,
}

export interface ISettingData {
  isOpen: boolean;
  isAutoFocused: boolean;
  hasClickedTestNotify: boolean;
  notifyType: NotificationType;
  serverURL: string;
  interval: number;
  jiraJql: string;
}

export const useSettingStore = create<ISettingData>()(
  persist(
    (set, get) => ({
      isOpen: true,
      isAutoFocused: true,
      hasClickedTestNotify: false,
      notifyType: NotificationType.System,
      serverURL: "",
      interval: 180,
      jiraJql: DEFAULT_JIRA_JQL,
    }),
    {
      name: SETTING_STORAGE_KEY,
      storage: createJSONStorage(() => ChromeLocalStorage),
    },
  ),
);

export async function persistSettingPatch(patch: Partial<ISettingData>) {
  const nextState = {
    ...useSettingStore.getState(),
    ...patch,
  };

  useSettingStore.setState(patch);
  await browser.storage.local.set({
    [SETTING_STORAGE_KEY]: JSON.stringify({
      state: nextState,
      version: 0,
    }),
  });
}

if (browser) {
  browser.storage.local.onChanged.addListener((changes) => {
    if (changes[SETTING_STORAGE_KEY]) {
      useSettingStore.persist.rehydrate();
    }
  });
} else {
  window.addEventListener("storage", (event) => {
    if (event.key === SETTING_STORAGE_KEY && event.newValue) {
      useSettingStore.persist.rehydrate();
    }
  });
}
