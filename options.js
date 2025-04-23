(() => {
    "use strict";

    class ScriptManager {
        constructor() {
            this.scripts = [];
            this.currentScript = null;
            this.init();
        }

        async init() {
            await this.loadScripts();
            this.renderScripts();
            this.setupEventListeners();
        }

        async loadScripts() {
            const result = await chrome.storage.local.get(null);
            this.scripts = Object.values(result).filter(item => item.id && item.id.startsWith('script_'));
        }

        renderScripts() {
            const scriptList = document.querySelector('.script-list');
            scriptList.innerHTML = '';

            this.scripts.forEach(script => {
                const scriptElement = this.createScriptElement(script);
                scriptList.appendChild(scriptElement);
            });
        }

        createScriptElement(script) {
            const div = document.createElement('div');
            div.className = 'script-item';
            div.innerHTML = `
                <h3>${script.title}</h3>
                <div class="script-info">
                    <div>Trigger: ${script.trigger.type === 'm' ? 'Manual' : 'Automatic'}</div>
                    <div>URL Pattern: ${script.filter.value}</div>
                </div>
                <div class="actions">
                    <button class="primary-button edit-script" data-id="${script.id}">Edit</button>
                    <button class="secondary-button delete-script" data-id="${script.id}">Delete</button>
                </div>
            `;
            return div;
        }

        setupEventListeners() {
            // Add New Script button
            document.getElementById('addNewScript').addEventListener('click', () => {
                this.showEditor();
            });

            // Save Script button
            document.getElementById('saveScript').addEventListener('click', () => {
                this.saveScript();
            });

            // Cancel Edit button
            document.getElementById('cancelEdit').addEventListener('click', () => {
                this.hideEditor();
            });

            // Edit and Delete buttons
            document.querySelector('.script-list').addEventListener('click', (e) => {
                if (e.target.classList.contains('edit-script')) {
                    const scriptId = e.target.dataset.id;
                    this.editScript(scriptId);
                } else if (e.target.classList.contains('delete-script')) {
                    const scriptId = e.target.dataset.id;
                    this.deleteScript(scriptId);
                }
            });
        }

        showEditor(script = null) {
            this.currentScript = script;
            document.querySelector('.script-list').style.display = 'none';
            document.querySelector('.script-editor').style.display = 'block';

            if (script) {
                document.getElementById('scriptTitle').value = script.title;
                document.getElementById('triggerType').value = script.trigger.type;
                document.getElementById('triggerValue').value = script.trigger.value;
                document.getElementById('urlPattern').value = script.filter.value;
                document.getElementById('scriptCode').value = script.script.value;
            } else {
                document.getElementById('scriptTitle').value = '';
                document.getElementById('triggerType').value = 'm';
                document.getElementById('triggerValue').value = 'pageload';
                document.getElementById('urlPattern').value = '*://*.google.com/*';
                document.getElementById('scriptCode').value = '';
            }
        }

        hideEditor() {
            document.querySelector('.script-list').style.display = 'grid';
            document.querySelector('.script-editor').style.display = 'none';
            this.currentScript = null;
        }

        async saveScript() {
            const title = document.getElementById('scriptTitle').value;
            const triggerType = document.getElementById('triggerType').value;
            const triggerValue = document.getElementById('triggerValue').value;
            const urlPattern = document.getElementById('urlPattern').value;
            const scriptCode = document.getElementById('scriptCode').value;

            if (!title || !scriptCode) {
                alert('Please fill in all required fields');
                return;
            }

            // Validate URL pattern
            if (!this.isValidUrlPattern(urlPattern)) {
                alert('Invalid URL pattern. Please use format: *://*.domain.com/*');
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
                vrs: 2
            };

            await chrome.storage.local.set({ [script.id]: script });
            await this.loadScripts();
            this.renderScripts();
            this.hideEditor();
        }

        isValidUrlPattern(pattern) {
            // Basic URL pattern validation
            const patternRegex = /^\*:\/\/(\*|\*\.[^/*]+|[^/*]+)\/(.*)?$/;
            return patternRegex.test(pattern);
        }

        editScript(scriptId) {
            const script = this.scripts.find(s => s.id === scriptId);
            if (script) {
                this.showEditor(script);
            }
        }

        async deleteScript(scriptId) {
            if (confirm('Are you sure you want to delete this script?')) {
                await chrome.storage.local.remove(scriptId);
                await this.loadScripts();
                this.renderScripts();
            }
        }
    }

    // Initialize the script manager when the page loads
    window.addEventListener('DOMContentLoaded', () => {
        new ScriptManager();
    });
})(); 