/**
 * EditorCore - Main editor controller that orchestrates all systems
 * Manages the overall state and coordinates between different modules
 */
class EditorCore {
    static instance = null;
    
    static setInstance(instance) {
        EditorCore.instance = instance;
    }
    
    static getInstance() {
        return EditorCore.instance;
    }
    
    constructor(eventBus, sceneManager, componentSystem, assetManager) {
        this.eventBus = eventBus || new EventBus();
        this.sceneManager = sceneManager;
        this.componentSystem = componentSystem;
        this.assetManager = assetManager;
        this.pluginManager = null;
        this.uiManager = null;
        
        // Editor state
        this.isInitialized = false;
        this.currentTool = 'select';
        this.editorMode = 'edit'; // edit, play, debug
        this.project = {
            name: 'Untitled Project',
            version: '1.0.0',
            created: new Date(),
            modified: new Date()
        };
        
        // Command history for undo/redo
        this.commandHistory = [];
        this.commandIndex = -1;
        this.maxHistorySize = 100;
        
        // Settings
        this.settings = {
            autoSave: true,
            autoSaveInterval: 300000, // 5 minutes
            theme: 'dark',
            language: 'en',
            performance: {
                targetFPS: 60,
                enableVSync: true,
                shadowQuality: 'medium'
            }
        };
        
        // Don't auto-initialize, wait for explicit init call
    }

    /**
     * Initialize the editor
     */
    async init() {
        try {
            console.log('Initializing 3D Web Editor...');
            
            // Keep debug mode disabled to reduce console spam
            // if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            //     this.eventBus.setDebugMode(true);
            // }
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Setup auto-save
            this.setupAutoSave();
            
            // Mark as initialized
            this.isInitialized = true;
            
            // Emit ready event
            this.eventBus.emit(EventBus.Events.EDITOR_READY, {
                version: '1.0.0',
                timestamp: new Date()
            });
            
            console.log('3D Web Editor initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize editor:', error);
            this.showError('Failed to initialize editor', error.message);
        }
    }

    /**
     * Initialize core systems
     */
    async initializeCore() {
        // Get viewport container
        const viewportContainer = document.getElementById('viewport');
        if (!viewportContainer) {
            throw new Error('Viewport container not found');
        }
        
        // Initialize scene manager
        this.sceneManager = new SceneManager(this.eventBus, viewportContainer);
        
        // Initialize component system
        this.componentSystem = new ComponentSystem(this.eventBus);
        
        // Initialize asset manager
        this.assetManager = new AssetManager(this.eventBus);
        
        // Initialize plugin manager
        this.pluginManager = new PluginManager(this.eventBus, this);
        
        console.log('Core systems initialized');
    }

    /**
     * Initialize UI systems
     */
    async initializeUI() {
        // Initialize UI manager
        this.uiManager = new UIManager(this.eventBus, this);
        
        // Setup tool handlers
        this.setupToolHandlers();
        
        // Setup menu handlers
        this.setupMenuHandlers();
        
        console.log('UI systems initialized');
    }

    /**
     * Initialize plugin system
     */
    async initializePlugins() {
        // Load core plugins
        const corePlugins = [
            'transform-tools',
            'material-editor',
            'lighting-tools'
        ];
        
        for (const pluginId of corePlugins) {
            try {
                await this.pluginManager.loadPlugin(pluginId);
            } catch (error) {
                console.warn(`Failed to load core plugin ${pluginId}:`, error);
            }
        }
        
        console.log('Plugin system initialized');
    }

    /**
     * Setup global event listeners
     */
    setupEventListeners() {
        // Keyboard shortcuts
        document.addEventListener('keydown', (event) => this.handleKeyDown(event));
        
        // Before unload warning
        window.addEventListener('beforeunload', (event) => {
            if (this.hasUnsavedChanges()) {
                event.preventDefault();
                event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return event.returnValue;
            }
        });
        
        // Listen for scene changes
        this.eventBus.on(EventBus.Events.SCENE_CHANGED, () => {
            this.project.modified = new Date();
        });
        
        // Listen for object events
        this.eventBus.on(EventBus.Events.OBJECT_CREATED, (data) => {
            this.executeCommand(new CreateObjectCommand(data.object));
        });
        
        this.eventBus.on(EventBus.Events.OBJECT_DELETED, (data) => {
            this.executeCommand(new DeleteObjectCommand(data.object));
        });
    }

