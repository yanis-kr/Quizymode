const desktopGuideUrl =
  "https://github.com/yanis-kr/Quizymode/blob/main/docs/user-guide/user-guide.md";
const mobileGuideUrl =
  "https://github.com/yanis-kr/Quizymode/blob/main/docs/user-guide/user-guide.mobile.md";

const mobileBrowserPattern =
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

export function getUserGuideUrl(userAgent: string): string {
  return mobileBrowserPattern.test(userAgent) ? mobileGuideUrl : desktopGuideUrl;
}

