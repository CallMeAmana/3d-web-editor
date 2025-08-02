/**
 * AssetManager - Manages loading, caching, and organization of 3D assets
 * Supports various asset types including models, textures, sounds, and scripts
 */
class AssetManager {
    constructor(eventBus) {
        this.eventBus = eventBus;
        
        // Asset storage
        this.assets = new Map(); // Map of asset ID to asset data
        this.assetCache = new Map(); // Map of URL to loaded asset
        this.assetTypes = new Map(); // Map of file extension to asset type
        
        // Loaders
        this.loaders = new Map(); // Map of asset type to loader function
        this.loadingPromises = new Map(); // Map of URL to loading promise
        
        // Asset organization
        this.categories = new Map(); // Map of category to asset IDs
        this.tags = new Map(); // Map of tag to asset IDs
        
        // Settings
        this.settings = {
            maxCacheSize: 100 * 1024 * 1024, // 100MB
            enableCompression: true,
            autoOptimize: true
        };
        
        this.init();
    }

    /**
     * Initialize the asset manager
     */
    init() {
        this.setupAssetTypes();
        this.setupLoaders();
        this.setupEventListeners();
        this.loadBuiltinAssets();
    }

    /**
     * Setup asset type mappings
     */
    setupAssetTypes() {
        // 3D Models
        this.assetTypes.set('gltf', 'model');
        this.assetTypes.set('glb', 'model');
        this.assetTypes.set('obj', 'model');
        this.assetTypes.set('fbx', 'model');
        this.assetTypes.set('dae', 'model');
        this.assetTypes.set('3ds', 'model');
        
        // Textures
        this.assetTypes.set('jpg', 'texture');
        this.assetTypes.set('jpeg', 'texture');
        this.assetTypes.set('png', 'texture');
        this.assetTypes.set('gif', 'texture');
        this.assetTypes.set('bmp', 'texture');
        this.assetTypes.set('tga', 'texture');
        this.assetTypes.set('exr', 'texture');
        this.assetTypes.set('hdr', 'texture');
        
        // Audio
        this.assetTypes.set('mp3', 'audio');
        this.assetTypes.set('wav', 'audio');
        this.assetTypes.set('ogg', 'audio');
        this.assetTypes.set('m4a', 'audio');
        
        // Video
        this.assetTypes.set('mp4', 'video');
        this.assetTypes.set('webm', 'video');
        this.assetTypes.set('ogv', 'video');
        
        // Scripts
        this.assetTypes.set('js', 'script');
        this.assetTypes.set('ts', 'script');
        
        // Data
        this.assetTypes.set('json', 'data');
        this.assetTypes.set('xml', 'data');
        this.assetTypes.set('csv', 'data');
    }

    /**
     * Setup asset loaders
     */
    setupLoaders() {
        // GLTF/GLB Loader
        this.loaders.set('model', async (url, options = {}) => {
            const loader = new THREE.GLTFLoader();
            
            return new Promise((resolve, reject) => {
                loader.load(
                    url,
                    (gltf) => {
                        const asset = {
                            type: 'model',
                            url: url,
                            data: gltf,
                            scene: gltf.scene,
                            animations: gltf.animations,
                            cameras: gltf.cameras,
                            metadata: {
                                triangles: this.countTriangles(gltf.scene),
                                materials: this.extractMaterials(gltf.scene),
                                textures: this.extractTextures(gltf.scene)
                            }
                        };
                        resolve(asset);
                    },
                    (progress) => {
                        this.eventBus.emit('asset:loading-progress', {
                            url,
                            loaded: progress.loaded,
                            total: progress.total,
                            progress: progress.loaded / progress.total
                        });
                    },
                    (error) => {
                        reject(new Error(`Failed to load model: ${error.message}`));
                    }
                );
            });
        });

        // Texture Loader
        this.loaders.set('texture', async (url, options = {}) => {
            const loader = new THREE.TextureLoader();
            
            return new Promise((resolve, reject) => {
                loader.load(
                    url,
                    (texture) => {
                        // Apply options
                        if (options.wrapS) texture.wrapS = options.wrapS;
                        if (options.wrapT) texture.wrapT = options.wrapT;
                        if (options.magFilter) texture.magFilter = options.magFilter;
                        if (options.minFilter) texture.minFilter = options.minFilter;
                        if (options.flipY !== undefined) texture.flipY = options.flipY;
                        
                        const asset = {
                            type: 'texture',
                            url: url,
                            data: texture,
                            metadata: {
                                width: texture.image.width,
                                height: texture.image.height,
                                format: texture.format,
                                type: texture.type
                            }
                        };
                        resolve(asset);
                    },
                    undefined,
                    (error) => {
                        reject(new Error(`Failed to load texture: ${error.message}`));
                    }
                );
            });
        });

        // Audio Loader
        this.loaders.set('audio', async (url, options = {}) => {
            const loader = new THREE.AudioLoader();
            
            return new Promise((resolve, reject) => {
                loader.load(
                    url,
                    (audioBuffer) => {
                        const asset = {
                            type: 'audio',
                            url: url,
                            data: audioBuffer,
                            metadata: {
                                duration: audioBuffer.duration,
                                sampleRate: audioBuffer.sampleRate,
                                numberOfChannels: audioBuffer.numberOfChannels
                            }
                        };
                        resolve(asset);
                    },
                    undefined,
                    (error) => {
                        reject(new Error(`Failed to load audio: ${error.message}`));
                    }
                );
            });
        });

        // Script Loader
        this.loaders.set('script', async (url, options = {}) => {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const scriptCode = await response.text();
                
                const asset = {
                    type: 'script',
                    url: url,
                    data: scriptCode,
                    metadata: {
                        size: scriptCode.length,
                        language: url.endsWith('.ts') ? 'typescript' : 'javascript'
                    }
                };
                
                return asset;
            } catch (error) {
                throw new Error(`Failed to load script: ${error.message}`);
            }
        });

