#!/bin/bash

# --- НАСТРОЙКА ОКРУЖЕНИЯ ---
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
# --- КОНЕЦ НАСТРОЙКИ ОКРУЖЕНИЯ ---

# `set -e` останавливает выполнение скрипта при любой ошибке.
# `set -o pipefail` заставляет всю цепочку команд (с |) завершаться с ошибкой, если любая ее часть провалилась.
set -eo pipefail

# --- КОНФИГУРАЦИЯ ---
TARGET_REPO="y-tree-limited/argocd-monorepo"
ENVIRONMENT="preprod"
# --- КОНЕЦ КОНФИГУРАЦИИ ---

SOURCE_REPO="$1"
if [ -z "$SOURCE_REPO" ]; then
    # Молча выходим, чтобы не было ошибки, если аргумент не передан
    exit 0
fi

SERVICE_NAME=$(basename "$SOURCE_REPO")
FILE_PATH="environments/${ENVIRONMENT}/cm-frontend-server-versions/app-values.yaml"

# 1. Получаем текущую версию. `|| echo "N/A"` сработает, если любая команда в цепочке провалится.
CURRENT_VERSION=$(gh api "repos/$TARGET_REPO/contents/$FILE_PATH" --jq '.content | @base64d' | grep "    ${SERVICE_NAME}:" | awk '{print $2}' | sed 's/^v//' || echo "N/A")
if [ -z "$CURRENT_VERSION" ]; then
    CURRENT_VERSION="N/A"
fi

# 2. Получаем последнюю доступную версию из релизов
LATEST_TAG=$(gh release list -R "$SOURCE_REPO" --limit 1 | awk '{print $3}' | sed 's/^v//' || echo "N/A")
if [ -z "$LATEST_TAG" ]; then
    LATEST_TAG="N/A"
fi

# 3. Выводим обе версии в формате JSON в стандартный вывод (stdout),
# который и "слушает" ваш Node.js сервер.
printf '{"current": "%s", "latest": "%s"}\n' "$CURRENT_VERSION" "$LATEST_TAG"
