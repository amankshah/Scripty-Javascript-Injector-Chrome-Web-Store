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
            // Load existing scripts
            await this.loadScripts();
            
            // Register message listeners
            this.setupMessageListeners();
            
            // Set up tab update listener
            this.setupTabListener();
        }

        async loadScripts() {
            const result = await CONFIG.browserClient.storage.local.get(null);
            this.scripts = Object.values(result).filter(item => 
                item.id && item.id.startsWith(CONFIG.scriptStorageKey)
            );
            
            // Register all scripts
            for (const script of this.scripts) {
                if (!script.disable) {
                    await this.registerScript(script);
                }
            }
        }

        async registerScript(script) {
            try {
                const { id, filter, trigger, script: scriptContent } = script;
                
                // Generate match patterns
                const matches = new URLPatternMatcher(
                    filter.identifier,
                    filter.condition,
                    filter.value
                ).generate();

                // Store matches in the script object
                script.filter.matches = matches;

                // Prepare script code
                const wrappedScript = `
                    window._scripty = window._scripty || {}; 
                    window._scripty["${id}"] = () => {
                        try {   
                            ${scriptContent.value}
                        } catch (e) {
                            console.error("Scripty: Error executing script: ${script.title}", e);
                        }
                    };
                `.replace(/\s+/g, " ").trim();

                // Configure script registration
                const scriptConfig = {
                    id,
                    matches,
                    world: "MAIN",
                    runAt: "document_end",
                    js: [{ code: wrappedScript }]
                };

                // Register or update the script
                try {
                    await CONFIG.browserClient.userScripts.register([scriptConfig]);
                } catch (error) {
                    // If script exists, update it
                    await CONFIG.browserClient.userScripts.update([scriptConfig]);
                }

                // If automatic trigger, add execution code
                if (trigger.type === CONFIG.triggerType.automatic) {
                    const executeScript = {
                        target: { allFrames: true },
                        func: scriptId => {
                            if (typeof window._scripty?.[scriptId] === "function") {
                                window._scripty[scriptId]();
                            }
                        },
                        world: "MAIN",
                        args: [id]
                    };

                    // Execute on matching tabs
                    const tabs = await CONFIG.browserClient.tabs.query({});
                    for (const tab of tabs) {
                        if (matches.some(match => 
                            new URLPatternMatcher().matchPattern(tab.url, match)
                        )) {
                            try {
                                await CONFIG.browserClient.scripting.executeScript({
                                    ...executeScript,
                                    target: { tabId: tab.id }
                                });
                            } catch (error) {
                                console.error(`Failed to execute script on tab ${tab.id}:`, error);
                            }
                        }
                    }
                }

                return true;
            } catch (error) {
                console.error("Error registering script:", error);
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
                    case "updateScript":
                        this.saveScript(message.data)
                            .then(sendResponse)
                            .catch(error => sendResponse({ success: false, error }));
                        return true;
                    
                    case "deleteScript":
                        this.deleteScript(message.id)
                            .then(sendResponse)
                            .catch(error => sendResponse({ success: false, error }));
                        return true;

                    case "executeScript":
                        this.executeScript(message.scriptId, message.tabId)
                            .then(sendResponse)
                            .catch(error => sendResponse({ success: false, error }));
                        return true;
                }
            });
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

        async saveScript(script) {
            try {
                const success = await this.registerScript(script);
                if (success) {
                    await CONFIG.browserClient.storage.local.set({ [script.id]: script });
                    this.scripts = this.scripts.filter(s => s.id !== script.id);
                    this.scripts.push(script);
                    return { success: true, script };
                }
                return { success: false, error: "Failed to register script" };
            } catch (error) {
                return { success: false, error };
            }
        }

        async deleteScript(scriptId) {
            try {
                await CONFIG.browserClient.userScripts.unregister({ ids: [scriptId] });
                await CONFIG.browserClient.storage.local.remove(scriptId);
                this.scripts = this.scripts.filter(script => script.id !== scriptId);
                return { success: true };
            } catch (error) {
                return { success: false, error };
            }
        }
    }

    // Initialize the script manager
    new ScriptManager();
})();