    /**
     * Setup tool handlers
     */
    setupToolHandlers() {
        // Select tool
        document.getElementById('select-tool')?.addEventListener('click', () => {
            this.activateTool('select');
        });
        
        // Transform tools
        document.getElementById('move-tool')?.addEventListener('click', () => {
            this.activateTool('move');
        });
        
        document.getElementById('rotate-tool')?.addEventListener('click', () => {
            this.activateTool('rotate');
        });
        
        document.getElementById('scale-tool')?.addEventListener('click', () => {
            this.activateTool('scale');
        });
        
        // Object creation tools
        document.getElementById('add-cube')?.addEventListener('click', () => {
            this.createObject('cube');
        });
        
        document.getElementById('add-sphere')?.addEventListener('click', () => {
            this.createObject('sphere');
        });
        
        document.getElementById('add-light')?.addEventListener('click', () => {
            this.createObject('light');
        });
        
        // Viewport controls
        document.getElementById('wireframe-toggle')?.addEventListener('click', () => {
            this.eventBus.emit(EventBus.Events.TOOL_ACTIVATED, { tool: 'wireframe' });
        });
        
        document.getElementById('grid-toggle')?.addEventListener('click', () => {
            this.eventBus.emit(EventBus.Events.TOOL_ACTIVATED, { tool: 'grid' });
        });
        
        document.getElementById('camera-reset')?.addEventListener('click', () => {
            this.eventBus.emit(EventBus.Events.TOOL_ACTIVATED, { tool: 'camera-reset' });
        });
    }

    /**
     * Setup menu handlers
     */
    setupMenuHandlers() {
        // File menu
        document.getElementById('file-menu')?.addEventListener('click', () => {
            this.showFileMenu();
        });
        
        // Edit menu
        document.getElementById('edit-menu')?.addEventListener('click', () => {
            this.showEditMenu();
        });
        
        // View menu
        document.getElementById('view-menu')?.addEventListener('click', () => {
            this.showViewMenu();
        });
        
        // Plugins menu
        document.getElementById('plugins-menu')?.addEventListener('click', () => {
            this.showPluginManager();
        });
        
        // Help menu
        document.getElementById('help-menu')?.addEventListener('click', () => {
            this.showHelpMenu();
        });
    }

    /**
     * Handle keyboard shortcuts
     */
    handleKeyDown(event) {
        // Prevent default for editor shortcuts
        const isEditorShortcut = event.ctrlKey || event.metaKey;
        
        if (isEditorShortcut) {
            switch (event.key.toLowerCase()) {
                case 's':
                    event.preventDefault();
                    this.saveProject();
                    break;
                case 'o':
                    event.preventDefault();
                    this.openProject();
                    break;
                case 'n':
                    event.preventDefault();
                    this.newProject();
                    break;
                case 'z':
                    event.preventDefault();
                    if (event.shiftKey) {
                        this.redo();
                    } else {
                        this.undo();
                    }
                    break;
                case 'y':
                    event.preventDefault();
                    this.redo();
                    break;
                case 'd':
                    event.preventDefault();
                    this.duplicateSelected();
                    break;
            }
        }
        
        // Tool shortcuts
        switch (event.key.toLowerCase()) {
            case 'q':
                this.activateTool('select');
                break;
            case 'w':
                this.activateTool('move');
                break;
            case 'e':
                this.activateTool('rotate');
                break;
            case 'r':
                this.activateTool('scale');
                break;
            case 'Delete':
            case 'Backspace':
                event.preventDefault();
                this.deleteSelected();
                break;
        }
    }

    /**
     * Activate a tool
     */
    activateTool(toolName) {
        if (this.currentTool === toolName) return;
        
        // Deactivate current tool
        this.eventBus.emit(EventBus.Events.TOOL_DEACTIVATED, { tool: this.currentTool });
        
        // Update UI
        document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
        const toolBtn = document.getElementById(`${toolName}-tool`);
        if (toolBtn) {
            toolBtn.classList.add('active');
        }
        
        // Activate new tool
        this.currentTool = toolName;
        this.eventBus.emit(EventBus.Events.TOOL_ACTIVATED, { tool: toolName });
        
        console.log(`Activated tool: ${toolName}`);
    }

