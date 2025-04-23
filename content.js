(() => {
    "use strict";

    // Message types for communication
    const MESSAGE_TYPES = {
        CREATE_SCRIPT: "createScript",
        UPDATE_SCRIPT: "updateScript",
        DELETE_SCRIPT: "deleteScript",
        GET_SCRIPTS: "getScriptListFromStorage",
        PING: "pingContentScript",
        SCRIPTS_LOADED: "scriptsLoadedFromCS",
        CONTENT_SCRIPT_LOADED: "contentScriptLoaded",
        OPERATION_DONE: "scriptOperationDone",
        OPERATION_FAILED: "scriptOperationFailed",
        GET_VERSION: "getVersion"
    };

    // Configuration
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

    // Mark the page as having Scripty installed
    document.documentElement.setAttribute("scripty", true);

    // Listen for messages from the extension
    CONFIG.browserClient.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === MESSAGE_TYPES.PING) {
            sendResponse({ alive: true });
        }
    });

    // Listen for messages from the page
    window.addEventListener("message", (event) => {
        if (event.source === window && event.data.type) {
            try {
                switch (event.data.type) {
                    case MESSAGE_TYPES.GET_SCRIPTS:
                        CONFIG.browserClient.runtime.sendMessage(
                            { action: MESSAGE_TYPES.GET_SCRIPTS },
                            (response) => {
                                document.dispatchEvent(
                                    new CustomEvent(MESSAGE_TYPES.SCRIPTS_LOADED, {
                                        detail: { scripts: response }
                                    })
                                );
                            }
                        );
                        break;

                    case MESSAGE_TYPES.CREATE_SCRIPT:
                        CONFIG.browserClient.runtime.sendMessage(
                            {
                                action: MESSAGE_TYPES.CREATE_SCRIPT,
                                data: event.data.data
                            },
                            (response) => {
                                if (response.success) {
                                    response.opTitle = event.data.title;
                                    document.dispatchEvent(
                                        new CustomEvent(MESSAGE_TYPES.OPERATION_DONE, {
                                            detail: response
                                        })
                                    );
                                    document.dispatchEvent(
                                        new CustomEvent(MESSAGE_TYPES.SCRIPTS_LOADED, {
                                            detail: response
                                        })
                                    );
                                } else {
                                    document.dispatchEvent(
                                        new CustomEvent(MESSAGE_TYPES.OPERATION_FAILED, {
                                            detail: response
                                        })
                                    );
                                }
                            }
                        );
                        break;

                    case MESSAGE_TYPES.UPDATE_SCRIPT:
                        CONFIG.browserClient.runtime.sendMessage(
                            {
                                action: MESSAGE_TYPES.UPDATE_SCRIPT,
                                data: event.data.data,
                                id: event.data.id
                            },
                            (response) => {
                                if (response.success) {
                                    response.opTitle = event.data.title;
                                    document.dispatchEvent(
                                        new CustomEvent(MESSAGE_TYPES.OPERATION_DONE, {
                                            detail: response
                                        })
                                    );
                                    document.dispatchEvent(
                                        new CustomEvent(MESSAGE_TYPES.SCRIPTS_LOADED, {
                                            detail: response
                                        })
                                    );
                                } else {
                                    document.dispatchEvent(
                                        new CustomEvent(MESSAGE_TYPES.OPERATION_FAILED, {
                                            detail: response
                                        })
                                    );
                                }
                            }
                        );
                        break;

                    case MESSAGE_TYPES.DELETE_SCRIPT:
                        CONFIG.browserClient.runtime.sendMessage(
                            {
                                action: MESSAGE_TYPES.DELETE_SCRIPT,
                                id: event.data.id
                            },
                            (response) => {
                                document.dispatchEvent(
                                    new CustomEvent(MESSAGE_TYPES.SCRIPTS_LOADED, {
                                        detail: response
                                    })
                                );
                            }
                        );
                        break;

                    case MESSAGE_TYPES.GET_VERSION:
                        CONFIG.browserClient.runtime.sendMessage(
                            { action: MESSAGE_TYPES.GET_VERSION },
                            (response) => {
                                document.dispatchEvent(
                                    new CustomEvent(MESSAGE_TYPES.GET_VERSION, {
                                        detail: response
                                    })
                                );
                            }
                        );
                        break;
                }
            } catch (error) {
                console.error("Error handling message:", error);
            }
        }
    }, false);

    // Notify that content script is loaded
    document.dispatchEvent(
        new CustomEvent(MESSAGE_TYPES.CONTENT_SCRIPT_LOADED, {
            detail: ""
        })
    );
})();