import { jiraHelper } from "@/src/utils/common/jiraClient";
import { Button } from "antd";
import cssStyles from "./login-layout.module.scss";

function LoginLayout() {
  return (
    <div className={cssStyles.page}>
      <div className={cssStyles.panel}>
        <img className={cssStyles.logo} src="/icon.svg" alt="" />
        <div className={cssStyles.title}>{i18n.t("noLoginTitle")}</div>
        <div className={cssStyles.desc}>{i18n.t("noLoginContent")}</div>

        <Button
          className={cssStyles.loginButton}
          type="primary"
          onClick={() => jiraHelper.gotoLogin()}
        >
          {i18n.t("login")}
        </Button>
      </div>
    </div>
  );
}

export default LoginLayout;
