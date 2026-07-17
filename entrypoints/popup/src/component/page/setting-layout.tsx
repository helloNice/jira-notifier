import { i18n } from "#imports";
import { useJiraStore } from "@/src/store/jiraStore";
import {
  DEFAULT_DUE_REMINDER_OFFSETS_MINUTES,
  DEFAULT_JIRA_JQL,
  ISettingData,
  NEXT_CHECK_AT_STORAGE_KEY,
  NotificationType,
  persistSettingPatch,
  useSettingStore,
} from "@/src/store/settingStore";
import {
  getHostPermissionOrigin,
  normalizeJiraServerURL,
  requestHostPermission,
} from "@/src/utils/common/hostPermission";
import {
  jiraHelper,
  sendTestNotification,
  validateJiraJql,
} from "@/src/utils/common/jiraClient";
import {
  ApiOutlined,
  BellOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ControlOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  EyeInvisibleOutlined,
  GithubOutlined,
  LinkOutlined,
  SettingOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Checkbox,
  Collapse,
  Form,
  Input,
  InputNumber,
  Radio,
  Slider,
  Switch,
} from "antd";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import cssStyle from "./setting-layout.module.scss";

const MIN_INTERVAL_SECONDS = 60;
const MAX_INTERVAL_SECONDS = 600;
const GITHUB_URL = "https://github.com/helloNice/jira-notifier";
const DUE_REMINDER_OFFSET_VALUES = [1440, 300, 60, 15];

function normalizeInterval(value: number | null | undefined) {
  const interval = Number.isFinite(value) ? Math.round(value as number) : 180;
  return Math.min(
    MAX_INTERVAL_SECONDS,
    Math.max(MIN_INTERVAL_SECONDS, interval),
  );
}

