#!/bin/bash

# --- НАСТРОЙКА ОКРУЖЕНИЯ ---
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
# --- КОНЕЦ НАСТРОЙКИ ОКРУЖЕНИЯ ---

set -e

# --- КОНФИГУРАЦИЯ ---
TARGET_REPO="y-tree-limited/argocd-monorepo"
WORKFLOW_NAME="promote-service.yaml"
ENVIRONMENT="preprod"
# --- КОНЕЦ КОНФИГУРАЦИИ ---

SOURCE_REPO="$1"
if [ -z "$SOURCE_REPO" ]; then
    echo "Ошибка: Не передано имя исходного репозитория." >&2
    exit 1
fi

echo "1. Получение последнего тега из репозитория: $SOURCE_REPO"
LATEST_TAG=$(gh release list -R "$SOURCE_REPO" --limit 1 | awk '{print $3}' | sed 's/^v//')

if [ -z "$LATEST_TAG" ]; then
    echo "Ошибка: Не удалось найти релизы в $SOURCE_REPO." >&2
    exit 1
fi
echo "Найдена и очищена версия: $LATEST_TAG"

SERVICE_NAME=$(basename "$SOURCE_REPO")
SERVICES_STRING="$SERVICE_NAME@$LATEST_TAG"
echo "Сформирован параметр 'services': $SERVICES_STRING"

echo "2. Запуск воркфлоу '$WORKFLOW_NAME'..."
gh workflow run "$WORKFLOW_NAME" \
  -R "$TARGET_REPO" \
  -f environment="$ENVIRONMENT" \
  -f services="$SERVICES_STRING"

# --- ОБНОВЛЕННЫЙ БЛОК ОЖИДАНИЯ PR ---
echo "3. Ожидание появления Pull Request (максимум 5 минут)..."
PR_TITLE="GHA: Promote ${SERVICE_NAME}@${LATEST_TAG} ${ENVIRONMENT}"
PR_NUMBER=""
# Пытаемся найти PR в течение 5 минут (10 попыток с интервалом 30 секунд)
for i in {1..10}; do
    echo "Ожидание 30 секунд перед поиском... (попытка $i/10)"
    sleep 30

    echo "Поиск PR..."
    # Ищем PR по точному названию в открытом состоянии, берем первый столбец (номер)
    PR_NUMBER=$(gh pr list -R "$TARGET_REPO" --search "$PR_TITLE in:title is:open" --limit 1 | awk '{print $1}')

    if [ -n "$PR_NUMBER" ]; then
        echo "Найден PR: #$PR_NUMBER."
        break # Выходим из цикла, если PR найден
    fi
done

if [ -z "$PR_NUMBER" ]; then
    echo "Ошибка: Не удалось найти открытый PR с названием '$PR_TITLE' в течение 5 минут." >&2
    exit 1
fi

echo "4. Одобрение PR и включение авто-слияния..."
gh pr review "$PR_NUMBER" -R "$TARGET_REPO" --approve
gh pr merge "$PR_NUMBER" -R "$TARGET_REPO" --auto --squash

echo "✅ PR #$PR_NUMBER одобрен и установлен на авто-слияние. GitHub смержит его, как только пройдут все чеки."
