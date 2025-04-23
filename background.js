/*! For license information please see background.js.LICENSE.txt */
(() => {
    "use strict";

    const CONFIG = {
        version: "1.0.1",
        browserClient: chrome,
        scriptStorageKey: "script_",
        triggerType: {
            automatic: "a",
            manual: "m"
        },
        triggerValue: {
            pageload: "pageload",
            beforeload: "beforeload"
        }
    };

    // Import URLPatternMatcher from utils.js
    importScripts('utils.js');

    class ScriptManager {
        constructor() {
            this.scripts = [];
            this.init();
        }

        async init() {
            await this.loadScripts();
            this.setupMessageListeners();
            this.setupTabListener();
        }

        async loadScripts() {
            const result = await CONFIG.browserClient.storage.local.get(null);
            this.scripts = Object.values(result).filter(item => item.id && item.id.startsWith('script_'));
            await this.registerAllScripts();
        }

        async registerAllScripts() {
            for (const script of this.scripts) {
                if (!script.disable) {
                    await this.registerScript(script);
                }
            }
        }

        async registerScript(script) {
            try {
                const matches = new URLPatternMatcher(
                    script.filter.identifier,
                    script.filter.condition,
                    script.filter.value
                ).generate();

                script.filter.matches = matches;

                let world = "MAIN";
                let runAt = "document_end";
                let scriptCode = this.handleScriptCode(script.script.value);

                const wrappedScript = `
                    window._scripty = window._scripty || {}; 
                    window._scripty["${script.id}"] = () => {
                        try {   
                            ${scriptCode}
                        } catch (e) {
                            console.error("Scripty: Error executing script: ${script.title}", e);
                        }
                    };
                `.replace(/\s+/g, " ").trim();

                if (script.trigger.type === CONFIG.triggerType.automatic) {
                    wrappedScript += `window._scripty["${script.id}"]()`;
                    runAt = script.trigger.value === CONFIG.triggerValue.beforeload ? "document_start" : "document_end";
                }

                const scriptConfig = {
                    id: script.id,
                    matches,
                    world,
                    runAt,
                    js: [{ code: wrappedScript }]
                };

                const isRegistered = await this.isScriptRegistered(script.id);
                if (isRegistered) {
                    await CONFIG.browserClient.userScripts.update([scriptConfig]);
                } else {
                    await CONFIG.browserClient.userScripts.register([scriptConfig]);
                }

                return true;
            } catch (error) {
                console.error("Error registering script:", error);
                return false;
            }
        }

        async unregisterScript(scriptId) {
            try {
                await CONFIG.browserClient.userScripts.unregister({ ids: [scriptId] });
                return true;
            } catch (error) {
                console.error("Error unregistering script:", error);
                return false;
            }
        }

        setupMessageListeners() {
            CONFIG.browserClient.runtime.onMessage.addListener((message, sender, sendResponse) => {
                switch (message.action) {
                    case "getScriptListFromStorage":
                        sendResponse(this.scripts);
                        break;
                    case "createScript":
                        this.createScript(message.script).then(sendResponse);
                        return true;
                    case "updateScript":
                        this.updateScript(message.script).then(sendResponse);
                        return true;
                    case "deleteScript":
                        this.deleteScript(message.scriptId).then(sendResponse);
                        return true;
                    case "executeScript":
                        this.executeScript(message.scriptId, sender.tab.id).then(sendResponse);
                        return true;
                }
            });
        }

        async createScript(script) {
            await this.registerScript(script);
            this.scripts.push(script);
            await CONFIG.browserClient.storage.local.set({ [script.id]: script });
            this.notifyPopupUpdate();
            return script;
        }

        async updateScript(script) {
            await this.registerScript(script);
            const index = this.scripts.findIndex(s => s.id === script.id);
            if (index !== -1) {
                this.scripts[index] = script;
            }
            await CONFIG.browserClient.storage.local.set({ [script.id]: script });
            this.notifyPopupUpdate();
            return script;
        }

        async deleteScript(scriptId) {
            await this.unregisterScript(scriptId);
            this.scripts = this.scripts.filter(s => s.id !== scriptId);
            await CONFIG.browserClient.storage.local.remove(scriptId);
            this.notifyPopupUpdate();
            return true;
        }

        notifyPopupUpdate() {
            // Notify all popup windows to update
            CONFIG.browserClient.runtime.sendMessage({ action: "scriptsUpdated" });
        }

        setupTabListener() {
            CONFIG.browserClient.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
                if (changeInfo.status === "complete") {
                    const matchingScripts = this.scripts.filter(script => 
                        !script.disable && 
                        script.trigger.type === CONFIG.triggerType.automatic &&
                        script.filter.matches &&
                        script.filter.matches.some(match => 
                            new URLPatternMatcher().matchPattern(tab.url, match)
                        )
                    );

                    for (const script of matchingScripts) {
                        try {
                            await CONFIG.browserClient.scripting.executeScript({
                                target: { tabId },
                                func: scriptId => {
                                    if (typeof window._scripty?.[scriptId] === "function") {
                                        window._scripty[scriptId]();
                                    }
                                },
                                world: "MAIN",
                                args: [script.id]
                            });
                        } catch (error) {
                            console.error(`Failed to execute script ${script.id} on tab ${tabId}:`, error);
                        }
                    }
                }
            });
        }

        async executeScript(scriptId, tabId) {
            try {
                const script = this.scripts.find(s => s.id === scriptId);
                if (!script || script.disable) {
                    return { success: false, error: "Script not found or disabled" };
                }

                await CONFIG.browserClient.scripting.executeScript({
                    target: { tabId },
                    func: scriptId => {
                        if (typeof window._scripty?.[scriptId] === "function") {
                            window._scripty[scriptId]();
                        } else {
                            console.error(`Scripty: Script "${scriptId}" could not be executed.`);
                        }
                    },
                    world: "MAIN",
                    args: [scriptId]
                });

                return { success: true };
            } catch (error) {
                console.error(`Failed to execute script ${scriptId}:`, error);
                return { success: false, error };
            }
        }
    }

    // Initialize the script manager
    new ScriptManager();
})();