//TOTO use octokit
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

const PORT = 9001;

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // --- ОБНОВЛЕННЫЙ ОБРАБОТЧИК ДЛЯ ПОЛУЧЕНИЯ ИНФОРМАЦИИ О ВЕРСИЯХ ---
    if (req.url.startsWith('/get-version-info') && req.method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const repoName = url.searchParams.get('repo');

        if (!repoName) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Параметр 'repo' отсутствует" }));
            return;
        }

        const scriptPath = path.join(os.homedir(), 'bin', 'get-version-info.sh');
        const child = spawn('/bin/bash', [scriptPath, repoName]);

        let versionInfo = '';
        child.stdout.on('data', (data) => {
            versionInfo += data.toString().trim();
        });

        child.on('close', (code) => {
            if (code === 0 && versionInfo) {
                console.log(`[SERVER] Инфо для ${repoName}: ${versionInfo}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(versionInfo); // Скрипт уже отдает готовый JSON
            } else {
                console.error(`[SERVER] Ошибка получения инфо о версиях для ${repoName}. Код: ${code}`);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: "Не удалось получить инфо о версиях" }));
            }
        });
        return;
    }

    // --- СУЩЕСТВУЮЩИЙ ОБРАБОТЧИК ДЛЯ ЗАПУСКА ПРОМОУШЕНА ---
    if (req.url === '/trigger-workflow' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const repoName = data.repository;
                if (!repoName) throw new Error("Имя репозитория не было предоставлено.");

                console.log(`[SERVER] Запрос на промоушен для ${repoName}. Запускаю скрипт...`);
                const scriptPath = path.join(os.homedir(), 'bin', 'promote-preprod.sh');
                const child = spawn('/bin/bash', [scriptPath, repoName]);
                let fullLog = '';

                child.stdout.on('data', (data) => {
                    const logLine = data.toString();
                    console.log(`[SCRIPT STDOUT] ${logLine.trim()}`);
                    fullLog += logLine;
                });
                child.stderr.on('data', (data) => {
                    const errorLine = data.toString();
                    console.error(`[SCRIPT STDERR] ${errorLine.trim()}`);
                    fullLog += errorLine;
                });
                child.on('close', (code) => {
                    if (code === 0) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ status: 'success', message: fullLog }));
                    } else {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ status: 'error', message: fullLog }));
                    }
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'error', message: e.message }));
            }
        });
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', message: 'Endpoint не найден.' }));
});

server.listen(PORT, () => {
    console.log(`Сервер на Node.js запущен на порту ${PORT}. Ожидание запросов...`);
});

