import { useJiraStore } from "@/src/store/jiraStore";
import {
  NEXT_CHECK_AT_STORAGE_KEY,
  useSettingStore,
} from "@/src/store/settingStore";
import {
  handleNotificationClick,
  jiraHelper,
} from "@/src/utils/common/jiraClient";
import { registerBackgroundService } from "@/src/utils/common/proxyService";

const JIRA_CHECK_ALARM_NAME = "jira-notifier-check";
const LOG_PREFIX = "[jira-notifier][debug]";

async function hydrateStores() {
  await Promise.all([
    useJiraStore.persist.rehydrate(),
    useSettingStore.persist.rehydrate(),
  ]);
}

async function taskRun() {
  try {
    const settingState = useSettingStore.getState();
    const jiraState = useJiraStore.getState();
    console.log(`${LOG_PREFIX} taskRun:start`, {
      hasCheckedIssueBaseline: jiraState.hasCheckedIssueBaseline,
      isOpen: settingState.isOpen,
      lastCheckedIssueKeys: jiraState.lastCheckedIssueKeys,
      notifyType: settingState.notifyType,
      previousCount: jiraState.count,
    });

    await jiraHelper.refreshUserInfo();

    if (!jiraHelper.checkLogin()) {
      console.log(`${LOG_PREFIX} taskRun:skip-not-login`);
      await jiraHelper.gotoLogin();
      return;
    }

    await jiraHelper.getAllUnresolvedIssues({ shouldNotify: true });
    console.log(`${LOG_PREFIX} taskRun:done`, {
      count: useJiraStore.getState().count,
      lastCheckAddedIssueKeys: useJiraStore.getState().lastCheckAddedIssueKeys,
      lastNotificationIssueKeys:
        useJiraStore.getState().lastNotificationIssueKeys,
    });
  } catch (error) {
    useJiraStore.setState({
      lastCheckAt: Date.now(),
      lastCheckError: error instanceof Error ? error.message : String(error),
    });
    console.error("[jira-notifier] task error:", error);
  }
}

async function setJob() {
  try {
    await hydrateStores();
    const settingState = useSettingStore.getState();
    const jiraState = useJiraStore.getState();
    console.log(`${LOG_PREFIX} hydrate:done`, {
      count: jiraState.count,
      hasCheckedIssueBaseline: jiraState.hasCheckedIssueBaseline,
      interval: settingState.interval,
      isOpen: settingState.isOpen,
      lastCheckedIssueKeys: jiraState.lastCheckedIssueKeys,
      notifyType: settingState.notifyType,
    });
  } catch (error) {
    console.error("[jira-notifier] hydrate store failed:", error);
  }

  const saveNextCheckAt = (interval: number) => {
    browser.storage.local.set({
      [NEXT_CHECK_AT_STORAGE_KEY]: Date.now() + interval * 1000,
    });
  };

  const clear = () => {
    console.log(`${LOG_PREFIX} alarm:clear`);
    browser.alarms.clear(JIRA_CHECK_ALARM_NAME);
    browser.storage.local.remove(NEXT_CHECK_AT_STORAGE_KEY);
  };

  const start = (interval: number) => {
    clear();
    if (interval <= 0) return;

    const periodInMinutes = interval / 60;
    browser.alarms.create(JIRA_CHECK_ALARM_NAME, {
      delayInMinutes: periodInMinutes,
      periodInMinutes,
    });
    saveNextCheckAt(interval);
    console.log(`${LOG_PREFIX} alarm:start`, {
      interval,
      periodInMinutes,
    });
  };

  const resetJobFromSettings = () => {
    const { isOpen, interval } = useSettingStore.getState();
    if (!isOpen) {
      clear();
      return;
    }
    start(interval);
  };

  resetJobFromSettings();
  if (useSettingStore.getState().isOpen) taskRun();

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== JIRA_CHECK_ALARM_NAME) return;
    console.log(`${LOG_PREFIX} alarm:fire`, { name: alarm.name });

    const { isOpen, interval } = useSettingStore.getState();
    if (!isOpen) {
      clear();
      return;
    }

    saveNextCheckAt(interval);
    taskRun();
  });

  useSettingStore.subscribe(resetJobFromSettings);
}

function initBackground() {
  console.log("[jira-notifier] background initialized");

  registerBackgroundService();

  browser.notifications.onClicked.addListener(handleNotificationClick);
  browser.notifications.onButtonClicked.addListener((notifId) => {
    handleNotificationClick(notifId);
  });
}

export default defineBackground({
  type: "module",
  main() {
    initBackground();
    void setJob();
  },
});
