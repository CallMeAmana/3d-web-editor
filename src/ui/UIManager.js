/**
 * UIManager - Manages the user interface and interactions
 */
class UIManager {
    constructor(eventBus, editorCore) {
        this.eventBus = eventBus;
        this.editorCore = editorCore;
        
        // UI state
        this.panels = new Map();
        this.modals = new Map();
        this.contextMenu = null;
        
        // Drag and drop state
        this.dragState = {
            isDragging: false,
            dragType: null,
            dragData: null,
            dropTarget: null
        };
        
        this.init();
    }

    /**
     * Initialize the UI manager
     */
    init() {
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.setupPanels();
        this.setupModals();
        this.setupInspector();
        this.setupHierarchy();
        
        console.log('UIManager initialized');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Listen for object selection to update inspector
        this.eventBus.on(EventBus.Events.OBJECT_SELECTED, (data) => {
            this.updateInspector(data.object);
            this.updateHierarchy();
        });
        
        this.eventBus.on(EventBus.Events.OBJECT_DESELECTED, () => {
            this.clearInspector();
        });
        
        this.eventBus.on(EventBus.Events.OBJECT_CREATED, (data) => {
            console.log('Object created event received:', data);
            this.updateHierarchy();
        });
        
        this.eventBus.on(EventBus.Events.OBJECT_DELETED, () => {
            this.updateHierarchy();
            this.clearInspector();
        });
        
        this.eventBus.on(EventBus.Events.COMPONENT_ADDED, (data) => {
            this.updateInspector();
        });
        
        this.eventBus.on(EventBus.Events.COMPONENT_REMOVED, (data) => {
            this.updateInspector();
        });
        
        // Listen for scene state changes
        this.eventBus.on(EventBus.Events.SCENE_PLAY, () => {
            this.updateSceneControls('play');
        });
        
        this.eventBus.on(EventBus.Events.SCENE_PAUSE, () => {
            this.updateSceneControls('pause');
        });
        
        this.eventBus.on(EventBus.Events.SCENE_STOP, () => {
            this.updateSceneControls('stop');
        });
    }

