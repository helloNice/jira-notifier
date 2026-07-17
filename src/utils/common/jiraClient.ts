import { i18n } from "#imports";
import { useJiraStore } from "@/src/store/jiraStore";
import {
  DEFAULT_JIRA_JQL,
  NotificationType,
  useSettingStore,
} from "@/src/store/settingStore";
import { hasHostPermission, normalizeJiraServerURL } from "./hostPermission";
import { orderItemsByKeys } from "./projectOrder";
import { Version2Client, Version2Models } from "jira.js";

const LOG_PREFIX = "[jira-notifier][debug]";

function getIssueKeys(issues: Version2Models.Issue[]) {
  return issues.map((issue) => issue.key);
}

export enum JIRAStatus {
  None = "1",
  Start = "3",
  Reopen = "4",
  Investigating = "5",
}

// #region 类型定义
export interface IProjectData {
  count: number;
  issues: Version2Models.Issue[];
  key: string;
  name: string;
  url: string;
}

interface IRefreshOptions {
  /** 是否对本轮新发现的任务发送系统通知 */
  shouldNotify?: boolean;
  /** 用当前 Jira 列表重建后台通知基线，但不发送通知 */
  resetNotificationBaseline?: boolean;
}

// #endregion

// #region 初始化JiraClient
let cachedJiraClient: Version2Client | null = null;
let cachedJiraHost = "";

function normalizeServerURL(serverURL?: string) {
  const trimmedServerURL = (serverURL ?? "").trim();
  if (!trimmedServerURL) return "";

  return normalizeJiraServerURL(trimmedServerURL);
}

function getServerURL() {
  return normalizeServerURL(useSettingStore.getState().serverURL);
}

function createJiraClient(host: string) {
  const client = new Version2Client({ host });

  client.handleFailedResponse = (response) => {
    const failedResponse = response as { code?: string; status?: number };

    if (failedResponse.code === "ERR_NETWORK")
      useJiraStore.setState({ isOffLine: true });

    if (failedResponse.status === 429) throw response;

    console.log("handleFailedResponse", response);
  };

  client.handleSuccessResponse = (response) => {
    useJiraStore.setState({ isOffLine: false });
    return response;
  };

  return client;
}

function getJiraClient() {
  const host = getServerURL();
  if (!host) return null;

  if (!cachedJiraClient || cachedJiraHost !== host) {
    cachedJiraHost = host;
    cachedJiraClient = createJiraClient(host);
    console.log(`${LOG_PREFIX} jiraClient:created`, { host });
  }

  return cachedJiraClient;
}

async function ensureJiraHostPermission() {
  const serverURL = getServerURL();
  if (!serverURL) return;

  const allowed = await hasHostPermission(serverURL);
  if (!allowed) {
    throw new Error(i18n.t("jiraHostPermissionMissing"));
  }
}

// #endregion

// #region 初始化JiraHelper
class JiraHelper {
  public async gotoLogin() {
    const isOffLine = useJiraStore.getState().isOffLine;
    if (isOffLine) return;

    const serverURL = getServerURL();
    if (!serverURL) {
      console.warn("[jira-notifier] Jira server URL is not configured");
      return;
    }

    const url = `${serverURL}/*`;
    const tabs = await browser.tabs.query({ url });

    if (tabs.length > 0) {
      browser.tabs.update(tabs[0].id!, { active: true });
    } else {
      browser.tabs.create({
        url: serverURL,
      });
    }
  }

  public checkLogin() {
    return useJiraStore.getState().isLogin;
  }

  public async refreshUserInfo() {
    await ensureJiraHostPermission();
    const jiraClient = getJiraClient();
    if (!jiraClient) {
      useJiraStore.setState({
        isLogin: false,
        userInfo: null,
        count: 0,
      });
      return;
    }

    const userInfo = await jiraClient.myself.getCurrentUser();

    if (userInfo) {
      useJiraStore.setState({
        isLogin: true,
        userInfo,
      });
    } else {
      useJiraStore.setState({
        isLogin: false,
        userInfo: null,
        count: 0,
      });
    }
  }

