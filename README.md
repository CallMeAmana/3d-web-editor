3D Web Editor - Advanced 3D Content Creation Platform

A powerful, extensible 3D web application editor built with pure JavaScript and Three.js. This platform provides Unity-like functionality with a plugin architecture, event-driven system, and UI customization capabilities for multiple domains including virtual exhibitions and architectural visualization.

Features:
 Core Functionality
- **3D Scene Management**: Full 3D scene creation and manipulation with Three.js

- **Component System**: Modular component architecture for extensible object behavior
- **Plugin Architecture**: Extensible plugin system for domain-specific functionality
- **Event-driven System**: Robust event bus for component communication
- **Drag & Drop**: Intuitive drag-and-drop interface for components

 Advanced Features
- **Transform Tools**: Precision transform controls with gizmos
- **Material Editor**: Advanced material creation and editing
- **Console System**: Built-in console for debugging and scripting
- **Responsive Design**: Works on desktop and mobile devices

 Technology Stack

- **Frontend**: Pure JavaScript (ES6+), HTML5, CSS3
- **3D Engine**: Three.js 
- **Architecture**: Modular component-based design
- **Build System**: No build process required - runs directly in browser
- **Dependencies**: Three.js (loaded via CDN)

Project Structure

```
3d-web-editor/
├── index.html                 # Main application entry point
├── src/
│   ├── core/                  # Core engine modules
│   │   ├── EventBus.js        # Event system
│   │   ├── SceneManager.js    # 3D scene management
│   │   ├── EditorCore.js      # Main editor controller
│   │   ├── PluginManager.js   # Plugin system
│   │   ├── ComponentSystem.js # Component architecture
│   │   └── AssetManager.js    # Asset management
│   ├── ui/                    # User interface
│   │   ├── UIManager.js       # UI controller
│   │   └── styles.css         # Application styles
│   ├── plugins/               # Plugin directory
│   └── assets/                # Static assets
└── README.md                  # This file
```





   Run : (Using Node.js) 
   npx serve .
   

Plugin API

The editor provides a comprehensive API for plugin development:

- **Event System**: Subscribe to editor events
- **Scene Access**: Manipulate 3D objects and scene
- **UI Integration**: Add custom panels and controls
- **Component System**: Create custom components
- **Asset Management**: Register custom asset types


 Keyboard Shortcuts
- `W` - Move tool
- `E` - Rotate tool
- `R` - Scale tool
- `Ctrl+Z` - Undo
- `Ctrl+Y` - Redo