    /**
     * Setup drag and drop functionality
     */
    setupDragAndDrop() {
        // Component drag and drop
        const componentItems = document.querySelectorAll('.component-item');
        componentItems.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                const componentName = item.dataset.component;
                this.dragState.isDragging = true;
                this.dragState.dragType = 'component';
                this.dragState.dragData = { componentName };
                
                e.dataTransfer.setData('text/plain', componentName);
                e.dataTransfer.effectAllowed = 'copy';
                
                item.classList.add('dragging');
            });
            
            item.addEventListener('dragend', (e) => {
                this.dragState.isDragging = false;
                this.dragState.dragType = null;
                this.dragState.dragData = null;
                
                item.classList.remove('dragging');
            });
        });
        
        // Viewport drop target
        const viewport = document.getElementById('viewport');
        if (viewport) {
            viewport.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                viewport.classList.add('drag-over');
            });
            
            viewport.addEventListener('dragleave', (e) => {
                viewport.classList.remove('drag-over');
            });
            
            viewport.addEventListener('drop', (e) => {
                e.preventDefault();
                viewport.classList.remove('drag-over');
                
                if (this.dragState.dragType === 'component') {
                    this.handleComponentDrop(e);
                }
            });
        }
    }

    /**
     * Handle component drop on viewport
     */
    handleComponentDrop(event) {
        const selectedObjects = this.editorCore.sceneManager.getSelectedObjects();
        
        if (selectedObjects.length === 0) {
            this.editorCore.showMessage('Please select an object first', 'warning');
            return;
        }
        
        const componentName = this.dragState.dragData.componentName;
        const targetObject = selectedObjects[0];
        
        try {
            // Add component with default data
            let componentData = {};
            
            // Set default data based on component type
            if (componentName === 'Script') {
                componentData = {
                    scriptName: 'New Script',
                    scriptCode: '// New script\nfunction start() {\n    console.log("Script started");\n}\n\nfunction update() {\n    // Update logic here\n}',
                    enabled: true,
                    variables: {}
                };
            } else if (componentName === 'Light') {
                componentData = {
                    type: 'point',
                    color: 0xffffff,
                    intensity: 1,
                    castShadow: true
                };
            } else if (componentName === 'Collider') {
                componentData = {
                    type: 'box',
                    size: { x: 1, y: 1, z: 1 },
                    offset: { x: 0, y: 0, z: 0 },
                    isTrigger: false,
                    enabled: true
                };
            }
            
            this.editorCore.componentSystem.addComponent(targetObject.id, componentName, componentData);
            this.editorCore.showMessage(`Added ${componentName} component to ${targetObject.name}`, 'success');
            
            // Update inspector to show new component
            this.updateInspector(targetObject);
            
        } catch (error) {
            this.editorCore.showMessage(`Failed to add component: ${error.message}`, 'error');
        }
    }

    /**
     * Setup panels
     */
    setupPanels() {
        // Setup panel toggles
        document.querySelectorAll('.panel-header').forEach(header => {
            header.addEventListener('click', () => {
                const panel = header.closest('.panel');
                const content = panel.querySelector('.panel-content');
                const toggle = header.querySelector('.panel-toggle');
                
                const isCollapsed = content.style.display === 'none';
                content.style.display = isCollapsed ? 'block' : 'none';
                toggle.textContent = isCollapsed ? '−' : '+';
                
                this.eventBus.emit(EventBus.Events.UI_PANEL_TOGGLED, {
                    panelId: panel.id,
                    collapsed: !isCollapsed
                });
            });
        });
    }

    /**
     * Setup modals
     */
    setupModals() {
        // Plugin manager modal
        const pluginModal = document.getElementById('plugin-modal');
        if (pluginModal) {
            this.setupModal(pluginModal);
            this.setupPluginManagerTabs();
        }
        
        // Settings modal
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal) {
            this.setupModal(settingsModal);
            this.setupSettingsHandlers();
        }
    }

    /**
     * Setup a modal
     */
    setupModal(modal) {
        // Close button
        const closeBtn = modal.querySelector('.modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.add('hidden');
            });
        }
        
        // Background click to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
        
        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                modal.classList.add('hidden');
            }
        });
    }

    /**
     * Setup plugin manager tabs
     */
    setupPluginManagerTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabPanels = document.querySelectorAll('.tab-panel');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetTab = button.dataset.tab;
                
                // Update button states
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                // Update panel states
                tabPanels.forEach(panel => {
                    panel.classList.remove('active');
                    if (panel.id === `${targetTab}-plugins`) {
                        panel.classList.add('active');
                    }
                });
            });
        });
    }

    /**
     * Setup settings handlers
     */
    setupSettingsHandlers() {
        const saveBtn = document.getElementById('save-settings');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveSettings();
            });
        }
    }

    /**
     * Save settings
     */
    saveSettings() {
        const settings = {
            theme: document.getElementById('theme-select')?.value || 'dark',
            gridSize: parseFloat(document.getElementById('grid-size')?.value || '1'),
            shadowQuality: document.getElementById('shadow-quality')?.value || 'medium',
            antialiasing: document.getElementById('antialiasing')?.checked || true
        };
        
        // Apply settings
        this.editorCore.settings = { ...this.editorCore.settings, ...settings };
        
        // Close modal
        document.getElementById('settings-modal').classList.add('hidden');
        
        this.editorCore.showMessage('Settings saved', 'success');
    }

    /**
     * Setup inspector
     */
    setupInspector() {
        // Inspector will be updated when objects are selected
    }

    /**
     * Update inspector with object properties
     */
    updateInspector(object) {
        const inspectorContent = document.getElementById('inspector-content');
        if (!inspectorContent) return;
        
        if (!object) {
            this.clearInspector();
            return;
        }
        
        let html = `
            <div class="object-inspector">
                <h4>${object.name}</h4>
                <div class="property-group">
                    <h6>Transform</h6>
                    <div class="property-row">
                        <label>Position:</label>
                        <div class="vector-input">
                            <input type="number" id="pos-x" value="${object.properties.position.x.toFixed(2)}" step="0.1">
                            <input type="number" id="pos-y" value="${object.properties.position.y.toFixed(2)}" step="0.1">
                            <input type="number" id="pos-z" value="${object.properties.position.z.toFixed(2)}" step="0.1">
                        </div>
                    </div>
                    <div class="property-row">
                        <label>Rotation:</label>
                        <div class="vector-input">
                            <input type="number" id="rot-x" value="${(object.properties.rotation.x * 180 / Math.PI).toFixed(1)}" step="1">
                            <input type="number" id="rot-y" value="${(object.properties.rotation.y * 180 / Math.PI).toFixed(1)}" step="1">
                            <input type="number" id="rot-z" value="${(object.properties.rotation.z * 180 / Math.PI).toFixed(1)}" step="1">
                        </div>
                    </div>
                    <div class="property-row">
                        <label>Scale:</label>
                        <div class="vector-input">
                            <input type="number" id="scale-x" value="${object.properties.scale.x.toFixed(2)}" step="0.1">
                            <input type="number" id="scale-y" value="${object.properties.scale.y.toFixed(2)}" step="0.1">
                            <input type="number" id="scale-z" value="${object.properties.scale.z.toFixed(2)}" step="0.1">
                        </div>
                    </div>
                </div>
        `;
        
        // Add components
        const components = this.editorCore.componentSystem.getComponents(object.id);
        if (components.length > 0) {
            html += '<div class="property-group"><h6>Components</h6>';
            
            components.forEach(component => {
                html += this.renderComponentInspector(component, object.id);
            });
            
            html += '</div>';
        }
        
        // Add component button
        html += `
            <div class="property-group">
                <button id="add-component-btn">Add Component</button>
                <select id="component-select">
                    <option value="">Select Component...</option>
                    <option value="Script">Script</option>
                    <option value="Collider">Collider</option>
                    <option value="Light">Light</option>
                </select>
            </div>
        `;
        
        html += '</div>';
        
        inspectorContent.innerHTML = html;
        
        // Setup event listeners for inspector controls
        this.setupInspectorEventListeners(object);
    }

    /**
     * Render component inspector
     */
    renderComponentInspector(component, entityId) {
        const componentName = component.constructor.name;
        let html = `
            <div class="component-inspector">
                <div class="component-header">
                    <h5>${componentName}</h5>
                    <button class="remove-component" onclick="uiManager.removeComponent('${entityId}', '${componentName}')">×</button>
                </div>
                <div class="component-properties">
        `;
        
        // Render component-specific properties
        if (componentName === 'Script') {
            html += `
                <div class="property-row">
                    <label>Script Name:</label>
                    <input type="text" value="${component.scriptName}" onchange="uiManager.updateScriptProperty('${entityId}', 'scriptName', this.value)">
                </div>
                <div class="property-row">
                    <label>Enabled:</label>
                    <input type="checkbox" ${component.enabled ? 'checked' : ''} onchange="uiManager.updateScriptProperty('${entityId}', 'enabled', this.checked)">
                </div>
                <div class="property-row">
                    <label>Script Code:</label>
                    <textarea rows="10" onchange="uiManager.updateScriptProperty('${entityId}', 'scriptCode', this.value)">${component.scriptCode}</textarea>
                </div>
                <div class="property-row">
                    <button onclick="uiManager.loadScriptTemplate('${entityId}')">Load Template</button>
                    <select id="script-template-select">
                        <option value="">Select Template...</option>
                        <option value="Simple Rotate">Simple Rotate</option>
                        <option value="Rotator">Rotator</option>
                        <option value="Oscillator">Oscillator</option>
                        <option value="ClickHandler">Click Handler</option>
                    </select>
                </div>
            `;
        } else if (componentName === 'Light') {
            html += `
                <div class="property-row">
                    <label>Type:</label>
                    <select onchange="uiManager.updateLightProperty('${entityId}', 'type', this.value)">
                        <option value="directional" ${component.type === 'directional' ? 'selected' : ''}>Directional</option>
                        <option value="point" ${component.type === 'point' ? 'selected' : ''}>Point</option>
                        <option value="spot" ${component.type === 'spot' ? 'selected' : ''}>Spot</option>
                        <option value="ambient" ${component.type === 'ambient' ? 'selected' : ''}>Ambient</option>
                    </select>
                </div>
                <div class="property-row">
                    <label>Color:</label>
                    <input type="color" value="#${component.color.toString(16).padStart(6, '0')}" onchange="uiManager.updateLightProperty('${entityId}', 'color', parseInt(this.value.substring(1), 16))">
                </div>
                <div class="property-row">
                    <label>Intensity:</label>
                    <input type="range" min="0" max="5" step="0.1" value="${component.intensity}" onchange="uiManager.updateLightProperty('${entityId}', 'intensity', parseFloat(this.value))">
                </div>
                <div class="property-row">
                    <label>Cast Shadow:</label>
                    <input type="checkbox" ${component.castShadow ? 'checked' : ''} onchange="uiManager.updateLightProperty('${entityId}', 'castShadow', this.checked)">
                </div>
            `;
        } else if (componentName === 'Collider') {
            html += `
                <div class="property-row">
                    <label>Type:</label>
                    <select onchange="uiManager.updateColliderProperty('${entityId}', 'type', this.value)">
                        <option value="box" ${component.type === 'box' ? 'selected' : ''}>Box</option>
                        <option value="sphere" ${component.type === 'sphere' ? 'selected' : ''}>Sphere</option>
                        <option value="mesh" ${component.type === 'mesh' ? 'selected' : ''}>Mesh</option>
                    </select>
                </div>
                <div class="property-row">
                    <label>Is Trigger:</label>
                    <input type="checkbox" ${component.isTrigger ? 'checked' : ''} onchange="uiManager.updateColliderProperty('${entityId}', 'isTrigger', this.checked)">
                </div>
                <div class="property-row">
                    <label>Enabled:</label>
                    <input type="checkbox" ${component.enabled ? 'checked' : ''} onchange="uiManager.updateColliderProperty('${entityId}', 'enabled', this.checked)">
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
     * Setup inspector event listeners
     */
    setupInspectorEventListeners(object) {
        // Transform controls
        const posInputs = ['pos-x', 'pos-y', 'pos-z'];
        const rotInputs = ['rot-x', 'rot-y', 'rot-z'];
        const scaleInputs = ['scale-x', 'scale-y', 'scale-z'];
        
        posInputs.forEach((id, index) => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('change', () => {
                    const axes = ['x', 'y', 'z'];
                    const axis = axes[index];
                    const value = parseFloat(input.value);
                    
                    if (object.mesh) {
                        object.mesh.position[axis] = value;
                        object.properties.position[axis] = value;
                    }
                });
            }
        });
        
        rotInputs.forEach((id, index) => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('change', () => {
                    const axes = ['x', 'y', 'z'];
                    const axis = axes[index];
                    const value = parseFloat(input.value) * Math.PI / 180; // Convert to radians
                    
                    if (object.mesh) {
                        object.mesh.rotation[axis] = value;
                        object.properties.rotation[axis] = value;
                    }
                });
            }
        });
        
        scaleInputs.forEach((id, index) => {
            const input = document.getElementById(id);
            if (input) {
                input.addEventListener('change', () => {
                    const axes = ['x', 'y', 'z'];
                    const axis = axes[index];
                    const value = parseFloat(input.value);
                    
                    if (object.mesh) {
                        object.mesh.scale[axis] = value;
                        object.properties.scale[axis] = value;
                    }
                });
            }
        });
        
        // Add component button
        const addComponentBtn = document.getElementById('add-component-btn');
        const componentSelect = document.getElementById('component-select');
        
        if (addComponentBtn && componentSelect) {
            addComponentBtn.addEventListener('click', () => {
                const componentName = componentSelect.value;
                if (componentName) {
                    this.addComponentToObject(object.id, componentName);
                    componentSelect.value = '';
                }
            });
        }
    }

    /**
     * Add component to object
     */
    addComponentToObject(entityId, componentName) {
        try {
            let componentData = {};
            
            // Set default data based on component type
            if (componentName === 'Script') {
                componentData = {
                    scriptName: 'New Script',
                    scriptCode: '// New script\nfunction start() {\n    console.log("Script started");\n}\n\nfunction update() {\n    // Update logic here\n}',
                    enabled: true,
                    variables: {}
                };
            } else if (componentName === 'Light') {
                componentData = {
                    type: 'point',
                    color: 0xffffff,
                    intensity: 1,
                    castShadow: true
                };
            } else if (componentName === 'Collider') {
                componentData = {
                    type: 'box',
                    size: { x: 1, y: 1, z: 1 },
                    offset: { x: 0, y: 0, z: 0 },
                    isTrigger: false,
                    enabled: true
                };
            }
            
            this.editorCore.componentSystem.addComponent(entityId, componentName, componentData);
            
            // Update inspector
            const object = this.editorCore.sceneManager.objects.get(entityId);
            this.updateInspector(object);
            
            this.editorCore.showMessage(`Added ${componentName} component`, 'success');
            
        } catch (error) {
            this.editorCore.showMessage(`Failed to add component: ${error.message}`, 'error');
        }
    }

    /**
     * Remove component from object
     */
    removeComponent(entityId, componentName) {
        try {
            this.editorCore.componentSystem.removeComponent(entityId, componentName);
            
            // Update inspector
            const object = this.editorCore.sceneManager.objects.get(entityId);
            this.updateInspector(object);
            
            this.editorCore.showMessage(`Removed ${componentName} component`, 'success');
            
        } catch (error) {
            this.editorCore.showMessage(`Failed to remove component: ${error.message}`, 'error');
        }
    }

    /**
     * Update script property
     */
    updateScriptProperty(entityId, property, value) {
        const scriptComponent = this.editorCore.componentSystem.getComponent(entityId, 'Script');
        if (scriptComponent) {
            scriptComponent[property] = value;
            
            // If script code changed, recompile
            if (property === 'scriptCode' || property === 'scriptName') {
                scriptComponent.compileScript();
            }
            
            this.editorCore.showMessage(`Updated script ${property}`, 'info');
        }
    }

    /**
     * Update light property
     */
    updateLightProperty(entityId, property, value) {
        const lightComponent = this.editorCore.componentSystem.getComponent(entityId, 'Light');
        if (lightComponent) {
            if (property === 'type') {
                lightComponent.setType(value);
            } else if (property === 'color') {
                lightComponent.setColor(value);
            } else if (property === 'intensity') {
                lightComponent.setIntensity(value);
            } else {
                lightComponent[property] = value;
                lightComponent.update();
            }
            
            this.editorCore.showMessage(`Updated light ${property}`, 'info');
        }
    }

    /**
     * Update collider property
     */
    updateColliderProperty(entityId, property, value) {
        const colliderComponent = this.editorCore.componentSystem.getComponent(entityId, 'Collider');
        if (colliderComponent) {
            colliderComponent[property] = value;
            
            // Recreate collider if type changed
            if (property === 'type') {
                colliderComponent.destroy();
                colliderComponent.createCollider();
            }
            
            this.editorCore.showMessage(`Updated collider ${property}`, 'info');
        }
    }

    /**
     * Load script template
     */
    loadScriptTemplate(entityId) {
        const templateSelect = document.getElementById('script-template-select');
        if (!templateSelect || !templateSelect.value) return;
        
        const templateName = templateSelect.value;
        const templateCode = this.editorCore.componentSystem.getScriptTemplate(templateName);
        
        if (templateCode) {
            this.updateScriptProperty(entityId, 'scriptName', templateName);
            this.updateScriptProperty(entityId, 'scriptCode', templateCode);
            
            // Update inspector to show new code
            const object = this.editorCore.sceneManager.objects.get(entityId);
            this.updateInspector(object);
            
            this.editorCore.showMessage(`Loaded script template: ${templateName}`, 'success');
        }
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
     * Setup hierarchy
     */
    setupHierarchy() {
        this.updateHierarchy();
    }

    /**
     * Update hierarchy tree
     */
    updateHierarchy() {
        const hierarchyTree = document.getElementById('hierarchy-list');
        if (!hierarchyTree) {
            console.warn('Hierarchy list element not found');
            return;
        }
        
        console.log('Updating hierarchy with objects:', this.editorCore.sceneManager.objects.size);
        
        let html = `
            <div class="tree-item" data-object-id="scene">
                <span class="tree-icon">📁</span>
                <span class="tree-label">Scene</span>
            </div>
        `;
        
        // Add all objects
        const objects = Array.from(this.editorCore.sceneManager.objects.values());
        objects.forEach(object => {
            const isSelected = this.editorCore.sceneManager.selectedObjects.has(object.id);
            html += `
                <div class="tree-item ${isSelected ? 'selected' : ''}" data-object-id="${object.id}">
                    <span class="tree-icon">${this.getObjectIcon(object.type)}</span>
                    <span class="tree-label" onclick="uiManager.selectObjectFromHierarchy('${object.id}')">${object.name}</span>
                    <button class="delete-btn" onclick="uiManager.deleteObject('${object.id}')" title="Delete Object">🗑</button>
                </div>
            `;
        });
        
        hierarchyTree.innerHTML = html;
    }

    /**
     * Get icon for object type
     */
    getObjectIcon(type) {
        switch (type) {
            case 'cube': return '📦';
            case 'sphere': return '⚪';
            case 'plane': return '⬜';
            case 'cylinder': return '🥫';
            case 'imported-model': return '🎯';
            case 'light': return '💡';
            case 'camera': return '📷';
            default: return '📦';
        }
    }

    /**
     * Select object from hierarchy
     */
    selectObjectFromHierarchy(objectId) {
        this.editorCore.sceneManager.selectObject(objectId);
    }
    
    deleteObject(objectId) {
        if (confirm('Are you sure you want to delete this object?')) {
            this.editorCore.sceneManager.removeObject(objectId);
        }
    }

    /**
     * Update scene controls and UI state based on play mode
     */
    updateSceneControls(mode) {
        console.log(`updateSceneControls called with mode: ${mode}`);
        
        const playBtn = document.getElementById('play-scene');
        const pauseBtn = document.getElementById('pause-scene');
        const stopBtn = document.getElementById('stop-scene');
        
        if (playBtn && pauseBtn && stopBtn) {
            // Reset all buttons
            playBtn.classList.remove('active');
            pauseBtn.classList.remove('active');
            stopBtn.classList.remove('active');
            
            // Set active button based on mode
            switch (mode) {
                case 'play':
                    playBtn.classList.add('active');
                    this.setPlayModeUI(true);
                    break;
                case 'pause':
                    pauseBtn.classList.add('active');
                    this.setPlayModeUI(true);
                    break;
                case 'stop':
                    stopBtn.classList.add('active');
                    this.setPlayModeUI(false);
                    break;
            }
        } else {
            console.warn('Scene control buttons not found');
        }
    }

    /**
     * Set UI state for play mode (disable editing panels)
     */
    setPlayModeUI(isPlayMode) {
        console.log(`setPlayModeUI called with isPlayMode: ${isPlayMode}`);
        
        // Get all panels that should be disabled during play mode
        const inspectorPanel = document.getElementById('inspector-panel');
        const hierarchyPanel = document.getElementById('hierarchy-panel');
        const toolbarPanel = document.getElementById('main-toolbar');
        const componentPanel = document.getElementById('component-panel');
        
        console.log('Found panels:', {
            inspectorPanel: !!inspectorPanel,
            hierarchyPanel: !!hierarchyPanel,
            toolbarPanel: !!toolbarPanel,
            componentPanel: !!componentPanel
        });
        
        // Add/remove disabled class and disable interactions
        const panelsToDisable = [inspectorPanel, hierarchyPanel, toolbarPanel, componentPanel];
        
        panelsToDisable.forEach(panel => {
            if (panel) {
                if (isPlayMode) {
                    console.log(`Disabling panel: ${panel.id || panel.className}`);
                    panel.classList.add('play-mode-disabled');
                    panel.style.pointerEvents = 'none';
                    panel.style.opacity = '0.6';
                    
                    // Disable all input elements within the panel, except scene control buttons
                    const inputs = panel.querySelectorAll('input, select, textarea, button');
                    inputs.forEach(input => {
                        // Don't disable scene control buttons
                        if (!input.id || !['play-scene', 'pause-scene', 'stop-scene'].includes(input.id)) {
                            input.disabled = true;
                            console.log(`Disabled input element:`, input);
                        }
                    });
                    
                    console.log(`Panel ${panel.id} disabled successfully`);
                } else {
                    console.log(`Enabling panel: ${panel.id || panel.className}`);
                    panel.classList.remove('play-mode-disabled');
                    panel.style.pointerEvents = 'auto';
                    panel.style.opacity = '1';
                    
                    // Re-enable all input elements within the panel
                    const inputs = panel.querySelectorAll('input, select, textarea, button');
                    inputs.forEach(input => {
                        input.disabled = false;
                        console.log(`Enabled input element:`, input);
                    });
                    
                    console.log(`Panel ${panel.id} enabled successfully`);
                }
            } else {
                console.warn(`Panel not found: ${panel}`);
            }
        });
        
        // Show/hide play mode indicator
        this.showPlayModeIndicator(isPlayMode);
    }

    /**
     * Show or hide play mode indicator
     */
    showPlayModeIndicator(isPlayMode) {
        let indicator = document.getElementById('play-mode-indicator');
        
        if (isPlayMode) {
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.id = 'play-mode-indicator';
                indicator.innerHTML = `
                    <div style="
                        position: fixed;
                        top: 10px;
                        right: 10px;
                        background: #ff4444;
                        color: white;
                        padding: 8px 12px;
                        border-radius: 4px;
                        font-weight: bold;
                        z-index: 1000;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                    ">
                        PLAY MODE
                    </div>
                `;
                document.body.appendChild(indicator);
            }
        } else {
            if (indicator) {
                indicator.remove();
            }
        }
    }

    /**
     * Show context menu
     */
    showContextMenu(x, y, actions) {
        // Remove existing context menu
        if (this.contextMenu) {
            this.contextMenu.remove();
        }
        
        // Create context menu
        this.contextMenu = document.createElement('div');
        this.contextMenu.className = 'context-menu';
        this.contextMenu.style.position = 'fixed';
        this.contextMenu.style.left = `${x}px`;
        this.contextMenu.style.top = `${y}px`;
        this.contextMenu.style.background = 'var(--bg-secondary)';
        this.contextMenu.style.border = '1px solid var(--border-color)';
        this.contextMenu.style.borderRadius = 'var(--radius)';
        this.contextMenu.style.padding = '8px 0';
        this.contextMenu.style.zIndex = '1000';
        this.contextMenu.style.minWidth = '150px';
        
        // Add actions
        actions.forEach(action => {
            const item = document.createElement('div');
            item.className = 'context-menu-item';
            item.textContent = action.label;
            item.style.padding = '8px 16px';
            item.style.cursor = 'pointer';
            item.style.color = 'var(--text-primary)';
            
            item.addEventListener('click', () => {
                action.action();
                this.hideContextMenu();
            });
            
            item.addEventListener('mouseenter', () => {
                item.style.background = 'var(--bg-tertiary)';
            });
            
            item.addEventListener('mouseleave', () => {
                item.style.background = 'transparent';
            });
            
            this.contextMenu.appendChild(item);
        });
        
        document.body.appendChild(this.contextMenu);
        
        // Hide on click outside
        setTimeout(() => {
            document.addEventListener('click', this.hideContextMenu.bind(this), { once: true });
        }, 0);
    }

    /**
     * Hide context menu
     */
    hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.remove();
            this.contextMenu = null;
        }
    }

    /**
     * Dispose of the UI manager
     */
    dispose() {
        // Clean up event listeners and DOM elements
        this.hideContextMenu();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIManager;
} else {
    window.UIManager = UIManager;
}