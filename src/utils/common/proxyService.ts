import { useJiraStore } from "@/src/store/jiraStore";
import { useSettingStore } from "@/src/store/settingStore";
import { defineProxyService } from "@webext-core/proxy-service";
import { jiraHelper } from "./jiraClient";

class BackgroundService {
  async refreshUserInfo() {
    if (!jiraHelper.checkLogin()) await jiraHelper.refreshUserInfo();
  }

  getJiraStore() {
    return useJiraStore.getState();
  }

  getSettingStore() {
    return useSettingStore.getState();
  }

  async showToast(title: string, description: string) {
    console.warn("[jira-notifier] page toast is disabled", {
      description,
      title,
    });
  }
}

export const [registerBackgroundService, getBackgroundService] =
  defineProxyService("BackgroundService", () => new BackgroundService());
