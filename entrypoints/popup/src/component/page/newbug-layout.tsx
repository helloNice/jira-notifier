import { useJiraStore } from "@/src/store/jiraStore";
import {
  NEXT_CHECK_AT_STORAGE_KEY,
  useSettingStore,
} from "@/src/store/settingStore";
import { JIRAStatus } from "@/src/utils/common/jiraClient";
import { Collapse, List, Tag } from "antd";
import { CheckCircleOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import { Version2Models } from "jira.js";
import cssStyles from "./newbug-layout.module.scss";

const BugItem = (props: {
  index: number;
  issue: Version2Models.Issue;
  length: number;
}) => {
  const serverURL = useSettingStore((state) => state.serverURL);
  const isAutoFocused = useSettingStore((state) => state.isAutoFocused);

  const onClick = () => {
    // 打开新的一页
    browser.tabs.create({
      url: `${serverURL}/browse/${props.issue.key}`,
      active: isAutoFocused,
    });
  };

  return (
    <div
      className={`${cssStyles.bugItem} ${props.index === 0 && cssStyles.isFirst} ${props.index === props.length - 1 && cssStyles.isLast}`}
      onClick={onClick}
    >
      <div className={cssStyles.bugTitle}>
        <div className={cssStyles.titleLeft}>
          <img
            className={cssStyles.priorityIcon}
            src={props.issue.fields.priority.iconUrl}
            alt=""
          />
          <div className={cssStyles.bugKey}>{props.issue.key}</div>
        </div>
        {props.issue.fields.status.id === JIRAStatus.Reopen && (
          <Tag className={cssStyles.tag} color="warning">
            {props.issue.fields.status.name}
          </Tag>
        )}
      </div>

      <div className={cssStyles.bugContent}>{props.issue.fields.summary}</div>
    </div>
  );
};

function NewBugLayout() {
  const projectInfoList = useJiraStore((state) => state.projectInfoList);
  const isOpen = useSettingStore((state) => state.isOpen);
  const [nextCheckAt, setNextCheckAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let mounted = true;

    const syncNextCheckAt = () => {
      browser.storage.local
        .get(NEXT_CHECK_AT_STORAGE_KEY)
        .then((data) => {
          if (!mounted) return;
          const value = data[NEXT_CHECK_AT_STORAGE_KEY];
          setNextCheckAt(typeof value === "number" ? value : null);
        })
        .catch((err) => {
          console.error("[jira-notifier] 读取下次检查时间失败", err);
        });
    };

    syncNextCheckAt();

    const syncTimer = window.setInterval(syncNextCheckAt, 5000);
    const storageListener = (changes: Record<string, { newValue?: unknown }>) => {
      if (changes[NEXT_CHECK_AT_STORAGE_KEY]) {
        const value = changes[NEXT_CHECK_AT_STORAGE_KEY].newValue;
        setNextCheckAt(typeof value === "number" ? value : null);
      }
    };

    browser.storage.local.onChanged.addListener(storageListener);

    return () => {
      mounted = false;
      window.clearInterval(syncTimer);
      browser.storage.local.onChanged.removeListener(storageListener);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remainSeconds =
    isOpen && nextCheckAt ? Math.ceil((nextCheckAt - now) / 1000) : null;
  const countdownText =
    remainSeconds === null
      ? i18n.t("nextCheckDisabled")
      : remainSeconds <= 0
        ? i18n.t("nextCheckRunning")
        : i18n.t("nextCheckCountdown", [remainSeconds]);

  return (
    <div className={cssStyles.page}>
      <div className={cssStyles.toolbar}>
        <span className={cssStyles.toolbarTitle}>我的任务</span>
        <span className={cssStyles.countdown}>
          <ClockCircleOutlined />
          {countdownText}
        </span>
      </div>
      {projectInfoList.length === 0 ? (
        <div className={cssStyles.empty}>
          <div className={cssStyles.emptyIcon}>
            <CheckCircleOutlined />
          </div>
          <div className={cssStyles.emptyTitle}>{i18n.t("emptyStateTitle")}</div>
          <div className={cssStyles.emptyDesc}>{i18n.t("emptyStateDesc")}</div>
        </div>
      ) : (
        <Collapse
          bordered
          defaultActiveKey={[projectInfoList[0]?.key]}
          items={projectInfoList.map((project) => ({
            key: project.key,
            label: `${project.name}（${project.count}）`,
            children: (
              <List
                bordered={false}
                dataSource={project.issues}
                renderItem={(item, index) => (
                  <List.Item style={{ padding: 0 }}>
                    <BugItem
                      index={index}
                      issue={item}
                      length={project.issues.length}
                    />
                  </List.Item>
                )}
              />
            ),
          }))}
        />
      )}
    </div>
  );
}

export default NewBugLayout;
