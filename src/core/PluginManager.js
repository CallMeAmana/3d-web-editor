/**
 * PluginManager - Manages loading, unloading, and communication with plugins
 * Provides a secure and extensible plugin architecture
 */
class PluginManager {
    constructor(eventBus, editorCore) {
        this.eventBus = eventBus;
        this.editorCore = editorCore;
        
        // Plugin storage
        this.plugins = new Map(); // Map of plugin ID to plugin instance
        this.pluginManifests = new Map(); // Map of plugin ID to manifest
        this.loadedPlugins = new Set(); // Set of loaded plugin IDs
        
        // Plugin API
        this.pluginAPI = this.createPluginAPI();
        
        // Plugin directories
        this.pluginDirectories = [
            'src/plugins/', // Local plugins
            'plugins/', // User plugins
            'https://cdn.3d-web-editor.com/plugins/' // Remote plugins (future)
        ];
        
        // Security settings
        this.security = {
            allowRemotePlugins: false,
            allowEval: false,
            sandboxed: true
        };
        
        this.init();
    }

    /**
     * Initialize the plugin manager
     */
    init() {
        this.setupEventListeners();
        this.discoverPlugins();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Listen for plugin-related UI events
        this.eventBus.on('ui:plugin-manager-opened', () => {
            this.refreshPluginList();
        });
    }