  public async getAllUnresolvedIssues(options: IRefreshOptions = {}) {
    const { shouldNotify = false } = options;

    console.log(`${LOG_PREFIX} getAllUnresolvedIssues:start`, {
      hasCheckedIssueBaseline:
        useJiraStore.getState().hasCheckedIssueBaseline,
      lastCheckedIssueKeys: useJiraStore.getState().lastCheckedIssueKeys,
      resetNotificationBaseline: options.resetNotificationBaseline === true,
      serverURL: getServerURL(),
      shouldNotify,
    });

    await ensureJiraHostPermission();
    const jiraClient = getJiraClient();
    if (!jiraClient) {
      useJiraStore.setState({
        count: 0,
        isLogin: false,
        lastCheckAt: shouldNotify
          ? Date.now()
          : useJiraStore.getState().lastCheckAt,
        lastCheckError: shouldNotify
          ? "Jira server URL is not configured"
          : useJiraStore.getState().lastCheckError,
        projectInfoList: [],
        userInfo: null,
      });
      return;
    }

    const issuesList: Version2Models.Issue[] = [];
    const maxResults = 100;
    let startAt = 0;
    const jiraJql =
      useSettingStore.getState().jiraJql?.trim() || DEFAULT_JIRA_JQL;

    while (true) {
      const respondList = await jiraClient.issueSearch.searchForIssuesUsingJql({
        jql: jiraJql,
        fields: [
          "summary",
          "status",
          "priority",
          "created",
          "updated",
          "project",
        ],
        maxResults,
        startAt,
      });

      const pageIssues = respondList?.issues ?? [];
      issuesList.push(...pageIssues);

      const total = respondList?.total ?? issuesList.length;
      if (pageIssues.length === 0 || issuesList.length >= total) break;

      startAt += pageIssues.length;
    }

    if (issuesList.length === 0) {
      console.log(`${LOG_PREFIX} getAllUnresolvedIssues:empty`, {
        shouldNotify,
      });
      this.processList([], [], options);
      return;
    }

    console.log(`${LOG_PREFIX} getAllUnresolvedIssues:fetched`, {
      issueCount: issuesList.length,
      issueKeys: getIssueKeys(issuesList),
      shouldNotify,
    });

    const projectIssues = new Map<string, Version2Models.Issue[]>();
    const projectList = new Map<string, Version2Models.Project>();
    issuesList.forEach((issue) => {
      const project = issue.fields.project as Version2Models.Project;
      if (!project.key) return;

      if (!projectList.has(project.key)) {
        projectList.set(project.key, project);
      }

      if (!projectIssues.has(project.key)) {
        projectIssues.set(project.key, [issue]);
      } else {
        projectIssues.get(project.key)!.push(issue);
      }
    });

    console.log(`${LOG_PREFIX} getAllUnresolvedIssues:projects`, {
      projectKeys: Array.from(projectList.keys()),
      projectIssueCounts: Array.from(projectIssues.entries()).map(
        ([key, issues]) => ({ count: issues.length, key }),
      ),
    });

    const projectInfoList = [];
    for (const [key, value] of projectList) {
      const info = {
        count: projectIssues.get(key)!.length,
        key,
        name: value.name!,
        url: value.self!,
        issues: projectIssues.get(key)!,
      };

      projectInfoList.push(info);
    }

    this.processList(projectInfoList, issuesList, options);
  }

  public async setIssuesStatus(issueKey: string, status: JIRAStatus) {
    try {
      await ensureJiraHostPermission();
      const jiraClient = getJiraClient();
      if (!jiraClient) throw new Error("Jira server URL is not configured");

      const response = await jiraClient.issues.doTransition({
        issueIdOrKey: issueKey,
        transition: {
          id: status,
        },
      });
      console.log("Issue transitioned successfully:", response);
      return response;
    } catch (error) {
      console.error("Error transitioning issue:", error);
      throw error;
    }
  }

