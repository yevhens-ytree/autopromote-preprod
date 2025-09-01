#!/bin/bash

# --- НАСТРОЙКА ---
TARGET_DIR="$HOME/bin"
SERVICE_NAME="com.user.githubtrigger.nodejs"
LAUNCH_AGENT_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$LAUNCH_AGENT_DIR/$SERVICE_NAME.plist"
# --- КОНЕЦ НАСТРОЙКИ ---

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

print_info() {
    echo -e "\033[0;34m$1\033[0m"
}
print_success() {
    echo -e "\033[0;32m$1\033[0m"
}
print_error() {
    echo -e "\033[0;31m$1\033[0m" >&2
    exit 1
}

# 1. ПРОВЕРКА ТОКЕНА GITHUB
# -----------------------------------------------------------------------------
print_info "Проверка наличия токена GitHub (GH_TOKEN)..."
if [ -z "$GH_TOKEN" ]; then
    print_error "Ошибка: Переменная окружения GH_TOKEN не установлена."
    echo "Пожалуйста, убедитесь, что она экспортирована в вашем .zshrc/.bash_profile,"
    echo "и вы перезапустили терминал, либо выполните:"
    echo "export GH_TOKEN=ghp_... перед запуском этого скрипта."
    exit 1
fi
print_success "Токен GH_TOKEN найден."

# 2. КОПИРОВАНИЕ ФАЙЛОВ И НАСТРОЙКА ПРАВ
# -----------------------------------------------------------------------------
mkdir -p "$TARGET_DIR"
mkdir -p "$LAUNCH_AGENT_DIR"

print_info "Копирование исполняемых файлов в '$TARGET_DIR'..."
cp -f "$SCRIPT_DIR/local-server.js" "$TARGET_DIR/" || print_error "Не удалось скопировать local-server.js"
cp -f "$SCRIPT_DIR/promote-preprod.sh" "$TARGET_DIR/" || print_error "Не удалось скопировать promote-preprod.sh"
# --- ОБНОВЛЕННЫЕ СТРОКИ ---
cp -f "$SCRIPT_DIR/get-version-info.sh" "$TARGET_DIR/" || print_error "Не удалось скопировать get-version-info.sh"
# Удаляем старый скрипт, если он есть
rm -f "$TARGET_DIR/get-preprod-version.sh"

print_info "Установка прав на выполнение..."
chmod +x "$TARGET_DIR/promote-preprod.sh" || print_error "Не удалось установить права на promote-preprod.sh."
# --- ДОБАВЛЕНА СТРОКА ---
chmod +x "$TARGET_DIR/get-version-info.sh" || print_error "Не удалось установить права на get-version-info.sh."


# 3. СОЗДАНИЕ .PLIST ФАЙЛА С АВТОМАТИЧЕСКОЙ ПОДСТАНОВКОЙ ТОКЕНА
# -----------------------------------------------------------------------------
print_info "Создание файла сервиса с вашим токеном..."
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
    print_error "Ошибка: Node.js не найден. Пожалуйста, установите его (brew install node)."
fi

cat << EOF > "$PLIST_FILE"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$SERVICE_NAME</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_PATH</string>
        <string>$TARGET_DIR/local-server.js</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>GH_TOKEN</key>
        <string>$GH_TOKEN</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/${SERVICE_NAME}.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/${SERVICE_NAME}.error.log</string>
</dict>
</plist>
EOF

# 4. ПЕРЕЗАПУСК СЕРВИСА
# -----------------------------------------------------------------------------
print_info "Перезапуск сервиса '$SERVICE_NAME'..."
launchctl unload "$PLIST_FILE" 2>/dev/null
launchctl load "$PLIST_FILE" || print_error "Не удалось запустить сервис '$SERVICE_NAME'."

print_success "✅ Деплой и перезапуск сервиса успешно завершены!"
echo "Ваш токен был автоматически добавлен в конфигурацию сервиса."

