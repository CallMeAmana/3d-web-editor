/**
 * EventBus - Central event management system for the 3D Web Editor
 * Implements publish-subscribe pattern for loose coupling between components
 */
class EventBus {
    constructor() {
        this.events = new Map();
        this.onceEvents = new Map();
        this.debugMode = false;
    }

    /**
     * Subscribe to an event
     * @param {string} eventType - The event type to listen for
     * @param {Function} callback - The callback function to execute
     * @param {Object} context - Optional context for the callback
     * @returns {Function} Unsubscribe function
     */
    on(eventType, callback, context = null) {
        if (!this.events.has(eventType)) {
            this.events.set(eventType, []);
        }

        const listener = { callback, context };
        this.events.get(eventType).push(listener);

        if (this.debugMode) {
            console.log(`[EventBus] Subscribed to '${eventType}'`);
        }

        // Return unsubscribe function
        return () => this.off(eventType, callback);
    }

    /**
     * Subscribe to an event that will only fire once
     * @param {string} eventType - The event type to listen for
     * @param {Function} callback - The callback function to execute
     * @param {Object} context - Optional context for the callback
     * @returns {Function} Unsubscribe function
     */
    once(eventType, callback, context = null) {
        if (!this.onceEvents.has(eventType)) {
            this.onceEvents.set(eventType, []);
        }

        const listener = { callback, context };
        this.onceEvents.get(eventType).push(listener);

        if (this.debugMode) {
            console.log(`[EventBus] Subscribed once to '${eventType}'`);
        }

        // Return unsubscribe function
        return () => this.offOnce(eventType, callback);
    }

    /**
     * Unsubscribe from an event
     * @param {string} eventType - The event type to unsubscribe from
     * @param {Function} callback - The callback function to remove
     */
    off(eventType, callback) {
        if (!this.events.has(eventType)) return;

        const listeners = this.events.get(eventType);
        const index = listeners.findIndex(listener => listener.callback === callback);
        
        if (index !== -1) {
            listeners.splice(index, 1);
            if (this.debugMode) {
                console.log(`[EventBus] Unsubscribed from '${eventType}'`);
            }
        }

        // Clean up empty event arrays
        if (listeners.length === 0) {
            this.events.delete(eventType);
        }
    }

    /**
     * Unsubscribe from a once event
     * @param {string} eventType - The event type to unsubscribe from
     * @param {Function} callback - The callback function to remove
     */
    offOnce(eventType, callback) {
        if (!this.onceEvents.has(eventType)) return;

        const listeners = this.onceEvents.get(eventType);
        const index = listeners.findIndex(listener => listener.callback === callback);
        
        if (index !== -1) {
            listeners.splice(index, 1);
            if (this.debugMode) {
                console.log(`[EventBus] Unsubscribed once from '${eventType}'`);
            }
        }

        // Clean up empty event arrays
        if (listeners.length === 0) {
            this.onceEvents.delete(eventType);
        }
    }

    /**
     * Publish an event to all subscribers
     * @param {string} eventType - The event type to publish
     * @param {*} data - The data to send with the event
     */
    emit(eventType, data = null) {
        if (this.debugMode) {
            console.log(`[EventBus] Emitting '${eventType}'`, data);
        }

        // Handle regular subscribers
        if (this.events.has(eventType)) {
            const listeners = [...this.events.get(eventType)]; // Create copy to avoid issues with modifications during iteration
            
            listeners.forEach(listener => {
                try {
                    if (listener.context) {
                        listener.callback.call(listener.context, data);
                    } else {
                        listener.callback(data);
                    }
                } catch (error) {
                    console.error(`[EventBus] Error in event listener for '${eventType}':`, error);
                }
            });
        }

        // Handle once subscribers
        if (this.onceEvents.has(eventType)) {
            const listeners = [...this.onceEvents.get(eventType)]; // Create copy
            this.onceEvents.delete(eventType); // Remove all once listeners after firing
            
            listeners.forEach(listener => {
                try {
                    if (listener.context) {
                        listener.callback.call(listener.context, data);
                    } else {
                        listener.callback(data);
                    }
                } catch (error) {
                    console.error(`[EventBus] Error in once event listener for '${eventType}':`, error);
                }
            });
        }
    }

    /**
     * Remove all subscribers for a specific event type
     * @param {string} eventType - The event type to clear
     */
    clear(eventType) {
        if (eventType) {
            this.events.delete(eventType);
            this.onceEvents.delete(eventType);
            if (this.debugMode) {
                console.log(`[EventBus] Cleared all listeners for '${eventType}'`);
            }
        } else {
            this.events.clear();
            this.onceEvents.clear();
            if (this.debugMode) {
                console.log(`[EventBus] Cleared all listeners`);
            }
        }
    }

    /**
     * Get the number of subscribers for an event type
     * @param {string} eventType - The event type to check
     * @returns {number} Number of subscribers
     */
    listenerCount(eventType) {
        const regularCount = this.events.has(eventType) ? this.events.get(eventType).length : 0;
        const onceCount = this.onceEvents.has(eventType) ? this.onceEvents.get(eventType).length : 0;
        return regularCount + onceCount;
    }

