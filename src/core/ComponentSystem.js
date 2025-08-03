/**
 * ComponentSystem - Unity-like component system for attaching behaviors to objects
 * Implements Entity-Component-System (ECS) pattern for modular object composition
 */
class ComponentSystem {
    constructor(eventBus) {
        this.eventBus = eventBus;
        
        // Component registry
        this.componentTypes = new Map(); // Map of component name to component class
        this.entityComponents = new Map(); // Map of entity ID to Map of component instances
        
        // Script system
        this.scripts = new Map(); // Map of script ID to script instance
        this.scriptTemplates = new Map(); // Map of script name to script template
        
        // Component update system
        this.updateableComponents = new Set(); // Components that need regular updates
        this.isUpdating = false;
        this.updateInterval = null;
        
        this.init();
    }

    /**
     * Initialize the component system
     */
    init() {
        this.registerBuiltinComponents();
        this.registerBuiltinScripts();
        this.setupEventListeners();
        this.startUpdateLoop();
    }

    /**
     * Register built-in component types
     */
    registerBuiltinComponents() {


        // Script Component
        this.registerComponent('Script', class Script {
            constructor(entity, data = {}) {
                this.entity = entity;
                this.scriptName = data.scriptName || '';
                this.scriptCode = data.scriptCode || '';
                this.scriptInstance = null;
                this.enabled = data.enabled !== undefined ? data.enabled : true;
                this.variables = data.variables || {};
                
                if (this.scriptCode || this.scriptName) {
                    this.compileScript();
                }
            }
            
            setScript(scriptName, scriptCode) {
                this.scriptName = scriptName;
                this.scriptCode = scriptCode;
                this.compileScript();
            }
            
            compileScript() {
                try {
                    // Create a safe execution context
                    const context = this.createScriptContext();
                    
                    // Compile the script
                    const scriptFunction = new Function('context', `
                        with(context) {
                            ${this.scriptCode}
                        }
                    `);
                    
                    // Create script instance
                    this.scriptInstance = {
                        context: context,
                        execute: scriptFunction,
                        start: null,
                        update: null,
                        onDestroy: null
                    };
                    
                    // Execute the script to define methods
                    scriptFunction.call(this.scriptInstance, context);
                    
                    // Call start method if it exists
                    if (typeof this.scriptInstance.start === 'function') {
                        this.scriptInstance.start();
                    }
                    
                } catch (error) {
                    console.error(`Error compiling script for entity ${this.entity}:`, error);
                }
            }
            
            createScriptContext() {
                const editor = EditorCore.getInstance();
                const entity = this.entity;
                
                return {
                    // Entity reference
                    entity: entity,
                    
                    // Component access
                    getComponent: (componentName) => {
                        return ComponentSystem.getInstance().getComponent(entity, componentName);
                    },
                    
                    addComponent: (componentName, data) => {
                        return ComponentSystem.getInstance().addComponent(entity, componentName, data);
                    },
                    
                    removeComponent: (componentName) => {
                        return ComponentSystem.getInstance().removeComponent(entity, componentName);
                    },
                    
                    // Scene access
                    findObject: (name) => {
                        return Array.from(editor.sceneManager.objects.values())
                            .find(obj => obj.name === name);
                    },
                    
                    createObject: (type, options) => {
                        return editor.createObject(type, options);
                    },
                    
                    destroyObject: (id) => {
                        return editor.sceneManager.removeObject(id);
                    },
                    
                    // Event system
                    on: (event, callback) => {
                        return editor.eventBus.on(event, callback);
                    },
                    
                    emit: (event, data) => {
                        return editor.eventBus.emit(event, data);
                    },
                    
                    // Utility functions
                    log: console.log,
                    warn: console.warn,
                    error: console.error,
                    
                    // Math utilities
                    Math: Math,
                    Vector3: THREE.Vector3,
                    
                    // Time
                    time: {
                        deltaTime: 0.016, // Will be updated in update loop
                        time: 0
                    },
                    
                    // Input (basic)
                    input: {
                        getKey: (key) => {
                            // Simple key state tracking
                            return false; // TODO: Implement proper input system
                        }
                    },
                    
                    // Variables
                    variables: this.variables,
                    
                    // Script lifecycle methods (to be defined by user script)
                    start: null,
                    update: null,
                    onDestroy: null
                };
            }
            
            update(deltaTime) {
                if (!this.enabled || !this.scriptInstance) return;
                
                // Only update if scene is in play mode
                const editor = EditorCore.getInstance();
                if (editor.editorMode !== 'play') return;
                
                // Update time in context
                if (this.scriptInstance.context) {
                    this.scriptInstance.context.time.deltaTime = deltaTime;
                    this.scriptInstance.context.time.time += deltaTime;
                }
                
                // Call update method if it exists
                if (typeof this.scriptInstance.update === 'function') {
                    try {
                        this.scriptInstance.update();
                    } catch (error) {
                        console.error(`Error in script update for entity ${this.entity}:`, error);
                    }
                }
            }
            
            destroy() {
                if (this.scriptInstance && typeof this.scriptInstance.onDestroy === 'function') {
                    try {
                        this.scriptInstance.onDestroy();
                    } catch (error) {
                        console.error(`Error in script destroy for entity ${this.entity}:`, error);
                    }
                }
                this.scriptInstance = null;
            }
            
            serialize() {
                return {
                    scriptName: this.scriptName,
                    scriptCode: this.scriptCode,
                    enabled: this.enabled,
                    variables: this.variables
                };
            }
        });

        // Collider Component
        this.registerComponent('Collider', class Collider {
            constructor(entity, data = {}) {
                this.entity = entity;
                this.type = data.type || 'box'; // box, sphere, mesh
                this.size = data.size || { x: 1, y: 1, z: 1 };
                this.offset = data.offset || { x: 0, y: 0, z: 0 };
                this.isTrigger = data.isTrigger || false;
                this.enabled = data.enabled !== undefined ? data.enabled : true;
                
                this.createCollider();
            }
            
            createCollider() {
                const object = this.getSceneObject();
                if (!object || !object.mesh) return;
                
                // Create visual representation of collider
                let geometry;
                switch (this.type) {
                    case 'box':
                        geometry = new THREE.BoxGeometry(this.size.x, this.size.y, this.size.z);
                        break;
                    case 'sphere':
                        geometry = new THREE.SphereGeometry(this.size.x / 2);
                        break;
                    case 'mesh':
                        geometry = object.mesh.geometry;
                        break;
                    default:
                        geometry = new THREE.BoxGeometry(this.size.x, this.size.y, this.size.z);
                }
                
                const material = new THREE.MeshBasicMaterial({
                    color: this.isTrigger ? 0x00ff00 : 0xff0000,
                    wireframe: true,
                    transparent: true,
                    opacity: 0.5
                });
                
                this.colliderMesh = new THREE.Mesh(geometry, material);
                this.colliderMesh.position.copy(object.mesh.position);
                this.colliderMesh.position.add(new THREE.Vector3(this.offset.x, this.offset.y, this.offset.z));
                this.colliderMesh.visible = this.enabled;
                
                // Add to scene
                const editor = EditorCore.getInstance();
                editor.sceneManager.scene.add(this.colliderMesh);
            }
            
            update() {
                if (this.colliderMesh) {
                    const object = this.getSceneObject();
                    if (object && object.mesh) {
                        this.colliderMesh.position.copy(object.mesh.position);
                        this.colliderMesh.position.add(new THREE.Vector3(this.offset.x, this.offset.y, this.offset.z));
                        this.colliderMesh.visible = this.enabled;
                    }
                }
            }
            
            checkCollision(other) {
                // Basic collision detection
                // In a real implementation, you'd use a physics engine
                return false;
            }
            
            getSceneObject() {
                const editor = EditorCore.getInstance();
                return editor.sceneManager.objects.get(this.entity);
            }
            
            destroy() {
                if (this.colliderMesh) {
                    const editor = EditorCore.getInstance();
                    editor.sceneManager.scene.remove(this.colliderMesh);
                    this.colliderMesh.geometry.dispose();
                    this.colliderMesh.material.dispose();
                    this.colliderMesh = null;
                }
            }
            
            serialize() {
                return {
                    type: this.type,
                    size: this.size,
                    offset: this.offset,
                    isTrigger: this.isTrigger,
                    enabled: this.enabled
                };
            }
        });

        // Light Component
        this.registerComponent('Light', class Light {
            constructor(entity, data = {}) {
                this.entity = entity;
                this.type = data.type || 'directional'; // directional, point, spot, ambient
                this.color = data.color || 0xffffff;
                this.intensity = data.intensity || 1;
                this.distance = data.distance || 0;
                this.angle = data.angle || Math.PI / 3;
                this.penumbra = data.penumbra || 0;
                this.castShadow = data.castShadow !== undefined ? data.castShadow : true;
                
                this.createLight();
            }
            
            createLight() {
                let light;
                
                switch (this.type) {
                    case 'directional':
                        light = new THREE.DirectionalLight(this.color, this.intensity);
                        break;
                    case 'point':
                        light = new THREE.PointLight(this.color, this.intensity, this.distance);
                        break;
                    case 'spot':
                        light = new THREE.SpotLight(this.color, this.intensity, this.distance, this.angle, this.penumbra);
                        break;
                    case 'ambient':
                        light = new THREE.AmbientLight(this.color, this.intensity);
                        break;
                    default:
                        light = new THREE.DirectionalLight(this.color, this.intensity);
                }
                
                light.castShadow = this.castShadow;
                this.light = light;
                
                // Add to scene
                const editor = EditorCore.getInstance();
                const object = editor.sceneManager.objects.get(this.entity);
                if (object) {
                    // Don't replace the existing mesh, just add the light to the scene
                    editor.sceneManager.scene.add(light);
                    
                    // Position the light at the object's position
                    if (object.mesh) {
                        light.position.copy(object.mesh.position);
                    }
                }
            }
            
            update() {
                // Update light properties if they changed
                if (this.light) {
                    this.light.color.setHex(this.color);
                    this.light.intensity = this.intensity;
                    this.light.castShadow = this.castShadow;
                    
                    // Update specific light type properties
                    if (this.type === 'point' && this.light instanceof THREE.PointLight) {
                        this.light.distance = this.distance;
                    } else if (this.type === 'spot' && this.light instanceof THREE.SpotLight) {
                        this.light.angle = this.angle;
                        this.light.penumbra = this.penumbra;
                        this.light.distance = this.distance;
                    }
                }
            }
            
            setColor(color) {
                this.color = color;
                if (this.light) {
                    this.light.color.setHex(color);
                }
            }
            
            setIntensity(intensity) {
                this.intensity = intensity;
                if (this.light) {
                    this.light.intensity = intensity;
                }
            }
            
            setType(type) {
                this.type = type;
                // Remove old light first
                if (this.light) {
                    const editor = EditorCore.getInstance();
                    editor.sceneManager.scene.remove(this.light);
                }
                this.createLight(); // Recreate light with new type
            }
            
            getSceneObject() {
                const editor = EditorCore.getInstance();
                return editor.sceneManager.objects.get(this.entity);
            }
            
            destroy() {
                if (this.light) {
                    const editor = EditorCore.getInstance();
                    editor.sceneManager.scene.remove(this.light);
                    this.light = null;
                }
            }
            
            serialize() {
                return {
                    type: this.type,
                    color: this.color,
                    intensity: this.intensity,
                    distance: this.distance,
                    angle: this.angle,
                    penumbra: this.penumbra,
                    castShadow: this.castShadow
                };
            }
        });

        console.log('Built-in components registered');
    }

