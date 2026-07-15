import { useAsyncEffect } from "ahooks";
import { Avatar, Tooltip } from "antd";
import {
  HashRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import cssStyles from "./main-layout.module.scss";
import SettingLayout from "./page/setting-layout";

import {
  CheckCircleOutlined,
  LeftOutlined,
  SettingOutlined,
} from "@ant-design/icons";

import { useJiraStore } from "@/src/store/jiraStore";
import { useSettingStore } from "@/src/store/settingStore";
import { jiraHelper } from "@/src/utils/common/jiraClient";
import LoginLayout from "./page/login-layout";
import NewBugLayout from "./page/newbug-layout";

function MainLayout() {
  useAsyncEffect(async () => {
    // 手动刷新一次数据
    await jiraHelper.refreshUserInfo();
    if (jiraHelper.checkLogin()) {
      await jiraHelper.getAllUnresolvedIssues({ shouldNotify: false });
    }
  }, []);

  return (
    <HashRouter>
      <div className={cssStyles.app}>
        <Header />
        <div className={cssStyles.body}>
          <Routes>
            <Route path="/" element={<NewBugLayout />} />
            <Route path="/setting" element={<SettingLayout />} />
            <Route path="/login" element={<LoginLayout />} />
          </Routes>
        </div>
      </div>
    </HashRouter>
  );
}

function Header() {
  const isLogin = useJiraStore((state) => state.isLogin);
  const taskCount = useJiraStore((state) => state.count);
  const serverURL = useSettingStore((state) => state.serverURL);
  const userInfo = useJiraStore((state) => state.userInfo);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isLogin) navigate("/login");
    else if (location.pathname === "/login") navigate("/");
  }, [isLogin]);

  if (location.pathname === "/setting") {
    return (
      <div className={cssStyles.headerBack}>
        <div
          className={cssStyles.title}
          onClick={() => {
            navigate("/");
          }}
        >
          <LeftOutlined className={cssStyles.icon} style={{ fontSize: 16 }} />
          <span className={cssStyles.clickable}>{i18n.t("back")} </span>
        </div>
      </div>
    );
  } else if (location.pathname === "/login") {
    return (
      <div className={cssStyles.header}>
        <div className={cssStyles.left}>
          <div className={cssStyles.title}>
            <img className={cssStyles.logo} src="/icon.svg" alt="" />
            <span>{i18n.t("noLogin")}</span>
          </div>
        </div>
        <div className={cssStyles.right}>
          <Tooltip title={i18n.t("setting")}>
            <SettingOutlined
              className={cssStyles.icon}
              onClick={() => navigate("/setting")}
            />
          </Tooltip>
        </div>
      </div>
    );
  } else {
    return (
      <div className={cssStyles.header}>
        <div className={cssStyles.left}>
          <div className={cssStyles.title}>
            <Avatar
              className={cssStyles.clickable}
              size={28}
              src={userInfo?.avatarUrls?.["48x48"] ?? ""}
              onClick={() => browser.tabs.create({ url: serverURL })}
            />
            <span
              className={cssStyles.clickable}
              onClick={() => browser.tabs.create({ url: serverURL })}
            >
              {userInfo?.displayName}
            </span>
          </div>
          <div className={cssStyles.statusLine}>
            <span className={cssStyles.connected}>
              <CheckCircleOutlined />
              {i18n.t("connected")}
            </span>
            <span className={cssStyles.taskMeta}>
              {i18n.t("taskCount", [taskCount])}
            </span>
          </div>
        </div>
        <div className={cssStyles.right}>
          <Tooltip title={i18n.t("setting")}>
            <SettingOutlined
              className={cssStyles.icon}
              onClick={() => navigate("/setting")}
            />
          </Tooltip>
        </div>
      </div>
    );
  }
}

export default MainLayout;
