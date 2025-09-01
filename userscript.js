// ==UserScript==
// @name         GitHub Promote Button
// @namespace    http://tampermonkey.net/
// @version      0.8
// @description  Adds a button to trigger a promotion workflow from a GitHub repo page.
// @author       You
// @match        https://github.com/*/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    function initPromoteButton() {
        const navBar = document.querySelector('nav.js-repo-nav ul.UnderlineNav-body');
        if (!navBar) return;

        if (document.getElementById('promote-button-container')) return;

        const repoName = window.location.pathname.substring(1);

        const listItem = document.createElement('li');
        listItem.id = 'promote-button-container';
        listItem.className = 'd-inline-flex';

        const buttonElement = document.createElement('a');
        buttonElement.className = 'UnderlineNav-item no-wrap js-responsive-underlinenav-item';
        buttonElement.style.cursor = 'pointer';
        buttonElement.innerHTML = `
            <span class="UnderlineNav-octicon d-none d-sm-inline" style="margin-right: 4px;">🚀</span>
            <span class="button-text-container">Check Preprod Version</span>
        `;
        const buttonText = buttonElement.querySelector('.button-text-container');
        listItem.appendChild(buttonElement);

        // Handler for the second click, which runs the promotion.
        const handlePromoteClick = () => {
            if (buttonElement.style.pointerEvents === 'none') return;
            if (!confirm(`Are you sure you want to start the promotion for "${repoName}"?`)) return;

            const originalText = buttonText.textContent;
            buttonText.textContent = "Promoting...";
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
                            buttonText.textContent = "Done!";
                            setTimeout(() => { window.location.reload(); }, 2000);
                        } else {
                            throw new Error(result.message || "Unknown server error");
                        }
                    } catch (e) {
                        new Notification('GitHub Promote', { body: `❌ Error: ${e.message}` });
                        buttonText.textContent = originalText;
                        buttonElement.style.pointerEvents = 'auto';
                    }
                },
                onerror: function(response) {
                    new Notification('GitHub Promote', { body: `❌ Critical Error: Could not connect to the local server.` });
                    buttonText.textContent = originalText;
                    buttonElement.style.pointerEvents = 'auto';
                }
            });
        };

        // Handler for the first click, which checks the versions.
        const handleCheckVersionClick = () => {
            buttonText.textContent = "Checking...";
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
                                buttonText.textContent = `Up to date (${latest})`;
                                buttonElement.style.color = '#2da44e';
                                buttonElement.style.pointerEvents = 'none'; // Keep disabled
                                listItem.title = 'The current version on preprod matches the latest available release.';
                            } else {
                                buttonText.textContent = `Promote ${latest} (pre: ${current})`;
                                buttonElement.style.pointerEvents = 'auto'; // Re-enable for promote click
                                buttonElement.onclick = handlePromoteClick; // Re-assign click handler
                            }
                        } else {
                            buttonText.textContent = 'Error: No version info';
                            buttonElement.style.color = '#cf222e'; // Red color for error
                            buttonElement.style.pointerEvents = 'none';
                        }
                    } catch (e) {
                        console.error("Error parsing version info:", e);
                        buttonText.textContent = 'Error: Parse failed';
                        buttonElement.style.color = '#cf222e';
                        buttonElement.style.pointerEvents = 'none';
                    }
                },
                onerror: function(response) {
                    console.error("Error requesting version info:", response);
                    buttonText.textContent = 'Error: Request failed';
                    buttonElement.style.color = '#cf222e';
                    buttonElement.style.pointerEvents = 'none';
                }
            });
        };

        // Assign the initial click handler
        buttonElement.onclick = handleCheckVersionClick;

        navBar.append(listItem);
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

