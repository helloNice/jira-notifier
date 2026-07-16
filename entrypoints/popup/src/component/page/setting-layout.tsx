import {
  DEFAULT_JIRA_JQL,
  ISettingData,
  NEXT_CHECK_AT_STORAGE_KEY,
  NotificationType,
  useSettingStore,
} from "@/src/store/settingStore";
import { useJiraStore } from "@/src/store/jiraStore";
import {
  sendTestNotification,
  validateJiraJql,
} from "@/src/utils/common/jiraClient";
import {
  ApiOutlined,
  BellOutlined,
  ControlOutlined,
  DatabaseOutlined,
  EyeInvisibleOutlined,
  GithubOutlined,
  SettingOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { i18n } from "#imports";
import {
  Alert,
  App,
  Button,
  Collapse,
  Form,
  Input,
  InputNumber,
  Radio,
  Slider,
  Switch,
} from "antd";
import { useEffect, useState } from "react";
import cssStyle from "./setting-layout.module.scss";

const MIN_INTERVAL_SECONDS = 60;
const MAX_INTERVAL_SECONDS = 600;
const GITHUB_URL = "https://github.com/helloNice/jira-notifier";

function normalizeInterval(value: number | null | undefined) {
  const interval = Number.isFinite(value) ? Math.round(value as number) : 180;
  return Math.min(
    MAX_INTERVAL_SECONDS,
    Math.max(MIN_INTERVAL_SECONDS, interval),
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (typeof error === "object" && error !== null) {
    const maybeError = error as {
      errorMessages?: string[];
      message?: string;
      statusText?: string;
    };

    if (maybeError.errorMessages?.length) {
      return maybeError.errorMessages.join("；");
    }

    if (maybeError.message) return maybeError.message;
    if (maybeError.statusText) return maybeError.statusText;
  }

  return String(error);
}

function SettingLayout() {
  const settingData = useSettingStore((state) => state);
  const normalizedSettingData = {
    ...settingData,
    interval: normalizeInterval(settingData.interval),
    jiraJql: settingData.jiraJql || DEFAULT_JIRA_JQL,
    notifyType:
      settingData.notifyType === NotificationType.None
        ? NotificationType.None
        : NotificationType.System,
  };
  const clearIgnore = useJiraStore((state) => state.clearIgnore);
  const hideAll = useJiraStore((state) => state.ignoreAll);
  const { message } = App.useApp();

  const [form] = Form.useForm<ISettingData>();
  const [jqlCheckError, setJqlCheckError] = useState<string | null>(null);
  const [isCheckingJql, setIsCheckingJql] = useState(false);
  const [sliderInterval, setSliderInterval] = useState(
    normalizedSettingData.interval,
  );

  useEffect(() => {
    form.setFieldsValue(normalizedSettingData);
    setSliderInterval(normalizedSettingData.interval);
  }, [
    form,
    normalizedSettingData.interval,
    normalizedSettingData.isAutoFocused,
    normalizedSettingData.isOpen,
    normalizedSettingData.jiraJql,
    normalizedSettingData.notifyType,
    normalizedSettingData.serverURL,
  ]);

  const syncNextCheckAt = (nextSettingData: ISettingData) => {
    if (!nextSettingData.isOpen) {
      void browser.storage.local.remove(NEXT_CHECK_AT_STORAGE_KEY);
      return;
    }

    void browser.storage.local.set({
      [NEXT_CHECK_AT_STORAGE_KEY]:
        Date.now() + nextSettingData.interval * 1000,
    });
  };

  const updateSettings = (patch: Partial<ISettingData>) => {
    useSettingStore.setState(patch);

    if ("interval" in patch || "isOpen" in patch) {
      syncNextCheckAt({
        ...useSettingStore.getState(),
        ...patch,
      });
    }
  };

  const updateInterval = (value: number | null) => {
    const nextInterval = normalizeInterval(value);
    form.setFieldValue("interval", nextInterval);
    setSliderInterval(nextInterval);
    updateSettings({ interval: nextInterval });
  };

  const checkJiraJql = async () => {
    const jiraJql = String(form.getFieldValue("jiraJql") ?? "").trim();

    setIsCheckingJql(true);
    setJqlCheckError(null);

    try {
      await validateJiraJql(jiraJql);
      updateSettings({ jiraJql: jiraJql || DEFAULT_JIRA_JQL });
      clearIgnore();
      message.success("JQL 检测通过，已重置记录并重新拉取任务");
    } catch (error) {
      setJqlCheckError(getErrorMessage(error));
    } finally {
      setIsCheckingJql(false);
    }
  };

  return (
    <div className={cssStyle.page}>
      <Form
        form={form}
        layout="vertical"
        initialValues={normalizedSettingData}
        onValuesChange={(changedValues: Partial<ISettingData>) => {
          const { jiraJql, ...safeChangedValues } = changedValues;
          if (Object.keys(safeChangedValues).length > 0) {
            updateSettings(safeChangedValues);
          }
          if (jiraJql !== undefined) setJqlCheckError(null);
        }}
      >

        {/* ── 服务器连接 ── */}
        <div className={cssStyle.section}>
          <div className={cssStyle.sectionTitle}>
            <ApiOutlined />
            <span>服务器连接</span>
          </div>
          <Form.Item
            name="serverURL"
            rules={[{ required: true, message: i18n.t("serverRequired") }]}
          >
            <Input placeholder={i18n.t("serverPlaceholder")} />
          </Form.Item>
          <p className={cssStyle.helper}>
            指向你的 Jira 服务器地址，扩展通过此地址获取任务数据
          </p>
        </div>

        {/* ── 检测设置 ── */}
        <div className={cssStyle.section}>
          <div className={cssStyle.sectionTitle}>
            <ControlOutlined />
            <span>检测设置</span>
          </div>

          <div className={cssStyle.field}>
            <Form.Item
              name="isOpen"
              label={i18n.t("openCheck")}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <p className={cssStyle.helper}>
              开启后自动轮询检测新指派的任务
            </p>
          </div>

          <div className={cssStyle.field}>
            <Form.Item label={i18n.t("interval")}>
              <div className={cssStyle.sliderWrapper}>
                <Slider
                  style={{ flex: 1 }}
                  step={1}
                  min={MIN_INTERVAL_SECONDS}
                  max={MAX_INTERVAL_SECONDS}
                  value={sliderInterval}
                  onChange={setSliderInterval}
                  onChangeComplete={updateInterval}
                  tooltip={{ open: false }}
                />
                <InputNumber
                  min={MIN_INTERVAL_SECONDS}
                  max={MAX_INTERVAL_SECONDS}
                  value={normalizedSettingData.interval}
                  suffix="s"
                  controls={false}
                  className={cssStyle.intervalInput}
                  onChange={updateInterval}
                />
              </div>
            </Form.Item>
            <p className={cssStyle.helper}>
              建议 180 秒（3 分钟）。过快增加服务器压力，过慢可能漏掉通知
            </p>
          </div>
        </div>

        {/* ── 通知设置 ── */}
        <div className={cssStyle.section}>
          <div className={cssStyle.sectionTitle}>
            <BellOutlined />
            <span>通知设置</span>
          </div>

          <div className={cssStyle.field}>
            <Form.Item name="notifyType" label={i18n.t("notifyType")}>
              <Radio.Group>
                <Radio.Button value={NotificationType.None}>
                  {i18n.t("notifyTypeNone")}
                </Radio.Button>
                <Radio.Button value={NotificationType.System}>
                  {i18n.t("notifyTypeSystem")}
                </Radio.Button>
              </Radio.Group>
            </Form.Item>
            <p className={cssStyle.helper}>
              有新任务指派时，通过选择的方式通知你
            </p>
          </div>

          <div className={cssStyle.field}>
            <Form.Item
              name="isAutoFocused"
              label={i18n.t("gotoJira")}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <p className={cssStyle.helper}>
              开启后，点击通知或任务时自动切换到 Jira 页面
            </p>
          </div>
        </div>

        {/* ── 高级选项 ── */}
        <div className={cssStyle.section}>
          <Collapse
            bordered={false}
            className={cssStyle.advancedCollapse}
            items={[
              {
                key: "advanced",
                label: (
                  <div className={cssStyle.sectionTitle}>
                    <SettingOutlined />
                    <span>高级选项</span>
                  </div>
                ),
                children: (
                  <div className={cssStyle.field}>
                    {jqlCheckError && (
                      <Alert
                        showIcon
                        type="error"
                        message="JQL 检测失败"
                        description={jqlCheckError}
                        className={cssStyle.jqlAlert}
                      />
                    )}
                    <Form.Item
                      name="jiraJql"
                      label={
                        <div className={cssStyle.jqlLabel}>
                          <span>Jira JQL</span>
                          <Button
                            size="small"
                            type="primary"
                            loading={isCheckingJql}
                            onClick={checkJiraJql}
                          >
                            检测
                          </Button>
                        </div>
                      }
                    >
                      <Input.TextArea
                        autoSize={{ minRows: 4, maxRows: 8 }}
                        placeholder={DEFAULT_JIRA_JQL}
                      />
                    </Form.Item>
                    <p className={cssStyle.helper}>
                      自定义后台轮询使用的 Jira 查询语句。留空时使用默认查询条件
                    </p>
                  </div>
                ),
              },
            ]}
          />
        </div>

      </Form>

      {/* ── 通知测试 ── */}
      <div className={cssStyle.section}>
        <div className={cssStyle.sectionTitle}>
          <BellOutlined />
          <span>通知测试</span>
        </div>
        <Button
          type="default"
          icon={<BellOutlined />}
          onClick={() => {
            const ok = sendTestNotification();
            if (ok) {
              message.success(i18n.t("testNotifyHint"));
            } else {
              message.warning(i18n.t("testNotifyDisabled"));
            }
          }}
          block
        >
          {i18n.t("testNotify")}
        </Button>
        <p className={cssStyle.helper} style={{ marginTop: 6 }}>
          {i18n.t("testNotifyDesc")}
        </p>
      </div>

      {/* ── 数据管理 ── */}
      <div className={cssStyle.section}>
        <div className={cssStyle.sectionTitle}>
          <DatabaseOutlined />
          <span>数据管理</span>
        </div>
        <div className={cssStyle.actionRow}>
          <Button
            icon={<EyeInvisibleOutlined />}
            onClick={() => hideAll()}
            className={cssStyle.actionBtn}
          >
            {i18n.t("ignoreAll")}
          </Button>
          <Button
            type="primary"
            icon={<UndoOutlined />}
            onClick={() => clearIgnore()}
            className={cssStyle.actionBtn}
          >
            {i18n.t("reset")}
          </Button>
        </div>
        <div className={cssStyle.actionDesc}>
          <p>
            <span className={cssStyle.label}>全部隐藏：</span>
            旧版隐藏记录入口；当前列表仍以 Jira 当前指派状态为准
          </p>
          <p>
            <span className={cssStyle.label}>重置记录：</span>
            清空本地隐藏和已通知记录，重新拉取任务，用于数据异常修复
          </p>
        </div>
      </div>

      {/* ── 项目链接 ── */}
      <div className={cssStyle.section}>
        <div className={cssStyle.sectionTitle}>
          <GithubOutlined />
          <span>项目链接</span>
        </div>
        <Button
          type="default"
          icon={<GithubOutlined />}
          onClick={() => browser.tabs.create({ url: GITHUB_URL })}
          block
        >
          GitHub 仓库
        </Button>
        <p className={cssStyle.helper} style={{ marginTop: 6 }}>
          查看源码、提交 Issue 或关注更新
        </p>
      </div>
    </div>
  );
}

export default SettingLayout;
