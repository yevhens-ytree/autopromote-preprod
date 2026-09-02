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

    const NAV_SELECTORS = [
        'nav[aria-label="Repository"] ul[role="list"]',
        'nav.UnderlineNav ul.UnderlineNav-body',
        'ul.UnderlineNav-body'
    ];

    function isVisible(element) {
        return element.offsetParent !== null || element.getClientRects().length > 0;
    }

    function findNavBar() {
        const candidates = NAV_SELECTORS.flatMap(selector => Array.from(document.querySelectorAll(selector)));
        return candidates.find(isVisible) || candidates[0] || null;
    }

    function findTemplateItem(navBar) {
        const items = Array.from(navBar.children).filter(item =>
            item.tagName === 'LI' &&
            item.id !== 'promote-button-container' &&
            !item.classList.contains('demoted')
        );
        return items[items.length - 1] || null;
    }

    function setIcon(buttonElement) {
        const iconEl = buttonElement.querySelector('[data-component="icon"], svg.octicon');
        if (!iconEl) return;

        if (iconEl.tagName.toLowerCase() === 'svg') {
            const span = document.createElement('span');
            span.className = (iconEl.getAttribute('class') || '')
                .split(/\s+/)
                .filter(cls => cls && cls !== 'octicon' && !cls.startsWith('octicon-'))
                .join(' ');
            span.textContent = '🚀';
            iconEl.replaceWith(span);
            return;
        }

        iconEl.innerHTML = '🚀';
    }

    function findTextElement(buttonElement) {
        return buttonElement.querySelector('[data-component="text"], span[data-content]');
    }

    function setText(textElement, value) {
        if (!textElement) return;
        textElement.textContent = value;
        if (textElement.hasAttribute('data-content')) textElement.setAttribute('data-content', value);
    }

    function initPromoteButton() {
        const navBar = findNavBar();
        if (!navBar) return;

        if (document.getElementById('promote-button-container')) return;

        const repoNameMatch = window.location.pathname.match(/^\/([^/]+)\/([^/]+)/);
        const repoName = repoNameMatch ? `${repoNameMatch[1]}/${repoNameMatch[2]}` : '';
        if (!repoName) return; // Not on a repo page, skip initialization

        const templateItem = findTemplateItem(navBar);
        if (!templateItem) return;

        const listItem = templateItem.cloneNode(true);
        listItem.id = 'promote-button-container';

        const buttonElement = listItem.querySelector('a');
        if (!buttonElement) return;

        buttonElement.href = '#';
        buttonElement.removeAttribute('id');
        buttonElement.removeAttribute('aria-current');
        buttonElement.removeAttribute('aria-labelledby');
        buttonElement.classList.remove('selected');
        buttonElement.dataset.reactNav = '';
        buttonElement.dataset.turboFrame = '';

        setIcon(buttonElement);

        const buttonText = findTextElement(buttonElement);
        if (!buttonText) return;
        buttonText.classList.remove('d-none');
        setText(buttonText, 'Check Preprod Version');

        const counter = buttonElement.querySelector('[data-component="counter"], .Counter');
        if (counter) counter.remove();

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
                                listItem.title = 'The current version on preprod matches the latest available release.';
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
