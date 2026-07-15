import {
  ISettingData,
  NotificationType,
  useSettingStore,
} from "@/src/store/settingStore";
import { useJiraStore } from "@/src/store/jiraStore";
import { sendTestNotification } from "@/src/utils/common/jiraClient";
import {
  ApiOutlined,
  BellOutlined,
  ControlOutlined,
  DatabaseOutlined,
  EyeInvisibleOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { i18n } from "#imports";
import { App, Button, Form, Input, InputNumber, Radio, Slider, Switch } from "antd";
import cssStyle from "./setting-layout.module.scss";

function SettingLayout() {
  const settingData = useSettingStore((state) => state);
  const normalizedSettingData = {
    ...settingData,
    notifyType:
      settingData.notifyType === NotificationType.None
        ? NotificationType.None
        : NotificationType.System,
  };
  const clearIgnore = useJiraStore((state) => state.clearIgnore);
  const hideAll = useJiraStore((state) => state.ignoreAll);
  const { message } = App.useApp();

  const [form] = Form.useForm<ISettingData>();
  const isOpen = Form.useWatch("isOpen", form);
  const serverURL = Form.useWatch("serverURL", form);
  const interval = Form.useWatch("interval", form);
  const isAutoFocused = Form.useWatch("isAutoFocused", form);
  const notifyType = Form.useWatch("notifyType", form);

  useEffect(() => {
    useSettingStore.setState({
      isOpen,
      serverURL,
      interval,
      isAutoFocused,
      notifyType,
    });
  }, [isOpen, serverURL, interval, isAutoFocused, notifyType]);

  return (
    <div className={cssStyle.page}>
      <Form form={form} layout="vertical" initialValues={normalizedSettingData}>

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
            <Form.Item name="interval" label={i18n.t("interval")}>
              <div className={cssStyle.sliderWrapper}>
                <Slider
                  style={{ flex: 1 }}
                  step={1}
                  min={60}
                  max={600}
                  tooltip={{ open: false }}
                />
                <Form.Item name="interval" noStyle>
                  <InputNumber
                    min={60}
                    max={600}
                    suffix="s"
                    controls={false}
                    className={cssStyle.intervalInput}
                  />
                </Form.Item>
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
    </div>
  );
}

export default SettingLayout;
