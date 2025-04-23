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
            this.scriptCache = new Map();
            this.lastUpdateTime = Date.now();
            this.init();
        }

        handleScriptCode(code) {
            if (!code) return '';
            // Remove comments and extra whitespace
            return code
                .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        async init() {
            try {
                await this.loadScripts();
                this.setupMessageListeners();
                this.setupTabListener();
                this.setupStorageListener();
                this.setupUpdateChecker();
            } catch (error) {
                console.error('Error initializing ScriptManager:', error);
            }
        }

        setupStorageListener() {
            CONFIG.browserClient.storage.onChanged.addListener((changes, area) => {
                if (area === 'local') {
                    Object.keys(changes).forEach(key => {
                        if (key.startsWith('script_')) {
                            this.notifyPopupUpdate();
                        }
                    });
                }
            });
        }

        async loadScripts() {
            try {
                const result = await CONFIG.browserClient.storage.local.get(null);
                this.scripts = Object.values(result).filter(item => item.id && item.id.startsWith('script_'));
                await this.registerAllScripts();
            } catch (error) {
                console.error('Error loading scripts:', error);
            }
        }

        async registerAllScripts() {
            const registrationPromises = this.scripts
                .filter(script => !script.disable)
                .map(script => this.registerScript(script));
            
            await Promise.all(registrationPromises);
        }

        async registerScript(script) {
            try {
                // First try to unregister if it exists
                await this.unregisterScript(script.id);

                const matches = new URLPatternMatcher(
                    script.filter.identifier,
                    script.filter.condition,
                    script.filter.value
                ).generate();

                const scriptConfig = {
                    id: script.id,
                    matches: matches,
                    world: "MAIN",
                    runAt: this.getRunAtTime(script),
                    js: [{
                        code: this.getWrappedScriptCode(script)
                    }]
                };

                await CONFIG.browserClient.userScripts.register([scriptConfig]);

                // Update cache
                this.scriptCache.set(script.id, {
                    version: script.version || Date.now(),
                    config: scriptConfig,
                    script: script
                });

                return true;
            } catch (error) {
                console.error("Error registering script:", error);
                return false;
            }
        }

        getRunAtTime(script) {
            if (script.trigger.type === CONFIG.triggerType.automatic) {
                return script.trigger.value === CONFIG.triggerValue.beforeload ? 
                       "document_start" : "document_end";
            }
            return "document_end";
        }

        getWrappedScriptCode(script) {
            const scriptCode = this.handleScriptCode(script.script.value);
            let wrappedScript = `
                (function() {
                    window._scripty = window._scripty || {}; 
                    window._scripty["${script.id}"] = () => {
                        try {   
                            ${scriptCode}
                        } catch (e) {
                            console.error("Scripty: Error executing script: ${script.title}", e);
                        }
                    };
                })();
            `.replace(/\s+/g, " ").trim();

            if (script.trigger.type === CONFIG.triggerType.automatic) {
                wrappedScript += `window._scripty["${script.id}"]()`;
            }

            return wrappedScript;
        }

        async isScriptRegistered(scriptId) {
            try {
                const scripts = await CONFIG.browserClient.userScripts.getScripts({ ids: [scriptId] });
                return scripts.length > 0;
            } catch (error) {
                return false;
            }
        }

        async unregisterScript(scriptId) {
            try {
                const isRegistered = await this.isScriptRegistered(scriptId);
                if (!isRegistered) {
                    console.debug(`Script ${scriptId} is not registered, skipping unregistration`);
                    return true;
                }
                await CONFIG.browserClient.userScripts.unregister({ ids: [scriptId] });
                this.scriptCache.delete(scriptId);
                return true;
            } catch (error) {
                console.error("Error unregistering script:", error);
                return false;
            }
        }

        async deleteScript(scriptId) {
            try {
                // First unregister the script
                await this.unregisterScript(scriptId);
                
                // Remove from storage
                await CONFIG.browserClient.storage.local.remove(scriptId);
                
                // Remove from local array
                this.scripts = this.scripts.filter(s => s.id !== scriptId);
                
                // Clean up from all tabs
                await this.cleanupScriptFromTabs(scriptId);
                
                // Notify all components
                this.notifyPopupUpdate();
                
                return true;
            } catch (error) {
                console.error("Error deleting script:", error);
                return false;
            }
        }

        async cleanupScriptFromTabs(scriptId) {
            const tabs = await CONFIG.browserClient.tabs.query({});
            const cleanupPromises = tabs.map(tab => 
                CONFIG.browserClient.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (scriptId) => {
                        if (window._scripty && window._scripty[scriptId]) {
                            delete window._scripty[scriptId];
                        }
                    },
                    args: [scriptId]
                }).catch(error => {
                    console.debug(`Could not cleanup script in tab ${tab.id}:`, error);
                })
            );
            
            await Promise.all(cleanupPromises);
        }

        setupUpdateChecker() {
            // Check for updates every 5 seconds
            setInterval(async () => {
                const currentTime = Date.now();
                if (currentTime - this.lastUpdateTime > 5000) {
                    await this.checkForUpdates();
                }
            }, 5000);
        }

        async checkForUpdates() {
            try {
                const result = await CONFIG.browserClient.storage.local.get(null);
                const newScripts = Object.values(result).filter(item => item.id && item.id.startsWith('script_'));
                
                // Check for new or updated scripts
                const updates = newScripts.filter(newScript => {
                    const oldScript = this.scripts.find(s => s.id === newScript.id);
                    return !oldScript || 
                           oldScript.version !== newScript.version || 
                           oldScript.script.value !== newScript.script.value;
                });

                if (updates.length > 0) {
                    console.log('Scripts updated:', updates);
                    this.scripts = newScripts;
                    await this.registerAllScripts();
                    this.notifyPopupUpdate();
                    this.lastUpdateTime = Date.now();
                }
            } catch (error) {
                console.error('Error checking for updates:', error);
            }
        }

        setupTabListener() {
            CONFIG.browserClient.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
                if (changeInfo.status === 'complete') {
                    await this.checkForUpdates();
                    await this.executeMatchingScripts(tab);
                }
            });

            CONFIG.browserClient.tabs.onCreated.addListener(async (tab) => {
                await this.checkForUpdates();
                if (tab.url && !tab.url.startsWith('chrome://')) {
                    await this.executeMatchingScripts(tab);
                }
            });
        }

        async executeMatchingScripts(tab) {
            try {
                const matchingScripts = this.scripts.filter(script => {
                    if (script.disable) return false;
                    if (script.trigger.type !== CONFIG.triggerType.automatic) return false;
                    
                    if (!script.filter.matches || script.filter.matches.length === 0) return true;
                    
                    return script.filter.matches.some(match => {
                        try {
                            if (match === '*://*/*') return true;
                            const pattern = match
                                .replace(/\./g, '\\.')
                                .replace(/\*/g, '.*')
                                .replace(/\?/g, '.');
                            const regex = new RegExp('^' + pattern + '$');
                            return regex.test(tab.url);
                        } catch (error) {
                            console.error('Error checking URL pattern:', error);
                            return false;
                        }
                    });
                });

                for (const script of matchingScripts) {
                    try {
                        // First inject the script
                        await CONFIG.browserClient.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: (scriptId, scriptCode) => {
                                window._scripty = window._scripty || {};
                                window._scripty[scriptId] = () => {
                                    try {
                                        eval(scriptCode);
                                    } catch (e) {
                                        console.error(`Scripty: Error executing script ${scriptId}:`, e);
                                    }
                                };
                            },
                            args: [script.id, script.script.value]
                        });

                        // Then execute it
                        await CONFIG.browserClient.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: (scriptId) => {
                                if (window._scripty && window._scripty[scriptId]) {
                                    window._scripty[scriptId]();
                                }
                            },
                            args: [script.id]
                        });
                    } catch (error) {
                        console.error(`Error executing script ${script.id} on tab ${tab.id}:`, error);
                    }
                }
            } catch (error) {
                console.error('Error executing matching scripts:', error);
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
                    case "checkForUpdates":
                        this.checkForUpdates().then(sendResponse);
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

        notifyPopupUpdate() {
            CONFIG.browserClient.runtime.sendMessage({ action: "scriptsUpdated" });
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