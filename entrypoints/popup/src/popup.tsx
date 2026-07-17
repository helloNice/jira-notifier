import React from "react";
import ReactDOM from "react-dom/client";
import { App as AntdApp } from "antd";
import { i18n } from "#imports";
import MainLayout from "./component/main-layout";

document.title = i18n.t("extName");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AntdApp>
      <MainLayout />
    </AntdApp>
  </React.StrictMode>,
);