    /**
     * Register built-in script templates
     */
    registerBuiltinScripts() {
        // Rotator script
        this.registerScriptTemplate('Rotator', `
            // Rotator Script - Continuously rotates the object
            var rotationSpeed = variables.rotationSpeed || 1;
            var axis = variables.axis || 'y';
            
            function start() {
                log('Rotator script started for entity: ' + entity);
            }
            
            function update() {
                // Direct mesh rotation since Transform component is removed
                var sceneObject = findObject(entity);
                if (sceneObject && sceneObject.mesh) {
                    switch(axis) {
                        case 'x':
                            sceneObject.mesh.rotation.x += rotationSpeed * time.deltaTime;
                            break;
                        case 'y':
                            sceneObject.mesh.rotation.y += rotationSpeed * time.deltaTime;
                            break;
                        case 'z':
                            sceneObject.mesh.rotation.z += rotationSpeed * time.deltaTime;
                            break;
                    }
                }
            }
        `);

        // Oscillator script
        this.registerScriptTemplate('Oscillator', `
            // Oscillator Script - Moves object back and forth
            var amplitude = variables.amplitude || 2;
            var frequency = variables.frequency || 1;
            var axis = variables.axis || 'y';
            var startPosition = null;
            
            function start() {
                // Get initial position from mesh since Transform component is removed
                var sceneObject = findObject(entity);
                if (sceneObject && sceneObject.mesh) {
                    startPosition = {
                        x: sceneObject.mesh.position.x,
                        y: sceneObject.mesh.position.y,
                        z: sceneObject.mesh.position.z
                    };
                }
                log('Oscillator script started for entity: ' + entity);
            }
            
            function update() {
                if (!startPosition) return;
                
                var sceneObject = findObject(entity);
                if (sceneObject && sceneObject.mesh) {
                    var offset = Math.sin(time.time * frequency) * amplitude;
                    
                    switch(axis) {
                        case 'x':
                            sceneObject.mesh.position.x = startPosition.x + offset;
                            break;
                        case 'y':
                            sceneObject.mesh.position.y = startPosition.y + offset;
                            break;
                        case 'z':
                            sceneObject.mesh.position.z = startPosition.z + offset;
                            break;
                    }
                }
            }
        `);

        // Click Handler script
        this.registerScriptTemplate('ClickHandler', `
            // Click Handler Script - Responds to mouse clicks
            var clickAction = variables.clickAction || 'log';
            var message = variables.message || 'Object clicked!';
            
            function start() {
                // Listen for object selection events
                on(EventBus.Events.OBJECT_SELECTED, function(data) {
                    if (data.id === entity) {
                        handleClick();
                    }
                });
                
                log('Click Handler script started for entity: ' + entity);
            }
            
            function handleClick() {
                switch(clickAction) {
                    case 'log':
                        log(message);
                        break;
                    case 'hide':
                        var sceneObject = findObject(entity);
                        if (sceneObject && sceneObject.mesh) {
                            sceneObject.mesh.visible = false;
                        }
                        break;
                    case 'destroy':
                        destroyObject(entity);
                        break;
                    case 'changeColor':
                        var sceneObject = findObject(entity);
                        if (sceneObject && sceneObject.mesh && sceneObject.mesh.material) {
                            sceneObject.mesh.material.color.setHex(Math.random() * 0xffffff);
                        }
                        break;
                }
            }
        `);

        // Simple Rotate Script
        this.registerScriptTemplate('Simple Rotate', `
// Simple Rotate Script
// Makes the object rotate around its Y axis

var rotationSpeed = 1.0; // degrees per second

function start() {
    console.log('Simple rotate script started');
}

function update() {
    if (this.gameObject && this.gameObject.mesh) {
        // Rotate around Y axis
        this.gameObject.mesh.rotation.y += (rotationSpeed * Math.PI / 180) * this.context.time.deltaTime;
    }
}

function onDestroy() {
    console.log('Simple rotate script destroyed');
}
        `);

        console.log('Built-in script templates registered');
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Listen for object creation to add default components
        this.eventBus.on(EventBus.Events.OBJECT_CREATED, (data) => {
            this.onObjectCreated(data);
        });

        // Listen for object deletion to clean up components
        this.eventBus.on(EventBus.Events.OBJECT_DELETED, (data) => {
            this.onObjectDeleted(data);
        });
    }

