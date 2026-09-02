// ==UserScript==
// @name         GitHub Promote Button
// @namespace    http://tampermonkey.net/
// @version      0.9
// @description  Adds a button to trigger a promotion workflow from a GitHub repo page.
// @author       You
// @match        https://github.com/y-tree-limited/**
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    const BUTTON_ID = 'promote-button-container';

    function setText(textElement, value) {
        if (!textElement) return;
        textElement.textContent = value;
    }

    function createButton() {
        const buttonElement = document.createElement('button');
        buttonElement.id = BUTTON_ID;
        buttonElement.type = 'button';
        Object.assign(buttonElement.style, {
            position: 'absolute',
            top: '60px',
            right: '10px',
            zIndex: '9999',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 12px',
            font: 'inherit',
            fontSize: '14px',
            lineHeight: '20px',
            color: 'inherit',
            background: 'transparent',
            border: '1px solid rgba(31,35,40,0.15)',
            borderRadius: '6px',
            cursor: 'pointer'
        });

        const icon = document.createElement('span');
        icon.textContent = '🚀';
        buttonElement.append(icon);

        const buttonText = document.createElement('span');
        buttonElement.append(buttonText);

        return { buttonElement, buttonText };
    }

    function initPromoteButton() {
        if (document.getElementById(BUTTON_ID)) return;

        const repoNameMatch = window.location.pathname.match(/^\/([^/]+)\/([^/]+)/);
        const repoName = repoNameMatch ? `${repoNameMatch[1]}/${repoNameMatch[2]}` : '';
        if (!repoName) return; // Not on a repo page, skip initialization

        const { buttonElement, buttonText } = createButton();
        setText(buttonText, 'Check Preprod Version');

        // Handler for the second click, which runs the promotion.
        const handlePromoteClick = () => {
            if (buttonElement.style.pointerEvents === 'none') return;
            if (!confirm(`Are you sure you want to start the promotion for "${repoName}"?`)) return;

            const originalText = buttonText.textContent;
            setText(buttonText, "Promoting...");
            buttonElement.style.pointerEvents = 'none';

            GM_xmlhttpRequest({
                method: 'POST',
                url: 'http://localhost:9001/trigger-workflow',
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ repository: repoName }),
                onload: function(response) {
                    try {
                        const result = JSON.parse(response.responseText);
                        if (response.status >= 200 && response.status < 300) {
                            new Notification('GitHub Promote', { body: `✅ Promotion for ${repoName} has been successfully started.` });
                            setText(buttonText, "Done!");
                            setTimeout(() => { window.location.reload(); }, 2000);
                        } else {
                            throw new Error(result.message || "Unknown server error");
                        }
                    } catch (e) {
                        new Notification('GitHub Promote', { body: `❌ Error: ${e.message}` });
                        setText(buttonText, originalText);
                        buttonElement.style.pointerEvents = 'auto';
                    }
                },
                onerror: function(response) {
                    new Notification('GitHub Promote', { body: `❌ Critical Error: Could not connect to the local server.` });
                    setText(buttonText, originalText);
                    buttonElement.style.pointerEvents = 'auto';
                }
            });
        };

        // Handler for the first click, which checks the versions.
        const handleCheckVersionClick = () => {
            setText(buttonText, "Checking...");
            buttonElement.style.pointerEvents = 'none'; // Disable while checking

            GM_xmlhttpRequest({
                method: "GET",
                url: `http://localhost:9001/get-version-info?repo=${repoName}`,
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        const current = data.current;
                        const latest = data.latest;

                        if (current && latest && current.toLowerCase() !== 'n/a' && latest.toLowerCase() !== 'n/a') {
                            if (current === latest) {
                                setText(buttonText, `Up to date (${latest})`);
                                buttonElement.style.color = '#2da44e';
                                buttonElement.style.pointerEvents = 'none'; // Keep disabled
                                buttonElement.title = 'The current version on preprod matches the latest available release.';
                            } else {
                                setText(buttonText, `Promote ${latest} (pre: ${current})`);
                                buttonElement.style.pointerEvents = 'auto'; // Re-enable for promote click
                                buttonElement.onclick = handlePromoteClick; // Re-assign click handler
                            }
                        } else {
                            setText(buttonText, 'Error: No version info');
                            buttonElement.style.color = '#cf222e'; // Red color for error
                            buttonElement.style.pointerEvents = 'none';
                        }
                    } catch (e) {
                        console.error("Error parsing version info:", e);
                        setText(buttonText, 'Error: Parse failed');
                        buttonElement.style.color = '#cf222e';
                        buttonElement.style.pointerEvents = 'none';
                    }
                },
                onerror: function(response) {
                    console.error("Error requesting version info:", response);
                    setText(buttonText, 'Error: Request failed');
                    buttonElement.style.color = '#cf222e';
                    buttonElement.style.pointerEvents = 'none';
                }
            });
        };

        // Assign the initial click handler
        buttonElement.onclick = handleCheckVersionClick;

        document.body.append(buttonElement);
    }

    // This observer is critical for navigating GitHub without full page reloads (PJAX)
    let debounce;
    const observer = new MutationObserver(() => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            initPromoteButton();
        }, 100);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Initial call for the first page load
    initPromoteButton();

})();