  public processList(
    projectInfoList: IProjectData[],
    issuesList?: Version2Models.Issue[],
    options: IRefreshOptions = {},
  ) {
    const { shouldNotify = false } = options;
    const {
      hasCheckedIssueBaseline: prevHasCheckedIssueBaseline,
      hasIssueSnapshot: prevHasIssueSnapshot,
      ignoreList: prevIgnoreList,
      lastCheckedIssueKeys: prevLastCheckedIssueKeys,
      noticedList: prevNoticeList,
      projectOrderKeys,
      projectInfoList: prevProjectInfoList,
    } = useJiraStore.getState();
    const needNoticeList = new Array<Version2Models.Issue>();

    let ignoreList = prevIgnoreList;
    let hasIssueSnapshot = prevHasIssueSnapshot;
    let hasCheckedIssueBaseline = prevHasCheckedIssueBaseline;
    let lastCheckedIssueKeys = prevLastCheckedIssueKeys;
    let noticedList = prevNoticeList;
    // 如果是从 Jira 重新拉取到的完整未解决列表，则同步清理历史记录：
    // - 已解决/已关闭而不在未解决列表里的任务，从 noticedList 移除
    // - 之后若这些任务被重新打开、再次进入未解决列表，后台轮询会重新通知
    // - ignoreList 是旧版隐藏记录，只做兼容清理，不再决定列表展示
    if (issuesList) {
      hasIssueSnapshot = true;
      const unresolvedIssueKeys = new Set(issuesList.map((issue) => issue.key));
      ignoreList = prevIgnoreList.filter((ignore) =>
        unresolvedIssueKeys.has(ignore),
      );
      noticedList = prevNoticeList.filter((notice) =>
        unresolvedIssueKeys.has(notice),
      );
      lastCheckedIssueKeys = prevLastCheckedIssueKeys.filter((issueKey) =>
        unresolvedIssueKeys.has(issueKey),
      );
    }

    // 列表展示仍尊重隐藏记录；通知基线使用完整 Jira 列表，避免隐藏影响新增检测。
    projectInfoList.forEach((project) => {
      project.issues = project.issues.filter(
        (issue) => !ignoreList.includes(issue.key),
      );
      project.count = project.issues.length;
    });

    projectInfoList = projectInfoList.filter((project) => project.count > 0);
    projectInfoList = orderItemsByKeys(projectInfoList, projectOrderKeys);

    const count = projectInfoList.reduce((acc, cur) => acc + cur.count, 0);

    const latestIssues =
      issuesList ?? projectInfoList.flatMap((project) => project.issues);
    const latestIssueKeys = latestIssues.map((issue) => issue.key);
    const uniqueLatestIssueKeys = Array.from(new Set(latestIssueKeys));
    const previousSnapshotIssueKeys = prevProjectInfoList.flatMap((project) =>
      project.issues.map((issue) => issue.key),
    );

    let newCount = 0;
    let reopenCount = 0;
    let addedIssueKeys: string[] = [];
    let baselineIssueKeys: string[] | null = null;
    if (options.resetNotificationBaseline) {
      hasCheckedIssueBaseline = true;
      lastCheckedIssueKeys = uniqueLatestIssueKeys;
    } else if (shouldNotify) {
      baselineIssueKeys = hasCheckedIssueBaseline
        ? lastCheckedIssueKeys
        : previousSnapshotIssueKeys.length > 0
          ? previousSnapshotIssueKeys
          : null;

      if (baselineIssueKeys) {
        const prevIssueKeySet = new Set(baselineIssueKeys);
        addedIssueKeys = uniqueLatestIssueKeys.filter(
          (issueKey) => !prevIssueKeySet.has(issueKey),
        );
        const addedIssueKeySet = new Set(addedIssueKeys);

        latestIssues.forEach((issue) => {
          if (!addedIssueKeySet.has(issue.key)) return;
          if (ignoreList.includes(issue.key)) return;

          newCount++;
          needNoticeList.push(issue);
        });
      }

      hasCheckedIssueBaseline = true;
      lastCheckedIssueKeys = uniqueLatestIssueKeys;
    }

    const needNoticeIssueKeys = getIssueKeys(needNoticeList);
    const ignoredAddedIssueKeys = addedIssueKeys.filter((issueKey) =>
      ignoreList.includes(issueKey),
    );

    console.log(`${LOG_PREFIX} processList:decision`, {
      addedIssueKeys,
      baselineIssueKeys: baselineIssueKeys ?? [],
      hasCheckedIssueBaseline,
      ignoredAddedIssueKeys,
      ignoreList,
      latestIssueKeys: uniqueLatestIssueKeys,
      needNoticeIssueKeys,
      newCount,
      notifyType: useSettingStore.getState().notifyType,
      previousSnapshotIssueKeys,
      prevHasCheckedIssueBaseline,
      resetNotificationBaseline: options.resetNotificationBaseline === true,
      shouldNotify,
      visibleCount: count,
    });

    if (shouldNotify && needNoticeList.length > 0) {
      const noticedIssueKeySet = new Set(noticedList);
      needNoticeList.forEach((issue) => noticedIssueKeySet.add(issue.key));
      noticedList = Array.from(noticedIssueKeySet);
    }

    if (noticedList.length > 500) {
      noticedList = noticedList.slice(-500);
    }

    if (shouldNotify) {
      this.noticeIssues(needNoticeList, newCount, reopenCount);
    }

    useJiraStore.setState({
      count,
      hasCheckedIssueBaseline,
      hasIssueSnapshot,
      projectInfoList,
      ignoreList,
      lastCheckAddedIssueKeys: shouldNotify ? addedIssueKeys : [],
      lastCheckAt: shouldNotify
        ? Date.now()
        : useJiraStore.getState().lastCheckAt,
      lastCheckBaselineIssueKeys: shouldNotify ? (baselineIssueKeys ?? []) : [],
      lastCheckError: shouldNotify
        ? null
        : useJiraStore.getState().lastCheckError,
      lastCheckLatestIssueKeys: shouldNotify ? uniqueLatestIssueKeys : [],
      lastCheckedIssueKeys,
      lastNotificationAt:
        shouldNotify && needNoticeList.length > 0
          ? Date.now()
          : useJiraStore.getState().lastNotificationAt,
      lastNotificationIssueKeys: shouldNotify
        ? needNoticeList.map((issue) => issue.key)
        : useJiraStore.getState().lastNotificationIssueKeys,
      noticedList,
    });
  }

