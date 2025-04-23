(() => {
    "use strict";

    class ScriptManager {
        constructor() {
            this.scripts = [];
            this.currentScript = null;
            this.editor = null;
            this.init();
        }

        async init() {
            await this.loadScripts();
            this.setupMessageListeners();
            this.setupEventListeners();
            this.renderScriptList();
            this.initializeEditor();
        }

        initializeEditor() {
            // Wait for the DOM to be fully loaded
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.setupEditor());
            } else {
                this.setupEditor();
            }
        }

        setupEditor() {
            // Initialize the editor
            this.editor = ace.edit("scriptCode");
            


            // Load the theme
            ace.require("ace/theme/cobalt");
            this.editor.setTheme("ace/theme/cobalt");
            
            // Load the JavaScript mode
            ace.require("ace/mode/javascript");
            const JavaScriptMode = ace.require("ace/mode/javascript").Mode;
            this.editor.session.setMode(new JavaScriptMode());
            ace.edit(editor, {
                theme: "ace/theme/cobalt",
                mode: "ace/mode/javascript",
              });
            
            // Configure editor options
            this.editor.setOptions({
                fontSize: "14px",
                enableBasicAutocompletion: true,
                enableLiveAutocompletion: true,
                enableSnippets: true,
                showLineNumbers: true,
                showGutter: true,
                highlightActiveLine: true,
                tabSize: 4,
                useSoftTabs: true,
                wrap: true,
                autoScrollEditorIntoView: true,
                minLines: 20,
                maxLines: 50
            });

            // Set default value
            this.editor.setValue("// Enter your JavaScript code here\n", -1);
        }

        async loadScripts() {
            const result = await chrome.storage.local.get(null);
            this.scripts = Object.values(result).filter(item => item.id && item.id.startsWith('script_'));
        }

        setupMessageListeners() {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.action === "editScript") {
                    this.editScript(message.scriptId);
                }
            });
        }

        setupEventListeners() {
            document.getElementById('addNewScript').addEventListener('click', () => this.showEditor());
            document.getElementById('saveScript').addEventListener('click', () => this.saveScript());
            document.getElementById('cancelEdit').addEventListener('click', () => this.hideEditor());
            document.getElementById('viewAllScripts').addEventListener('click', () => this.hideEditor());
        }

        async editScript(scriptId) {
            const script = this.scripts.find(s => s.id === scriptId);
            if (script) {
                this.currentScript = script;
                this.showEditor(script);
            }
        }

        showEditor(script = null) {
            const editor = document.querySelector('.script-editor');
            const list = document.querySelector('.script-list');
            
            editor.style.display = 'block';
            list.style.display = 'none';

            if (script) {
                document.getElementById('scriptTitle').value = script.title;
                document.getElementById('triggerType').value = script.trigger.type;
                document.getElementById('triggerValue').value = script.trigger.value;
                document.getElementById('urlPattern').value = script.filter.value;
                this.editor.setValue(script.script.value);
            } else {
                document.getElementById('scriptTitle').value = '';
                document.getElementById('triggerType').value = 'm';
                document.getElementById('triggerValue').value = 'pageload';
                document.getElementById('urlPattern').value = '*://*/*';
                this.editor.setValue('');
            }
            this.editor.clearSelection();
        }

        hideEditor() {
            const editor = document.querySelector('.script-editor');
            const list = document.querySelector('.script-list');
            
            editor.style.display = 'none';
            list.style.display = 'block';
            this.currentScript = null;
        }

        async saveScript() {
            const title = document.getElementById('scriptTitle').value.trim();
            const triggerType = document.getElementById('triggerType').value;
            const triggerValue = document.getElementById('triggerValue').value;
            const urlPattern = document.getElementById('urlPattern').value.trim();
            const scriptCode = this.editor.getValue().trim();

            if (!title || !urlPattern || !scriptCode) {
                alert('Please fill in all required fields');
                return;
            }

            if (!this.isValidUrlPattern(urlPattern)) {
                alert('Invalid URL pattern format. Please use the format: *://*.domain.com/*');
                return;
            }

            const script = {
                id: this.currentScript?.id || `script_${Date.now()}`,
                title,
                trigger: {
                    type: triggerType,
                    value: triggerValue
                },
                filter: {
                    identifier: 'pattern',
                    condition: 'equals',
                    value: urlPattern
                },
                script: {
                    value: scriptCode
                },
                disable: false
            };

            await chrome.storage.local.set({ [script.id]: script });
            this.scripts = this.scripts.filter(s => s.id !== script.id);
            this.scripts.push(script);
            
            this.hideEditor();
            this.renderScriptList();
        }

        isValidUrlPattern(pattern) {
            return /^\*:\/\/(\*|\*\.[^/*]+|[^/*]+)\/(.*)?$/.test(pattern);
        }

        renderScriptList() {
            const list = document.querySelector('.script-list');
            const scripts = this.scripts.map(script => `
                <div class="script-item">
                    <div class="script-info">
                        <h3>
                            ${script.title}
                            <span class="script-type ${script.trigger.type === 'm' ? 'manual' : 'automatic'}">
                                ${script.trigger.type === 'm' ? 'Manual' : 'Auto'}
                            </span>
                        </h3>
                        <p>${script.filter.value}</p>
                    </div>
                    <div class="script-actions">
                        <button class="edit-script" data-id="${script.id}">Edit</button>
                        <button class="delete-script" data-id="${script.id}">Delete</button>
                    </div>
                </div>
            `).join('');
            
            list.innerHTML = scripts;

            // Add event listeners for edit and delete buttons
            document.querySelectorAll('.edit-script').forEach(button => {
                button.addEventListener('click', () => {
                    this.editScript(button.dataset.id);
                });
            });

            document.querySelectorAll('.delete-script').forEach(button => {
                button.addEventListener('click', () => {
                    this.deleteScript(button.dataset.id);
                });
            });
        }

        async deleteScript(scriptId) {
            if (confirm('Are you sure you want to delete this script?')) {
                await chrome.storage.local.remove(scriptId);
                this.scripts = this.scripts.filter(s => s.id !== scriptId);
                this.renderScriptList();
            }
        }
    }

    // Initialize the script manager
    new ScriptManager();
})(); 