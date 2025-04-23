/*! For license information please see popup.js.LICENSE.txt */
(() => {
    "use strict";

    // =============================================
    // Configuration and Constants
    // =============================================
    const CONFIG = {
        version: "1.0.1",
        browserClient: chrome,
        selectors: {
            scriptButton: ".scriptButton",
            editButton: ".edit",
            addNewScriptButton: ".add-new-script",
            viewall: "#viewall",
            downloadScript: ".down-script"
        },
        scriptdb: "scriptdb",
        menuTitle: "Scripty",
        triggerType: {
            automatic: "a",
            manual: "m"
        },
        triggerValue: {
            pageload: "pageload",
            beforeload: "beforeload"
        }
    };

    // =============================================
    // URL Pattern Matcher Class
    // Handles URL pattern matching for script execution
    // =============================================
    class URLPatternMatcher {
        constructor(identifierType, matchType, identifier) {
            if (!(this instanceof URLPatternMatcher)) {
                throw new TypeError("Cannot call a class as a function");
            }
            this.identifierType = identifierType;
            this.matchType = matchType;
            this.identifier = identifier;
        }

        matchPattern(url, pattern) {
            const urlObj = new URL(url);
            const [protocol, ...rest] = pattern.split("://");
            const [host, ...pathParts] = rest.join("://").split("/");
            const path = "/" + pathParts.join("/");
            const urlProtocol = urlObj.protocol.slice(0, -1);

            return !(
                (protocol !== "*" && protocol !== urlProtocol) ||
                !new RegExp("^" + host.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$").test(urlObj.hostname) ||
                !new RegExp("^" + path.replace(/\*/g, ".*") + "$").test(urlObj.pathname)
            );
        }

        isValidPattern(pattern) {
            return /^(\*|https?|http|file):\/\/(\*|\*\.[^/*]+|[^/*]+)\/(.*)?$/.test(pattern);
        }

        generate() {
            const match = this.getMatch();
            return Array.isArray(match) ? match : [match];
        }

        getMatch() {
            switch (this.identifierType) {
                case "pattern":
                case "url":
                    return this.getMatchPattern();
                case "host":
                    return this.generateHostPattern();
                case "path":
                    return this.generatePathPattern();
                default:
                    throw new Error('Invalid identifier type. Must be "host", "path", or "pattern".');
            }
        }

        generateHostPattern() {
            if (this.matchType === "equals") {
                return `*://${this.identifier}/*`;
            }
            throw new Error("Invalid match type. Only equals is supported for host.");
        }

        generatePathPattern() {
            if (this.matchType === "equals") {
                const path = this.identifier.startsWith("/") ? this.identifier : `/${this.identifier}`;
                return `*://*${path}`;
            }
            if (this.matchType === "contains") {
                return `*://*/*${this.identifier}*`;
            }
            throw new Error('Invalid match type. Must be "equals" or "contains".');
        }

        generateUrlPattern() {
            if (this.matchType === "equals") {
                return `*://*/${this.identifier}`;
            }
            if (this.matchType === "contains") {
                return `*://*/*${this.identifier}*`;
            }
            throw new Error('Invalid match type. Must be "equals" or "contains".');
        }

        getMatchPattern() {
            return this.identifier
                .split(",")
                .map(part => part.trim())
                .filter(pattern => this.isValidPattern(pattern));
        }
    }

    // =============================================
    // Script Manager Class
    // Handles script registration, execution, and management
    // =============================================
    class ScriptManager {
        constructor() {
            if (!(this instanceof ScriptManager)) {
                throw new TypeError("Cannot call a class as a function");
            }
        }

        async createScript(script) {
            return this.saveScript(script);
        }

        async updateScript(script) {
            return this.saveScript(script);
        }

        async deleteScript(scriptId) {
            const isRegistered = await this.isScriptRegistered(scriptId);
            if (!isRegistered) return false;

            try {
                await CONFIG.browserClient.userScripts.unregister({ ids: [scriptId] });
                return true;
            } catch (error) {
                return false;
            }
        }

        async isScriptRegistered(scriptId) {
            try {
                const scripts = await CONFIG.browserClient.userScripts.getScripts({ ids: [scriptId] });
                return scripts.length !== 0;
            } catch (error) {
                return false;
            }
        }

        async saveScript(script) {
            try {
                const { id, filter, trigger, disable } = script;
                const isRegistered = await this.isScriptRegistered(id);

                if (disable) {
                    await this.deleteScript(id);
                    return script;
                }

                if (!isRegistered && !script.vrs) {
                    script.disable = true;
                    return script;
                }

                const matches = new URLPatternMatcher(
                    filter.identifier,
                    filter.condition,
                    filter.value
                ).generate();

                script.filter.matches = matches;

                let world = "MAIN";
                let runAt = "document_end";
                let scriptCode = this.handleScriptCode(script.script.value);

                const wrappedScript = `
                    window._scripty = window._scripty || {}; 
                    window._scripty["${id}"] = () => {
                        try {   
                            ${scriptCode}
                        } catch (e) {
                            console.error("Scripty: Error executing script: ${script.title}", e);
                        }
                    };
                `.replace(/\s+/g, " ").trim();

                if (trigger.type === CONFIG.triggerType.manual) {
                    world = "MAIN";
                    runAt = "document_end";
                } else if (trigger.type === CONFIG.triggerType.automatic) {
                    wrappedScript += `window._scripty["${id}"]()`;
                    runAt = trigger.value === CONFIG.triggerValue.beforeload ? "document_start" : "document_end";
                }

                const scriptConfig = {
                    id,
                    matches,
                    world,
                    runAt,
                    js: [{ code: wrappedScript }]
                };

                if (isRegistered) {
                    await CONFIG.browserClient.userScripts.update([scriptConfig]);
                } else {
                    await CONFIG.browserClient.userScripts.register([scriptConfig]);
                }

                script.vrs = 2;
                return script;
            } catch (error) {
                console.error("Error saving script", error);
                return null;
            }
        }

        handleScriptCode(code) {
            return code
                .replace(/<!--[\s\S]*?-->/g, "")
                .replace(/(^|\s)\/\/[^\n]*/gm, "$1")
                .replace(/\/\*[\s\S]*?\*\//g, "")
                .replace(/^\s*[\r\n]/gm, "");
        }

        getScriptsForCurrentUrl(url, scripts, options = { type: CONFIG.triggerType.manual }) {
            if (!Array.isArray(scripts)) return [];
            if (!url.length) return [];

            const urlObj = new URL(url);
            if (urlObj.origin.includes("chrome://")) return [];

            return scripts.filter(script => {
                if (script.disable) return false;
                if (script.trigger.type !== options.type && options.type !== "all") return false;
                if (options.type === CONFIG.triggerType.automatic && options.value !== script.trigger.value) return false;

                if (script.filter.value === "all" || script.filter.value === "") return true;

                let valueToMatch;
                if (["pattern", "path", "host"].includes(script.filter.identifier)) {
                    return (script.filter.matches || []).some(match => 
                        new URLPatternMatcher().matchPattern(url, match)
                    );
                }

                switch (script.filter.identifier) {
                    case "url":
                        valueToMatch = urlObj.href;
                        break;
                    case "path":
                        valueToMatch = urlObj.pathname;
                        break;
                    case "host":
                        valueToMatch = urlObj.hostname;
                        break;
                }

                switch (script.filter.condition) {
                    case "contains":
                        return valueToMatch.includes(script.filter.value);
                    case "equals":
                        return valueToMatch === script.filter.value;
                    case "regex":
                        const flags = script.filter.value.replace(/.*\/([gimy]*)$/, "$1");
                        const pattern = script.filter.value.replace(new RegExp("^/(.*?)/" + flags + "$"), "$1");
                        return new RegExp(pattern, flags).test(valueToMatch);
                    default:
                        return false;
                }
            });
        }

        getScriptById(scripts, id) {
            return scripts.find(script => script.id === id);
        }

        handleScriptRun(scripts, scriptId, tabId, script = null) {
            if (!script) {
                script = this.getScriptById(scripts, scriptId);
            }

            if (script && typeof script === "object") {
                CONFIG.browserClient.scripting.executeScript({
                    target: { tabId },
                    func: scriptId => {
                        if (typeof window._scripty?.[scriptId] === "function") {
                            window._scripty[scriptId]();
                        } else {
                            console.error(`Scripty: Script "${scriptId}" could not be executed.

This could be because:
1. There might be syntax errors in the script
2. The script might have been disabled or deleted
3. Try reloading the page
4. Semicolons might be missing in the script

Please check the script and try again.`);
                        }
                    },
                    world: "MAIN",
                    args: [scriptId]
                }, error => {
                    if (error) {
                        console.error(CONFIG.browserClient.runtime.lastError);
                    }
                });
            }
        }
    }

    // =============================================
    // Popup UI Class
    // Handles the popup interface and user interactions
    // =============================================
    class PopupUI {
        constructor() {
            if (!(this instanceof PopupUI)) {
                throw new TypeError("Cannot call a class as a function");
            }
            this.currentTab = {};
            this.tabId = -1;
            this.scriptArray = [];
        }

        setTabConfig(tab) {
            this.currentTab = tab;
            this.tabId = tab.id;
        }

        setScriptArray(scripts) {
            this.scriptArray = scripts;
        }

        renderScriptList() {
            const listElement = document.querySelector("#list");
            const scripts = new ScriptManager().getScriptsForCurrentUrl(
                this.currentTab.url,
                this.scriptArray,
                { type: "all" }
            );

            const scriptButtons = scripts.map(script => this.getPopupScriptButton(script)).join("");
            
            if (scripts.length !== 0) {
                document.querySelector(".no-script-fallback").classList.add("bottomfix");
            }
            
            listElement.innerHTML = scriptButtons;
        }

        getPopupScriptButton(script) {
            const triggerType = script.trigger.type;
            return `
                <div class="script-item">
                    <div class="play-wrap scriptButton" data-sid="${script.id}">
                        <svg class="play" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                            <path d="M2.93 17.07A10 10 0 1 1 17.07 2.93 10 10 0 0 1 2.93 17.07zm12.73-1.41A8 8 0 1 0 4.34 4.34a8 8 0 0 0 11.32 11.32zM7 6l8 4-8 4V6z"/>
                        </svg>
                        <div class="title">${script.title}</div>
                    </div>
                    <span class="mode ${triggerType}" title="Triggers ${triggerType ? "Manually" : "Automatically"}">
                        ${triggerType}
                    </span>
                    <svg class="edit" data-sid="${script.id}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                        <path d="M12.3 3.7l4 4L4 20H0v-4L12.3 3.7zm1.4-1.4L16 0l4 4-2.3 2.3-4-4z"/>
                    </svg>
                </div>
            `;
        }

        events() {
            const scriptManager = new ScriptManager();
            document.querySelector("#popupRoot").addEventListener("click", event => {
                const target = event.target;
                
                if (target.matches(CONFIG.selectors.scriptButton)) {
                    scriptManager.handleScriptRun(this.scriptArray, target.dataset.sid, this.tabId);
                } else if (target.matches(CONFIG.selectors.editButton)) {
                    CONFIG.browserClient.runtime.openOptionsPage();
                } else if (target.matches(CONFIG.selectors.addNewScriptButton)) {
                    CONFIG.browserClient.runtime.openOptionsPage();
                } else if (target.matches(CONFIG.selectors.viewall)) {
                    CONFIG.browserClient.runtime.openOptionsPage();
                } else if (target.matches(CONFIG.selectors.downloadScript)) {
                    CONFIG.browserClient.runtime.openOptionsPage();
                }
            });
        }

        init() {
            this.renderScriptList();
            this.events();
        }
    }

    // =============================================
    // Initialize popup when DOM is loaded
    // =============================================
    window.addEventListener("DOMContentLoaded", () => {
        const popup = new PopupUI();
        CONFIG.browserClient.runtime.sendMessage(
            { action: "getScriptListFromStorage" },
            scripts => {
                popup.setScriptArray(scripts);
                CONFIG.browserClient.tabs.query(
                    { active: true, currentWindow: true },
                    tabs => {
                        popup.setTabConfig(tabs[0]);
                        popup.init();
                    }
                );
            }
        );
    });
})();