#!/usr/bin/env bash
# 部署脚本：拉取最新代码 -> 编译 -> 仅编译成功后部署到 nginx
# 任意一步失败立即退出，不会带着失败产物或旧产物继续部署。
set -euo pipefail

WORK_DIR=/root/workspace/easy-web-tab
NGINX_HTML=/usr/share/nginx/html

# 1) 拉取最新代码
rm -rf "$WORK_DIR"
git clone https://gitee.com/sifujiang/easy-web-tab.git "$WORK_DIR"

# 2) 复用本地已安装依赖，避免重新 npm install
#    注意：若 package.json 新增了依赖（如本次新增的 unplugin-auto-import /
#    unplugin-vue-components），需先把这些包装进 /root/workspace/node_modules，
#    否则后续编译会因找不到模块而失败并立即中止（符合「报错即停止」预期）。
cp -rf /root/workspace/node_modules "$WORK_DIR"

cd "$WORK_DIR"

# 3) 编译（set -e：编译报错会立即退出，不会执行后面的部署）
echo "开始编译..."
npm run build
echo "编译成功!"

# 4) 部署（仅在编译成功后才会执行到这里）
echo "开始部署到 $NGINX_HTML ..."
rm -rf "$NGINX_HTML"
mkdir -p "$NGINX_HTML"
cp -rf "$WORK_DIR/dist/." "$NGINX_HTML/"

echo "部署完成!"
