/**
 * UIManager - Manages the user interface, drag-and-drop, and UI interactions
 * Handles panel management, modal dialogs, and UI customization
 */
class UIManager {
    constructor(eventBus, editorCore) {
        this.eventBus = eventBus;
        this.editorCore = editorCore;
        
        // UI state
        this.panels = new Map(); // Map of panel ID to panel config
        this.modals = new Map(); // Map of modal ID to modal element
        this.dragState = {
            isDragging: false,
            dragType: null,
            dragData: null,
            dragElement: null,
            dropTargets: []
        };
        
        // UI settings
        this.settings = {
            theme: 'dark',
            layout: 'default',
            panelSizes: {},
            collapsedPanels: new Set()
        };
        
        this.init();
    }

    /**
     * Initialize the UI manager
     */
    init() {
        this.setupDragAndDrop();
        this.setupPanelManagement();
        this.setupModalManagement();
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        this.loadUISettings();
    }

    /**
     * Setup drag and drop functionality
     */
    setupDragAndDrop() {
        // Setup drag and drop for components
        this.setupComponentDragDrop();
        
        // Setup drag and drop for files
        this.setupFileDragDrop();
        
        // Setup drag and drop for scene objects
        this.setupSceneObjectDragDrop();
    }

    /**
     * Setup component drag and drop
     */
    setupComponentDragDrop() {
        const componentItems = document.querySelectorAll('.component-item');
        
        componentItems.forEach(item => {
            item.draggable = true;
            
            item.addEventListener('dragstart', (event) => {
                const componentName = item.dataset.component;
                
                this.dragState.isDragging = true;
                this.dragState.dragType = 'component';
                this.dragState.dragData = { componentName };
                this.dragState.dragElement = item;
                
                // Set drag image
                event.dataTransfer.setData('text/plain', componentName);
                event.dataTransfer.effectAllowed = 'copy';
                
                // Add visual feedback
                item.classList.add('dragging');
                
                // Highlight drop targets
                this.highlightDropTargets('component');
                
                console.log(`Started dragging component: ${componentName}`);
            });
            
            item.addEventListener('dragend', (event) => {
                this.endDrag();
            });
        });
    }



    /**
     * Setup file drag and drop
     */
    setupFileDragDrop() {
        const dropZones = [
            document.getElementById('viewport')
        ];
        
        dropZones.forEach(zone => {
            if (!zone) return;
            
            zone.addEventListener('dragover', (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                zone.classList.add('drag-over');
            });
            
            zone.addEventListener('dragleave', (event) => {
                if (!zone.contains(event.relatedTarget)) {
                    zone.classList.remove('drag-over');
                }
            });
            
            zone.addEventListener('drop', (event) => {
                event.preventDefault();
                zone.classList.remove('drag-over');
                
                const files = Array.from(event.dataTransfer.files);
                if (files.length > 0) {
                    this.handleFileDrop(files, event);
                }
            });
        });
    }

    /**
     * Setup scene object drag and drop
     */
    setupSceneObjectDragDrop() {
        const viewport = document.getElementById('viewport');
        if (!viewport) return;
        
        // Handle dropping components onto viewport (to add to selected objects)
        viewport.addEventListener('dragover', (event) => {
            if (this.dragState.dragType === 'component') {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                viewport.classList.add('drag-over');
            }
        });
        
        viewport.addEventListener('dragleave', (event) => {
            if (!viewport.contains(event.relatedTarget)) {
                viewport.classList.remove('drag-over');
            }
        });
        
        viewport.addEventListener('drop', (event) => {
            if (this.dragState.dragType === 'component') {
                event.preventDefault();
                viewport.classList.remove('drag-over');
                this.handleComponentDrop(event);
            }
        });
    }

    /**
     * Handle component drop
     */
    handleComponentDrop(event) {
        const { componentName } = this.dragState.dragData;
        const selectedObjects = this.editorCore.sceneManager.getSelectedObjects();
        
        if (selectedObjects.length === 0) {
            this.showNotification('No objects selected to add component to', 'warning');
            return;
        }
        
        selectedObjects.forEach(object => {
            try {
                this.editorCore.componentSystem.addComponent(object.id, componentName);
                this.showNotification(`Added ${componentName} to ${object.name}`, 'success');
            } catch (error) {
                this.showNotification(`Failed to add ${componentName}: ${error.message}`, 'error');
            }
        });
        
        // Update inspector
        this.updateInspector();
    }

    /**
     * Handle file drop
     */
    handleFileDrop(files, event) {
        console.log(`Dropped ${files.length} file(s)`);
        
        // Emit event for asset manager to handle
        this.eventBus.emit('ui:file-dropped', { files, event });
        
        // Show loading notification
        this.showNotification(`Importing ${files.length} file(s)...`, 'info');
    }

