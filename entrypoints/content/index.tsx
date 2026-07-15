import { ContentScriptContext, i18n } from "#imports";
import { onMessage } from "@/src/utils/common/messageService";
import { getBackgroundService } from "../../src/utils/common/proxyService";
import showToast from "./content-toast";

function initPage(ctx: ContentScriptContext) {
  onMessage("showToast", (message) => {
    showToast(
      ctx,
      message.data.title,
      message.data.description,
      message.data.issueKey,
    );
  });
}

async function checkLogin(ctx: ContentScriptContext) {
  const service = getBackgroundService();

  const settingStore = await service.getSettingStore();
  const url = settingStore.serverURL;
  if (!window.location.href.includes(url)) return;

  await service.refreshUserInfo();
  const jiraStore = await service.getJiraStore();
  const isLogin = jiraStore.isLogin;
  if (isLogin) return;

  showToast(ctx, i18n.t("noLoginTitle"), i18n.t("noLoginContent"));
}

export default defineContentScript({
  matches: ["<all_urls>"],
  main(ctx) {
    checkLogin(ctx);

    initPage(ctx);
  },
});
