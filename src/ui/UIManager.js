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
        
        // Initialize scene control button states to match edit/stop mode
        this.updateSceneControls('stop');
        
        // Initialize viewport control button states
        this.initializeViewportButtonStates();
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
            // console.log('Object created event received:', data);
            this.updateHierarchy();
        });
        
        this.eventBus.on(EventBus.Events.OBJECT_DELETED, () => {
            this.updateHierarchy();
            this.clearInspector();
        });
        
        this.eventBus.on(EventBus.Events.COMPONENT_ADDED, (data) => {
            if (data && data.entityId) {
                const object = this.editorCore.sceneManager.objects.get(data.entityId);
                if (object) {
                    this.updateInspector(object);
                } else {
                    this.clearInspector();
                }
            } else {
                this.clearInspector();
            }
        });
        
        this.eventBus.on(EventBus.Events.COMPONENT_REMOVED, (data) => {
            if (data && data.entityId) {
                const object = this.editorCore.sceneManager.objects.get(data.entityId);
                if (object) {
                    this.updateInspector(object);
                } else {
                    this.clearInspector();
                }
            } else {
                this.clearInspector();
            }
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

        // Setup toolbar button handlers
        this.setupToolbarButtons();
    }

    /**
     * Setup toolbar button event handlers
     */
    setupToolbarButtons() {
        // Scene management buttons
        const newSceneBtn = document.getElementById('new-scene');
        if (newSceneBtn) {
            newSceneBtn.addEventListener('click', () => {
                this.editorCore.newProject();
            });
        }

        const saveSceneBtn = document.getElementById('save-scene');
        if (saveSceneBtn) {
            saveSceneBtn.addEventListener('click', () => {
                this.editorCore.saveProject();
            });
        }

        const openSceneBtn = document.getElementById('open-scene');
        if (openSceneBtn) {
            openSceneBtn.addEventListener('click', () => {
                this.editorCore.openProject();
            });
        }

        // Undo/Redo buttons
        const undoBtn = document.getElementById('undo');
        if (undoBtn) {
            undoBtn.addEventListener('click', () => {
                this.editorCore.undo();
            });
        }

        const redoBtn = document.getElementById('redo');
        if (redoBtn) {
            redoBtn.addEventListener('click', () => {
                this.editorCore.redo();
            });
        }

        // Viewport control buttons
        const gridToggleBtn = document.getElementById('grid-toggle');
        if (gridToggleBtn) {
            gridToggleBtn.addEventListener('click', () => {
                this.editorCore.sceneManager.toggleGrid();
                // Update button state based on actual setting
                const newState = this.editorCore.sceneManager.settings.showGrid;
                gridToggleBtn.classList.toggle('active', newState);
            });
        } else {
            console.error('Grid toggle button not found!');
        }

        const fullscreenToggleBtn = document.getElementById('fullscreen-toggle');
        if (fullscreenToggleBtn) {
            fullscreenToggleBtn.addEventListener('click', () => {
                this.toggleFullscreen();
            });
        }

        // Import model button
        const importBtn = document.getElementById('import-model');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                this.handleImportModel();
            });
        }

        // Scene control buttons
        const playBtn = document.getElementById('play-scene');
        const pauseBtn = document.getElementById('pause-scene');
        const stopBtn = document.getElementById('stop-scene');

        if (playBtn) {
            playBtn.addEventListener('click', () => {
                this.editorCore.playScene();
            });
        }

        if (pauseBtn) {
            pauseBtn.addEventListener('click', () => {
                this.editorCore.pauseScene();
            });
        }

        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                this.editorCore.stopScene();
            });
        }

        // Clear console button
        const clearConsoleBtn = document.getElementById('clear-console');
        if (clearConsoleBtn) {
            clearConsoleBtn.addEventListener('click', () => {
                const consoleOutput = document.getElementById('console-output');
                if (consoleOutput) {
                    consoleOutput.innerHTML = '';
                }
            });
        }

        // Console input
        const consoleInput = document.getElementById('console-input');
        const consoleSubmit = document.getElementById('console-submit');
        
        if (consoleSubmit && consoleInput) {
            const executeConsoleCommand = () => {
                const command = consoleInput.value.trim();
                if (command && this.editorCore) {
                    try {
                        // Simple command execution
                        if (command === 'help') {
                            console.log('Available commands: help, addCube, addTestCube, clear, scriptStatus, testSelection');
                        } else if (command === 'addCube') {
                            this.editorCore.sceneManager.addObject('cube', {
                                name: 'ConsoleCube',
                                x: Math.random() * 10 - 5,
                                y: Math.random() * 10 - 5,
                                z: Math.random() * 10 - 5,
                                color: 0xff0000
                            });
                            console.log('Added cube via console command');
                        } else if (command === 'addTestCube') {
                            this.editorCore.sceneManager.addObject('cube', {
                                name: 'TestCube',
                                x: 0, y: 0, z: 0,
                                color: 0x00ff00
                            });
                            console.log('Added test cube at origin');
                        } else if (command === 'clear') {
                            this.editorCore.sceneManager.clearScene();
                            console.log('Scene cleared');
                        } else if (command === 'scriptStatus') {
                            const status = this.editorCore.componentSystem.getScriptStatus();
                            console.log('Script Status:', status);
                        } else if (command === 'testSelection') {
                            const objects = Array.from(this.editorCore.sceneManager.objects.values());
                            if (objects.length > 0) {
                                const firstObject = objects[0];
                                this.editorCore.sceneManager.selectObject(firstObject.id);
                                console.log(`Selected object: ${firstObject.name} (${firstObject.id})`);
                            } else {
                                console.log('No objects in scene to select');
                            }
                        } else {
                            console.log(`Unknown command: ${command}`);
                        }
                    } catch (error) {
                        console.error('Command execution error:', error);
                    }
                    consoleInput.value = '';
                }
            };
            
            consoleSubmit.addEventListener('click', executeConsoleCommand);
            consoleInput.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') {
                    executeConsoleCommand();
                }
            });
        }

        // Plugin Manager button
        const pluginManagerBtn = document.getElementById('plugin-manager-btn');
        if (pluginManagerBtn) {
            pluginManagerBtn.addEventListener('click', () => {
                // Emit event for plugin manager
                this.eventBus.emit('ui:plugin-manager-opened');
                // Show the modal
                const pluginModal = document.getElementById('plugin-modal');
                if (pluginModal) {
                    pluginModal.classList.remove('hidden');
                    // Refresh plugin list when modal is opened
                    if (this.editorCore.pluginManager) {
                        this.editorCore.pluginManager.refreshPluginList();
                    }
                }
            });
        }
    }

    /**
     * Handle import model button click
     */
    handleImportModel() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.glb,.gltf,.fbx,.obj,.dae,.3ds,.ply,.stl';
        input.multiple = true;
        input.onchange = (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) {
                files.forEach(file => {
                    this.editorCore.sceneManager.importModel(file)
                        .then(() => {
                            console.log(`Model "${file.name}" imported successfully`);
                            this.editorCore.showMessage(`Model "${file.name}" imported successfully`, 'success');
                        })
                        .catch(error => {
                            console.error(`Failed to import "${file.name}": ${error.message}`);
                            this.editorCore.showMessage(`Failed to import "${file.name}": ${error.message}`, 'error');
                        });
                });
            }
        };
        input.click();
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
        // Plugin Manager Modal
        const pluginModal = document.getElementById('plugin-modal');
        if (pluginModal) {
            // Setup tab switching
            const tabBtns = pluginModal.querySelectorAll('.tab-btn');
            const tabContents = pluginModal.querySelectorAll('.tab-content');
            
            tabBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const targetTab = btn.getAttribute('data-tab');
                    
                    // Update active tab button
                    tabBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    
                    // Update active tab content
                    tabContents.forEach(content => {
                        content.classList.remove('active');
                        if (content.id === `${targetTab}-tab`) {
                            content.classList.add('active');
                        }
                    });
                });
            });
            
            // Close button functionality
            const closeBtn = pluginModal.querySelector('.modal-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    pluginModal.classList.add('hidden');
                });
            }
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
        if (!object) {
            this.clearInspector();
            return;
        }
        
        const inspectorContent = document.getElementById('inspector-content');
        if (!inspectorContent) return;
        
        // Start building the HTML for the inspector
        let html = `
            <div class="object-inspector">
                <div class="property-group">
                    <h6>Name</h6>
                    <div class="property-row">
                        <input type="text" id="object-name" value="${object.name || 'Unnamed Object'}" class="object-name-input" placeholder="Enter object name">
                    </div>
                </div>
                <div class="property-group">
                    <h6>Transform</h6>
                    <div class="property-row vertical-inputs">
                        <label>Position:</label>
                        <div class="vector-input vertical-inputs">
                            <input type="number" id="pos-x" value="${object.properties.position.x.toFixed(2)}" step="0.1" placeholder="X">
                            <input type="number" id="pos-y" value="${object.properties.position.y.toFixed(2)}" step="0.1" placeholder="Y">
                            <input type="number" id="pos-z" value="${object.properties.position.z.toFixed(2)}" step="0.1" placeholder="Z">
                        </div>
                    </div>
                    <div class="property-row vertical-inputs">
                        <label>Rotation:</label>
                        <div class="vector-input vertical-inputs">
                            <input type="number" id="rot-x" value="${(object.properties.rotation.x * 180 / Math.PI).toFixed(1)}" step="1" placeholder="X">
                            <input type="number" id="rot-y" value="${(object.properties.rotation.y * 180 / Math.PI).toFixed(1)}" step="1" placeholder="Y">
                            <input type="number" id="rot-z" value="${(object.properties.rotation.z * 180 / Math.PI).toFixed(1)}" step="1" placeholder="Z">
                        </div>
                    </div>
                    <div class="property-row">
                        <label>Size:</label>
                        <input type="number" id="size-input" value="${object.properties.size || 1.0}" step="0.25" placeholder="Size">
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
        
        // Setup name change handler
        const nameInput = document.getElementById('object-name');
        if (nameInput) {
            nameInput.addEventListener('change', (e) => {
                const newName = e.target.value.trim();
                if (newName && newName !== object.name) {
                    // Update the object's name in the scene manager
                    this.editorCore.sceneManager.renameObject(object.id, newName);
                    
                    // Update the object's name in the hierarchy
                    const hierarchyItem = document.querySelector(`[data-object-id="${object.id}"] .tree-label`);
                    if (hierarchyItem) {
                        hierarchyItem.textContent = newName;
                    }
                    
                    // Show feedback to the user
                    this.editorCore.showMessage(`Renamed to: ${newName}`, 'success');
                }
            });
        }
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
        
        // Size input
        const sizeInput = document.getElementById('size-input');
        if (sizeInput) {
            sizeInput.addEventListener('change', () => {
                let size = parseFloat(sizeInput.value);
                if (isNaN(size) || size <= 0) size = 0.01;
                sizeInput.value = size;
                this.editorCore.sceneManager.setObjectUniformSize(object.id, size);
            });
        }

        // Listen for size updates from the scene (e.g., from gizmo)
        this.eventBus.on('object:size-updated', (data) => {
            if (data.id === object.id && sizeInput) {
                sizeInput.value = data.size;
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
                    <span class="tree-label" onclick="uiManager.selectObjectFromHierarchy('${object.id}')" ondblclick="uiManager.focusObjectFromHierarchy('${object.id}')">${object.name}</span>
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

    /**
     * Focus object from hierarchy on double-click
     */
    focusObjectFromHierarchy(objectId) {
        const object = this.editorCore.sceneManager.objects.get(objectId);
        if (object) {
            this.editorCore.sceneManager.focusOnObjectSmooth(object);
        }
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
        // console.log(`updateSceneControls called with mode: ${mode}`);
        
        const playBtn = document.getElementById('play-scene');
        const pauseBtn = document.getElementById('pause-scene');
        const stopBtn = document.getElementById('stop-scene');
        
        if (playBtn && pauseBtn && stopBtn) {
            // Reset all buttons
            playBtn.classList.remove('active');
            pauseBtn.classList.remove('active');
            stopBtn.classList.remove('active');
            
            // Set active button and enable/disable based on mode
            switch (mode) {
                case 'play':
                    playBtn.classList.add('active');
                    playBtn.disabled = true;
                    pauseBtn.disabled = false;
                    stopBtn.disabled = false;
                    this.setPlayModeUI(true);
                    break;
                case 'pause':
                    pauseBtn.classList.add('active');
                    playBtn.disabled = false;
                    pauseBtn.disabled = true;
                    stopBtn.disabled = false;
                    this.setPlayModeUI(true);
                    break;
                case 'stop':
                    stopBtn.classList.add('active');
                    playBtn.disabled = false;
                    pauseBtn.disabled = true;
                    stopBtn.disabled = true;
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
        // console.log(`setPlayModeUI called with isPlayMode: ${isPlayMode}`);
        
        // Panels that can be dimmed, but toolbar must stay clickable for controls
        const inspectorPanel = document.getElementById('inspector-panel');
        const hierarchyPanel = document.getElementById('hierarchy-panel');
        const componentPanel = document.getElementById('component-panel');
        const toolbarPanel = document.getElementById('main-toolbar');
        
        const panelsToDisable = [inspectorPanel, hierarchyPanel, componentPanel];
        
        panelsToDisable.forEach(panel => {
            if (!panel) return;
            if (isPlayMode) {
                panel.classList.add('play-mode-disabled');
                panel.style.pointerEvents = 'none';
                panel.style.opacity = '0.6';
                const inputs = panel.querySelectorAll('input, select, textarea, button');
                inputs.forEach(input => { input.disabled = true; });
            } else {
                panel.classList.remove('play-mode-disabled');
                panel.style.pointerEvents = 'auto';
                panel.style.opacity = '1';
                const inputs = panel.querySelectorAll('input, select, textarea, button');
                inputs.forEach(input => { input.disabled = false; });
            }
        });
        
        // Keep toolbar interactive. Only disable non-control buttons when playing
        if (toolbarPanel) {
            const toolbarButtons = toolbarPanel.querySelectorAll('button');
            toolbarButtons.forEach(btn => {
                const id = btn.id || '';
                const isControl = ['play-scene','pause-scene','stop-scene'].includes(id);
                if (isPlayMode) {
                    if (!isControl) btn.disabled = true;
                } else {
                    btn.disabled = false;
                }
            });
        }
        
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
     * Toggle fullscreen mode
     */
    toggleFullscreen() {
        const viewport = document.getElementById('viewport');
        if (!viewport) return;

        if (!document.fullscreenElement) {
            // Enter fullscreen
            if (viewport.requestFullscreen) {
                viewport.requestFullscreen();
            } else if (viewport.webkitRequestFullscreen) {
                viewport.webkitRequestFullscreen();
            } else if (viewport.msRequestFullscreen) {
                viewport.msRequestFullscreen();
            }
        } else {
            // Exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    }

    /**
     * Initialize viewport button states
     */
    initializeViewportButtonStates() {
        const gridToggleBtn = document.getElementById('grid-toggle');

        if (gridToggleBtn) {
            gridToggleBtn.classList.toggle('active', this.editorCore.sceneManager.settings.showGrid);
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