    /**
     * Create a new object
     */
    createObject(type, options = {}) {
        if (!this.sceneManager) return null;
        
        // Add some randomization to position to avoid overlap
        const randomOffset = () => (Math.random() - 0.5) * 2;
        const defaultOptions = {
            x: randomOffset(),
            y: 0,
            z: randomOffset(),
            ...options
        };
        
        const object = this.sceneManager.addObject(type, defaultOptions);
        
        if (object) {
            // Select the new object
            this.sceneManager.selectObject(object.id);
            console.log(`Created ${type} object:`, object.id);
        }
        
        return object;
    }

    /**
     * Delete selected objects
     */
    deleteSelected() {
        const selectedObjects = this.sceneManager.getSelectedObjects();
        
        if (selectedObjects.length === 0) {
            this.showMessage('No objects selected to delete', 'warning');
            return;
        }
        
        // Create delete command for undo/redo
        const deleteCommands = selectedObjects.map(object => new DeleteObjectCommand(object));
        
        selectedObjects.forEach(object => {
            this.sceneManager.removeObject(object.id);
        });
        
        // Add to command history
        deleteCommands.forEach(command => {
            this.executeCommand(command);
        });
        
        this.showMessage(`Deleted ${selectedObjects.length} object(s)`, 'success');
        console.log(`Deleted ${selectedObjects.length} object(s)`);
    }

    /**
     * Duplicate selected objects
     */
    duplicateSelected() {
        const selectedObjects = this.sceneManager.getSelectedObjects();
        
        selectedObjects.forEach(object => {
            const newObject = this.createObject(object.type, {
                ...object.properties,
                x: object.properties.x + 1,
                z: object.properties.z + 1,
                name: `${object.name}_copy`
            });
        });
        
        if (selectedObjects.length > 0) {
            console.log(`Duplicated ${selectedObjects.length} object(s)`);
        }
    }

    /**
     * Execute a command (for undo/redo system)
     */
    executeCommand(command) {
        // Remove any commands after current index
        this.commandHistory = this.commandHistory.slice(0, this.commandIndex + 1);
        
        // Add new command
        this.commandHistory.push(command);
        this.commandIndex++;
        
        // Limit history size
        if (this.commandHistory.length > this.maxHistorySize) {
            this.commandHistory.shift();
            this.commandIndex--;
        }
        
        // Execute command
        command.execute();
        
        this.eventBus.emit(EventBus.Events.EDITOR_COMMAND_EXECUTED, { command });
    }

    /**
     * Undo last command
     */
    undo() {
        if (this.commandIndex >= 0) {
            const command = this.commandHistory[this.commandIndex];
            command.undo();
            this.commandIndex--;
            console.log('Undo:', command.constructor.name);
        }
    }

    /**
     * Redo last undone command
     */
    redo() {
        if (this.commandIndex < this.commandHistory.length - 1) {
            this.commandIndex++;
            const command = this.commandHistory[this.commandIndex];
            command.execute();
            console.log('Redo:', command.constructor.name);
        }
    }

    /**
     * Save project
     */
    async saveProject() {
        try {
            const projectData = {
                project: this.project,
                scene: this.sceneManager.exportScene(),
                plugins: this.pluginManager.getLoadedPlugins(),
                settings: this.settings
            };
            
            // For now, save to localStorage
            localStorage.setItem('3d-editor-project', JSON.stringify(projectData));
            
            this.project.modified = new Date();
            console.log('Project saved successfully');
            this.showMessage('Project saved successfully', 'success');
            
        } catch (error) {
            console.error('Failed to save project:', error);
            this.showError('Failed to save project', error.message);
        }
    }

    /**
     * Load project
     */
    async loadProject(projectData) {
        try {
            if (typeof projectData === 'string') {
                projectData = JSON.parse(projectData);
            }
            
            // Load project info
            if (projectData.project) {
                this.project = { ...this.project, ...projectData.project };
            }
            
            // Load scene
            if (projectData.scene) {
                this.sceneManager.importScene(projectData.scene);
            }
            
            // Load settings
            if (projectData.settings) {
                this.settings = { ...this.settings, ...projectData.settings };
            }
            
            // Load plugins
            if (projectData.plugins) {
                for (const pluginId of projectData.plugins) {
                    try {
                        await this.pluginManager.loadPlugin(pluginId);
                    } catch (error) {
                        console.warn(`Failed to load plugin ${pluginId}:`, error);
                    }
                }
            }
            
            console.log('Project loaded successfully');
            this.showMessage('Project loaded successfully', 'success');
            
        } catch (error) {
            console.error('Failed to load project:', error);
            this.showError('Failed to load project', error.message);
        }
    }

