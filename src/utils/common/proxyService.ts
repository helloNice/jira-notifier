import { useJiraStore } from "@/src/store/jiraStore";
import { useSettingStore } from "@/src/store/settingStore";
import { defineProxyService } from "@webext-core/proxy-service";
import { jiraHelper } from "./jiraClient";
import { sendMessage } from "./messageService";

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
    const tabs = await browser.tabs.query({});

    // 向内容脚本发送消息
    tabs.forEach((tab) => {
      if (tab.id) {
        sendMessage("showToast", { title, description }, tab.id);
      }
    });
  }
}

export const [registerBackgroundService, getBackgroundService] =
  defineProxyService("BackgroundService", () => new BackgroundService());