    /**
     * Highlight drop targets
     */
    highlightDropTargets(dragType) {
        const targets = [];
        
        switch (dragType) {
            case 'component':
                targets.push(document.getElementById('viewport'));
                break;
            case 'asset':
                targets.push(document.getElementById('viewport'));
                targets.push(document.getElementById('scene-hierarchy'));
                break;
        }
        
        targets.forEach(target => {
            if (target) {
                target.classList.add('drop-target');
            }
        });
        
        this.dragState.dropTargets = targets;
    }

    /**
     * End drag operation
     */
    endDrag() {
        // Remove visual feedback
        if (this.dragState.dragElement) {
            this.dragState.dragElement.classList.remove('dragging');
        }
        
        // Remove drop target highlights
        this.dragState.dropTargets.forEach(target => {
            target.classList.remove('drop-target', 'drag-over');
        });
        
        // Reset drag state
        this.dragState = {
            isDragging: false,
            dragType: null,
            dragData: null,
            dragElement: null,
            dropTargets: []
        };
    }

    /**
     * Setup panel management
     */
    setupPanelManagement() {
        // Setup panel toggles
        document.querySelectorAll('.panel-toggle').forEach(toggle => {
            toggle.addEventListener('click', (event) => {
                const panel = toggle.closest('.panel');
                if (panel) {
                    this.togglePanel(panel.id);
                }
            });
        });
        
        // Setup panel resizing
        this.setupPanelResizing();
    }

    /**
     * Setup panel resizing
     */
    setupPanelResizing() {
        // Add resize handles between panels
        const sidebars = document.querySelectorAll('.sidebar');
        
        sidebars.forEach(sidebar => {
            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'resize-handle';
            resizeHandle.style.cssText = `
                position: absolute;
                top: 0;
                bottom: 0;
                width: 4px;
                background: transparent;
                cursor: col-resize;
                z-index: 10;
            `;
            
            if (sidebar.id === 'left-sidebar') {
                resizeHandle.style.right = '-2px';
            } else {
                resizeHandle.style.left = '-2px';
            }
            
            sidebar.style.position = 'relative';
            sidebar.appendChild(resizeHandle);
            
            this.setupResizeHandle(resizeHandle, sidebar);
        });
    }

    /**
     * Setup resize handle
     */
    setupResizeHandle(handle, sidebar) {
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;
        
        handle.addEventListener('mousedown', (event) => {
            isResizing = true;
            startX = event.clientX;
            startWidth = sidebar.offsetWidth;
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            
            event.preventDefault();
        });
        
        const onMouseMove = (event) => {
            if (!isResizing) return;
            
            const deltaX = event.clientX - startX;
            const newWidth = sidebar.id === 'left-sidebar' ? 
                startWidth + deltaX : 
                startWidth - deltaX;
            
            const minWidth = 200;
            const maxWidth = 500;
            
            if (newWidth >= minWidth && newWidth <= maxWidth) {
                sidebar.style.width = `${newWidth}px`;
                this.settings.panelSizes[sidebar.id] = newWidth;
            }
        };
        
        const onMouseUp = () => {
            isResizing = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            
            this.saveUISettings();
        };
    }

    /**
     * Toggle panel visibility
     */
    togglePanel(panelId) {
        const panel = document.getElementById(panelId);
        if (!panel) return;
        
        const content = panel.querySelector('.panel-content');
        const toggle = panel.querySelector('.panel-toggle');
        
        if (!content || !toggle) return;
        
        const isCollapsed = content.style.display === 'none';
        
        content.style.display = isCollapsed ? 'block' : 'none';
        toggle.textContent = isCollapsed ? '−' : '+';
        
        if (isCollapsed) {
            this.settings.collapsedPanels.delete(panelId);
        } else {
            this.settings.collapsedPanels.add(panelId);
        }
        
        this.saveUISettings();
        
        this.eventBus.emit(EventBus.Events.UI_PANEL_TOGGLED, {
            panelId,
            collapsed: !isCollapsed
        });
    }

    /**
     * Setup modal management
     */
    setupModalManagement() {
        // Setup plugin modal
        this.setupPluginModal();
        
        // Setup generic modal close handlers
        document.querySelectorAll('.modal-close').forEach(closeBtn => {
            closeBtn.addEventListener('click', (event) => {
                const modal = closeBtn.closest('.modal');
                if (modal) {
                    this.hideModal(modal.id);
                }
            });
        });
        
        // Close modals on background click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });
    }