    /**
     * Handle object creation
     */
    onObjectCreated(data) {
        const { object } = data;
        
        // Add Light component for light objects
        if (object.type === 'light' || object.type.includes('light')) {
            this.addComponent(object.id, 'Light', {
                type: object.type.replace('-light', ''),
                color: object.properties.color || 0xffffff,
                intensity: object.properties.intensity || 1
            });
        }
        
        // Don't add components automatically for regular mesh objects
        // Components should be added manually by the user
    }

    /**
     * Handle object deletion
     */
    onObjectDeleted(data) {
        const { id } = data;
        this.removeAllComponents(id);
    }

    /**
     * Start the component update loop
     */
    startUpdateLoop() {
        this.isUpdating = true;
        let lastTime = performance.now();
        
        const update = () => {
            if (!this.isUpdating) return;
            
            const currentTime = performance.now();
            const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
            lastTime = currentTime;
            
            this.updateComponents(deltaTime);
            
            requestAnimationFrame(update);
        };
        
        update();
    }

    /**
     * Stop the component update loop
     */
    stopUpdateLoop() {
        this.isUpdating = false;
    }

    /**
     * Update all components that need regular updates
     */
    updateComponents(deltaTime) {
        this.entityComponents.forEach((components, entityId) => {
            components.forEach((component, componentName) => {
                if (typeof component.update === 'function') {
                    component.update(deltaTime);
                }
            });
        });
    }

