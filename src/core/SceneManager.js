/**
 * SceneManager - Manages the 3D scene, objects, and rendering
 */
class SceneManager {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.container = null;
        
        // Three.js core objects
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        
        // Scene state
        this.objects = new Map(); // Map of object IDs to objects
        this.selectedObjects = new Set();
        this.nextObjectId = 1;
        
        // Helpers and tools
        this.gridHelper = null;
        this.axesHelper = null;
        this.transformControls = null;
        
        // Rendering
        this.isRendering = false;
        this.frameId = null;
        this.stats = {
            fps: 0,
            frameCount: 0,
            lastTime: 0
        };
        
        // Settings
        this.settings = {
            showGrid: true,
            showAxes: true,
            wireframe: false,
            shadows: true,
            antialias: true
        };

        this.init();
    }

    /**
     * Initialize the scene manager
     */
    init() {
        this.container = document.getElementById('viewport');
        if (!this.container) {
            throw new Error('Viewport container not found');
        }
        this.setupScene();
        this.createCamera();
        this.createRenderer();
        this.setupControls();
        this.setupEventListeners();
        this.startRenderLoop();
        
        console.log('SceneManager initialized');
    }

    /**
     * Setup the complete scene
     */
    setupScene() {
        this.createScene();
        this.createHelpers();
    }

    /**
     * Create the Three.js scene
     */
    createScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x2d2d30);
        
        // Add basic lighting
        const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 10, 5);
        directionalLight.castShadow = this.settings.shadows;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);
    }

    /**
     * Create the camera
     */
    createCamera() {
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
        this.camera.position.set(5, 5, 5);
        this.camera.lookAt(0, 0, 0);
    }

    /**
     * Create the WebGL renderer
     */
    createRenderer() {
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: this.settings.antialias,
            alpha: true
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = this.settings.shadows;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1;
        
        this.container.appendChild(this.renderer.domElement);
    }

    /**
     * Setup camera controls
     */
    setupControls() {
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.screenSpacePanning = false;
        this.controls.minDistance = 1;
        this.controls.maxDistance = 100;
        this.controls.maxPolarAngle = Math.PI;
        
        this.controls.addEventListener('change', () => {
            this.eventBus.emit(EventBus.Events.CAMERA_MOVED, {
                position: this.camera.position.clone(),
                target: this.controls.target.clone()
            });
        });
    }

    /**
     * Create scene helpers (grid, axes, etc.)
     */
    createHelpers() {
        // Grid helper
        this.gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x444444);
        this.gridHelper.visible = this.settings.showGrid;
        this.scene.add(this.gridHelper);
        
        // Axes helper
        this.axesHelper = new THREE.AxesHelper(5);
        this.axesHelper.visible = this.settings.showAxes;
        this.scene.add(this.axesHelper);
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Handle window resize
        window.addEventListener('resize', () => this.handleResize());
        
        // Handle mouse events for object selection
        this.renderer.domElement.addEventListener('click', (event) => this.onMouseClick(event));
        this.renderer.domElement.addEventListener('contextmenu', (event) => this.onRightClick(event));
        
        // Setup TransformControls
        this.setupTransformControls();
        
        // Listen for editor events
        this.eventBus.on(EventBus.Events.TOOL_ACTIVATED, (data) => this.onToolActivated(data));
    }

    /**
     * Setup transform controls
     */
    setupTransformControls() {
        this.transformControls = new THREE.TransformControls(this.camera, this.renderer.domElement);
        this.transformControls.addEventListener('change', () => {
            // Update object properties when transform changes
            const object = this.transformControls.object;
            if (object && object.userData.id) {
                const sceneObject = this.objects.get(object.userData.id);
                if (sceneObject) {
                    sceneObject.properties.position = object.position.clone();
                    sceneObject.properties.rotation = object.rotation.clone();
                    sceneObject.properties.scale = object.scale.clone();
                    
                    this.eventBus.emit(EventBus.Events.OBJECT_TRANSFORMED, {
                        id: object.userData.id,
                        object: sceneObject
                    });
                }
            }
        });
        
        this.transformControls.addEventListener('dragging-changed', (event) => {
            this.controls.enabled = !event.value;
        });
        
        this.transformControls.addEventListener('objectChange', () => {
            this.render();
        });
        
        this.scene.add(this.transformControls);
    }

    /**
     * Start the render loop
     */
    startRenderLoop() {
        this.isRendering = true;
        this.render();
    }

    /**
     * Stop the render loop
     */
    stopRenderLoop() {
        this.isRendering = false;
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
        }
    }

    /**
     * Main render function
     */
    render() {
        if (!this.isRendering) return;
        
        this.frameId = requestAnimationFrame(() => this.render());
        
        // Update controls
        this.controls.update();
        
        // Update stats
        this.updateStats();
        
        // Frustum culling for performance
        this.updateFrustumCulling();
        
        // Level of Detail (LOD) system
        this.updateLOD();
        
        // Render the scene
        this.renderer.render(this.scene, this.camera);
    }
    
    /**
     * Frustum culling for performance optimization
     */
    updateFrustumCulling() {
        const frustum = new THREE.Frustum();
        const matrix = new THREE.Matrix4().multiplyMatrices(
            this.camera.projectionMatrix, 
            this.camera.matrixWorldInverse
        );
        frustum.setFromProjectionMatrix(matrix);
        
        this.objects.forEach((object, id) => {
            if (object.mesh) {
                const box = new THREE.Box3().setFromObject(object.mesh);
                object.mesh.visible = frustum.intersectsBox(box);
            }
        });
    }
    
    /**
     * Level of Detail system
     */
    updateLOD() {
        this.objects.forEach((object, id) => {
            if (object.mesh && object.mesh.children.length > 0) {
                const distance = this.camera.position.distanceTo(object.mesh.position);
                // Implement LOD based on distance
                this.updateObjectLOD(object, distance);
            }
        });
    }
    
    /**
     * Update object LOD based on distance
     */
    updateObjectLOD(object, distance) {
        // Simple LOD implementation
        if (distance > 50) {
            object.mesh.visible = false; // Hide far objects
        } else if (distance > 20) {
            // Use low detail mesh
            this.setObjectDetail(object, 'low');
        } else {
            // Use high detail mesh
            this.setObjectDetail(object, 'high');
        }
    }
    
    /**
     * Set object detail level for LOD
     */
    setObjectDetail(object, detailLevel) {
        if (!object.mesh) return;
        
        // Simple detail level implementation
        object.mesh.traverse((child) => {
            if (child.isMesh) {
                switch (detailLevel) {
                    case 'low':
                        // Reduce geometry detail for distant objects
                        if (child.material) {
                            child.material.wireframe = false;
                            child.castShadow = false;
                            child.receiveShadow = false;
                        }
                        break;
                    case 'high':
                        // Full detail for nearby objects
                        if (child.material) {
                            child.material.wireframe = false;
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                        break;
                }
                child.visible = true;
            }
        });
    }

    /**
     * Update performance stats
     */
    updateStats() {
        const now = performance.now();
        this.stats.frameCount++;
        
        if (now - this.stats.lastTime >= 1000) {
            this.stats.fps = Math.round((this.stats.frameCount * 1000) / (now - this.stats.lastTime));
            this.stats.frameCount = 0;
            this.stats.lastTime = now;
        }
    }

    /**
     * Handle window resize
     */
    handleResize() {
        if (!this.container || !this.camera || !this.renderer) return;
        
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(width, height);
        
        this.eventBus.emit(EventBus.Events.VIEWPORT_RESIZED, { width, height });
    }

    /**
     * Handle mouse click for object selection
     */
    onMouseClick(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);
        
        // Get all selectable objects including their children for complex models
        const selectableObjects = [];
        Array.from(this.objects.values()).forEach(obj => {
            if (obj.mesh && obj.mesh.visible) {
                selectableObjects.push(obj.mesh);
                // Add all child meshes for imported models
                obj.mesh.traverse((child) => {
                    if (child !== obj.mesh && child.isMesh && child.visible) {
                        selectableObjects.push(child);
                    }
                });
            }
        });
        
        const intersects = raycaster.intersectObjects(selectableObjects);
        
        if (intersects.length > 0) {
            const selectedMesh = intersects[0].object;
            
            // Find the parent object for this mesh
            let selectedObject = null;
            
            // First check if it's a direct mesh match
            selectedObject = Array.from(this.objects.values())
                .find(obj => obj.mesh === selectedMesh);
            
            // If not found, check if it's a child of any object
            if (!selectedObject) {
                selectedObject = Array.from(this.objects.values())
                    .find(obj => {
                        if (!obj.mesh) return false;
                        let found = false;
                        obj.mesh.traverse((child) => {
                            if (child === selectedMesh) {
                                found = true;
                            }
                        });
                        return found;
                    });
            }
            
            if (selectedObject) {
                this.selectObject(selectedObject.id);
            }
        } else {
            this.clearSelection();
        }
    }

    /**
     * Handle right click for context menu
     */
    onRightClick(event) {
        event.preventDefault();
        
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);
        
        // Get all selectable objects including their children for complex models
        const selectableObjects = [];
        Array.from(this.objects.values()).forEach(obj => {
            if (obj.mesh && obj.mesh.visible) {
                selectableObjects.push(obj.mesh);
                // Add all child meshes for imported models
                obj.mesh.traverse((child) => {
                    if (child !== obj.mesh && child.isMesh && child.visible) {
                        selectableObjects.push(child);
                    }
                });
            }
        });
        
        const intersects = raycaster.intersectObjects(selectableObjects);
        
        if (intersects.length > 0) {
            const selectedMesh = intersects[0].object;
            
            // Find the parent object for this mesh
            let selectedObject = null;
            
            // First check if it's a direct mesh match
            selectedObject = Array.from(this.objects.values())
                .find(obj => obj.mesh === selectedMesh);
            
            // If not found, check if it's a child of any object
            if (!selectedObject) {
                selectedObject = Array.from(this.objects.values())
                    .find(obj => {
                        if (!obj.mesh) return false;
                        let found = false;
                        obj.mesh.traverse((child) => {
                            if (child === selectedMesh) {
                                found = true;
                            }
                        });
                        return found;
                    });
            }
            
            if (selectedObject) {
                this.selectObject(selectedObject.id);
                this.showContextMenu(event.clientX, event.clientY, selectedObject);
            }
        } else {
            this.showContextMenu(event.clientX, event.clientY, null);
        }
    }

    /**
     * Show context menu
     */
    showContextMenu(x, y, object) {
        this.eventBus.emit('ui:show-context-menu', {
            x, y, object,
            actions: object ? [
                { label: 'Delete', action: () => this.removeObject(object.id) },
                { label: 'Duplicate', action: () => this.duplicateObject(object.id) },
                { label: 'Rename', action: () => this.renameObject(object.id) }
            ] : [
                { label: 'Add Cube', action: () => this.eventBus.emit('editor:create-object', { type: 'cube' }) },
                { label: 'Add Sphere', action: () => this.eventBus.emit('editor:create-object', { type: 'sphere' }) },
                { label: 'Add Plane', action: () => this.eventBus.emit('editor:create-object', { type: 'plane' }) }
            ]
        });
    }

    /**
     * Handle tool activation
     */
    onToolActivated(data) {
        // Handle different tool activations
        switch (data.tool) {
            case 'select':
                this.setTransformMode(null);
                break;
            case 'move':
                this.setTransformMode('translate');
                break;
            case 'rotate':
                this.setTransformMode('rotate');
                break;
            case 'scale':
                this.setTransformMode('scale');
                break;
            case 'wireframe':
                this.toggleWireframe();
                break;
            case 'grid':
                this.toggleGrid();
                break;
            case 'camera-reset':
                this.resetCamera();
                break;
        }
    }

    /**
     * Set transform mode for selected objects
     */
    setTransformMode(mode) {
        if (!this.transformControls) return;
        
        // Store the current mode for future selections
        this.currentTransformMode = mode;
        
        if (mode && mode !== 'select') {
            this.transformControls.setMode(mode);
            // Attach to selected object if any
            const selectedObjects = this.getSelectedObjects();
            if (selectedObjects.length > 0 && selectedObjects[0].mesh) {
                // Check if the mesh is still in the scene
                if (this.scene.children.includes(selectedObjects[0].mesh)) {
                    this.transformControls.attach(selectedObjects[0].mesh);
                    console.log(`Attached transform controls in ${mode} mode to object: ${selectedObjects[0].name}`);
                } else {
                    console.warn(`Object mesh not in scene, detaching transform controls`);
                    this.transformControls.detach();
                }
            } else {
                console.log(`Transform mode set to ${mode}, but no object selected`);
            }
        } else {
            this.transformControls.detach();
            console.log('Transform controls detached');
        }
    }

    /**
     * Add a 3D object to the scene
     */
    addObject(type, options = {}) {
        const id = `object_${this.nextObjectId++}`;
        let geometry, material, mesh;
        
        // Create geometry based on type
        switch (type) {
            case 'cube':
                geometry = new THREE.BoxGeometry(
                    options.width || 1,
                    options.height || 1,
                    options.depth || 1
                );
                break;
            case 'sphere':
                geometry = new THREE.SphereGeometry(
                    options.radius || 0.5,
                    options.widthSegments || 32,
                    options.heightSegments || 16
                );
                break;
            case 'plane':
                geometry = new THREE.PlaneGeometry(
                    options.width || 1,
                    options.height || 1
                );
                break;
            case 'cylinder':
                geometry = new THREE.CylinderGeometry(
                    options.radiusTop || 0.5,
                    options.radiusBottom || 0.5,
                    options.height || 1,
                    options.radialSegments || 8
                );
                break;
            default:
                console.warn(`Unknown object type: ${type}`);
                return null;
        }
        
        // Create material
        material = new THREE.MeshLambertMaterial({
            color: options.color || 0x00ff00,
            wireframe: this.settings.wireframe
        });
        
        // Create mesh
        mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(
            options.x || 0,
            options.y || 0,
            options.z || 0
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.id = id;
        
        // Create object data
        const object = {
            id,
            type,
            name: options.name || `${type}_${this.nextObjectId - 1}`,
            mesh,
            components: new Map(),
            properties: {
                position: mesh.position.clone(),
                rotation: mesh.rotation.clone(),
                scale: mesh.scale.clone(),
                visible: true,
                ...options
            }
        };
        
        // Add to scene and tracking
        this.scene.add(mesh);
        this.objects.set(id, object);
        
        // Emit event
        this.eventBus.emit(EventBus.Events.OBJECT_CREATED, {
            object,
            id,
            type
        });
        
        return object;
    }

    /**
     * Add a primitive object to the scene (wrapper for addObject)
     */
    addPrimitive(type, options = {}) {
        return this.addObject(type, options);
    }

    

    /**
     * Create a new scene
     */
    newScene() {
        this.clearScene();
        this.resetCamera();
        console.log('New scene created');
        this.eventBus.emit('scene:new-scene');
    }

    /**
     * Load scene from data
     */
    loadScene(sceneData) {
        this.importScene(sceneData);
        console.log('Scene loaded from data');
    }

    /**
     * Import a 3D model file
     */
    async importModel(file) {
        return new Promise((resolve, reject) => {
            const fileName = file.name.toLowerCase();
            const fileExtension = fileName.split('.').pop();
            
            const reader = new FileReader();
            
            reader.onload = (event) => {
                const arrayBuffer = event.target.result;
                
                try {
                    if (fileExtension === 'glb' || fileExtension === 'gltf') {
                        this.loadGLTFModel(arrayBuffer, file.name)
                            .then(resolve)
                            .catch(reject);
                    } else if (fileExtension === 'fbx') {
                        this.loadFBXModel(arrayBuffer, file.name)
                            .then(resolve)
                            .catch(reject);
                    } else if (fileExtension === 'obj') {
                        this.loadOBJModel(arrayBuffer, file.name)
                            .then(resolve)
                            .catch(reject);
                    } else {
                        reject(new Error(`Unsupported file format: ${fileExtension}`));
                    }
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };
            
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Load GLTF/GLB model
     */
    async loadGLTFModel(arrayBuffer, fileName) {
        return new Promise((resolve, reject) => {
            if (!window.THREE.GLTFLoader) {
                reject(new Error('GLTFLoader not available'));
                return;
            }
            
            const loader = new THREE.GLTFLoader();
            
            // Setup Draco decoder if available
            if (window.THREE.DRACOLoader) {
                const dracoLoader = new THREE.DRACOLoader();
                dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.4.3/');
                loader.setDRACOLoader(dracoLoader);
            }
            
            loader.parse(arrayBuffer, '', (gltf) => {
                try {
                    const model = gltf.scene;
                    const id = `model_${this.nextObjectId++}`;
                    
                    // Set up the model
                    model.userData.id = id;
                    model.position.set(0, 0, 0);
                    model.castShadow = true;
                    model.receiveShadow = true;
                    
                    // Enable shadows for all meshes
                    model.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                        }
                    });
                    
                    // Create object data
                    const modelObject = {
                        id,
                        type: 'imported-model',
                        name: fileName.replace(/\.[^/.]+$/, ''),
                        mesh: model,
                        gltf: gltf, // Store original GLTF data
                        components: new Map(),
                        properties: {
                            position: model.position.clone(),
                            rotation: model.rotation.clone(),
                            scale: model.scale.clone(),
                            visible: true,
                            fileName: fileName
                        }
                    };
                    
                    // Add to scene and tracking
                    this.scene.add(model);
                    this.objects.set(id, modelObject);
                    
                    // Center camera on the model
                    const box = new THREE.Box3().setFromObject(model);
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());
                    
                    // Position camera to see the entire model
                    const maxDim = Math.max(size.x, size.y, size.z);
                    const fov = this.camera.fov * (Math.PI / 180);
                    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
                    cameraZ *= 1.5; // Add some padding
                    
                    this.camera.position.set(center.x, center.y + maxDim * 0.5, center.z + cameraZ);
                    this.camera.lookAt(center);
                    this.controls.target.copy(center);
                    this.controls.update();
                    
                    // Auto-select the imported model
                    this.selectObject(id);
                    
                    // Emit event
                    this.eventBus.emit(EventBus.Events.OBJECT_CREATED, {
                        object: modelObject,
                        id,
                        type: 'imported-model'
                    });
                    
                    console.log(`Imported GLTF model: ${fileName}`);
                    resolve(modelObject);
                    
                } catch (error) {
                    reject(error);
                }
            }, (error) => {
                reject(new Error(`Failed to parse GLTF: ${error.message}`));
            });
        });
    }

    /**
     * Load FBX model (placeholder - requires FBXLoader)
     */
    async loadFBXModel(arrayBuffer, fileName) {
        return new Promise((resolve, reject) => {
            reject(new Error('FBX loading not implemented yet. Please use GLTF/GLB format.'));
        });
    }

    /**
     * Load OBJ model (placeholder - requires OBJLoader)
     */
    async loadOBJModel(arrayBuffer, fileName) {
        return new Promise((resolve, reject) => {
            reject(new Error('OBJ loading not implemented yet. Please use GLTF/GLB format.'));
        });
    }

    /**
     * Remove an object from the scene
     */
    removeObject(id) {
        const object = this.objects.get(id);
        if (!object) {
            console.warn(`Object with id ${id} not found`);
            return false;
        }
        
        // Detach transform controls if this object is selected
        const sceneObject = object.mesh || object.light || object.camera;
        if (this.transformControls && this.transformControls.object === sceneObject) {
            this.transformControls.detach();
        }
        
        // Remove from scene
        if (object.mesh) {
            this.scene.remove(object.mesh);
            
            // Clean up geometry and material for meshes
            if (object.mesh.geometry) {
                object.mesh.geometry.dispose();
            }
            if (object.mesh.material) {
                if (Array.isArray(object.mesh.material)) {
                    object.mesh.material.forEach(material => material.dispose());
                } else {
                    object.mesh.material.dispose();
                }
            }
            
            // Clean up textures if any
            if (object.mesh.material && object.mesh.material.map) {
                object.mesh.material.map.dispose();
            }
        } else if (object.light) {
            this.scene.remove(object.light);
        } else if (object.camera) {
            this.scene.remove(object.camera);
        }
        
        // Remove from tracking
        this.objects.delete(id);
        this.selectedObjects.delete(id);
        
        // Emit event
        this.eventBus.emit(EventBus.Events.OBJECT_DELETED, { id, object });
        
        console.log(`Removed object: ${object.name} (${id})`);
        return true;
    }

    /**
     * Delete an object from the scene (alias for removeObject)
     */
    deleteObject(id) {
        return this.removeObject(id);
    }

    /**
     * Select an object
     */
    selectObject(id) {
        const object = this.objects.get(id);
        if (!object) return false;
        
        // Clear previous selection
        this.clearSelection();
        
        // Add to selection
        this.selectedObjects.add(id);
        
        // Visual feedback (outline or highlight)
        this.highlightObject(object, true);
        
        // Attach transform controls if in transform mode
        if (this.transformControls && this.currentTransformMode && this.currentTransformMode !== 'select') {
            this.transformControls.setMode(this.currentTransformMode);
            // Check if the mesh is still in the scene before attaching
            if (this.scene.children.includes(object.mesh)) {
                this.transformControls.attach(object.mesh);
                console.log(`Attached transform controls in ${this.currentTransformMode} mode to selected object: ${object.name}`);
            } else {
                console.warn(`Object mesh not in scene, cannot attach transform controls`);
                this.transformControls.detach();
            }
        }
        
        // Emit event
        this.eventBus.emit(EventBus.Events.OBJECT_SELECTED, { id, object });
        
        return true;
    }

    /**
     * Clear object selection
     */
    clearSelection() {
        this.selectedObjects.forEach(id => {
            const object = this.objects.get(id);
            if (object) {
                this.highlightObject(object, false);
                this.eventBus.emit(EventBus.Events.OBJECT_DESELECTED, { id, object });
            }
        });
        
        // Detach transform controls
        this.detachTransformControls();
        
        this.selectedObjects.clear();
    }

    /**
     * Detach transform controls safely
     */
    detachTransformControls() {
        if (this.transformControls) {
            this.transformControls.detach();
        }
    }

    /**
     * Highlight/unhighlight an object
     */
    highlightObject(object, highlight) {
        if (!object.mesh) return;
        
        // Traverse all meshes in case of imported models with multiple parts
        object.mesh.traverse((child) => {
            if (child.isMesh && child.material) {
                if (Array.isArray(child.material)) {
                    // Handle multiple materials
                    child.material.forEach(material => {
                        if (material.emissive) {
                            material.emissive.setHex(highlight ? 0x333333 : 0x000000);
                        }
                    });
                } else {
                    // Handle single material
                    if (child.material.emissive) {
                        child.material.emissive.setHex(highlight ? 0x333333 : 0x000000);
                    }
                }
            }
        });
    }

    /**
     * Get selected objects
     */
    getSelectedObjects() {
        return Array.from(this.selectedObjects).map(id => this.objects.get(id));
    }

    /**
     * Toggle wireframe mode
     */
    toggleWireframe() {
        this.settings.wireframe = !this.settings.wireframe;
        
        this.objects.forEach(object => {
            if (object.mesh && object.mesh.material) {
                object.mesh.material.wireframe = this.settings.wireframe;
            }
        });
        
        this.eventBus.emit(EventBus.Events.VIEWPORT_MODE_CHANGED, {
            mode: 'wireframe',
            enabled: this.settings.wireframe
        });
    }

    /**
     * Toggle grid visibility
     */
    toggleGrid() {
        this.settings.showGrid = !this.settings.showGrid;
        if (this.gridHelper) {
            this.gridHelper.visible = this.settings.showGrid;
        }
        
        this.eventBus.emit(EventBus.Events.VIEWPORT_MODE_CHANGED, {
            mode: 'grid',
            enabled: this.settings.showGrid
        });
    }

    /**
     * Reset camera to default position
     */
    resetCamera() {
        this.camera.position.set(5, 5, 5);
        this.camera.lookAt(0, 0, 0);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
        
        this.eventBus.emit(EventBus.Events.CAMERA_RESET);
    }

    /**
     * Clear the entire scene
     */
    clearScene() {
        // Remove all objects
        const objectIds = Array.from(this.objects.keys());
        objectIds.forEach(id => this.removeObject(id));
        
        this.eventBus.emit(EventBus.Events.SCENE_CLEARED);
    }

    /**
     * Export scene data
     */
    exportScene() {
        const sceneData = {
            objects: Array.from(this.objects.values()).map(object => ({
                id: object.id,
                type: object.type,
                name: object.name,
                properties: object.properties,
                components: Array.from(object.components.entries())
            })),
            camera: {
                position: this.camera.position.toArray(),
                target: this.controls.target.toArray()
            },
            settings: this.settings
        };
        
        return sceneData;
    }

    /**
     * Import scene data
     */
    importScene(sceneData) {
        // Clear current scene
        this.clearScene();
        
        // Import settings
        if (sceneData.settings) {
            Object.assign(this.settings, sceneData.settings);
        }
        
        // Import camera
        if (sceneData.camera) {
            this.camera.position.fromArray(sceneData.camera.position);
            this.controls.target.fromArray(sceneData.camera.target);
            this.controls.update();
        }
        
        // Import objects
        if (sceneData.objects) {
            sceneData.objects.forEach(objectData => {
                const object = this.addObject(objectData.type, objectData.properties);
                if (object && objectData.components) {
                    // Restore components
                    objectData.components.forEach(([componentName, componentData]) => {
                        // Component restoration would be handled by ComponentSystem
                    });
                }
            });
        }
        
        this.eventBus.emit(EventBus.Events.SCENE_IMPORTED, { sceneData });
    }

    /**
     * Dispose of the scene manager
     */
    dispose() {
        this.stopRenderLoop();
        
        // Dispose of all objects
        this.clearScene();
        
        // Dispose of renderer
        if (this.renderer) {
            this.renderer.dispose();
            if (this.container && this.renderer.domElement) {
                this.container.removeChild(this.renderer.domElement);
            }
        }
        
        // Remove event listeners
        window.removeEventListener('resize', this.handleResize);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SceneManager;
} else {
    window.SceneManager = SceneManager;
}

