#!/bin/bash

# 获取最新 tag（也可以手动传入）
TAG=$(git describe --tags --abbrev=0)

echo "当前版本: $TAG"

# 处理版本号格式转换
# 将 v1.2 转换为 1.2.0 格式来匹配 CHANGELOG.md
if [[ $TAG == v* ]]; then
    # 移除 v 前缀
    VERSION_WITHOUT_V=${TAG#v}
    # 如果版本号只有两部分（如 1.2），添加 .0
    if [[ $VERSION_WITHOUT_V =~ ^[0-9]+\.[0-9]+$ ]]; then
        CHANGELOG_VERSION="${VERSION_WITHOUT_V}.0"
    else
        CHANGELOG_VERSION=$VERSION_WITHOUT_V
    fi
else
    CHANGELOG_VERSION=$TAG
fi

echo "转换后的版本号: $CHANGELOG_VERSION"

# 读取 CHANGELOG.md 中对应 tag 的内容
# 使用更可靠的方法来提取特定版本的内容
CHANGELOG=$(awk -v tag="$CHANGELOG_VERSION" '
BEGIN { in_section = 0; found = 0 }
/^## \[/ || /^## [0-9]/ {
    if (found) exit
    # 匹配 [tag] 或 tag 格式
    if ($0 ~ "\\[" tag "\\]" || $0 ~ "^## " tag " " || $0 ~ "^## " tag "$") {
        in_section = 1
        found = 1
        print "找到匹配的版本: " $0 > "/dev/stderr"
        next
    }
    in_section = 0
}
in_section { print }
' CHANGELOG.md)

# 移除标题行和空行
BODY=$(echo "$CHANGELOG" | sed '/^## /d' | sed '/^$/d')

echo "提取的变更日志内容:"
echo "$BODY"

# 检查是否成功提取到内容
if [ -z "$BODY" ]; then
    echo "警告: 没有找到版本 $CHANGELOG_VERSION 对应的变更日志内容"
    echo "请检查 CHANGELOG.md 中是否存在该版本的记录"
    exit 1
fi

# 等待用户输入
read -p "是否继续发布？(y/n): " confirm
if [ "$confirm" != "y" ]; then
    echo "取消发布"
    exit 1
fi

# 创建 GitHub Release（使用 gh）
gh release create "$TAG" \
    --title "$TAG" \
    --notes "$BODY"

read -p "按任意键退出..."
