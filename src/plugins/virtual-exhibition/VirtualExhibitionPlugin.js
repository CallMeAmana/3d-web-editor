import * as THREE from 'https://unpkg.com/three@0.150.1/build/three.module.js';

export class VirtualExhibitionPlugin {
    constructor() {
        this.editorCore = null;
        this.panelId = 'virtual-exhibition-tools';
        this.eventListeners = [];
        this.exhibitionKey = 'virtualExhibitionLayout';
    }

    onLoad(editorCore) {
        this.editorCore = editorCore;
        this.setupUI();
        // Load exhibition only if autosave is enabled or user triggers load explicitly
        this.autosaveEnabled = false; // default off
        this.loadExhibition();
    }

    onUnload() {
        this.removeUI();
        this.removeEventListeners();
        this.editorCore = null;
    }

    setupUI() {
        const panelContent = `
            <div class="exhibition-panel">
                <h4>Exhibition Elements</h4>
                <button id="vep-add-wall">Add Wall</button>
                <button id="vep-add-booth">Add Booth</button>
                <button id="vep-add-poster">Add Poster</button>
                <hr/>
                <button id="vep-save-exhibition">Save Exhibition</button>
                <button id="vep-load-exhibition">Load Exhibition</button>
                <hr/>
                <label><input type="checkbox" id="vep-autosave-toggle"> Autosave</label>
            </div>
        `;

        this.editorCore.pluginManager.pluginAPI.addPanel({
            id: this.panelId,
            title: 'Virtual Exhibition',
            content: panelContent,
            position: 'left'
        });

        this.addEventListener('vep-add-wall', 'click', () => this.addWall());
        this.addEventListener('vep-add-booth', 'click', () => this.addBooth());
        this.addEventListener('vep-add-poster', 'click', () => this.addPoster());
        this.addEventListener('vep-save-exhibition', 'click', () => this.saveExhibition());
        this.addEventListener('vep-load-exhibition', 'click', () => this.loadExhibition());
        this.addEventListener('vep-autosave-toggle', 'change', (e) => {
            this.autosaveEnabled = e.target.checked;
        });
    }

    removeUI() {
        const panel = document.getElementById(this.panelId);
        if (panel) {
            panel.remove();
        }
    }

    addEventListener(id, event, handler) {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener(event, handler);
            this.eventListeners.push({ el, event, handler });
        }
    }

    removeEventListeners() {
        this.eventListeners.forEach(({ el, event, handler }) => {
            el.removeEventListener(event, handler);
        });
        this.eventListeners = [];
    }

    generateId() {
        return `vep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    addWall() {
        const geometry = new THREE.BoxGeometry(4, 3, 0.1);
        const material = new THREE.MeshStandardMaterial({ color: 0x888888 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, 1.5, 0);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        this.addObjectToScene(mesh, 'Wall');
    }

    addBooth() {
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const material = new THREE.MeshStandardMaterial({ color: 0x3366cc });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, 1, 0);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        this.addObjectToScene(mesh, 'Booth');
    }

    addPoster() {
        const geometry = new THREE.PlaneGeometry(2, 1.5);
        const material = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, 1.5, 0);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        this.addObjectToScene(mesh, 'Poster');
    }

    addObjectToScene(mesh, type) {
        const id = this.generateId();
        mesh.userData.id = id;
        mesh.name = type;

        // Add mesh to scene
        this.editorCore.sceneManager.scene.add(mesh);

        // Add to SceneManager objects map
        const sceneObject = {
            id,
            type: 'custom',
            name: type,
            mesh,
            components: new Map(),
            properties: {
                position: mesh.position.clone(),
                rotation: mesh.rotation.clone(),
                scale: mesh.scale.clone(),
                visible: true,
                type
            }
        };
        this.editorCore.sceneManager.objects.set(id, sceneObject);

        // Add metadata component
// Use a component type that exists or register a new one if needed
// For now, use 'Script' component as a placeholder for metadata
this.editorCore.componentSystem.addComponent(id, 'Script', { scriptName: 'Metadata', variables: { isExhibitionElement: true, elementType: type } });

        // Select the new object
        this.editorCore.sceneManager.selectObject(id);

        // Autosave if enabled
        if (this.autosaveEnabled) {
            this.saveExhibition();
        }
    }

saveExhibition() {
        const objects = Array.from(this.editorCore.sceneManager.objects.values())
            .filter(obj => obj.properties.type && ['Wall', 'Booth', 'Poster'].includes(obj.properties.type))
            .map(obj => ({
                id: obj.id,
                type: obj.properties.type,
                position: obj.mesh.position.toArray(),
                rotation: [obj.mesh.rotation.x, obj.mesh.rotation.y, obj.mesh.rotation.z, obj.mesh.rotation.order],
                scale: obj.mesh.scale.toArray()
            }));

        localStorage.setItem(this.exhibitionKey, JSON.stringify(objects));
        this.editorCore.pluginManager.showNotification('Exhibition saved to localStorage.', 'success');
    }

    loadExhibition() {
        const data = localStorage.getItem(this.exhibitionKey);
        if (!data) {
            this.editorCore.pluginManager.showNotification('No saved exhibition found.', 'warning');
            return;
        }

        try {
            const objects = JSON.parse(data);

            // Clear existing exhibition objects
            const toRemove = [];
            this.editorCore.sceneManager.objects.forEach(obj => {
                if (obj.properties.type && ['Wall', 'Booth', 'Poster'].includes(obj.properties.type)) {
                    toRemove.push(obj.id);
                }
            });
            toRemove.forEach(id => this.editorCore.sceneManager.removeObject(id));

            // Add saved objects back
            objects.forEach(objData => {
                let mesh;
                switch (objData.type) {
                    case 'Wall':
                        mesh = new THREE.Mesh(
                            new THREE.BoxGeometry(4, 3, 0.1),
                            new THREE.MeshStandardMaterial({ color: 0x888888 })
                        );
                        break;
                    case 'Booth':
                        mesh = new THREE.Mesh(
                            new THREE.BoxGeometry(2, 2, 2),
                            new THREE.MeshStandardMaterial({ color: 0x3366cc })
                        );
                        break;
                    case 'Poster':
                        mesh = new THREE.Mesh(
                            new THREE.PlaneGeometry(2, 1.5),
                            new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide })
                        );
                        break;
                    default:
                        return;
                }
                mesh.position.fromArray(objData.position);
                mesh.rotation.set(objData.rotation[0], objData.rotation[1], objData.rotation[2], objData.rotation[3]);
                mesh.scale.fromArray(objData.scale);
                mesh.userData.id = objData.id;
                mesh.name = objData.type;
                mesh.castShadow = true;
                mesh.receiveShadow = true;

                this.editorCore.sceneManager.scene.add(mesh);

                const sceneObject = {
                    id: objData.id,
                    type: 'custom',
                    name: objData.type,
                    mesh,
                    components: new Map(),
                    properties: {
                        position: mesh.position.clone(),
                        rotation: mesh.rotation.clone(),
                        scale: mesh.scale.clone(),
                        visible: true,
                        type: objData.type
                    }
                };
                this.editorCore.sceneManager.objects.set(objData.id, sceneObject);

                // Use 'Script' component as placeholder for metadata
                this.editorCore.componentSystem.addComponent(objData.id, 'Script', { scriptName: 'Metadata', variables: { isExhibitionElement: true, elementType: objData.type } });
            });

            this.editorCore.pluginManager.showNotification('Exhibition loaded from localStorage.', 'success');
        } catch (error) {
            this.editorCore.pluginManager.showNotification('Failed to load exhibition: ' + error.message, 'error');
        }
    }
}
