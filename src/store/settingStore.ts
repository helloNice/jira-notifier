import { create } from "zustand";
import { ChromeLocalStorage } from "zustand-chrome-storage";
import { createJSONStorage, persist } from "zustand/middleware";

const STORAGE_KEY = "user-setting";

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
  notifyType: NotificationType;
  serverURL: string;
  interval: number;
  jiraJql: string;
}

export const useSettingStore = create<ISettingData>()(
  persist(
    (set, get) => ({
      isOpen: true,
      isAutoFocused: false,
      notifyType: NotificationType.System,
      serverURL: "",
      interval: 180,
      jiraJql: DEFAULT_JIRA_JQL,
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => ChromeLocalStorage),
    },
  ),
);

if (browser) {
  browser.storage.local.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEY]) {
      useSettingStore.persist.rehydrate();
    }
  });
} else {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      useSettingStore.persist.rehydrate();
    }
  });
}
