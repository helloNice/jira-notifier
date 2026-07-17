import { useJiraStore } from "@/src/store/jiraStore";
import {
  NEXT_CHECK_AT_STORAGE_KEY,
  useSettingStore,
} from "@/src/store/settingStore";
import { JIRAStatus } from "@/src/utils/common/jiraClient";
import { mergeOrderKeys } from "@/src/utils/common/projectOrder";
import { Collapse, List, Tag } from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  HolderOutlined,
} from "@ant-design/icons";
import { type DragEvent, useEffect, useState } from "react";
import { Version2Models } from "jira.js";
import cssStyles from "./newbug-layout.module.scss";

function moveProjectKey(
  projectKeys: string[],
  sourceKey: string,
  targetKey: string,
  insertAfter: boolean,
) {
  const nextKeys = projectKeys.filter((key) => key !== sourceKey);
  const targetIndex = nextKeys.indexOf(targetKey);
  if (targetIndex === -1) return projectKeys;

  nextKeys.splice(targetIndex + (insertAfter ? 1 : 0), 0, sourceKey);
  return nextKeys;
}

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
  const projectOrderKeys = useJiraStore((state) => state.projectOrderKeys);
  const setProjectOrderKeys = useJiraStore(
    (state) => state.setProjectOrderKeys,
  );
  const isOpen = useSettingStore((state) => state.isOpen);
  const [nextCheckAt, setNextCheckAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [draggingProjectKey, setDraggingProjectKey] = useState<string | null>(
    null,
  );
  const [dragOverProject, setDragOverProject] = useState<{
    insertAfter: boolean;
    key: string;
  } | null>(null);

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

  const projectKeys = projectInfoList.map((project) => project.key);
  const mergedProjectKeys = mergeOrderKeys(projectOrderKeys, projectKeys);
  const renderProjectLabel = (project: (typeof projectInfoList)[number]) => {
    const isDragging = draggingProjectKey === project.key;
    const isDragOverBefore =
      dragOverProject?.key === project.key && !dragOverProject.insertAfter;
    const isDragOverAfter =
      dragOverProject?.key === project.key && dragOverProject.insertAfter;

    const onDragOver = (event: DragEvent<HTMLDivElement>) => {
      if (!draggingProjectKey || draggingProjectKey === project.key) {
        setDragOverProject(null);
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";

      const rect = event.currentTarget.getBoundingClientRect();
      const insertAfter = event.clientY > rect.top + rect.height / 2;
      setDragOverProject((prevState) =>
        prevState?.key === project.key &&
        prevState.insertAfter === insertAfter
          ? prevState
          : { insertAfter, key: project.key },
      );
    };

    const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
      const nextTarget = event.relatedTarget;
      if (
        nextTarget instanceof Node &&
        event.currentTarget.contains(nextTarget)
      ) {
        return;
      }

      setDragOverProject(null);
    };

    const onDrop = (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOverProject(null);

      const sourceKey =
        event.dataTransfer.getData("text/plain") || draggingProjectKey;
      if (!sourceKey || sourceKey === project.key) {
        setDraggingProjectKey(null);
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const insertAfter = event.clientY > rect.top + rect.height / 2;
      setProjectOrderKeys(
        moveProjectKey(mergedProjectKeys, sourceKey, project.key, insertAfter),
      );
      setDraggingProjectKey(null);
    };

    return (
      <div
        className={`${cssStyles.projectHeader} ${
          isDragging ? cssStyles.isDraggingProject : ""
        } ${isDragOverBefore ? cssStyles.isDragOverBefore : ""} ${
          isDragOverAfter ? cssStyles.isDragOverAfter : ""
        }`}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <span
          aria-label={i18n.t("dragProjectSort")}
          className={cssStyles.projectDragHandle}
          draggable
          role="button"
          title={i18n.t("dragProjectSort")}
          onClick={(event) => event.stopPropagation()}
          onDragEnd={() => {
            setDraggingProjectKey(null);
            setDragOverProject(null);
          }}
          onDragStart={(event) => {
            event.stopPropagation();
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", project.key);
            setDraggingProjectKey(project.key);
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <HolderOutlined />
        </span>
        <span className={cssStyles.projectName}>{project.name}</span>
        <span className={cssStyles.projectCount}>
          {i18n.t("projectIssueCount", [project.count])}
        </span>
      </div>
    );
  };

  return (
    <div className={cssStyles.page}>
      <div className={cssStyles.toolbar}>
        <span className={cssStyles.toolbarTitle}>{i18n.t("myTasks")}</span>
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
            label: renderProjectLabel(project),
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
