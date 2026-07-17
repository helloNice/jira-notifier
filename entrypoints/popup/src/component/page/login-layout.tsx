import { useSettingStore } from "@/src/store/settingStore";
import { jiraHelper } from "@/src/utils/common/jiraClient";
import { Button } from "antd";
import cssStyles from "./login-layout.module.scss";

function openJiraSetupPage() {
  const setupUrl = browser.runtime.getURL("/popup.html#/setting?setup=jira");
  void browser.tabs.create({ active: true, url: setupUrl });
}

function LoginLayout() {
  const serverURL = useSettingStore((state) => state.serverURL);

  const onLogin = () => {
    if (!serverURL.trim()) {
      openJiraSetupPage();
      return;
    }

    jiraHelper.gotoLogin();
  };

  return (
    <div className={cssStyles.page}>
      <div className={cssStyles.panel}>
        <img className={cssStyles.logo} src="/icon.svg" alt="" />
        <div className={cssStyles.title}>{i18n.t("noLoginTitle")}</div>
        <div className={cssStyles.desc}>{i18n.t("noLoginContent")}</div>

        <Button
          className={cssStyles.loginButton}
          type="primary"
          onClick={onLogin}
        >
          {i18n.t("login")}
        </Button>
      </div>
    </div>
  );
}

export default LoginLayout;
