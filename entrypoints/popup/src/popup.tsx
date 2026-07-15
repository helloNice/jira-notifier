import React from "react";
import ReactDOM from "react-dom/client";
import { App as AntdApp } from "antd";
import MainLayout from "./component/main-layout";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AntdApp>
      <MainLayout />
    </AntdApp>
  </React.StrictMode>,
);
