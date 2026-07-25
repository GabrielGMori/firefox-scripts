// ==UserScript==
// @name            Chat Buttons
// @include         main
// @author          Mori
// @onlyonce
// ==/UserScript==

(function () {
    'use strict';

    const BUTTONS = [
        {
            id: 'chatgpt-launcher-button',
            label: 'ChatGPT',
            icon: 'https://chatgpt.com/cdn/assets/favicon-l4nq08hd.svg',
            url: 'https://chatgpt.com/'
        },
        {
            id: 'claude-launcher-button',
            label: 'Claude',
            icon: 'https://claude.ai/favicon.ico',
            url: 'https://claude.ai/'
        },
        {
            id: 'gemini-launcher-button',
            label: 'Gemini',
            icon: 'https://www.gstatic.com/lamda/images/gemini_sparkle_aurora_33f86dc0c0257da337c63.svg',
            url: 'https://gemini.google.com/'
        }
    ];

    let overlays = {};

    function getOverlayContainer() {
        let container = document.getElementById('chat-launcher-overlay-container');
        if (container) return container;

        let host = document.getElementById('appcontent')
            || document.getElementById('tabbrowser-tabbox')
            || document.getElementById('browser');

        if (!host) {
            console.warn('[Chat Buttons] Could not find a content host element to overlay.');
            return null;
        }

        container = document.createXULElement('box');
        container.id = 'chat-launcher-overlay-container';
        container.style.setProperty('position', 'absolute');
        container.style.setProperty('top', '0');
        container.style.setProperty('left', '0');
        container.style.setProperty('right', '0');
        container.style.setProperty('bottom', '0');
        container.style.setProperty('z-index', '10');
        container.style.setProperty('display', 'none');
        container.style.setProperty('background', '-moz-Field');

        host.style.setProperty('position', 'relative');
        host.appendChild(container);
        return container;
    }

    function getOverlayBrowser(def) {
        if (overlays[def.id]) return overlays[def.id];

        let container = getOverlayContainer();
        if (!container) return null;

        let browserEl = document.createXULElement('browser');
        browserEl.id = `chat-launcher-browser-${def.id}`;
        browserEl.setAttribute('type', 'content');
        browserEl.setAttribute('remote', 'true');
        browserEl.setAttribute('maychangeremoteness', 'true');
        browserEl.setAttribute('src', def.url);
        browserEl.style.setProperty('width', '100%');
        browserEl.style.setProperty('height', '100%');
        browserEl.style.setProperty('display', 'none');

        container.appendChild(browserEl);
        overlays[def.id] = browserEl;
        return browserEl;
    }

    let hiddenTabAttrs = null;

    function hideRealTabSelectionVisual() {
        let tab = gBrowser.selectedTab;
        if (!tab || hiddenTabAttrs) return;
        hiddenTabAttrs = {
            tab,
            visuallyselected: tab.getAttribute('visuallyselected'),
            selected: tab.getAttribute('selected')
        };
        tab.removeAttribute('visuallyselected');
        tab.removeAttribute('selected');
    }

    function restoreRealTabSelectionVisual() {
        if (!hiddenTabAttrs) return;
        let { tab, visuallyselected, selected } = hiddenTabAttrs;
        if (visuallyselected !== null) tab.setAttribute('visuallyselected', visuallyselected);
        if (selected !== null) tab.setAttribute('selected', selected);
        hiddenTabAttrs = null;
    }

    function selectButton(activeId) {
        for (let def of BUTTONS) {
            let btn = document.getElementById(def.id);
            if (btn) btn.toggleAttribute('selected', def.id === activeId);
        }
    }

    function hideAllOverlays() {
        let container = document.getElementById('chat-launcher-overlay-container');
        if (container) container.style.setProperty('display', 'none');
        for (let key in overlays) {
            overlays[key].style.setProperty('display', 'none');
        }
        selectButton(null);
        document.documentElement.removeAttribute('chat-launcher-overlay-active');
        restoreRealTabSelectionVisual();
    }

    function showOverlay(def) {
        let browserEl = getOverlayBrowser(def);
        let container = getOverlayContainer();
        if (!browserEl || !container) return;

        if (document.documentElement.getAttribute('chat-launcher-overlay-active') === 'true' &&
            document.getElementById(def.id)?.hasAttribute('selected')) {
            try {
                browserEl.reload();
            } catch (e) {
                console.warn('[Chat Buttons] Failed to reload overlay browser', e);
            }
            return;
        }

        for (let key in overlays) {
            overlays[key].style.setProperty('display', key === def.id ? 'flex' : 'none');
        }
        container.style.setProperty('display', 'block');
        selectButton(def.id);
        document.documentElement.setAttribute('chat-launcher-overlay-active', 'true');
        hideRealTabSelectionVisual();
    }

    function createButton(def) {
        let btn = document.createXULElement('toolbarbutton');
        btn.id = def.id;
        btn.setAttribute('tooltiptext', def.label);
        btn.className = 'chat-launcher-button';

        btn.style.setProperty('list-style-image', `url("${def.icon}")`);
        btn.style.setProperty('-moz-appearance', 'none', 'important');
        btn.style.setProperty('appearance', 'none', 'important');

        let img = document.createElement('img');
        img.src = def.icon;
        img.style.width = '20px';
        img.style.height = '20px';
        btn.style.setProperty('padding', '5px');
        btn.appendChild(img);

        btn.addEventListener('command', () => showOverlay(def));

        return btn;
    }

    function init() {
        if (document.getElementById(BUTTONS[0].id)) return; // already injected

        let buttonBox = document.getElementById('titlebar-buttonbox');
        let minBtn = document.getElementById('titlebar-min');

        if (buttonBox && minBtn) {
            for (let def of BUTTONS) {
                buttonBox.insertBefore(createButton(def), minBtn);
            }
            initTabSelectListener();
            return;
        }

        let tabsToolbar = document.getElementById('TabsToolbar');
        if (!tabsToolbar) {
            console.warn('[Chat Buttons] No titlebar-buttonbox and no #TabsToolbar found; skipping init.');
            return;
        }

        let container = document.createXULElement('hbox');
        container.id = 'chat-launcher-buttonbox';
        for (let def of BUTTONS) {
            container.appendChild(createButton(def));
        }
        tabsToolbar.appendChild(container);
        initTabSelectListener();
    }

    function initTabSelectListener() {
        function hideOverlayIfActive() {
            if (hiddenTabAttrs) {
                hideAllOverlays();
            }
        }

        // Only an explicit interaction with a real tab means "I want to
        // leave the chat overlay." We use mousedown (not click) because
        // Firefox switches tab selection on mousedown internally - using
        // capture-phase mousedown guarantees our restore runs BEFORE
        // Firefox's own selection switch, avoiding a race where we'd
        // restore attributes onto a tab that's no longer the real
        // selected tab (which left both the old and new tab looking
        // selected at once).
        gBrowser.tabContainer.addEventListener('mousedown', (event) => {
            if (event.target.closest('tab')) {
                hideAllOverlays();
            }
        }, true);

        // TabSelect is Firefox's authoritative signal that the selected tab
        // changed. Use it as a catch-all for keyboard/tab strip selection
        // changes, but guard against the double-select bug by only reacting
        // when the overlay is currently active.
        gBrowser.tabContainer.addEventListener('TabSelect', hideOverlayIfActive);

        // Navigating from the URL bar can change the visible page without
        // triggering a tab selection event, so also hide overlays when the
        // URL bar receives focus.
        let urlbar = document.getElementById('urlbar') || document.getElementById('urlbar-input');
        if (urlbar) {
            urlbar.addEventListener('focus', hideOverlayIfActive, true);
        }
    }

    if (gBrowserInit.delayedStartupFinished) {
        init();
    } else {
        let delayedListener = (subject, topic) => {
            if (topic === 'browser-delayed-startup-finished' && subject === window) {
                Services.obs.removeObserver(delayedListener, topic);
                init();
            }
        };
        Services.obs.addObserver(delayedListener, 'browser-delayed-startup-finished');
    }
})();