    /**
     * Register a component type
     */
    registerComponent(name, componentClass) {
        this.componentTypes.set(name, componentClass);
        console.log(`Registered component type: ${name}`);
    }

    /**
     * Register a script template
     */
    registerScriptTemplate(name, scriptCode) {
        this.scriptTemplates.set(name, scriptCode);
        console.log(`Registered script template: ${name}`);
    }

    /**
     * Add a component to an entity
     */
    addComponent(entityId, componentName, data = {}) {
        const ComponentClass = this.componentTypes.get(componentName);
        if (!ComponentClass) {
            throw new Error(`Component type '${componentName}' not found`);
        }

        // Ensure entity has component map
        if (!this.entityComponents.has(entityId)) {
            this.entityComponents.set(entityId, new Map());
        }

        const entityComponents = this.entityComponents.get(entityId);
        
        // Check if component already exists
        if (entityComponents.has(componentName)) {
            console.warn(`Entity ${entityId} already has component ${componentName}`);
            return entityComponents.get(componentName);
        }

        // Create component instance
        const component = new ComponentClass(entityId, data);
        entityComponents.set(componentName, component);

        // Add to updateable components if it has an update method
        if (typeof component.update === 'function') {
            this.updateableComponents.add(component);
        }

        // Emit event
        this.eventBus.emit(EventBus.Events.COMPONENT_ADDED, {
            entityId,
            componentName,
            component
        });

        console.log(`Added ${componentName} component to entity ${entityId}`);
        return component;
    }

