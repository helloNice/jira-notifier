export function normalizeJiraServerURL(url: string) {
  const parsedUrl = new URL(url.trim());

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Jira 地址必须以 http:// 或 https:// 开头");
  }

  return parsedUrl.origin;
}

export function getHostPermissionOrigin(url: string) {
  return `${normalizeJiraServerURL(url)}/*`;
}

export async function hasHostPermission(url: string) {
  if (!url.trim()) return false;

  return browser.permissions.contains({
    origins: [getHostPermissionOrigin(url)],
  });
}

export async function requestHostPermission(url: string) {
  return browser.permissions.request({
    origins: [getHostPermissionOrigin(url)],
  });
}