  public noticeIssues(
    list: Version2Models.Issue[],
    newCount: number,
    reopenCount: number,
  ) {
    if (list.length === 0) {
      console.log(`${LOG_PREFIX} noticeIssues:skip-empty`, {
        newCount,
        reopenCount,
      });
      return;
    }

    // 标题使用中性且准确的"新任务指派"，不依赖 status.id 做魔法数判定
    const total = newCount + reopenCount;
    const title = i18n.t("noticeAssignTitle", total);
    const firstIssueText = `${list[0].key} ${list[0].fields.summary}`;
    const message =
      total > 1
        ? i18n.t("noticeAssignMessage", [total, firstIssueText])
        : firstIssueText;

    // 传入第一个新任务的 issueKey，用于通知点击跳转
    console.log(`${LOG_PREFIX} noticeIssues:send`, {
      issueKeys: getIssueKeys(list),
      message,
      title,
      total,
    });
    this.sendNotification(title, message, list[0].key);
  }

  /**
   * 公共方法：触发一次通知，遵循当前设置中的 notifyType。
   * 用于设置页的"测试通知"按钮，绕过真实任务去验证通知通路。
   */
  public sendNotification(title: string, message: string, issueKey?: string) {
    const { notifyType } = useSettingStore.getState();
    const normalizedNotifyType =
      notifyType === NotificationType.None
        ? NotificationType.None
        : NotificationType.System;

    const createBrowserNotif = () => {
      const notificationId = `jira-notifier-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
      const payload = {
        // Chrome 系统通知对 SVG 图标兼容性不稳定，使用 manifest 同款 PNG。
        iconUrl: browser.runtime.getURL("/icon/128.png"),
        type: "basic" as const,
        title,
        message,
        buttons: [
          {
            title: i18n.t("noticeBtn"),
          },
        ],
        requireInteraction: true,
        isClickable: true,
      };

      console.log(`${LOG_PREFIX} notifications:create:start`, {
        iconUrl: payload.iconUrl,
        issueKey,
        message,
        notificationId,
        title,
      });

      browser.notifications
        .getPermissionLevel()
        .then((permissionLevel) => {
          console.log(`${LOG_PREFIX} notifications:permission`, {
            permissionLevel,
          });
        })
        .catch((err) => {
          console.error(
            "[jira-notifier] get notification permission failed:",
            err,
          );
        });

      chrome.notifications.create(notificationId, payload, (notifId) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          console.error("[jira-notifier] create notification failed:", {
            message: lastError.message,
            notificationId,
          });
          return;
        }

        if (issueKey) notificationMap.set(notifId, issueKey);
        console.log(`${LOG_PREFIX} notifications:create:success`, {
          issueKey,
          notifId,
        });

        chrome.notifications.getAll((notifications) => {
          console.log(`${LOG_PREFIX} notifications:getAll`, {
            notificationIds: Object.keys(notifications),
          });
        });
      });
    };

    switch (normalizedNotifyType) {
      case NotificationType.None:
        console.log(`${LOG_PREFIX} sendNotification:skip-disabled`, {
          issueKey,
          notifyType,
        });
        return;
      case NotificationType.System:
        console.log(`${LOG_PREFIX} sendNotification:system`, {
          issueKey,
          notifyType,
          normalizedNotifyType,
        });
        createBrowserNotif();
        break;
    }
  }
}

export const jiraHelper = new JiraHelper();

/**
 * 触发一次测试通知，绕过真实任务，用于在设置页验证通知通路。
 * 返回触发结果（true 表示发起成功，false 表示设置项为"不通知"）。
 */
export function sendTestNotification(): boolean {
  const { notifyType } = useSettingStore.getState();
  if (notifyType === NotificationType.None) return false;
  jiraHelper.sendNotification(
    i18n.t("testNotificationTitle"),
    i18n.t("testNotificationMessage"),
  );
  return true;
}

/**
 * 轻量校验 JQL 是否能被当前 Jira 接受。只请求 1 条结果，不更新任务列表。
 */
export async function validateJiraJql(jql: string): Promise<void> {
  await ensureJiraHostPermission();
  const jiraClient = getJiraClient();
  if (!jiraClient) throw new Error("Jira server URL is not configured");

  await jiraClient.issueSearch.searchForIssuesUsingJql({
    jql: jql.trim() || DEFAULT_JIRA_JQL,
    fields: ["summary"],
    maxResults: 1,
    startAt: 0,
  });
}

// #region 通知点击处理

/** 通知 ID → issueKey 映射，用于点击通知后跳转到具体任务 */
const notificationMap = new Map<string, string>();

function openIssueOrServer(issueKey?: string) {
  const serverURL = getServerURL();
  if (!serverURL) return;

  if (issueKey) {
    browser.tabs.create({ url: `${serverURL}/browse/${issueKey}` });
  } else {
    browser.tabs.create({ url: serverURL });
  }
}

/**
 * 处理通知点击 / 按钮点击事件。
 * 根据 notificationId 查找对应的 issueKey，跳转到具体任务详情页。
 * 如果找不到映射关系，则回退到 Jira 首页。
 */
export function handleNotificationClick(notificationId: string) {
  const issueKey = notificationMap.get(notificationId);
  notificationMap.delete(notificationId);
  openIssueOrServer(issueKey);
}

// #endregion