function normalizeDueReminderOffsets(value: unknown) {
  const validOffsets = new Set(DUE_REMINDER_OFFSET_VALUES);
  const offsets = Array.isArray(value)
    ? value
        .map((offset) => Number(offset))
        .filter((offset) => validOffsets.has(offset))
    : DEFAULT_DUE_REMINDER_OFFSETS_MINUTES;

  return offsets;
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
  const normalizedDueReminderOffsets = normalizeDueReminderOffsets(
    settingData.dueReminderOffsets,
  );
  const normalizedSettingData = {
    ...settingData,
    interval: normalizeInterval(settingData.interval),
    jiraJql: settingData.jiraJql || DEFAULT_JIRA_JQL,
    dueReminderEnabled: settingData.dueReminderEnabled ?? false,
    dueReminderOffsets: normalizedDueReminderOffsets,
    notifyType:
      settingData.notifyType === NotificationType.None
        ? NotificationType.None
        : NotificationType.System,
  };
  const dueReminderOffsetsSignature = normalizedDueReminderOffsets.join(",");
  const dueReminderOffsetOptions = [
    { label: i18n.t("dueReminderOffsetOneDay"), value: 1440 },
    { label: i18n.t("dueReminderOffsetFiveHours"), value: 300 },
    { label: i18n.t("dueReminderOffsetOneHour"), value: 60 },
    { label: i18n.t("dueReminderOffsetFifteenMinutes"), value: 15 },
  ];
  const clearIgnore = useJiraStore((state) => state.clearIgnore);
  const hideAll = useJiraStore((state) => state.ignoreAll);
  const { message } = App.useApp();
  const [searchParams] = useSearchParams();
  const shouldShowJiraSetupHint = searchParams.get("setup") === "jira";

  const [form] = Form.useForm<ISettingData>();
  const [isSavingJiraHost, setIsSavingJiraHost] = useState(false);
  const [jqlCheckError, setJqlCheckError] = useState<string | null>(null);
  const [isCheckingJql, setIsCheckingJql] = useState(false);
  const [sliderInterval, setSliderInterval] = useState(
    normalizedSettingData.interval,
  );
  const hasClickedTestNotify = Boolean(
    normalizedSettingData.hasClickedTestNotify,
  );

  useEffect(() => {
    form.setFieldsValue(normalizedSettingData);
    setSliderInterval(normalizedSettingData.interval);
  }, [
    form,
    normalizedSettingData.interval,
    normalizedSettingData.dueReminderEnabled,
    dueReminderOffsetsSignature,
    normalizedSettingData.isAutoFocused,
    normalizedSettingData.hasClickedTestNotify,
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
      [NEXT_CHECK_AT_STORAGE_KEY]: Date.now() + nextSettingData.interval * 1000,
    });
  };

  const applySettings = async (patch: Partial<ISettingData>) => {
    await persistSettingPatch(patch);

    if ("interval" in patch || "isOpen" in patch) {
      syncNextCheckAt({
        ...useSettingStore.getState(),
        ...patch,
      });
    }
  };

  const updateSettings = (patch: Partial<ISettingData>) => {
    void applySettings(patch);
  };

  const handleTestNotification = () => {
    updateSettings({ hasClickedTestNotify: true });

    const ok = sendTestNotification();
    if (ok) {
      message.success(i18n.t("testNotifyHint"));
    } else {
      message.warning(i18n.t("testNotifyDisabled"));
    }
  };

  const updateInterval = (value: number | null) => {
    const nextInterval = normalizeInterval(value);
    form.setFieldValue("interval", nextInterval);
    setSliderInterval(nextInterval);
    updateSettings({ interval: nextInterval });
  };

  const saveJiraServerURL = async () => {
    setIsSavingJiraHost(true);

    try {
      const { serverURL } = await form.validateFields(["serverURL"]);
      const nextServerURL = normalizeJiraServerURL(String(serverURL ?? ""));
      const permissionOrigin = getHostPermissionOrigin(nextServerURL);

      await applySettings({ serverURL: nextServerURL });
      form.setFieldValue("serverURL", nextServerURL);

      const allowed = await requestHostPermission(nextServerURL);

      if (!allowed) {
        message.warning(i18n.t("jiraHostPermissionDenied"));
        return;
      }

      message.success(
        i18n.t("jiraHostSavedWithPermission", [permissionOrigin]),
      );
      void jiraHelper.gotoLogin();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setIsSavingJiraHost(false);
    }
  };

  if (shouldShowJiraSetupHint) {
    return (
      <div className={cssStyle.setupPage}>
        <main className={cssStyle.setupShell}>
          <section className={cssStyle.setupIntro}>
            <img className={cssStyle.setupLogo} src="/icon.svg" alt="" />
            <p className={cssStyle.setupKicker}>{i18n.t("setupKicker")}</p>
            <h1>{i18n.t("setupTitle")}</h1>
            <p className={cssStyle.setupLead}>{i18n.t("setupLead")}</p>
          </section>

          <section className={cssStyle.setupPanel}>
            <div className={cssStyle.setupPanelHeader}>
              <div className={cssStyle.setupPanelIcon}>
                <LinkOutlined />
              </div>
              <div>
                <h2>{i18n.t("jiraAddressTitle")}</h2>
                <p>{i18n.t("jiraAddressHelp")}</p>
              </div>
            </div>

            <Form
              form={form}
              layout="vertical"
              initialValues={normalizedSettingData}
              className={cssStyle.setupForm}
            >
              <Form.Item
                name="serverURL"
                label={i18n.t("serverURLLabel")}
                rules={[{ required: true, message: i18n.t("serverRequired") }]}
              >
                <Input.Search
                  autoFocus
                  enterButton={i18n.t("authorizeAndSave")}
                  loading={isSavingJiraHost}
                  placeholder="https://jira.example.com"
                  size="large"
                  onSearch={saveJiraServerURL}
                />
              </Form.Item>
            </Form>

            <div className={cssStyle.setupFootnote}>
              <CheckCircleOutlined />
              <span>{i18n.t("setupFootnote")}</span>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const checkJiraJql = async () => {
    const jiraJql = String(form.getFieldValue("jiraJql") ?? "").trim();

    setIsCheckingJql(true);
    setJqlCheckError(null);

    try {
      await validateJiraJql(jiraJql);
      updateSettings({ jiraJql: jiraJql || DEFAULT_JIRA_JQL });
      clearIgnore();
      message.success(i18n.t("jqlCheckPassed"));
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
          const safeChangedValues = { ...changedValues };
          delete safeChangedValues.jiraJql;
          delete safeChangedValues.serverURL;
          if (safeChangedValues.dueReminderOffsets !== undefined) {
            safeChangedValues.dueReminderOffsets = normalizeDueReminderOffsets(
              safeChangedValues.dueReminderOffsets,
            );
          }

          if (Object.keys(safeChangedValues).length > 0) {
            updateSettings(safeChangedValues);
          }
          if (changedValues.jiraJql !== undefined) setJqlCheckError(null);
        }}
      >
        {/* ── 通知设置 ── */}
        <div className={`${cssStyle.section} ${cssStyle.prioritySection}`}>
          <Collapse
            bordered={false}
            className={cssStyle.advancedCollapse}
            defaultActiveKey={["notify"]}
            items={[
              {
                key: "notify",
                label: (
                  <div
                    className={`${cssStyle.sectionTitle} ${cssStyle.sectionTitleWithMeta}`}
                  >
                    <span className={cssStyle.sectionTitleText}>
                      <BellOutlined />
                      <span>{i18n.t("sectionNotifySettings")}</span>
                    </span>
                    <span className={cssStyle.sectionMetaBadge}>
                      {normalizedSettingData.notifyType ===
                      NotificationType.None
                        ? i18n.t("notifyTypeNone")
                        : i18n.t("notifyTypeSystem")}
                    </span>
                  </div>
                ),
                children: (
                  <>
                    <div className={cssStyle.notifyPanel}>
                      <div className={cssStyle.settingPanelHeader}>
                        <span>{i18n.t("notifyType")}</span>
                      </div>
                      <Form.Item
                        name="notifyType"
                        className={cssStyle.compactFormItem}
                      >
                        <Radio.Group className={cssStyle.notifyRadioGroup}>
                          <Radio.Button value={NotificationType.None}>
                            {i18n.t("notifyTypeNone")}
                          </Radio.Button>
                          <Radio.Button value={NotificationType.System}>
                            {i18n.t("notifyTypeSystem")}
                          </Radio.Button>
                        </Radio.Group>
                      </Form.Item>
                      <p className={cssStyle.helper}>
                        {i18n.t("notifyTypeHelper")}
                      </p>
                    </div>

                    <div className={cssStyle.notifyTestPanel}>
                      <div className={cssStyle.settingPanelHeader}>
                        <span>{i18n.t("sectionNotifyTest")}</span>
                      </div>
                      <p className={cssStyle.helper}>
                        {i18n.t("testNotifyDesc")}
                      </p>
                      <div className={cssStyle.notifyTestAction}>
                        {!hasClickedTestNotify && (
                          <div
                            className={cssStyle.notifyTestBadge}
                            aria-hidden="true"
                          >
                            <ExperimentOutlined />
                            <span>{i18n.t("testNotifyBadge")}</span>
                          </div>
                        )}
                        <Button
                          type="default"
                          icon={<BellOutlined />}
                          onClick={handleTestNotification}
                          block
                        >
                          {i18n.t("testNotify")}
                        </Button>
                      </div>
                    </div>

                    <div className={cssStyle.settingLine}>
                      <div className={cssStyle.settingLineCopy}>
                        <div className={cssStyle.settingLineTitle}>
                          {i18n.t("gotoJira")}
                        </div>
                        <p className={cssStyle.helper}>
                          {i18n.t("gotoJiraHelper")}
                        </p>
                      </div>
                      <Form.Item
                        name="isAutoFocused"
                        valuePropName="checked"
                        noStyle
                      >
                        <Switch />
                      </Form.Item>
                    </div>
                  </>
                ),
              },
            ]}
          />
        </div>

        {/* ── 检测设置 ── */}
        <div className={cssStyle.section}>
          <Collapse
            bordered={false}
            className={cssStyle.advancedCollapse}
            defaultActiveKey={[]}
            items={[
              {
                key: "check",
                label: (
                  <div
                    className={`${cssStyle.sectionTitle} ${cssStyle.sectionTitleWithMeta}`}
                  >
                    <span className={cssStyle.sectionTitleText}>
                      <ControlOutlined />
                      <span>{i18n.t("sectionCheckSettings")}</span>
                    </span>
                    <span
                      className={`${cssStyle.sectionMetaBadge} ${
                        normalizedSettingData.isOpen ? "" : cssStyle.isMuted
                      }`}
                    >
                      {normalizedSettingData.isOpen
                        ? `${normalizedSettingData.interval}s`
                        : i18n.t("nextCheckDisabled")}
                    </span>
                  </div>
                ),
                children: (
                  <div className={cssStyle.field}>
                    <div className={cssStyle.settingLine}>
                      <div className={cssStyle.settingLineCopy}>
                        <div className={cssStyle.settingLineTitle}>
                          {i18n.t("openCheck")}
                        </div>
                        <p className={cssStyle.helper}>
                          {i18n.t("openCheckHelper")}
                        </p>
                      </div>
                      <Form.Item name="isOpen" valuePropName="checked" noStyle>
                        <Switch />
                      </Form.Item>
                    </div>

                    <div className={cssStyle.settingPanel}>
                      <div className={cssStyle.settingPanelHeader}>
                        <span>{i18n.t("interval")}</span>
                      </div>
                      <Form.Item className={cssStyle.compactFormItem}>
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
                        {i18n.t("intervalHelper")}
                      </p>
                    </div>
                  </div>
                ),
              },
            ]}
          />
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
                    <span>{i18n.t("sectionAdvanced")}</span>
                  </div>
                ),
                children: (
                  <>
                    <div className={cssStyle.field}>
                      <div
                        className={`${cssStyle.settingPanel} ${cssStyle.dueReminderPanel} ${
                          normalizedSettingData.dueReminderEnabled
                            ? ""
                            : cssStyle.dueReminderPanelDisabled
                        }`}
                      >
                        <div className={cssStyle.dueReminderPanelHeader}>
                          <div className={cssStyle.dueReminderTitleBlock}>
                            <span
                              className={cssStyle.dueReminderIcon}
                              aria-hidden="true"
                            >
                              <CalendarOutlined />
                            </span>
                            <div className={cssStyle.settingLineCopy}>
                              <div className={cssStyle.settingLineTitle}>
                                {i18n.t("dueReminder")}
                              </div>
                              <p className={cssStyle.helper}>
                                {i18n.t("dueReminderHelper")}
                              </p>
                            </div>
                          </div>
                          <Form.Item
                            name="dueReminderEnabled"
                            valuePropName="checked"
                            noStyle
                          >
                            <Switch />
                          </Form.Item>
                        </div>

                        <div className={cssStyle.dueReminderOptionsHeader}>
                          <span>{i18n.t("dueReminderOffsets")}</span>
                        </div>
                        <Form.Item
                          name="dueReminderOffsets"
                          className={cssStyle.compactFormItem}
                        >
                          <Checkbox.Group
                            className={cssStyle.dueReminderCheckboxGroup}
                            disabled={!normalizedSettingData.dueReminderEnabled}
                          >
                            {dueReminderOffsetOptions.map((option) => (
                              <Checkbox
                                key={option.value}
                                className={cssStyle.dueReminderOption}
                                value={option.value}
                              >
                                <span
                                  className={cssStyle.dueReminderOptionContent}
                                >
                                  <ClockCircleOutlined aria-hidden="true" />
                                  <span>{option.label}</span>
                                </span>
                              </Checkbox>
                            ))}
                          </Checkbox.Group>
                        </Form.Item>
                        <p className={cssStyle.helper}>
                          {i18n.t("dueReminderOffsetsHelper")}
                        </p>
                      </div>
                    </div>

                    <div className={cssStyle.field}>
                      <div
                        className={`${cssStyle.settingPanel} ${cssStyle.jqlPanel}`}
                      >
                        <div className={cssStyle.settingPanelHeader}>
                          <span>{i18n.t("jiraJql")}</span>
                        </div>
                        {jqlCheckError && (
                          <Alert
                            showIcon
                            type="error"
                            message={i18n.t("jqlCheckFailed")}
                            description={jqlCheckError}
                            className={cssStyle.jqlAlert}
                          />
                        )}
                        <Form.Item className={cssStyle.compactFormItem}>
                          <div className={cssStyle.jqlControlRow}>
                            <Form.Item name="jiraJql" noStyle>
                              <Input.TextArea
                                autoSize={{ minRows: 4, maxRows: 8 }}
                                placeholder={DEFAULT_JIRA_JQL}
                              />
                            </Form.Item>
                            <Button
                              type="primary"
                              loading={isCheckingJql}
                              onClick={checkJiraJql}
                            >
                              {i18n.t("jqlCheckButton")}
                            </Button>
                          </div>
                        </Form.Item>
                        <p className={cssStyle.helper}>
                          {i18n.t("jiraJqlHelper")}
                        </p>
                      </div>
                    </div>
                  </>
                ),
              },
            ]}
          />
        </div>

        {/* ── 数据管理 ── */}
        <div className={cssStyle.section}>
          <Collapse
            bordered={false}
            className={cssStyle.advancedCollapse}
            defaultActiveKey={[]}
            items={[
              {
                key: "data",
                label: (
                  <div className={cssStyle.sectionTitle}>
                    <DatabaseOutlined />
                    <span>{i18n.t("sectionDataManage")}</span>
                  </div>
                ),
                children: (
                  <div className={cssStyle.field}>
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
                        <span className={cssStyle.label}>
                          {i18n.t("hideAllLabel")}
                        </span>
                        {i18n.t("hideAllDescription")}
                      </p>
                      <p>
                        <span className={cssStyle.label}>
                          {i18n.t("resetLabel")}
                        </span>
                        {i18n.t("resetDescription")}
                      </p>
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </div>

        {/* ── 服务器连接 ── */}
        <div className={cssStyle.section}>
          <div className={cssStyle.sectionTitle}>
            <ApiOutlined />
            <span>{i18n.t("sectionServerConnection")}</span>
          </div>
          {shouldShowJiraSetupHint && (
            <Alert
              showIcon
              type="info"
              message={i18n.t("setupAlertTitle")}
              description={i18n.t("setupAlertDescription")}
              className={cssStyle.setupAlert}
            />
          )}
          <Form.Item
            name="serverURL"
            rules={[{ required: true, message: i18n.t("serverRequired") }]}
          >
            <Input.Search
              enterButton={i18n.t("authorizeAndSave")}
              loading={isSavingJiraHost}
              placeholder={i18n.t("serverPlaceholder")}
              onSearch={saveJiraServerURL}
            />
          </Form.Item>
          <p className={cssStyle.helper}>{i18n.t("serverHelper")}</p>
        </div>
      </Form>

      {/* ── 项目链接 ── */}
      <div className={cssStyle.section}>
        <div className={cssStyle.sectionTitle}>
          <GithubOutlined />
          <span>{i18n.t("sectionProjectLink")}</span>
        </div>
        <Button
          type="default"
          icon={<GithubOutlined />}
          onClick={() => browser.tabs.create({ url: GITHUB_URL })}
          block
        >
          {i18n.t("githubRepo")}
        </Button>
        <p className={cssStyle.helper} style={{ marginTop: 6 }}>
          {i18n.t("githubRepoDesc")}
        </p>
      </div>
    </div>
  );
}

export default SettingLayout;
