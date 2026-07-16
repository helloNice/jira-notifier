import { useSettingStore } from "@/src/store/settingStore";
import { jiraHelper } from "@/src/utils/common/jiraClient";
import { Button } from "antd";
import { useNavigate } from "react-router-dom";
import cssStyles from "./login-layout.module.scss";

function LoginLayout() {
  const navigate = useNavigate();
  const serverURL = useSettingStore((state) => state.serverURL);

  const onLogin = () => {
    if (!serverURL.trim()) {
      navigate("/setting?setup=jira");
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