    /**
     * Create new project
     */
    newProject() {
        if (this.hasUnsavedChanges()) {
            if (!confirm('You have unsaved changes. Create new project anyway?')) {
                return;
            }
        }
        
        // Clear scene
        this.sceneManager.clearScene();
        
        // Reset project
        this.project = {
            name: 'Untitled Project',
            version: '1.0.0',
            created: new Date(),
            modified: new Date()
        };
        
        // Clear command history
        this.commandHistory = [];
        this.commandIndex = -1;
        
        console.log('New project created');
        this.showMessage('New project created', 'info');
    }

    /**
     * Open project from file
     */
    openProject() {
        // For now, load from localStorage
        const savedProject = localStorage.getItem('3d-editor-project');
        if (savedProject) {
            this.loadProject(savedProject);
        } else {
            this.showMessage('No saved project found', 'warning');
        }
    }

    /**
     * Check if there are unsaved changes
     */
    hasUnsavedChanges() {
        // Simple check - in a real app, you'd track dirty state
        return this.commandHistory.length > 0;
    }

    /**
     * Setup auto-save
     */
    setupAutoSave() {
        if (this.settings.autoSave) {
            setInterval(() => {
                if (this.hasUnsavedChanges()) {
                    this.saveProject();
                }
            }, this.settings.autoSaveInterval);
        }
    }

    /**
     * Show file menu
     */
    showFileMenu() {
        // TODO: Implement dropdown menu
        console.log('File menu clicked');
    }

    /**
     * Show edit menu
     */
    showEditMenu() {
        // TODO: Implement dropdown menu
        console.log('Edit menu clicked');
    }

    /**
     * Show view menu
     */
    showViewMenu() {
        // TODO: Implement dropdown menu
        console.log('View menu clicked');
    }

    /**
     * Show plugin manager
     */
    showPluginManager() {
        const modal = document.getElementById('plugin-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    /**
     * Show help menu
     */
    showHelpMenu() {
        // TODO: Implement help system
        console.log('Help menu clicked');
    }

    /**
     * Show message to user
     */
    showMessage(message, type = 'info') {
        const consoleOutput = document.getElementById('console-output');
        if (consoleOutput) {
            const messageElement = document.createElement('div');
            messageElement.className = `console-message ${type}`;
            messageElement.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
            consoleOutput.appendChild(messageElement);
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        }
    }

    /**
     * Show error message
     */
    showError(title, message) {
        console.error(title, message);
        this.showMessage(`${title}: ${message}`, 'error');
    }

    /**
     * Get editor instance (singleton pattern)
     */
    static getInstance() {
        if (!EditorCore.instance) {
            EditorCore.instance = new EditorCore();
        }
        return EditorCore.instance;
    }

    /**
     * Dispose of the editor
     */
    dispose() {
        // Stop auto-save
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }
        
        // Dispose of managers
        if (this.sceneManager) {
            this.sceneManager.dispose();
        }
        
        if (this.pluginManager) {
            this.pluginManager.dispose();
        }
        
        // Clear event bus
        this.eventBus.clear();
        
        console.log('Editor disposed');
    }
}

// Command classes for undo/redo system
class Command {
    execute() {
        throw new Error('Command.execute() must be implemented');
    }
    
    undo() {
        throw new Error('Command.undo() must be implemented');
    }
}

class CreateObjectCommand extends Command {
    constructor(object) {
        super();
        this.object = object;
    }
    
    execute() {
        // Object is already created, just track it
    }
    
    undo() {
        // Remove the object
        const editor = EditorCore.getInstance();
        editor.sceneManager.removeObject(this.object.id);
    }
}

class DeleteObjectCommand extends Command {
    constructor(object) {
        super();
        this.object = object;
    }
    
    execute() {
        // Object is already deleted, just track it
    }
    
    undo() {
        // Recreate the object
        const editor = EditorCore.getInstance();
        editor.sceneManager.addObject(this.object.type, this.object.properties);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EditorCore;
} else {
    window.EditorCore = EditorCore;
}