    /**
     * Remove a component from an entity
     */
    removeComponent(entityId, componentName) {
        const entityComponents = this.entityComponents.get(entityId);
        if (!entityComponents || !entityComponents.has(componentName)) {
            console.warn(`Component ${componentName} not found on entity ${entityId}`);
            return false;
        }

        const component = entityComponents.get(componentName);
        
        // Call destroy method if it exists
        if (typeof component.destroy === 'function') {
            component.destroy();
        }

        // Remove from updateable components
        this.updateableComponents.delete(component);

        // Remove from entity
        entityComponents.delete(componentName);

        // Clean up empty entity component map
        if (entityComponents.size === 0) {
            this.entityComponents.delete(entityId);
        }

        // Emit event
        this.eventBus.emit(EventBus.Events.COMPONENT_REMOVED, {
            entityId,
            componentName,
            component
        });

        console.log(`Removed ${componentName} component from entity ${entityId}`);
        return true;
    }

    /**
     * Get a component from an entity
     */
    getComponent(entityId, componentName) {
        const entityComponents = this.entityComponents.get(entityId);
        if (!entityComponents) {
            return null;
        }
        return entityComponents.get(componentName) || null;
    }

    /**
     * Get all components of an entity
     */
    getComponents(entityId) {
        const entityComponents = this.entityComponents.get(entityId);
        if (!entityComponents) {
            return [];
        }
        return Array.from(entityComponents.values());
    }