    /**
     * Create the plugin API that will be exposed to plugins
     */
    createPluginAPI() {
        return {
            // Core editor access
            getEditor: () => this.editorCore,
            getEventBus: () => this.eventBus,
            getSceneManager: () => this.editorCore.sceneManager,
            getComponentSystem: () => this.editorCore.componentSystem,
            getAssetManager: () => this.editorCore.assetManager,
            
            // Event system
            on: (event, callback, context) => this.eventBus.on(event, callback, context),
            once: (event, callback, context) => this.eventBus.once(event, callback, context),
            off: (event, callback) => this.eventBus.off(event, callback),
            emit: (event, data) => this.eventBus.emit(event, data),
            
            // UI integration
            addToolbarButton: (config) => this.addToolbarButton(config),
            addPanel: (config) => this.addPanel(config),
            addMenuItem: (config) => this.addMenuItem(config),
            showDialog: (config) => this.showDialog(config),
            showNotification: (message, type) => this.showNotification(message, type),
            
            // Scene manipulation
            createObject: (type, options) => this.editorCore.createObject(type, options),
            deleteObject: (id) => this.editorCore.sceneManager.removeObject(id),
            selectObject: (id) => this.editorCore.sceneManager.selectObject(id),
            getSelectedObjects: () => this.editorCore.sceneManager.getSelectedObjects(),
            
            // Asset management
            loadAsset: (url, type) => this.editorCore.assetManager.loadAsset(url, type),
            registerAssetType: (type, loader) => this.editorCore.assetManager.registerAssetType(type, loader),
            
            // Component system
            registerComponent: (name, componentClass) => this.editorCore.componentSystem.registerComponent(name, componentClass),
            addComponent: (objectId, componentName, data) => this.editorCore.componentSystem.addComponent(objectId, componentName, data),
            removeComponent: (objectId, componentName) => this.editorCore.componentSystem.removeComponent(objectId, componentName),
            
            // Utility functions
            utils: {
                generateId: () => `plugin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                loadScript: (url) => this.loadScript(url),
                loadCSS: (url) => this.loadCSS(url),
                createElement: (tag, attributes, parent) => this.createElement(tag, attributes, parent)
            }
        };
    }

    /**
     * Discover available plugins
     */
    async discoverPlugins() {
        // For now, we'll define some built-in plugins
        const builtinPlugins = [
            {
                id: 'virtual-exhibition',
                name: 'Virtual Exhibition',
                version: '1.0.0',
                description: 'Tools for creating virtual exhibitions and galleries',
                author: '3D Web Editor Team',
                category: 'domain',
                entryPoint: 'src/plugins/virtual-exhibition/index.js',
                dependencies: [],
                permissions: ['scene:modify', 'ui:panel', 'ui:toolbar']
            },
            {
                id: 'elearning-tools',
                name: 'E-Learning Tools',
                version: '1.0.0',
                description: 'Interactive e-learning content creation tools',
                author: '3D Web Editor Team',
                category: 'domain',
                entryPoint: 'src/plugins/elearning-tools/index.js',
                dependencies: [],
                permissions: ['scene:modify', 'ui:panel', 'ui:toolbar']
            },
            {
                id: 'architecture-viz',
                name: 'Architecture Visualization',
                version: '1.0.0',
                description: 'Tools for architectural visualization and walkthroughs',
                author: '3D Web Editor Team',
                category: 'domain',
                entryPoint: 'src/plugins/architecture-viz/index.js',
                dependencies: [],
                permissions: ['scene:modify', 'ui:panel', 'ui:toolbar']
            }
        ];
        
        // Store manifests
        builtinPlugins.forEach(manifest => {
            this.pluginManifests.set(manifest.id, manifest);
        });
        
        console.log(`Discovered ${builtinPlugins.length} plugins`);
    }

    /**
     * Load a plugin by ID
     */
    async loadPlugin(pluginId) {
        if (this.loadedPlugins.has(pluginId)) {
            console.warn(`Plugin ${pluginId} is already loaded`);
            return false;
        }
        
        const manifest = this.pluginManifests.get(pluginId);
        if (!manifest) {
            throw new Error(`Plugin manifest not found for ${pluginId}`);
        }
        
        try {
            console.log(`Loading plugin: ${manifest.name} v${manifest.version}`);
            
            // Check dependencies
            await this.checkDependencies(manifest);
            
            // Load the plugin
            const plugin = await this.loadPluginFromManifest(manifest);
            
            // Initialize the plugin
            await this.initializePlugin(plugin, manifest);
            
            // Store the plugin
            this.plugins.set(pluginId, plugin);
            this.loadedPlugins.add(pluginId);
            
            // Emit event
            this.eventBus.emit(EventBus.Events.PLUGIN_LOADED, {
                id: pluginId,
                manifest,
                plugin
            });
            
            console.log(`Plugin ${manifest.name} loaded successfully`);
            return true;
            
        } catch (error) {
            console.error(`Failed to load plugin ${pluginId}:`, error);
            this.eventBus.emit(EventBus.Events.PLUGIN_ERROR, {
                id: pluginId,
                error: error.message,
                phase: 'loading'
            });
            throw error;
        }
    }

    /**
     * Unload a plugin by ID
     */
    async unloadPlugin(pluginId) {
        if (!this.loadedPlugins.has(pluginId)) {
            console.warn(`Plugin ${pluginId} is not loaded`);
            return false;
        }
        
        try {
            const plugin = this.plugins.get(pluginId);
            const manifest = this.pluginManifests.get(pluginId);
            
            console.log(`Unloading plugin: ${manifest.name}`);
            
            // Call plugin's cleanup method if it exists
            if (plugin && typeof plugin.dispose === 'function') {
                await plugin.dispose();
            }
            
            // Remove from storage
            this.plugins.delete(pluginId);
            this.loadedPlugins.delete(pluginId);
            
            // Clean up UI elements added by the plugin
            this.cleanupPluginUI(pluginId);
            
            // Emit event
            this.eventBus.emit(EventBus.Events.PLUGIN_UNLOADED, {
                id: pluginId,
                manifest
            });
            
            console.log(`Plugin ${manifest.name} unloaded successfully`);
            return true;
            
        } catch (error) {
            console.error(`Failed to unload plugin ${pluginId}:`, error);
            this.eventBus.emit(EventBus.Events.PLUGIN_ERROR, {
                id: pluginId,
                error: error.message,
                phase: 'unloading'
            });
            throw error;
        }
    }

    /**
     * Check plugin dependencies
     */
    async checkDependencies(manifest) {
        if (!manifest.dependencies || manifest.dependencies.length === 0) {
            return true;
        }
        
        for (const dependency of manifest.dependencies) {
            if (!this.loadedPlugins.has(dependency)) {
                // Try to load the dependency
                await this.loadPlugin(dependency);
            }
        }
        
        return true;
    }

    /**
     * Load plugin from manifest
     */
    async loadPluginFromManifest(manifest) {
        // For now, we'll create mock plugins since we don't have actual plugin files
        // In a real implementation, you would load the actual JavaScript files
        
        const mockPlugin = this.createMockPlugin(manifest);
        return mockPlugin;
    }

    /**
     * Create a mock plugin for demonstration
     */
    createMockPlugin(manifest) {
        const basePlugin = {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            api: this.pluginAPI,
            
            // Plugin lifecycle methods
            async init() {
                console.log(`Initializing plugin: ${this.name}`);
                this.setupUI();
                this.setupEventListeners();
            },
            
            async dispose() {
                console.log(`Disposing plugin: ${this.name}`);
                this.cleanupEventListeners();
            },
            
            setupUI() {
                // Override in specific plugins
            },
            
            setupEventListeners() {
                // Override in specific plugins
            },
            
            cleanupEventListeners() {
                // Override in specific plugins
            }
        };
        
        // Create specific plugin based on ID
        switch (manifest.id) {
            case 'virtual-exhibition':
                return this.createVirtualExhibitionPlugin(basePlugin);
            case 'elearning-tools':
                return this.createELearningToolsPlugin(basePlugin);
            case 'architecture-viz':
                return this.createArchitectureVizPlugin(basePlugin);
            default:
                return basePlugin;
        }
    }

    /**
     * Create Virtual Exhibition plugin
     */
    createVirtualExhibitionPlugin(basePlugin) {
        return {
            ...basePlugin,
            
            setupUI() {
                this.api.addPanel({
                    id: 'exhibition-tools',
                    title: 'Exhibition Tools',
                    content: this.createExhibitionPanel(),
                    position: 'left'
                });
            },
            
            createExhibitionPanel() {
                return `
                    <div class="exhibition-panel">
                        <h4>Exhibition Elements</h4>
                        <button id="add-wall">Add Wall</button>
                        <button id="add-artwork-frame">Add Artwork Frame</button>
                        <button id="add-pedestal">Add Pedestal</button>
                        <button id="add-info-kiosk">Add Info Kiosk</button>
                        
                        <h4>Visitor Path</h4>
                        <button id="create-path">Create Visitor Path</button>
                        <button id="add-waypoint">Add Waypoint</button>
                        
                        <h4>Lighting Presets</h4>
                        <button id="gallery-lighting">Gallery Lighting</button>
                        <button id="museum-lighting">Museum Lighting</button>
                    </div>
                `;
            }
        };
    }

    /**
     * Create E-Learning Tools plugin
     */
    createELearningToolsPlugin(basePlugin) {
        return {
            ...basePlugin,
            
            setupUI() {
                this.api.addPanel({
                    id: 'elearning-tools',
                    title: 'E-Learning Tools',
                    content: this.createELearningPanel(),
                    position: 'left'
                });
            },
            
            createELearningPanel() {
                return `
                    <div class="elearning-panel">
                        <h4>Interactive Elements</h4>
                        <button id="add-quiz">Add Quiz</button>
                        <button id="add-hotspot">Add Hotspot</button>
                        <button id="add-annotation">Add Annotation</button>
                        <button id="add-video-player">Add Video Player</button>
                        
                        <h4>Learning Path</h4>
                        <button id="create-lesson">Create Lesson</button>
                        <button id="add-checkpoint">Add Checkpoint</button>
                        
                        <h4>Assessment</h4>
                        <button id="add-assessment">Add Assessment</button>
                        <button id="view-analytics">View Analytics</button>
                    </div>
                `;
            }
        };
    }

    /**
     * Create Architecture Visualization plugin
     */
    createArchitectureVizPlugin(basePlugin) {
        return {
            ...basePlugin,
            
            setupUI() {
                this.api.addPanel({
                    id: 'architecture-tools',
                    title: 'Architecture Tools',
                    content: this.createArchitecturePanel(),
                    position: 'left'
                });
            },
            
            createArchitecturePanel() {
                return `
                    <div class="architecture-panel">
                        <h4>Building Elements</h4>
                        <button id="add-wall-arch">Add Wall</button>
                        <button id="add-window">Add Window</button>
                        <button id="add-door">Add Door</button>
                        <button id="add-stairs">Add Stairs</button>
                        
                        <h4>Materials Library</h4>
                        <button id="concrete-material">Concrete</button>
                        <button id="wood-material">Wood</button>
                        <button id="glass-material">Glass</button>
                        <button id="metal-material">Metal</button>
                        
                        <h4>Visualization</h4>
                        <button id="create-walkthrough">Create Walkthrough</button>
                        <button id="render-view">Render View</button>
                    </div>
                `;
            }
        };
    }

    /**
     * Initialize a plugin
     */
    async initializePlugin(plugin, manifest) {
        if (typeof plugin.init === 'function') {
            await plugin.init();
        }
    }

    /**
     * Add toolbar button (called by plugins)
     */
    addToolbarButton(config) {
        const toolbar = document.getElementById('main-toolbar');
        if (!toolbar) return;
        
        const button = document.createElement('button');
        button.id = config.id;
        button.className = 'tool-btn';
        button.title = config.tooltip || '';
        button.innerHTML = config.icon || '🔧';
        
        if (config.onClick) {
            button.addEventListener('click', config.onClick);
        }
        
        toolbar.appendChild(button);
    }

    /**
     * Add panel (called by plugins)
     */
    addPanel(config) {
        const sidebar = config.position === 'left' ? 
            document.getElementById('left-sidebar') : 
            document.getElementById('right-sidebar');
        
        if (!sidebar) return;
        
        const panel = document.createElement('div');
        panel.className = 'panel';
        panel.id = config.id;
        
        panel.innerHTML = `
            <div class="panel-header">
                <h3>${config.title}</h3>
                <button class="panel-toggle">−</button>
            </div>
            <div class="panel-content">
                ${config.content}
            </div>
        `;
        
        sidebar.appendChild(panel);
        
        // Setup panel toggle
        const toggle = panel.querySelector('.panel-toggle');
        const content = panel.querySelector('.panel-content');
        
        toggle.addEventListener('click', () => {
            const isCollapsed = content.style.display === 'none';
            content.style.display = isCollapsed ? 'block' : 'none';
            toggle.textContent = isCollapsed ? '−' : '+';
        });
    }

    /**
     * Show notification (called by plugins)
     */
    showNotification(message, type = 'info') {
        this.editorCore.showMessage(message, type);
    }

    /**
     * Clean up plugin UI elements
     */
    cleanupPluginUI(pluginId) {
        // Remove toolbar buttons
        const toolbarButtons = document.querySelectorAll(`[id^="${pluginId}-"]`);
        toolbarButtons.forEach(button => button.remove());
        
        // Remove panels
        const panels = document.querySelectorAll(`[id^="${pluginId}-"]`);
        panels.forEach(panel => panel.remove());
    }

    /**
     * Get list of loaded plugins
     */
    getLoadedPlugins() {
        return Array.from(this.loadedPlugins);
    }

    /**
     * Get list of available plugins
     */
    getAvailablePlugins() {
        return Array.from(this.pluginManifests.values());
    }

    /**
     * Get plugin by ID
     */
    getPlugin(pluginId) {
        return this.plugins.get(pluginId);
    }

    /**
     * Refresh plugin list in UI
     */
    refreshPluginList() {
        const installedPanel = document.getElementById('installed-plugins');
        const availablePanel = document.getElementById('available-plugins');
        
        if (installedPanel) {
            installedPanel.innerHTML = this.renderInstalledPlugins();
        }
        
        if (availablePanel) {
            availablePanel.innerHTML = this.renderAvailablePlugins();
        }
    }

    /**
     * Render installed plugins list
     */
    renderInstalledPlugins() {
        if (this.loadedPlugins.size === 0) {
            return '<p>No plugins installed</p>';
        }
        
        let html = '<div class="plugin-list">';
        
        this.loadedPlugins.forEach(pluginId => {
            const manifest = this.pluginManifests.get(pluginId);
            html += `
                <div class="plugin-item">
                    <div class="plugin-info">
                        <h4>${manifest.name}</h4>
                        <p>${manifest.description}</p>
                        <small>v${manifest.version} by ${manifest.author}</small>
                    </div>
                    <div class="plugin-actions">
                        <button onclick="pluginManager.unloadPlugin('${pluginId}')">Unload</button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        return html;
    }

    /**
     * Render available plugins list
     */
    renderAvailablePlugins() {
        const availablePlugins = Array.from(this.pluginManifests.values())
            .filter(manifest => !this.loadedPlugins.has(manifest.id));
        
        if (availablePlugins.length === 0) {
            return '<p>All plugins are loaded</p>';
        }
        
        let html = '<div class="plugin-list">';
        
        availablePlugins.forEach(manifest => {
            html += `
                <div class="plugin-item">
                    <div class="plugin-info">
                        <h4>${manifest.name}</h4>
                        <p>${manifest.description}</p>
                        <small>v${manifest.version} by ${manifest.author}</small>
                    </div>
                    <div class="plugin-actions">
                        <button onclick="pluginManager.loadPlugin('${manifest.id}')">Load</button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        return html;
    }

    /**
     * Load external script
     */
    loadScript(url) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    /**
     * Load external CSS
     */
    loadCSS(url) {
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = url;
            link.onload = resolve;
            link.onerror = reject;
            document.head.appendChild(link);
        });
    }

    /**
     * Create DOM element helper
     */
    createElement(tag, attributes = {}, parent = null) {
        const element = document.createElement(tag);
        
        Object.entries(attributes).forEach(([key, value]) => {
            if (key === 'textContent') {
                element.textContent = value;
            } else if (key === 'innerHTML') {
                element.innerHTML = value;
            } else {
                element.setAttribute(key, value);
            }
        });
        
        if (parent) {
            parent.appendChild(element);
        }
        
        return element;
    }

    /**
     * Dispose of the plugin manager
     */
    dispose() {
        // Unload all plugins
        const pluginIds = Array.from(this.loadedPlugins);
        pluginIds.forEach(id => {
            try {
                this.unloadPlugin(id);
            } catch (error) {
                console.error(`Error unloading plugin ${id}:`, error);
            }
        });
        
        // Clear storage
        this.plugins.clear();
        this.pluginManifests.clear();
        this.loadedPlugins.clear();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PluginManager;
} else {
    window.PluginManager = PluginManager;
}

