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
        this.scriptStartTime = 0; // Time when scripts started
        this.scriptPauseTime = 0; // Time when scripts were paused
        this.totalPausedTime = 0; // Total time scripts have been paused
        
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
                        // Extract functions from the global scope and assign them to context
                        if (typeof start === 'function') context.start = start;
                        if (typeof update === 'function') context.update = update;
                        if (typeof onDestroy === 'function') context.onDestroy = onDestroy;
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
                    
                    // Extract functions from context
                    if (typeof context.start === 'function') {
                        this.scriptInstance.start = context.start;
                    }
                    if (typeof context.update === 'function') {
                        this.scriptInstance.update = context.update;
                    }
                    if (typeof context.onDestroy === 'function') {
                        this.scriptInstance.onDestroy = context.onDestroy;
                    }
                    
                    console.log(`Script compiled successfully for entity ${this.entity}`);
                    
                } catch (error) {
                    console.error(`Error compiling script for entity ${this.entity}:`, error);
                }
            }
            
            createScriptContext() {
                const editor = EditorCore.getInstance();
                const entityId = this.entity;
                
                return {
                    // Entity reference
                    entity: entityId,
                    
                    // Component access
                    getComponent: (componentName) => {
                        return ComponentSystem.getInstance().getComponent(entityId, componentName);
                    },
                    
                    addComponent: (componentName, data) => {
                        return ComponentSystem.getInstance().addComponent(entityId, componentName, data);
                    },
                    
                    removeComponent: (componentName) => {
                        return ComponentSystem.getInstance().removeComponent(entityId, componentName);
                    },
                    
                    // Scene access
                    findObject: (name) => {
                        if (typeof name === 'string') {
                            return Array.from(editor.sceneManager.objects.values())
                                .find(obj => obj.name === name);
                        } else {
                            // If name is actually an entity ID
                            return editor.sceneManager.objects.get(name);
                        }
                    },
                    
                    // Get current object
                    gameObject: editor.sceneManager.objects.get(entityId),
                    
                    // Get this object specifically
                    this: {
                        gameObject: editor.sceneManager.objects.get(entityId)
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
                    
                    // Time - will be updated in update loop
                    time: {
                        deltaTime: 0.016,
                        time: 0,
                        timeScale: 1,
                        getTime: () => {
                            const componentSystem = ComponentSystem.getInstance();
                            if (componentSystem) {
                                return componentSystem.scriptStartTime ? 
                                    (performance.now() - componentSystem.scriptStartTime - componentSystem.totalPausedTime) / 1000 : 0;
                            }
                            return 0;
                        }
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
                if (!this.enabled || !this.scriptInstance) {
                    // console.log(`Script update skipped - enabled: ${this.enabled}, hasInstance: ${!!this.scriptInstance}`);
                    return;
                }
                
                // Only update if scene is in play mode
                const editor = EditorCore.getInstance();
                if (editor.editorMode !== 'play') {
                    // console.log(`Script update skipped - editor mode: ${editor.editorMode}`);
                    return;
                }
                
                // console.log(`Script update called for entity ${this.entity}, deltaTime: ${deltaTime}`);
                
                // Update time in context
                if (this.scriptInstance.context) {
                    this.scriptInstance.context.time.deltaTime = deltaTime;
                    this.scriptInstance.context.time.time = this.scriptInstance.context.time.getTime();
                    
                    // Update gameObject reference in case it changed
                    const currentObject = editor.sceneManager.objects.get(this.entity);
                    if (currentObject) {
                        this.scriptInstance.context.gameObject = currentObject;
                        this.scriptInstance.context.this.gameObject = currentObject;
                        // console.log(`Updated gameObject reference for entity ${this.entity}:`, currentObject);
                        // console.log(`Object mesh position:`, currentObject.mesh.position);
                        // console.log(`Object mesh rotation:`, currentObject.mesh.rotation);
                    } else {
                        console.warn(`Script update: Could not find object for entity ${this.entity}`);
                        return;
                    }
                }
                
                // Call update method if it exists
                if (typeof this.scriptInstance.update === 'function') {
                    try {
                        // console.log(`Calling update() method for entity ${this.entity}`);
                        this.scriptInstance.update();
                        // console.log(`Update() method completed for entity ${this.entity}`);
                    } catch (error) {
                        console.error(`Error in script update for entity ${this.entity}:`, error);
                    }
                } else {
                    // console.warn(`Script for entity ${this.entity} has no update() method`);
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
                this.lightType = data.lightType || data.type || 'point'; // directional, point, spot, ambient
                this.color = data.color || 0xffffff;
                this.intensity = data.intensity || 1;
                this.distance = data.distance || 0;
                this.decay = data.decay || 2;
                this.angle = data.angle || Math.PI / 3;
                this.penumbra = data.penumbra || 0;
                this.castShadow = data.castShadow !== undefined ? data.castShadow : true;
                
                // Get the scene object to check if it already has a light
                const sceneObject = this.getSceneObject();
                if (sceneObject && sceneObject.light) {
                    // Object already has a light (created by SceneManager), just sync properties
                    this.light = sceneObject.light;
                    this.helper = sceneObject.helper;
                    this.syncWithExistingLight();
                } else {
                    // Create new light (for objects that weren't created as lights)
                    this.createLight();
                }
            }
            
            syncWithExistingLight() {
                if (!this.light) return;
                
                // Sync component properties with existing light
                this.color = this.light.color.getHex();
                this.intensity = this.light.intensity;
                this.castShadow = this.light.castShadow;
                
                if (this.light.distance !== undefined) {
                    this.distance = this.light.distance;
                }
                if (this.light.decay !== undefined) {
                    this.decay = this.light.decay;
                }
                if (this.light.angle !== undefined) {
                    this.angle = this.light.angle;
                }
                if (this.light.penumbra !== undefined) {
                    this.penumbra = this.light.penumbra;
                }
                
                // Determine light type from the Three.js light
                if (this.light instanceof THREE.DirectionalLight) {
                    this.lightType = 'directional';
                } else if (this.light instanceof THREE.PointLight) {
                    this.lightType = 'point';
                } else if (this.light instanceof THREE.SpotLight) {
                    this.lightType = 'spot';
                } else if (this.light instanceof THREE.AmbientLight) {
                    this.lightType = 'ambient';
                }
            }
            
            createLight() {
                let light;
                
                switch (this.lightType) {
                    case 'directional':
                        light = new THREE.DirectionalLight(this.color, this.intensity);
                        light.castShadow = this.castShadow;
                        light.shadow.mapSize.width = 2048;
                        light.shadow.mapSize.height = 2048;
                        light.shadow.camera.near = 0.5;
                        light.shadow.camera.far = 50;
                        light.shadow.camera.left = -10;
                        light.shadow.camera.right = 10;
                        light.shadow.camera.top = 10;
                        light.shadow.camera.bottom = -10;
                        break;
                    case 'point':
                        light = new THREE.PointLight(this.color, this.intensity, this.distance, this.decay);
                        light.castShadow = this.castShadow;
                        light.shadow.mapSize.width = 1024;
                        light.shadow.mapSize.height = 1024;
                        light.shadow.camera.near = 0.1;
                        light.shadow.camera.far = this.distance || 25;
                        break;
                    case 'spot':
                        light = new THREE.SpotLight(this.color, this.intensity, this.distance, this.angle, this.penumbra, this.decay);
                        light.castShadow = this.castShadow;
                        light.shadow.mapSize.width = 1024;
                        light.shadow.mapSize.height = 1024;
                        light.shadow.camera.near = 0.1;
                        light.shadow.camera.far = this.distance || 25;
                        break;
                    case 'ambient':
                        light = new THREE.AmbientLight(this.color, this.intensity);
                        break;
                    default:
                        light = new THREE.PointLight(this.color, this.intensity, this.distance, this.decay);
                }
                
                this.light = light;
                
                // Create helper
                this.createHelper();
                
                // Add light to scene or object
                const editor = EditorCore.getInstance();
                const object = editor.sceneManager.objects.get(this.entity);
                if (object) {
                    if (object.mesh) {
                        // Add light to the object's mesh (anchor)
                        object.mesh.add(light);
                        
                        // Add target for directional and spot lights
                        if (this.lightType === 'directional' || this.lightType === 'spot') {
                            light.target.position.set(0, -1, 0);
                            object.mesh.add(light.target);
                        }
                        
                        // Add helper to the object
                        if (this.helper) {
                            object.mesh.add(this.helper);
                        }
                        
                        // Store references in the scene object
                        object.light = light;
                        object.helper = this.helper;
                    } else {
                        // Fallback: add directly to scene
                        editor.sceneManager.scene.add(light);
                    }
                }
            }
            
            createHelper() {
                if (!this.light) return;
                
                switch (this.lightType) {
                    case 'directional':
                        this.helper = new THREE.DirectionalLightHelper(this.light, 1);
                        break;
                    case 'point':
                        this.helper = new THREE.PointLightHelper(this.light, 0.5);
                        break;
                    case 'spot':
                        this.helper = new THREE.SpotLightHelper(this.light);
                        break;
                    // Ambient lights don't have helpers
                }
            }
            
            update() {
                // Update light properties if they changed
                if (this.light) {
                    this.light.color.setHex(this.color);
                    this.light.intensity = this.intensity;
                    this.light.castShadow = this.castShadow;
                    
                    // Update specific light type properties
                    if (this.lightType === 'point' && this.light instanceof THREE.PointLight) {
                        this.light.distance = this.distance;
                        this.light.decay = this.decay;
                    } else if (this.lightType === 'spot' && this.light instanceof THREE.SpotLight) {
                        this.light.angle = this.angle;
                        this.light.penumbra = this.penumbra;
                        this.light.distance = this.distance;
                        this.light.decay = this.decay;
                    }
                    
                    // Update helper
                    if (this.helper && this.helper.update) {
                        this.helper.update();
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
            
            setType(lightType) {
                this.lightType = lightType;
                // Remove old light first
                if (this.light) {
                    const editor = EditorCore.getInstance();
                    const object = editor.sceneManager.objects.get(this.entity);
                    if (object && object.mesh) {
                        object.mesh.remove(this.light);
                        if (this.helper) {
                            object.mesh.remove(this.helper);
                        }
                    } else {
                        editor.sceneManager.scene.remove(this.light);
                    }
                }
                this.createLight(); // Recreate light with new type
            }
            
            setDistance(distance) {
                this.distance = distance;
                if (this.light && this.light.distance !== undefined) {
                    this.light.distance = distance;
                    // Update shadow camera
                    if (this.light.shadow && this.light.shadow.camera) {
                        this.light.shadow.camera.far = distance || 25;
                        this.light.shadow.camera.updateProjectionMatrix();
                    }
                }
            }
            
            setDecay(decay) {
                this.decay = decay;
                if (this.light && this.light.decay !== undefined) {
                    this.light.decay = decay;
                }
            }
            
            setAngle(angle) {
                this.angle = angle;
                if (this.light && this.light.angle !== undefined) {
                    this.light.angle = angle;
                }
            }
            
            setPenumbra(penumbra) {
                this.penumbra = penumbra;
                if (this.light && this.light.penumbra !== undefined) {
                    this.light.penumbra = penumbra;
                }
            }
            
            setCastShadow(castShadow) {
                this.castShadow = castShadow;
                if (this.light) {
                    this.light.castShadow = castShadow;
                }
            }
            
            getSceneObject() {
                const editor = EditorCore.getInstance();
                return editor.sceneManager.objects.get(this.entity);
            }
            
            destroy() {
                if (this.light) {
                    const editor = EditorCore.getInstance();
                    const object = editor.sceneManager.objects.get(this.entity);
                    if (object && object.mesh) {
                        object.mesh.remove(this.light);
                        if (this.helper) {
                            object.mesh.remove(this.helper);
                        }
                        if (this.light.target) {
                            object.mesh.remove(this.light.target);
                        }
                    } else {
                        editor.sceneManager.scene.remove(this.light);
                    }
                    this.light = null;
                    this.helper = null;
                }
            }
            
            serialize() {
                return {
                    lightType: this.lightType,
                    color: this.color,
                    intensity: this.intensity,
                    distance: this.distance,
                    decay: this.decay,
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
                // Get the current object
                var obj = gameObject;
                if (obj && obj.mesh) {
                    var rotationAmount = rotationSpeed * time.deltaTime;
                    
                    // Handle both single meshes and imported model groups
                    var targetMesh = obj.mesh;
                    if (obj.type === 'imported-model') {
                        // For imported models, rotate the entire group
                        targetMesh = obj.mesh;
                    }
                    
                    switch(axis) {
                        case 'x':
                            targetMesh.rotation.x += rotationAmount;
                            break;
                        case 'y':
                            targetMesh.rotation.y += rotationAmount;
                            break;
                        case 'z':
                            targetMesh.rotation.z += rotationAmount;
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
                // Get initial position from mesh
                var obj = gameObject;
                if (obj && obj.mesh) {
                    // Handle both single meshes and imported model groups
                    var targetMesh = obj.mesh;
                    if (obj.type === 'imported-model') {
                        // For imported models, use the entire group
                        targetMesh = obj.mesh;
                    }
                    
                    startPosition = {
                        x: targetMesh.position.x,
                        y: targetMesh.position.y,
                        z: targetMesh.position.z
                    };
                }
                log('Oscillator script started for entity: ' + entity);
            }
            
            function update() {
                if (!startPosition) return;
                
                var obj = gameObject;
                if (obj && obj.mesh) {
                    var offset = Math.sin(time.time * frequency) * amplitude;
                    
                    // Handle both single meshes and imported model groups
                    var targetMesh = obj.mesh;
                    if (obj.type === 'imported-model') {
                        // For imported models, move the entire group
                        targetMesh = obj.mesh;
                    }
                    
                    switch(axis) {
                        case 'x':
                            targetMesh.position.x = startPosition.x + offset;
                            break;
                        case 'y':
                            targetMesh.position.y = startPosition.y + offset;
                            break;
                        case 'z':
                            targetMesh.position.z = startPosition.z + offset;
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
                on('objectSelected', function(data) {
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
                        var obj = gameObject;
                        if (obj && obj.mesh) {
                            // Handle both single meshes and imported model groups
                            var targetMesh = obj.mesh;
                            if (obj.type === 'imported-model') {
                                // For imported models, hide the entire group
                                targetMesh = obj.mesh;
                            }
                            targetMesh.visible = false;
                        }
                        break;
                    case 'destroy':
                        destroyObject(entity);
                        break;
                    case 'changeColor':
                        var obj = gameObject;
                        if (obj && obj.mesh && obj.mesh.material) {
                            obj.mesh.material.color.setHex(Math.random() * 0xffffff);
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
                log('Simple rotate script started');
            }
            
            function update() {
                var obj = gameObject;
                if (obj && obj.mesh) {
                    // Rotate around Y axis
                    obj.mesh.rotation.y += (rotationSpeed * Math.PI / 180) * time.deltaTime;
                }
            }
            
            function onDestroy() {
                log('Simple rotate script destroyed');
            }
        `);

        // Debug script for testing
        this.registerScriptTemplate('Debug Test', `
            // Debug Test Script - Simple test to verify script system is working
            var testCounter = 0;
            
            function start() {
                log('Debug test script started for entity: ' + entity);
                log('GameObject type: ' + (gameObject ? gameObject.type : 'undefined'));
                log('GameObject mesh: ' + (gameObject && gameObject.mesh ? 'exists' : 'undefined'));
                if (gameObject && gameObject.mesh) {
                    log('Mesh position: ' + JSON.stringify(gameObject.mesh.position));
                    log('Mesh rotation: ' + JSON.stringify(gameObject.mesh.rotation));
                    if (gameObject.type === 'imported-model') {
                        log('Imported model detected - mesh is a group with ' + gameObject.mesh.children.length + ' children');
                    }
                }
            }
            
            function update() {
                testCounter += time.deltaTime;
                
                if (testCounter >= 1.0) { // Log every second
                    log('Debug test update - Counter: ' + testCounter.toFixed(2));
                    testCounter = 0;
                }
                
                // Simple rotation test
                var obj = gameObject;
                if (obj && obj.mesh) {
                    // Handle both single meshes and imported model groups
                    var targetMesh = obj.mesh;
                    if (obj.type === 'imported-model') {
                        // For imported models, rotate the entire group
                        targetMesh = obj.mesh;
                    }
                    targetMesh.rotation.y += 0.01;
                }
            }
            
            function onDestroy() {
                log('Debug test script destroyed');
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
        let frameCount = 0;
        
        const update = () => {
            if (!this.isUpdating) return;
            
            const currentTime = performance.now();
            const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
            lastTime = currentTime;
            
            frameCount++;
            // Only log every 300 frames (about every 5 seconds) instead of every 60
            if (frameCount % 300 === 0) {
                // console.log(`Update loop running - frame: ${frameCount}, deltaTime: ${deltaTime.toFixed(4)}`);
            }
            
            this.updateComponents(deltaTime);
            
            requestAnimationFrame(update);
        };
        
        // console.log('Starting component update loop');
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
        // Only update if we're in a valid state
        const editor = EditorCore.getInstance();
        if (!editor) return;
        
        // Debug: Log the current editor mode
        // if (editor.editorMode === 'play') {
        //     console.log('Play mode detected, updating scripts...');
        // }
        
        // Update script time tracking
        if (editor.editorMode === 'play') {
            // Scripts are running - update all components including scripts
            this.entityComponents.forEach((components, entityId) => {
                components.forEach((component, componentName) => {
                    if (typeof component.update === 'function') {
                        // if (componentName === 'Script') {
                        //     console.log(`Updating script for entity: ${entityId}`);
                        // }
                        component.update(deltaTime);
                    }
                });
            });
        } else if (editor.editorMode === 'pause') {
            // Scripts are paused - don't update script components but update others
            this.entityComponents.forEach((components, entityId) => {
                components.forEach((component, componentName) => {
                    if (componentName !== 'Script' && typeof component.update === 'function') {
                        component.update(deltaTime);
                    }
                });
            });
        } else {
            // Scripts are stopped - don't update script components but update others
            this.entityComponents.forEach((components, entityId) => {
                components.forEach((component, componentName) => {
                    if (componentName !== 'Script' && typeof component.update === 'function') {
                        component.update(deltaTime);
                    }
                });
            });
        }
    }

    /**
     * Start script execution (called when play button is pressed)
     */
    startScriptExecution() {
        // console.log('Starting script execution system...');
        this.scriptStartTime = performance.now();
        this.totalPausedTime = 0;
        
        let scriptCount = 0;
        
        // Call start() method on all script components
        this.entityComponents.forEach((components, entityId) => {
            const scriptComponent = components.get('Script');
            if (scriptComponent && scriptComponent.scriptInstance) {
                // Reset time context
                if (scriptComponent.scriptInstance.context) {
                    scriptComponent.scriptInstance.context.time.time = 0;
                    scriptComponent.scriptInstance.context.time.deltaTime = 0;
                }
                
                // Call start method
                if (typeof scriptComponent.scriptInstance.start === 'function') {
                    try {
                        scriptComponent.scriptInstance.start();
                        // console.log(`Started script for entity: ${entityId}`);
                        scriptCount++;
                    } catch (error) {
                        console.error(`Error starting script for entity ${entityId}:`, error);
                    }
                } else {
                    // console.warn(`Script for entity ${entityId} has no start() method`);
                }
            }
        });
        
        // console.log(`Script execution started. ${scriptCount} scripts initialized.`);
    }
    
    /**
     * Stop script execution (called when stop button is pressed)
     */
    stopScriptExecution() {
        // console.log('Stopping script execution system...');
        
        // Call onDestroy() method on all script components
        this.entityComponents.forEach((components, entityId) => {
            const scriptComponent = components.get('Script');
            if (scriptComponent && scriptComponent.scriptInstance) {
                if (typeof scriptComponent.scriptInstance.onDestroy === 'function') {
                    try {
                        scriptComponent.scriptInstance.onDestroy();
                        // console.log(`Destroyed script for entity: ${entityId}`);
                    } catch (error) {
                        console.error(`Error destroying script for entity ${entityId}:`, error);
                    }
                }
            }
        });
    }
    
    /**
     * Pause script execution (called when pause button is pressed)
     */
    pauseScriptExecution() {
        // console.log('Pausing script execution system...');
        this.scriptPauseTime = performance.now();
    }
    
    /**
     * Resume script execution (called when play button is pressed after pause)
     */
    resumeScriptExecution() {
        // console.log('Resuming script execution system...');
        if (this.scriptPauseTime > 0) {
            this.totalPausedTime += performance.now() - this.scriptPauseTime;
            this.scriptPauseTime = 0;
        }
    }
    
    /**
     * Reset script execution state
     */
    resetScriptExecution() {
        // console.log('Resetting script execution system state...');
        this.scriptStartTime = 0;
        this.scriptPauseTime = 0;
        this.totalPausedTime = 0;
        
        // Reset time in all script contexts
        this.entityComponents.forEach((components, entityId) => {
            const scriptComponent = components.get('Script');
            if (scriptComponent && scriptComponent.scriptInstance && scriptComponent.scriptInstance.context) {
                scriptComponent.scriptInstance.context.time.time = 0;
                scriptComponent.scriptInstance.context.time.deltaTime = 0;
            }
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
     * Get script execution status for debugging
     */
    getScriptStatus() {
        const status = {
            totalScripts: 0,
            activeScripts: 0,
            scriptDetails: []
        };
        
        this.entityComponents.forEach((components, entityId) => {
            const scriptComponent = components.get('Script');
            if (scriptComponent) {
                status.totalScripts++;
                
                const scriptInfo = {
                    entityId: entityId,
                    scriptName: scriptComponent.scriptName,
                    enabled: scriptComponent.enabled,
                    hasStart: typeof scriptComponent.scriptInstance?.start === 'function',
                    hasUpdate: typeof scriptComponent.scriptInstance?.update === 'function',
                    hasOnDestroy: typeof scriptComponent.scriptInstance?.onDestroy === 'function',
                    compiled: !!scriptComponent.scriptInstance
                };
                
                if (scriptComponent.enabled && scriptComponent.scriptInstance) {
                    status.activeScripts++;
                }
                
                status.scriptDetails.push(scriptInfo);
            }
        });
        
        return status;
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