    /**
     * Check if entity has a component
     */
    hasComponent(entityId, componentName) {
        const entityComponents = this.entityComponents.get(entityId);
        return entityComponents ? entityComponents.has(componentName) : false;
    }

    /**
     * Remove all components from an entity
     */
    removeAllComponents(entityId) {
        const entityComponents = this.entityComponents.get(entityId);
        if (!entityComponents) return;

        // Remove each component
        const componentNames = Array.from(entityComponents.keys());
        componentNames.forEach(componentName => {
            this.removeComponent(entityId, componentName);
        });
    }

    /**
     * Get all registered component types
     */
    getComponentTypes() {
        return Array.from(this.componentTypes.keys());
    }

    /**
     * Get all registered script templates
     */
    getScriptTemplates() {
        return Array.from(this.scriptTemplates.keys());
    }

    /**
     * Get script template code
     */
    getScriptTemplate(name) {
        return this.scriptTemplates.get(name);
    }

    /**
     * Add script to an entity
     */
    addScript(entityId, scriptName, scriptCode, variables = {}) {
        return this.addComponent(entityId, 'Script', {
            scriptName,
            scriptCode,
            variables
        });
    }

    /**
     * Add script from template
     */
    addScriptFromTemplate(entityId, templateName, variables = {}) {
        const scriptCode = this.scriptTemplates.get(templateName);
        if (!scriptCode) {
            throw new Error(`Script template '${templateName}' not found`);
        }
        
        return this.addScript(entityId, templateName, scriptCode, variables);
    }

    /**
     * Serialize entity components
     */
    serializeEntity(entityId) {
        const entityComponents = this.entityComponents.get(entityId);
        if (!entityComponents) {
            return {};
        }

        const serialized = {};
        entityComponents.forEach((component, componentName) => {
            if (typeof component.serialize === 'function') {
                serialized[componentName] = component.serialize();
            }
        });

        return serialized;
    }

    /**
     * Deserialize entity components
     */
    deserializeEntity(entityId, componentData) {
        Object.entries(componentData).forEach(([componentName, data]) => {
            try {
                this.addComponent(entityId, componentName, data);
            } catch (error) {
                console.error(`Failed to deserialize component ${componentName} for entity ${entityId}:`, error);
            }
        });
    }

    /**
     * Get singleton instance
     */
    static getInstance() {
        if (!ComponentSystem.instance) {
            throw new Error('ComponentSystem not initialized');
        }
        return ComponentSystem.instance;
    }

    /**
     * Set singleton instance
     */
    static setInstance(instance) {
        ComponentSystem.instance = instance;
    }

    /**
     * Dispose of the component system
     */
    dispose() {
        this.stopUpdateLoop();
        
        // Remove all components
        this.entityComponents.forEach((components, entityId) => {
            this.removeAllComponents(entityId);
        });
        
        // Clear storage
        this.componentTypes.clear();
        this.entityComponents.clear();
        this.updateableComponents.clear();
        this.scripts.clear();
        this.scriptTemplates.clear();
    }
}

// Set up singleton
ComponentSystem.instance = null;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ComponentSystem;
} else {
    window.ComponentSystem = ComponentSystem;
}

