import { ContentScriptContext } from "#imports";
import { notification } from "antd";
import ReactDOM from "react-dom/client";

function ContentToast(props: {
  title: string;
  description: string;
  onClick?: () => void;
}) {
  const iconPath = browser.runtime.getURL("/icon.svg");

  console.log("🚀 ~ iconPath:", iconPath);
  useEffect(() => {
    notification.open({
      icon: <img style={{ height: 26, width: 26 }} src={iconPath} />,
      message: props.title,
      description: props.description,
      onClick: props.onClick,
    });
  });

  return null;
}

function showToast(
  ctx: ContentScriptContext,
  title: string,
  description: string,
  issueKey?: string,
) {
  const ui = createIntegratedUi(ctx, {
    position: "inline",
    anchor: "body",
    onMount: (container) => {
      const root = ReactDOM.createRoot(container);
      root.render(
        <ContentToast
          title={title}
          description={description}
          onClick={
            issueKey
              ? () => {
                  window.open(`/browse/${issueKey}`, "_blank");
                }
              : undefined
          }
        />,
      );
      return root;
    },
    onRemove: (root) => {
      root?.unmount();
    },
  });

  ui.mount();
}

export default showToast;