    /**
     * Setup plugin modal
     */
    setupPluginModal() {
        const modal = document.getElementById('plugin-modal');
        if (!modal) return;
        
        // Setup tab switching
        const tabBtns = modal.querySelectorAll('.tab-btn');
        const tabPanels = modal.querySelectorAll('.tab-panel');
        
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                
                // Update active tab
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Update active panel
                tabPanels.forEach(panel => {
                    panel.classList.remove('active');
                    if (panel.id === `${tabName}-plugins`) {
                        panel.classList.add('active');
                    }
                });
            });
        });
        
        // Setup plugin development tools
        const createPluginBtn = document.getElementById('create-plugin');
        const loadPluginBtn = document.getElementById('load-plugin');
        
        if (createPluginBtn) {
            createPluginBtn.addEventListener('click', () => {
                this.showCreatePluginDialog();
            });
        }
        
        if (loadPluginBtn) {
            loadPluginBtn.addEventListener('click', () => {
                this.showLoadPluginDialog();
            });
        }
    }

    /**
     * Show modal
     */
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('fade-in');
            
            // Focus first input if any
            const firstInput = modal.querySelector('input, textarea, select');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        }
    }

    /**
     * Hide modal
     */
    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('fade-in');
        }
    }

    /**
     * Show create plugin dialog
     */
    showCreatePluginDialog() {
        const dialogHTML = `
            <div class="modal" id="create-plugin-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Create New Plugin</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="create-plugin-form">
                            <div class="property-row">
                                <label>Plugin Name:</label>
                                <input type="text" id="plugin-name" required>
                            </div>
                            <div class="property-row">
                                <label>Description:</label>
                                <textarea id="plugin-description" rows="3"></textarea>
                            </div>
                            <div class="property-row">
                                <label>Category:</label>
                                <select id="plugin-category">
                                    <option value="tools">Tools</option>
                                    <option value="domain">Domain Specific</option>
                                    <option value="utility">Utility</option>
                                    <option value="visual">Visual Effects</option>
                                </select>
                            </div>
                            <div class="property-row">
                                <label>Template:</label>
                                <select id="plugin-template">
                                    <option value="basic">Basic Plugin</option>
                                    <option value="ui-panel">UI Panel Plugin</option>
                                    <option value="tool">Tool Plugin</option>
                                    <option value="component">Component Plugin</option>
                                </select>
                            </div>
                            <div class="modal-actions">
                                <button type="submit">Create Plugin</button>
                                <button type="button" onclick="uiManager.hideModal('create-plugin-modal')">Cancel</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', dialogHTML);
        this.showModal('create-plugin-modal');
        
        // Setup form handler
        const form = document.getElementById('create-plugin-form');
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            this.handleCreatePlugin(form);
        });
    }

    /**
     * Handle create plugin
     */
    handleCreatePlugin(form) {
        const formData = new FormData(form);
        const pluginData = {
            name: formData.get('plugin-name') || document.getElementById('plugin-name').value,
            description: formData.get('plugin-description') || document.getElementById('plugin-description').value,
            category: formData.get('plugin-category') || document.getElementById('plugin-category').value,
            template: formData.get('plugin-template') || document.getElementById('plugin-template').value
        };
        
        // Generate plugin code based on template
        const pluginCode = this.generatePluginCode(pluginData);
        
        // Show code editor
        this.showPluginCodeEditor(pluginData, pluginCode);
        
        this.hideModal('create-plugin-modal');
        document.getElementById('create-plugin-modal').remove();
    }

    /**
     * Generate plugin code
     */
    generatePluginCode(pluginData) {
        const templates = {
            basic: `
// ${pluginData.name} Plugin
class ${pluginData.name.replace(/\s+/g, '')}Plugin {
    constructor(api) {
        this.api = api;
        this.name = '${pluginData.name}';
        this.version = '1.0.0';
    }
    
    async init() {
        console.log('${pluginData.name} plugin initialized');
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Add your event listeners here
    }
    
    async dispose() {
        console.log('${pluginData.name} plugin disposed');
    }
}

// Export the plugin
window.${pluginData.name.replace(/\s+/g, '')}Plugin = ${pluginData.name.replace(/\s+/g, '')}Plugin;
            `,
            'ui-panel': `
// ${pluginData.name} Plugin with UI Panel
class ${pluginData.name.replace(/\s+/g, '')}Plugin {
    constructor(api) {
        this.api = api;
        this.name = '${pluginData.name}';
        this.version = '1.0.0';
    }
    
    async init() {
        console.log('${pluginData.name} plugin initialized');
        this.setupUI();
        this.setupEventListeners();
    }
    
    setupUI() {
        this.api.addPanel({
            id: '${pluginData.name.toLowerCase().replace(/\s+/g, '-')}-panel',
            title: '${pluginData.name}',
            content: this.createPanelContent(),
            position: 'right'
        });
    }
    
    createPanelContent() {
        return \`
            <div class="${pluginData.name.toLowerCase().replace(/\s+/g, '-')}-panel">
                <h4>${pluginData.name} Controls</h4>
                <button id="${pluginData.name.toLowerCase().replace(/\s+/g, '-')}-action">Action Button</button>
            </div>
        \`;
    }
    
    setupEventListeners() {
        // Add your event listeners here
    }
    
    async dispose() {
        console.log('${pluginData.name} plugin disposed');
    }
}

// Export the plugin
window.${pluginData.name.replace(/\s+/g, '')}Plugin = ${pluginData.name.replace(/\s+/g, '')}Plugin;
            `
        };
        
        return templates[pluginData.template] || templates.basic;
    }

    /**
     * Show plugin code editor
     */
    showPluginCodeEditor(pluginData, code) {
        const editorHTML = `
            <div class="modal" id="plugin-code-editor">
                <div class="modal-content" style="width: 80%; height: 80%;">
                    <div class="modal-header">
                        <h3>Plugin Code Editor - ${pluginData.name}</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body" style="display: flex; flex-direction: column;">
                        <textarea id="plugin-code" style="flex: 1; font-family: monospace; font-size: 12px;">${code}</textarea>
                        <div class="modal-actions" style="margin-top: 16px;">
                            <button id="test-plugin">Test Plugin</button>
                            <button id="save-plugin">Save Plugin</button>
                            <button onclick="uiManager.hideModal('plugin-code-editor')">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', editorHTML);
        this.showModal('plugin-code-editor');
        
        // Setup editor handlers
        document.getElementById('test-plugin').addEventListener('click', () => {
            this.testPlugin(pluginData, document.getElementById('plugin-code').value);
        });
        
        document.getElementById('save-plugin').addEventListener('click', () => {
            this.savePlugin(pluginData, document.getElementById('plugin-code').value);
        });
    }

    /**
     * Test plugin
     */
    testPlugin(pluginData, code) {
        try {
            // Create a safe evaluation context
            const testFunction = new Function('api', code + `\nreturn new ${pluginData.name.replace(/\s+/g, '')}Plugin(api);`);
            const plugin = testFunction(this.editorCore.pluginManager.pluginAPI);
            
            // Test initialization
            plugin.init();
            
            this.showNotification('Plugin test successful!', 'success');
        } catch (error) {
            this.showNotification(`Plugin test failed: ${error.message}`, 'error');
            console.error('Plugin test error:', error);
        }
    }

    /**
     * Save plugin
     */
    savePlugin(pluginData, code) {
        // In a real implementation, you would save to a file or database
        // For now, we'll just store in localStorage
        const pluginId = pluginData.name.toLowerCase().replace(/\s+/g, '-');
        
        const pluginManifest = {
            id: pluginId,
            name: pluginData.name,
            description: pluginData.description,
            category: pluginData.category,
            version: '1.0.0',
            author: 'User',
            code: code,
            created: new Date().toISOString()
        };
        
        localStorage.setItem(`plugin_${pluginId}`, JSON.stringify(pluginManifest));
        
        this.showNotification('Plugin saved successfully!', 'success');
        this.hideModal('plugin-code-editor');
        document.getElementById('plugin-code-editor').remove();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Listen for object selection to update inspector
        this.eventBus.on(EventBus.Events.OBJECT_SELECTED, (data) => {
            this.updateInspector(data.object);
            this.updatePrecisionTransformPanel(data.object);
        });
        
        this.eventBus.on(EventBus.Events.OBJECT_DESELECTED, () => {
            this.clearInspector();
            this.clearPrecisionTransformPanel();
        });
        
        // Listen for component changes
        this.eventBus.on(EventBus.Events.COMPONENT_ADDED, () => {
            this.updateInspector();
        });
        
        this.eventBus.on(EventBus.Events.COMPONENT_REMOVED, () => {
            this.updateInspector();
        });
        
        // Listen for scene changes to update hierarchy
        this.eventBus.on(EventBus.Events.OBJECT_CREATED, (data) => {
            this.updateHierarchy();
        });
        
        this.eventBus.on(EventBus.Events.OBJECT_DELETED, () => {
            this.updateHierarchy();
        });
        
        // Listen for object transformations to update precision transform panel
        this.eventBus.on(EventBus.Events.OBJECT_TRANSFORMED, (data) => {
            this.updatePrecisionTransformPanel(data.object);
        });
    }

    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            // Toggle panels with F keys
            if (event.key >= 'F1' && event.key <= 'F12') {
                event.preventDefault();
                const panelMap = {
                    'F1': 'scene-hierarchy',
                    'F2': 'inspector',
                    'F3': 'console'
                };
                
                const panelId = panelMap[event.key];
                if (panelId) {
                    this.togglePanel(panelId);
                }
            }
        });
    }

    /**
     * Update inspector with selected object
     */
    updateInspector(object = null) {
        const inspectorContent = document.getElementById('inspector-content');
        if (!inspectorContent) return;
        
        if (!object) {
            const selectedObjects = this.editorCore.sceneManager.getSelectedObjects();
            object = selectedObjects.length > 0 ? selectedObjects[0] : null;
        }
        
        if (!object) {
            this.clearInspector();
            return;
        }
        
        const components = this.editorCore.componentSystem.getComponents(object.id);
        
        let html = `
            <div class="object-info">
                <h4>${object.name}</h4>
                <div class="property-row">
                    <label>Type:</label>
                    <span>${object.type}</span>
                </div>
                <div class="property-row">
                    <label>ID:</label>
                    <span>${object.id}</span>
                </div>
            </div>
        `;
        
        // Add components
        components.forEach(component => {
            html += this.renderComponentInspector(component);
        });
        
        // Add component button only for mesh objects
        if (this.canObjectHaveComponents(object)) {
            html += `
                <div class="add-component">
                    <button id="add-component-btn">Add Component</button>
                </div>
            `;
        }
        
        inspectorContent.innerHTML = html;
        
        // Setup event listeners for property changes
        this.setupPropertyChangeListeners(object);
        
        // Setup add component button
        const addBtn = document.getElementById('add-component-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                this.showAddComponentDialog(object.id);
            });
        }
    }

    /**
     * Render component in inspector
     */
    renderComponentInspector(component) {
        const componentName = component.constructor.name;
        
        let html = `
            <div class="component-inspector">
                <div class="component-header">
                    <h5>${componentName}</h5>
                    <button class="remove-component" data-component="${componentName}">×</button>
                </div>
                <div class="component-properties">
        `;
        
        // Render component-specific properties
        if (componentName === 'Script') {
            html += `
                <div class="property-group">
                    <div class="property-row">
                        <label>Script Name:</label>
                        <input type="text" value="${component.scriptName}" data-property="scriptName">
                    </div>
                    <div class="property-row">
                        <label>Enabled:</label>
                        <input type="checkbox" ${component.enabled ? 'checked' : ''} data-property="enabled">
                    </div>
                    <button class="edit-script">Edit Script</button>
                </div>
            `;
        } else if (componentName === 'Collider') {
            html += `
                <div class="property-group">
                    <div class="property-row">
                        <label>Type:</label>
                        <select data-property="type">
                            <option value="box" ${component.type === 'box' ? 'selected' : ''}>Box</option>
                            <option value="sphere" ${component.type === 'sphere' ? 'selected' : ''}>Sphere</option>
                            <option value="mesh" ${component.type === 'mesh' ? 'selected' : ''}>Mesh</option>
                        </select>
                    </div>
                    <div class="property-row">
                        <label>Size X:</label>
                        <input type="number" value="${component.size.x}" data-property="size.x" step="0.1">
                    </div>
                    <div class="property-row">
                        <label>Size Y:</label>
                        <input type="number" value="${component.size.y}" data-property="size.y" step="0.1">
                    </div>
                    <div class="property-row">
                        <label>Size Z:</label>
                        <input type="number" value="${component.size.z}" data-property="size.z" step="0.1">
                    </div>
                    <div class="property-row">
                        <label>Is Trigger:</label>
                        <input type="checkbox" ${component.isTrigger ? 'checked' : ''} data-property="isTrigger">
                    </div>
                    <div class="property-row">
                        <label>Enabled:</label>
                        <input type="checkbox" ${component.enabled ? 'checked' : ''} data-property="enabled">
                    </div>
                </div>
            `;
        } else if (componentName === 'Light') {
            html += `
                <div class="property-group">
                    <div class="property-row">
                        <label>Type:</label>
                        <select data-property="type">
                            <option value="directional" ${component.type === 'directional' ? 'selected' : ''}>Directional</option>
                            <option value="point" ${component.type === 'point' ? 'selected' : ''}>Point</option>
                            <option value="spot" ${component.type === 'spot' ? 'selected' : ''}>Spot</option>
                            <option value="ambient" ${component.type === 'ambient' ? 'selected' : ''}>Ambient</option>
                        </select>
                    </div>
                    <div class="property-row">
                        <label>Color:</label>
                        <input type="color" value="#${component.color.toString(16).padStart(6, '0')}" data-property="color">
                    </div>
                    <div class="property-row">
                        <label>Intensity:</label>
                        <input type="range" min="0" max="10" step="0.1" value="${component.intensity}" data-property="intensity">
                        <span class="value-display">${component.intensity}</span>
                    </div>
                    <div class="property-row">
                        <label>Distance:</label>
                        <input type="number" value="${component.distance}" data-property="distance" step="0.1">
                    </div>
                    <div class="property-row">
                        <label>Cast Shadow:</label>
                        <input type="checkbox" ${component.castShadow ? 'checked' : ''} data-property="castShadow">
                    </div>
                </div>
            `;
        }
        
        html += `
                </div>
            </div>
        `;
        
        return html;
    }

    /**
     * Clear inspector
     */
    clearInspector() {
        const inspectorContent = document.getElementById('inspector-content');
        if (inspectorContent) {
            inspectorContent.innerHTML = '<p>Select an object to view its properties</p>';
        }
    }

    /**
     * Update hierarchy
     */
    updateHierarchy() {
        const hierarchyTree = document.getElementById('hierarchy-tree');
        if (!hierarchyTree) return;
        
        const objects = this.editorCore.sceneManager.objects;
        
        let html = `
            <div class="tree-item" data-object-id="scene">
                <span class="tree-icon">📁</span>
                <span class="tree-label">Scene</span>
            </div>
        `;
        
        objects.forEach((object, id) => {
            html += `
                <div class="tree-item" data-object-id="${id}">
                    <span class="tree-icon">${this.getObjectIcon(object.type)}</span>
                    <span class="tree-label">${object.name}</span>
                    <button class="delete-object-btn" data-object-id="${id}" title="Delete Object">🗑️</button>
                </div>
            `;
        });
        
        hierarchyTree.innerHTML = html;
        
        // Setup click handlers
        hierarchyTree.querySelectorAll('.tree-item').forEach(item => {
            item.addEventListener('click', (event) => {
                // Don't trigger selection if clicking delete button
                if (event.target.classList.contains('delete-object-btn')) {
                    return;
                }
                
                const objectId = item.dataset.objectId;
                if (objectId && objectId !== 'scene') {
                    this.editorCore.sceneManager.selectObject(objectId);
                    
                    // Update visual selection
                    hierarchyTree.querySelectorAll('.tree-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    
                    // Focus camera on selected object
                    this.focusOnObject(objectId);
                }
            });
        });
        
        // Setup delete button handlers
        hierarchyTree.querySelectorAll('.delete-object-btn').forEach(button => {
            button.addEventListener('click', (event) => {
                event.stopPropagation(); // Prevent triggering selection
                const objectId = button.dataset.objectId;
                if (objectId && objectId !== 'scene') {
                    this.deleteObject(objectId);
                }
            });
        });
    }

    /**
     * Get object icon
     */
    getObjectIcon(type) {
        const icons = {
            'cube': '📦',
            'sphere': '🔮',
            'plane': '📄',
            'cylinder': '🥫',
            'light': '💡',
            'camera': '📷',
            'mesh': '🎭'
        };
        
        return icons[type] || '📦';
    }

    /**
     * Focus camera on selected object
     */
    focusOnObject(objectId) {
        const object = this.editorCore.sceneManager.objects.get(objectId);
        if (!object || !object.mesh) return;
        
        const camera = this.editorCore.sceneManager.camera;
        const controls = this.editorCore.sceneManager.controls;
        
        if (camera && controls) {
            // Calculate distance to object
            const distance = 5; // Default distance
            const direction = new THREE.Vector3();
            direction.subVectors(camera.position, object.mesh.position).normalize();
            
            // Position camera at a good viewing distance
            const newPosition = object.mesh.position.clone().add(direction.multiplyScalar(distance));
            camera.position.copy(newPosition);
            
            // Look at the object
            camera.lookAt(object.mesh.position);
            
            // Update controls target
            controls.target.copy(object.mesh.position);
            controls.update();
        }
    }

    /**
     * Delete object
     */
    deleteObject(objectId) {
        if (confirm('Are you sure you want to delete this object?')) {
            this.editorCore.sceneManager.deleteObject(objectId);
            this.showNotification('Object deleted successfully', 'success');
        }
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        this.editorCore.showMessage(message, type);
    }

    /**
     * Load UI settings
     */
    loadUISettings() {
        const savedSettings = localStorage.getItem('3d-editor-ui-settings');
        if (savedSettings) {
            try {
                const settings = JSON.parse(savedSettings);
                Object.assign(this.settings, settings);
                
                // Ensure collapsedPanels is a Set
                if (settings.collapsedPanels) {
                    this.settings.collapsedPanels = new Set(settings.collapsedPanels);
                }
                
                this.applyUISettings();
            } catch (error) {
                console.warn('Failed to load UI settings:', error);
            }
        }
    }

    /**
     * Save UI settings
     */
    saveUISettings() {
        // Convert Set to Array for JSON serialization
        const settingsToSave = {
            ...this.settings,
            collapsedPanels: Array.from(this.settings.collapsedPanels)
        };
        localStorage.setItem('3d-editor-ui-settings', JSON.stringify(settingsToSave));
    }

    /**
     * Apply UI settings
     */
    applyUISettings() {
        // Apply panel sizes
        Object.entries(this.settings.panelSizes).forEach(([panelId, width]) => {
            const panel = document.getElementById(panelId);
            if (panel) {
                panel.style.width = `${width}px`;
            }
        });
        
        // Apply collapsed panels
        this.settings.collapsedPanels.forEach(panelId => {
            this.togglePanel(panelId);
        });
    }

    /**
     * Update precision transform panel with object data
     */
    updatePrecisionTransformPanel(object) {
        if (!object || !object.mesh) return;
        
        // Find transform input fields in the precision transform panel
        const positionInputs = document.querySelectorAll('[data-transform="position"] input');
        const rotationInputs = document.querySelectorAll('[data-transform="rotation"] input');
        const scaleInputs = document.querySelectorAll('[data-transform="scale"] input');
        
        // Update position inputs
        if (positionInputs.length >= 3) {
            positionInputs[0].value = object.mesh.position.x.toFixed(3);
            positionInputs[1].value = object.mesh.position.y.toFixed(3);
            positionInputs[2].value = object.mesh.position.z.toFixed(3);
        }
        
        // Update rotation inputs (convert from radians to degrees)
        if (rotationInputs.length >= 3) {
            rotationInputs[0].value = (object.mesh.rotation.x * 180 / Math.PI).toFixed(1);
            rotationInputs[1].value = (object.mesh.rotation.y * 180 / Math.PI).toFixed(1);
            rotationInputs[2].value = (object.mesh.rotation.z * 180 / Math.PI).toFixed(1);
        }
        
        // Update scale inputs
        if (scaleInputs.length >= 3) {
            scaleInputs[0].value = object.mesh.scale.x.toFixed(3);
            scaleInputs[1].value = object.mesh.scale.y.toFixed(3);
            scaleInputs[2].value = object.mesh.scale.z.toFixed(3);
        }
        
        // Setup event listeners for the transform inputs
        this.setupPrecisionTransformListeners(object);
    }

    /**
     * Clear precision transform panel
     */
    clearPrecisionTransformPanel() {
        // Find transform input fields in the precision transform panel
        const positionInputs = document.querySelectorAll('[data-transform="position"] input');
        const rotationInputs = document.querySelectorAll('[data-transform="rotation"] input');
        const scaleInputs = document.querySelectorAll('[data-transform="scale"] input');
        
        // Clear all inputs with appropriate default values
        positionInputs.forEach(input => {
            input.value = '0';
        });
        rotationInputs.forEach(input => {
            input.value = '0';
        });
        scaleInputs.forEach(input => {
            input.value = '1';
        });
    }

    /**
     * Setup event listeners for precision transform inputs
     */
    setupPrecisionTransformListeners(object) {
        // Remove existing listeners first
        const allInputs = document.querySelectorAll('[data-transform] input');
        allInputs.forEach(input => {
            input.removeEventListener('change', input._transformListener);
        });
        
        // Add new listeners
        allInputs.forEach(input => {
            const listener = (event) => {
                const transformType = event.target.closest('[data-transform]').dataset.transform;
                const axis = event.target.dataset.axis || this.getAxisFromInput(event.target);
                const value = parseFloat(event.target.value);
                
                this.updateObjectTransform(object, transformType, axis, value);
            };
            
            input._transformListener = listener;
            input.addEventListener('change', listener);
        });
    }

    /**
     * Get axis from input element
     */
    getAxisFromInput(input) {
        return input.dataset.axis || 'x';
    }

    /**
     * Update object transform from precision transform panel
     */
    updateObjectTransform(object, transformType, axis, value) {
        if (!object || !object.mesh) return;
        
        if (transformType === 'position') {
            object.mesh.position[axis] = value;
        } else if (transformType === 'rotation') {
            // Convert degrees to radians
            object.mesh.rotation[axis] = value * Math.PI / 180;
        } else if (transformType === 'scale') {
            object.mesh.scale[axis] = value;
        }
        
        // Update object properties
        object.properties[transformType] = object.mesh[transformType].clone();
        
        // Emit event
        this.eventBus.emit(EventBus.Events.OBJECT_TRANSFORMED, {
            id: object.id,
            object: object
        });
    }

    /**
     * Show add component dialog
     */
    showAddComponentDialog(objectId) {
        const object = this.editorCore.sceneManager.objects.get(objectId);
        if (!object) {
            this.showNotification('Object not found', 'error');
            return;
        }
        
        // Check if object can have components
        if (!this.canObjectHaveComponents(object)) {
            this.showNotification('This object type cannot have components', 'warning');
            return;
        }
        
        const availableComponents = this.editorCore.componentSystem.getComponentTypes();
        const existingComponents = this.editorCore.componentSystem.getComponents(objectId).map(c => c.constructor.name);
        const addableComponents = availableComponents.filter(name => !existingComponents.includes(name));
        
        if (addableComponents.length === 0) {
            this.showNotification('All available components are already added', 'warning');
            return;
        }
        
        const dialogHTML = `
            <div class="modal" id="add-component-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Add Component</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="component-list">
                            ${addableComponents.map(componentName => `
                                <div class="component-item" data-component="${componentName}">
                                    <span class="component-icon">${this.getComponentIcon(componentName)}</span>
                                    <span class="component-name">${componentName}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', dialogHTML);
        this.showModal('add-component-modal');
        
        // Setup component selection
        document.querySelectorAll('#add-component-modal .component-item').forEach(item => {
            item.addEventListener('click', () => {
                const componentName = item.dataset.component;
                this.addComponent(objectId, componentName);
                
                this.hideModal('add-component-modal');
                document.getElementById('add-component-modal').remove();
                this.updateInspector();
            });
        });
    }

    /**
     * Check if object can have components
     */
    canObjectHaveComponents(object) {
        // Only mesh objects can have components (not lights, cameras, etc.)
        return object.mesh && object.mesh.isMesh;
    }

    /**
     * Add component to object
     */
    addComponent(objectId, componentName) {
        try {
            this.editorCore.componentSystem.addComponent(objectId, componentName);
            this.showNotification(`Added ${componentName} component`, 'success');
        } catch (error) {
            this.showNotification(`Failed to add ${componentName}: ${error.message}`, 'error');
        }
    }

    /**
     * Get component icon
     */
    getComponentIcon(componentName) {
        const icons = {
            'Script': '📜',
            'Collider': '🛡️',
            'Light': '💡'
        };
        return icons[componentName] || '🔧';
    }

    /**
     * Setup property change listeners for inspector
     */
    setupPropertyChangeListeners(object) {
        // Component property listeners
        document.querySelectorAll('[data-property]').forEach(input => {
            input.addEventListener('change', (event) => {
                const property = event.target.dataset.property;
                let value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
                
                // Handle color input
                if (event.target.type === 'color') {
                    value = parseInt(value.replace('#', ''), 16);
                }
                
                // Handle number inputs
                if (event.target.type === 'number') {
                    value = parseFloat(value);
                }
                
                this.updateComponentProperty(object, property, value);
            });
        });

        // Range input listeners with value display
        document.querySelectorAll('input[type="range"]').forEach(input => {
            const valueDisplay = input.parentNode.querySelector('.value-display');
            if (valueDisplay) {
                input.addEventListener('input', (event) => {
                    valueDisplay.textContent = event.target.value;
                });
            }
        });

        // Remove component buttons
        document.querySelectorAll('.remove-component').forEach(button => {
            button.addEventListener('click', (event) => {
                const componentName = event.target.dataset.component;
                this.removeComponent(object.id, componentName);
            });
        });

        // Edit script button
        document.querySelectorAll('.edit-script').forEach(button => {
            button.addEventListener('click', (event) => {
                const component = this.findComponentByName(object.id, 'Script');
                if (component) {
                    this.showScriptEditor(component);
                }
            });
        });
    }

    /**
     * Update component property
     */
    updateComponentProperty(object, property, value) {
        const [componentName, propName] = property.split('.');
        const component = this.editorCore.componentSystem.getComponent(object.id, componentName);
        
        if (!component) return;
        
        // Update component property
        if (propName.includes('.')) {
            // Handle nested properties like size.x
            const [parentProp, childProp] = propName.split('.');
            component[parentProp][childProp] = value;
        } else {
            component[propName] = value;
        }
        
        // Update component if it has an update method
        if (typeof component.update === 'function') {
            component.update();
        }
        
        // Emit event
        this.eventBus.emit(EventBus.Events.COMPONENT_UPDATED, {
            entityId: object.id,
            componentName: componentName,
            property: propName,
            value: value
        });
    }

    /**
     * Find component by name
     */
    findComponentByName(objectId, componentName) {
        return this.editorCore.componentSystem.getComponent(objectId, componentName);
    }

    /**
     * Remove component
     */
    removeComponent(objectId, componentName) {
        this.editorCore.componentSystem.removeComponent(objectId, componentName);
        this.updateInspector();
    }

    /**
     * Show script editor
     */
    showScriptEditor(component) {
        const editorHTML = `
            <div class="modal" id="script-editor-modal">
                <div class="modal-content" style="width: 80%; height: 80%;">
                    <div class="modal-header">
                        <h3>Script Editor - ${component.scriptName || 'New Script'}</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body" style="display: flex; flex-direction: column;">
                        <div class="property-row">
                            <label>Script Name:</label>
                            <input type="text" id="script-name" value="${component.scriptName}">
                        </div>
                        <textarea id="script-code" style="flex: 1; font-family: monospace; font-size: 12px;">${component.scriptCode}</textarea>
                        <div class="modal-actions" style="margin-top: 16px;">
                            <button id="save-script">Save Script</button>
                            <button onclick="uiManager.hideModal('script-editor-modal')">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', editorHTML);
        this.showModal('script-editor-modal');
        
        // Setup save button
        document.getElementById('save-script').addEventListener('click', () => {
            const scriptName = document.getElementById('script-name').value;
            const scriptCode = document.getElementById('script-code').value;
            
            component.setScript(scriptName, scriptCode);
            
            this.hideModal('script-editor-modal');
            document.getElementById('script-editor-modal').remove();
            this.updateInspector();
        });
    }

    /**
     * Dispose of the UI manager
     */
    dispose() {
        this.saveUISettings();
        
        // Clean up event listeners
        // (In a real implementation, you'd track and remove all listeners)
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
} else {
    window.UIManager = UIManager;
}