        // Data Loader
        this.loaders.set('data', async (url, options = {}) => {
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                let data;
                const contentType = response.headers.get('content-type');
                
                if (url.endsWith('.json') || contentType?.includes('application/json')) {
                    data = await response.json();
                } else {
                    data = await response.text();
                }
                
                const asset = {
                    type: 'data',
                    url: url,
                    data: data,
                    metadata: {
                        contentType: contentType,
                        size: JSON.stringify(data).length
                    }
                };
                
                return asset;
            } catch (error) {
                throw new Error(`Failed to load data: ${error.message}`);
            }
        });
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Listen for drag and drop events
        this.eventBus.on('ui:file-dropped', (data) => {
            this.handleFileDropped(data);
        });
    }

    /**
     * Load built-in assets
     */
    loadBuiltinAssets() {
        // Create some basic built-in assets
        this.createBuiltinMaterials();
        this.createBuiltinTextures();
    }

    /**
     * Create built-in materials
     */
    createBuiltinMaterials() {
        const materials = [
            {
                id: 'default-material',
                name: 'Default Material',
                material: new THREE.MeshLambertMaterial({ color: 0x00ff00 })
            },
            {
                id: 'red-material',
                name: 'Red Material',
                material: new THREE.MeshLambertMaterial({ color: 0xff0000 })
            },
            {
                id: 'blue-material',
                name: 'Blue Material',
                material: new THREE.MeshLambertMaterial({ color: 0x0000ff })
            },
            {
                id: 'metallic-material',
                name: 'Metallic Material',
                material: new THREE.MeshStandardMaterial({ 
                    color: 0x888888, 
                    metalness: 0.8, 
                    roughness: 0.2 
                })
            }
        ];

        materials.forEach(({ id, name, material }) => {
            this.registerAsset(id, {
                type: 'material',
                name: name,
                data: material,
                category: 'materials',
                tags: ['builtin', 'material'],
                metadata: {
                    builtin: true
                }
            });
        });
    }

    /**
     * Create built-in textures
     */
    createBuiltinTextures() {
        // Create procedural textures
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Checker texture
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#cccccc';
        for (let x = 0; x < 256; x += 32) {
            for (let y = 0; y < 256; y += 32) {
                if ((x / 32 + y / 32) % 2 === 0) {
                    ctx.fillRect(x, y, 32, 32);
                }
            }
        }

        const checkerTexture = new THREE.CanvasTexture(canvas);
        checkerTexture.wrapS = THREE.RepeatWrapping;
        checkerTexture.wrapT = THREE.RepeatWrapping;

        this.registerAsset('checker-texture', {
            type: 'texture',
            name: 'Checker Texture',
            data: checkerTexture,
            category: 'textures',
            tags: ['builtin', 'texture', 'procedural'],
            metadata: {
                builtin: true,
                width: 256,
                height: 256
            }
        });
    }

    /**
     * Load an asset from URL
     */
    async loadAsset(url, options = {}) {
        // Check cache first
        if (this.assetCache.has(url)) {
            return this.assetCache.get(url);
        }

        // Check if already loading
        if (this.loadingPromises.has(url)) {
            return this.loadingPromises.get(url);
        }

        // Determine asset type
        const extension = this.getFileExtension(url).toLowerCase();
        const assetType = this.assetTypes.get(extension);
        
        if (!assetType) {
            throw new Error(`Unsupported asset type: ${extension}`);
        }

        // Get loader
        const loader = this.loaders.get(assetType);
        if (!loader) {
            throw new Error(`No loader available for asset type: ${assetType}`);
        }

        // Start loading
        const loadingPromise = this.loadAssetWithLoader(url, assetType, loader, options);
        this.loadingPromises.set(url, loadingPromise);

        try {
            const asset = await loadingPromise;
            
            // Cache the asset
            this.assetCache.set(url, asset);
            
            // Generate asset ID and register
            const assetId = this.generateAssetId(url);
            this.registerAsset(assetId, asset);
            
            // Emit event
            this.eventBus.emit(EventBus.Events.ASSET_LOADED, {
                id: assetId,
                url: url,
                asset: asset
            });
            
            return asset;
            
        } finally {
            this.loadingPromises.delete(url);
        }
    }

    /**
     * Load asset with specific loader
     */
    async loadAssetWithLoader(url, assetType, loader, options) {
        try {
            console.log(`Loading ${assetType} asset: ${url}`);
            const asset = await loader(url, options);
            console.log(`Successfully loaded ${assetType} asset: ${url}`);
            return asset;
        } catch (error) {
            console.error(`Failed to load ${assetType} asset ${url}:`, error);
            throw error;
        }
    }

    /**
     * Register an asset
     */
    registerAsset(id, asset) {
        // Add metadata
        asset.id = id;
        asset.registeredAt = new Date();
        
        // Store asset
        this.assets.set(id, asset);
        
        // Add to categories
        if (asset.category) {
            if (!this.categories.has(asset.category)) {
                this.categories.set(asset.category, new Set());
            }
            this.categories.get(asset.category).add(id);
        }
        
        // Add to tags
        if (asset.tags) {
            asset.tags.forEach(tag => {
                if (!this.tags.has(tag)) {
                    this.tags.set(tag, new Set());
                }
                this.tags.get(tag).add(id);
            });
        }
        
        console.log(`Registered asset: ${id}`);
    }

    /**
     * Get an asset by ID
     */
    getAsset(id) {
        return this.assets.get(id);
    }

    /**
     * Get assets by category
     */
    getAssetsByCategory(category) {
        const assetIds = this.categories.get(category);
        if (!assetIds) return [];
        
        return Array.from(assetIds).map(id => this.assets.get(id));
    }

    /**
     * Get assets by tag
     */
    getAssetsByTag(tag) {
        const assetIds = this.tags.get(tag);
        if (!assetIds) return [];
        
        return Array.from(assetIds).map(id => this.assets.get(id));
    }

    /**
     * Search assets
     */
    searchAssets(query) {
        const results = [];
        const lowerQuery = query.toLowerCase();
        
        this.assets.forEach((asset, id) => {
            const searchText = `${asset.name || ''} ${asset.category || ''} ${(asset.tags || []).join(' ')}`.toLowerCase();
            
            if (searchText.includes(lowerQuery)) {
                results.push(asset);
            }
        });
        
        return results;
    }

    /**
     * Handle file dropped
     */
    async handleFileDropped(data) {
        const { files } = data;
        
        for (const file of files) {
            try {
                await this.importFile(file);
            } catch (error) {
                console.error(`Failed to import file ${file.name}:`, error);
                this.eventBus.emit('asset:import-error', {
                    file: file.name,
                    error: error.message
                });
            }
        }
    }

    /**
     * Import a file
     */
    async importFile(file) {
        const url = URL.createObjectURL(file);
        
        try {
            const asset = await this.loadAsset(url, {
                fileName: file.name,
                fileSize: file.size,
                lastModified: file.lastModified
            });
            
            // Update asset with file info
            asset.fileName = file.name;
            asset.fileSize = file.size;
            asset.imported = true;
            
            this.eventBus.emit(EventBus.Events.ASSET_IMPORTED, {
                file: file.name,
                asset: asset
            });
            
            return asset;
            
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    /**
     * Delete an asset
     */
    deleteAsset(id) {
        const asset = this.assets.get(id);
        if (!asset) return false;
        
        // Remove from categories
        if (asset.category) {
            const categoryAssets = this.categories.get(asset.category);
            if (categoryAssets) {
                categoryAssets.delete(id);
                if (categoryAssets.size === 0) {
                    this.categories.delete(asset.category);
                }
            }
        }
        
        // Remove from tags
        if (asset.tags) {
            asset.tags.forEach(tag => {
                const tagAssets = this.tags.get(tag);
                if (tagAssets) {
                    tagAssets.delete(id);
                    if (tagAssets.size === 0) {
                        this.tags.delete(tag);
                    }
                }
            });
        }
        
        // Remove from cache if it's there
        if (asset.url) {
            this.assetCache.delete(asset.url);
        }
        
        // Dispose of Three.js resources
        this.disposeAssetResources(asset);
        
        // Remove from assets
        this.assets.delete(id);
        
        this.eventBus.emit(EventBus.Events.ASSET_DELETED, { id, asset });
        
        console.log(`Deleted asset: ${id}`);
        return true;
    }

    /**
     * Dispose of Three.js resources
     */
    disposeAssetResources(asset) {
        if (asset.type === 'texture' && asset.data) {
            asset.data.dispose();
        } else if (asset.type === 'model' && asset.data) {
            // Dispose of geometries and materials
            asset.data.scene.traverse((child) => {
                if (child.geometry) {
                    child.geometry.dispose();
                }
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(material => material.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
    }

    /**
     * Get file extension from URL
     */
    getFileExtension(url) {
        const parts = url.split('.');
        return parts.length > 1 ? parts[parts.length - 1].split('?')[0] : '';
    }

    /**
     * Generate asset ID from URL
     */
    generateAssetId(url) {
        const fileName = url.split('/').pop().split('?')[0];
        const baseName = fileName.split('.')[0];
        const timestamp = Date.now();
        return `${baseName}_${timestamp}`;
    }

    /**
     * Count triangles in a scene
     */
    countTriangles(scene) {
        let triangles = 0;
        
        scene.traverse((child) => {
            if (child.geometry) {
                const geometry = child.geometry;
                if (geometry.index) {
                    triangles += geometry.index.count / 3;
                } else {
                    triangles += geometry.attributes.position.count / 3;
                }
            }
        });
        
        return Math.floor(triangles);
    }

    /**
     * Extract materials from a scene
     */
    extractMaterials(scene) {
        const materials = new Set();
        
        scene.traverse((child) => {
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(material => materials.add(material.name || 'Unnamed'));
                } else {
                    materials.add(child.material.name || 'Unnamed');
                }
            }
        });
        
        return Array.from(materials);
    }

    /**
     * Extract textures from a scene
     */
    extractTextures(scene) {
        const textures = new Set();
        
        scene.traverse((child) => {
            if (child.material) {
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                
                materials.forEach(material => {
                    Object.values(material).forEach(value => {
                        if (value && value.isTexture) {
                            textures.add(value.name || 'Unnamed');
                        }
                    });
                });
            }
        });
        
        return Array.from(textures);
    }

    /**
     * Get all assets
     */
    getAllAssets() {
        return Array.from(this.assets.values());
    }

    /**
     * Get all categories
     */
    getAllCategories() {
        return Array.from(this.categories.keys());
    }

    /**
     * Get all tags
     */
    getAllTags() {
        return Array.from(this.tags.keys());
    }

    /**
     * Export asset data
     */
    exportAssets() {
        const exportData = {
            assets: Array.from(this.assets.entries()).map(([id, asset]) => ({
                id,
                type: asset.type,
                name: asset.name,
                category: asset.category,
                tags: asset.tags,
                metadata: asset.metadata,
                url: asset.url
            })),
            categories: Array.from(this.categories.entries()),
            tags: Array.from(this.tags.entries())
        };
        
        return exportData;
    }

    /**
     * Import asset data
     */
    async importAssets(importData) {
        // Clear existing assets
        this.assets.clear();
        this.categories.clear();
        this.tags.clear();
        
        // Import assets
        for (const assetData of importData.assets) {
            if (assetData.url) {
                try {
                    await this.loadAsset(assetData.url);
                } catch (error) {
                    console.warn(`Failed to load asset ${assetData.id}:`, error);
                }
            }
        }
    }

    /**
     * Dispose of the asset manager
     */
    dispose() {
        // Dispose of all assets
        this.assets.forEach((asset, id) => {
            this.disposeAssetResources(asset);
        });
        
        // Clear storage
        this.assets.clear();
        this.assetCache.clear();
        this.categories.clear();
        this.tags.clear();
        this.loadingPromises.clear();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AssetManager;
} else {
    window.AssetManager = AssetManager;
}