    /**
     * Get all event types that have subscribers
     * @returns {Array<string>} Array of event types
     */
    getEventTypes() {
        const regularEvents = Array.from(this.events.keys());
        const onceEvents = Array.from(this.onceEvents.keys());
        return [...new Set([...regularEvents, ...onceEvents])];
    }

    /**
     * Enable or disable debug mode
     * @param {boolean} enabled - Whether to enable debug mode
     */
    setDebugMode(enabled) {
        this.debugMode = enabled;
        console.log(`[EventBus] Debug mode ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Create a namespaced event emitter
     * @param {string} namespace - The namespace prefix
     * @returns {Object} Namespaced event emitter
     */
    namespace(namespace) {
        return {
            on: (eventType, callback, context) => this.on(`${namespace}:${eventType}`, callback, context),
            once: (eventType, callback, context) => this.once(`${namespace}:${eventType}`, callback, context),
            off: (eventType, callback) => this.off(`${namespace}:${eventType}`, callback),
            emit: (eventType, data) => this.emit(`${namespace}:${eventType}`, data),
            clear: (eventType) => this.clear(eventType ? `${namespace}:${eventType}` : null)
        };
    }
}

// Standard event types used throughout the editor
EventBus.Events = {
    // Scene events
    SCENE_LOADED: 'scene:loaded',
    SCENE_SAVED: 'scene:saved',
    SCENE_CLEARED: 'scene:cleared',
    SCENE_CHANGED: 'scene:changed',

    // Object events
    OBJECT_CREATED: 'object:created',
    OBJECT_DELETED: 'object:deleted',
    OBJECT_SELECTED: 'object:selected',
    OBJECT_DESELECTED: 'object:deselected',
    OBJECT_TRANSFORMED: 'object:transformed',
    OBJECT_PROPERTY_CHANGED: 'object:property_changed',

    // Component events
    COMPONENT_ADDED: 'component:added',
    COMPONENT_REMOVED: 'component:removed',
    COMPONENT_UPDATED: 'component:updated',

    // Tool events
    TOOL_ACTIVATED: 'tool:activated',
    TOOL_DEACTIVATED: 'tool:deactivated',

    // Asset events
    ASSET_LOADED: 'asset:loaded',
    ASSET_IMPORTED: 'asset:imported',
    ASSET_DELETED: 'asset:deleted',

    // Plugin events
    PLUGIN_LOADED: 'plugin:loaded',
    PLUGIN_UNLOADED: 'plugin:unloaded',
    PLUGIN_ERROR: 'plugin:error',

    // UI events
    UI_PANEL_TOGGLED: 'ui:panel_toggled',
    UI_LAYOUT_CHANGED: 'ui:layout_changed',
    UI_THEME_CHANGED: 'ui:theme_changed',

    // Editor events
    EDITOR_READY: 'editor:ready',
    EDITOR_MODE_CHANGED: 'editor:mode_changed',
    EDITOR_COMMAND_EXECUTED: 'editor:command_executed',

    // Camera events
    CAMERA_MOVED: 'camera:moved',
    CAMERA_RESET: 'camera:reset',

    // Viewport events
    VIEWPORT_RESIZED: 'viewport:resized',
    VIEWPORT_MODE_CHANGED: 'viewport:mode_changed'
};

// Define event types
EventBus.Events = {
    // Editor events
    EDITOR_READY: 'editor:ready',
    EDITOR_COMMAND_EXECUTED: 'editor:command:executed',
    
    // Scene events
    SCENE_CHANGED: 'scene:changed',
    SCENE_PLAY: 'scene:play',
    SCENE_PAUSE: 'scene:pause',
    SCENE_STOP: 'scene:stop',
    SCENE_CLEARED: 'scene:cleared',
    SCENE_IMPORTED: 'scene:imported',
    
    // Object events
    OBJECT_CREATED: 'object:created',
    OBJECT_DELETED: 'object:deleted',
    OBJECT_SELECTED: 'object:selected',
    OBJECT_DESELECTED: 'object:deselected',
    OBJECT_TRANSFORMED: 'object:transformed',
    
    // Component events
    COMPONENT_ADDED: 'component:added',
    COMPONENT_REMOVED: 'component:removed',
    COMPONENT_UPDATED: 'component:updated',
    
    // Tool events
    TOOL_ACTIVATED: 'tool:activated',
    TOOL_DEACTIVATED: 'tool:deactivated',
    
    // Viewport events
    VIEWPORT_RESIZED: 'viewport:resized',
    VIEWPORT_MODE_CHANGED: 'viewport:mode:changed',
    CAMERA_MOVED: 'camera:moved',
    CAMERA_RESET: 'camera:reset',
    
    // Asset events
    ASSET_LOADED: 'asset:loaded',
    ASSET_IMPORTED: 'asset:imported',
    ASSET_DELETED: 'asset:deleted',
    
    // Plugin events
    PLUGIN_LOADED: 'plugin:loaded',
    PLUGIN_UNLOADED: 'plugin:unloaded',
    PLUGIN_ERROR: 'plugin:error',
    
    // UI events
    UI_PANEL_TOGGLED: 'ui:panel:toggled'
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventBus;
} else {
    window.EventBus = EventBus;
}

