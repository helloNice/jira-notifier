import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react", "@wxt-dev/i18n/module"],
  manifest: {
    default_locale: "zh_CN",
    name: "__MSG_extName__",
    description: "__MSG_extDescription__",

    permissions: ["notifications", "storage", "alarms"],
    optional_host_permissions: ["http://*/*", "https://*/*"],
  },
});
