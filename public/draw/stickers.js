// Stickers - Kid Pix-style drawing app
const canvas = document.getElementById('drawing-canvas');
const ctx = canvas.getContext('2d');

// Layer Management - declare early so setCanvasSize can access it
let layers = [];
let activeLayerIndex = 0;
let layerIdCounter = 0;

// Set initial canvas size - responsive for mobile
let userSetCanvasSize = false; // Track if user manually set canvas size

function setInitialCanvasSize() {
    // Don't auto-resize if user manually set a size
    if (userSetCanvasSize) return;
    
    if (window.innerWidth <= 768) {
        // Mobile: smaller canvas for better performance
        const containerWidth = Math.max(300, window.innerWidth - 100);
        const maxWidth = Math.min(600, containerWidth);
        const maxHeight = Math.min(450, window.innerHeight * 0.4);
        canvas.width = maxWidth;
        canvas.height = maxHeight;
    } else {
        // Desktop: default size 2048×2048
        canvas.width = 2048;
        canvas.height = 2048;
    }
    
    // Don't set explicit CSS size - let CSS handle it responsively
    // This allows proper scaling on mobile
    canvas.style.width = '';
    canvas.style.height = '';
}

setInitialCanvasSize();

// Update canvas size selector to match current size
function updateCanvasSizeSelector() {
    const canvasSizeSelector = document.getElementById('canvas-size-selector');
    if (canvasSizeSelector) {
        const currentSize = `${canvas.width}x${canvas.height}`;
        
        // Check if current size matches an option
        const options = Array.from(canvasSizeSelector.options);
        const matchingOption = options.find(opt => opt.value === currentSize);
        
        if (matchingOption) {
            canvasSizeSelector.value = currentSize;
        } else {
            // Add custom option if size doesn't match
            const customOption = document.createElement('option');
            customOption.value = currentSize;
            customOption.textContent = `${canvas.width}×${canvas.height} (Current)`;
            customOption.selected = true;
            canvasSizeSelector.insertBefore(customOption, canvasSizeSelector.firstChild);
        }
    }
}

// Re-initialize on resize for responsive behavior (only if user hasn't set custom size)
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (!userSetCanvasSize) {
            const oldWidth = canvas.width;
            const oldHeight = canvas.height;
            setInitialCanvasSize();
            
            // Only reinit if size actually changed
            if (oldWidth !== canvas.width || oldHeight !== canvas.height) {
                setViewportHeight();
                updateCanvasSizeSelector();
            }
        }
    }, 250);
});

// History Management for Undo/Redo
let history = [];
let historyStep = -1;
const MAX_HISTORY = 50;

// Initial settings
let isDrawing = false;
let currentTool = 'pencil';
let currentColor = '#FF0000';
let brushSize = 5;
let selectedEmoji = '😀';
let rainbowMode = false;
let sparkleMode = false;
let rainbowHue = 0;
let selectedFont = 'Arial';
let textCase = 'upper'; // 'upper' or 'lower'
let fillPattern = 'solid';
let secondaryColor = '#FFFFFF';
let mirrorMode = false;
let shapeStartX = 0;
let shapeStartY = 0;
let stampRotation = 0; // Rotation angle in degrees for stamp tool
let arcSweepAngle = 90; // Arc sweep angle in degrees (0-360)
let canvasZoom = 1; // Canvas zoom level (1 = 100%)
let exportScale = 1; // Export resolution multiplier

// Selection and clipboard
let clipboard = null;
let selectionData = null;
let selectionType = null; // 'circle' or 'square'
let selectionBounds = null;

// Helper function to get canvas coordinates accounting for zoom
function getCanvasCoordinates(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    
    // Get position relative to canvas
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    // Account for zoom scaling
    // When zoomed, the visual size differs from actual canvas size
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
        x: x * scaleX,
        y: y * scaleY
    };
}

// Audio context for sound effects
let audioContext = null;
let soundEnabled = true;

// Initialize audio context on first user interaction (iOS compatible)
function initAudio() {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // iOS requires resuming the audio context
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
        } catch (e) {
            console.log('Audio context not supported:', e);
            soundEnabled = false;
        }
    } else if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

// Sound effect functions
function playSound(type, frequency = 440, duration = 0.1) {
    if (!soundEnabled || !audioContext) return;
    
    try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        switch(type) {
            case 'draw':
                oscillator.frequency.value = 200 + Math.random() * 100;
                oscillator.type = 'sine';
                gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.05);
                duration = 0.05;
                break;
            case 'stamp':
                oscillator.frequency.value = 600;
                oscillator.type = 'square';
                gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
                duration = 0.15;
                break;
            case 'spray':
                oscillator.frequency.value = 300 + Math.random() * 200;
                oscillator.type = 'sawtooth';
                gainNode.gain.setValueAtTime(0.03, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.03);
                duration = 0.03;
                break;
            case 'eraser':
                oscillator.frequency.value = 150 + Math.random() * 50;
                oscillator.type = 'sine';
                gainNode.gain.setValueAtTime(0.04, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.06);
                duration = 0.06;
                break;
            case 'fill':
                oscillator.frequency.value = 400;
                oscillator.type = 'triangle';
                gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                duration = 0.3;
                // Add a sweep effect
                oscillator.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.3);
                break;
            case 'clear':
                oscillator.frequency.value = 800;
                oscillator.type = 'square';
                gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
                duration = 0.5;
                // Descending sweep
                oscillator.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.5);
                break;
            case 'click':
                oscillator.frequency.value = 800;
                oscillator.type = 'sine';
                gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.08);
                duration = 0.08;
                break;
            case 'save':
                oscillator.frequency.value = 523.25; // C5
                oscillator.type = 'sine';
                gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
                duration = 0.4;
                break;
            default:
                oscillator.frequency.value = frequency;
                gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
        }
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
    } catch (e) {
        console.log('Audio error:', e);
    }
}

// Play a chord for special effects
function playChord(frequencies, duration = 0.3) {
    if (!soundEnabled || !audioContext) return;
    
    frequencies.forEach((freq, index) => {
        setTimeout(() => {
            playSound('custom', freq, duration);
        }, index * 50);
    });
}

// Layer Management Functions
function createLayer(name = null) {
    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = canvas.width;
    layerCanvas.height = canvas.height;
    const layerCtx = layerCanvas.getContext('2d');
    
    // Initialize with transparent background
    layerCtx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
    
    const layer = {
        id: layerIdCounter++,
        name: name || `Layer ${layerIdCounter}`,
        canvas: layerCanvas,
        ctx: layerCtx,
        visible: true,
        opacity: 1.0
    };
    
    return layer;
}

function initializeLayers() {
    // Clear any existing layers
    layers = [];
    
    // Create background layer with white background
    const backgroundLayer = createLayer('Background');
    backgroundLayer.ctx.fillStyle = 'white';
    backgroundLayer.ctx.fillRect(0, 0, backgroundLayer.canvas.width, backgroundLayer.canvas.height);
    layers.push(backgroundLayer);
    
    activeLayerIndex = 0;
    renderCanvas();
    updateLayersList();
}

function getActiveLayer() {
    return layers[activeLayerIndex];
}

function getActiveContext() {
    return layers[activeLayerIndex]?.ctx || ctx;
}

function renderCanvas() {
    // Clear main canvas completely
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Reset all canvas state to prevent glitches (especially on Cloudflare)
    ctx.setLineDash([]);  // Clear any dashed lines (from selection outlines)
    ctx.globalAlpha = 1;  // Reset alpha
    ctx.globalCompositeOperation = 'source-over';  // Reset composite operation
    ctx.strokeStyle = '#000000';  // Reset stroke
    ctx.fillStyle = '#000000';  // Reset fill
    
    // Render all visible layers from bottom to top
    for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        if (layer.visible) {
            ctx.save();
            ctx.globalAlpha = layer.opacity;
            ctx.drawImage(layer.canvas, 0, 0);
            ctx.restore();
        }
    }
}

function addLayer() {
    initAudio();
    playSound('click');
    const newLayer = createLayer();
    layers.unshift(newLayer); // Add to top
    activeLayerIndex = 0;
    renderCanvas();
    updateLayersList();
    saveHistory();
}

function deleteLayer() {
    if (layers.length <= 1) {
        return; // Don't delete the last layer
    }
    
    initAudio();
    playSound('click');
    layers.splice(activeLayerIndex, 1);
    if (activeLayerIndex >= layers.length) {
        activeLayerIndex = layers.length - 1;
    }
    renderCanvas();
    updateLayersList();
    saveHistory();
}

function duplicateLayer() {
    initAudio();
    playSound('click');
    const sourceLayer = layers[activeLayerIndex];
    const newLayer = createLayer(`${sourceLayer.name} copy`);
    newLayer.ctx.drawImage(sourceLayer.canvas, 0, 0);
    newLayer.opacity = sourceLayer.opacity;
    layers.splice(activeLayerIndex, 0, newLayer); // Insert above current
    activeLayerIndex = activeLayerIndex; // Keep same index (which is now the new layer)
    renderCanvas();
    updateLayersList();
    saveHistory();
}

function mergeLayerDown() {
    if (activeLayerIndex >= layers.length - 1) {
        return; // Can't merge bottom layer
    }
    
    initAudio();
    playSound('click');
    const currentLayer = layers[activeLayerIndex];
    const belowLayer = layers[activeLayerIndex + 1];
    
    // Merge current layer into the one below
    belowLayer.ctx.save();
    belowLayer.ctx.globalAlpha = currentLayer.opacity;
    belowLayer.ctx.drawImage(currentLayer.canvas, 0, 0);
    belowLayer.ctx.restore();
    
    // Remove current layer
    layers.splice(activeLayerIndex, 1);
    // activeLayerIndex automatically points to the merged layer now
    
    renderCanvas();
    updateLayersList();
    saveHistory();
}

function setActiveLayer(index) {
    activeLayerIndex = index;
    updateLayersList();
    updateLayerOpacityControl();
}

function toggleLayerVisibility(index) {
    initAudio();
    playSound('click');
    layers[index].visible = !layers[index].visible;
    renderCanvas();
    updateLayersList();
}

function moveLayer(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= layers.length) return;
    
    initAudio();
    playSound('click');
    const [layer] = layers.splice(fromIndex, 1);
    layers.splice(toIndex, 0, layer);
    
    // Update active index if needed
    if (fromIndex === activeLayerIndex) {
        activeLayerIndex = toIndex;
    } else if (fromIndex < activeLayerIndex && toIndex >= activeLayerIndex) {
        activeLayerIndex--;
    } else if (fromIndex > activeLayerIndex && toIndex <= activeLayerIndex) {
        activeLayerIndex++;
    }
    
    renderCanvas();
    updateLayersList();
}

function setLayerOpacity(opacity) {
    layers[activeLayerIndex].opacity = opacity;
    renderCanvas();
    updateThumbnail(activeLayerIndex);
}

function updateThumbnail(index) {
    const layer = layers[index];
    const thumbnailCanvas = document.createElement('canvas');
    thumbnailCanvas.width = 40;
    thumbnailCanvas.height = 30;
    const thumbCtx = thumbnailCanvas.getContext('2d');
    
    // Draw white background
    thumbCtx.fillStyle = 'white';
    thumbCtx.fillRect(0, 0, 40, 30);
    
    // Draw layer content scaled down
    thumbCtx.drawImage(layer.canvas, 0, 0, 40, 30);
    
    return thumbnailCanvas.toDataURL();
}

function updateLayersList() {
    const layersList = document.getElementById('layers-list');
    layersList.innerHTML = '';
    
    layers.forEach((layer, index) => {
        const layerItem = document.createElement('div');
        layerItem.className = 'layer-item' + (index === activeLayerIndex ? ' active' : '');
        
        const thumbnail = document.createElement('canvas');
        thumbnail.className = 'layer-thumbnail';
        thumbnail.width = 40;
        thumbnail.height = 30;
        const thumbCtx = thumbnail.getContext('2d');
        thumbCtx.fillStyle = 'white';
        thumbCtx.fillRect(0, 0, 40, 30);
        thumbCtx.drawImage(layer.canvas, 0, 0, 40, 30);
        
        const layerInfo = document.createElement('div');
        layerInfo.className = 'layer-info';
        
        const layerName = document.createElement('div');
        layerName.className = 'layer-name';
        layerName.textContent = layer.name;
        
        // Function to start renaming
        const startRename = (e) => {
            e.stopPropagation();
            const input = document.createElement('input');
            input.type = 'text';
            input.value = layer.name;
            input.className = 'layer-name-input';
            input.addEventListener('blur', () => {
                layer.name = input.value || layer.name;
                updateLayersList();
            });
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') input.blur();
                if (e.key === 'Escape') {
                    input.value = layer.name;
                    input.blur();
                }
            });
            layerName.innerHTML = '';
            layerName.appendChild(input);
            input.focus();
            input.select();
        };
        
        // Desktop: double-click to rename
        layerName.addEventListener('dblclick', startRename);
        
        // Mobile: long-press to rename (500ms)
        let touchStartTime;
        let longPressTimer;
        
        layerName.addEventListener('touchstart', (e) => {
            touchStartTime = Date.now();
            longPressTimer = setTimeout(() => {
                // Trigger rename after 500ms hold
                const touchDuration = Date.now() - touchStartTime;
                if (touchDuration >= 500) {
                    startRename(e);
                    // Haptic feedback if available
                    if (navigator.vibrate) {
                        navigator.vibrate(50);
                    }
                }
            }, 500);
        }, { passive: true });
        
        layerName.addEventListener('touchend', () => {
            clearTimeout(longPressTimer);
        }, { passive: true });
        
        layerName.addEventListener('touchmove', () => {
            clearTimeout(longPressTimer);
        }, { passive: true });
        
        layerInfo.appendChild(layerName);
        
        // Add rename button for easier access on mobile
        const renameBtn = document.createElement('button');
        renameBtn.className = 'layer-rename-btn';
        renameBtn.innerHTML = '✏️';
        renameBtn.title = 'Rename layer';
        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            startRename(e);
        });
        
        layerInfo.appendChild(renameBtn);
        
        const layerActions = document.createElement('div');
        layerActions.className = 'layer-actions';
        
        const visibilityBtn = document.createElement('button');
        visibilityBtn.className = 'layer-visibility-btn' + (layer.visible ? ' visible' : '');
        visibilityBtn.textContent = layer.visible ? '👁️' : '👁️‍🗨️';
        visibilityBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleLayerVisibility(index);
        });
        
        const moveBtns = document.createElement('div');
        moveBtns.className = 'layer-move-btns';
        
        const moveUpBtn = document.createElement('button');
        moveUpBtn.className = 'layer-move-btn';
        moveUpBtn.textContent = '▲';
        moveUpBtn.disabled = index === 0;
        moveUpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            moveLayer(index, index - 1);
        });
        
        const moveDownBtn = document.createElement('button');
        moveDownBtn.className = 'layer-move-btn';
        moveDownBtn.textContent = '▼';
        moveDownBtn.disabled = index === layers.length - 1;
        moveDownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            moveLayer(index, index + 1);
        });
        
        moveBtns.appendChild(moveUpBtn);
        moveBtns.appendChild(moveDownBtn);
        
        layerActions.appendChild(visibilityBtn);
        layerActions.appendChild(moveBtns);
        
        layerItem.appendChild(thumbnail);
        layerItem.appendChild(layerInfo);
        layerItem.appendChild(layerActions);
        
        layerItem.addEventListener('click', () => {
            setActiveLayer(index);
        });
        
        // Touch-friendly layer selection
        layerItem.addEventListener('touchend', (e) => {
            e.preventDefault();
            e.stopPropagation();
            setActiveLayer(index);
        }, { passive: false });
        
        layersList.appendChild(layerItem);
    });
    
    // Update button states
    document.getElementById('delete-layer-btn').disabled = layers.length <= 1;
    document.getElementById('merge-down-btn').disabled = activeLayerIndex >= layers.length - 1;
}

function updateLayerOpacityControl() {
    const layer = layers[activeLayerIndex];
    const opacitySlider = document.getElementById('layer-opacity');
    const opacityDisplay = document.getElementById('opacity-display');
    opacitySlider.value = layer.opacity * 100;
    opacityDisplay.textContent = Math.round(layer.opacity * 100) + '%';
}

// History Management Functions
function saveHistory() {
    // Remove any history steps after the current step
    if (historyStep < history.length - 1) {
        history = history.slice(0, historyStep + 1);
    }
    
    // Save current state of all layers
    const state = layers.map(layer => ({
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        opacity: layer.opacity,
        imageData: layer.ctx.getImageData(0, 0, canvas.width, canvas.height)
    }));
    
    history.push({
        layers: state,
        activeLayerIndex: activeLayerIndex
    });
    
    // Limit history size
    if (history.length > MAX_HISTORY) {
        history.shift();
    } else {
        historyStep++;
    }
    
    updateHistoryButtons();
}

function undo() {
    if (historyStep > 0) {
        initAudio();
        playSound('click');
        historyStep--;
        restoreHistory();
    }
}

function redo() {
    if (historyStep < history.length - 1) {
        initAudio();
        playSound('click');
        historyStep++;
        restoreHistory();
    }
}

function restoreHistory() {
    if (historyStep < 0 || historyStep >= history.length) return;
    
    const state = history[historyStep];
    
    // Restore layers
    layers = state.layers.map(layerState => {
        const layerCanvas = document.createElement('canvas');
        layerCanvas.width = canvas.width;
        layerCanvas.height = canvas.height;
        const layerCtx = layerCanvas.getContext('2d');
        layerCtx.putImageData(layerState.imageData, 0, 0);
        
        return {
            id: layerState.id,
            name: layerState.name,
            canvas: layerCanvas,
            ctx: layerCtx,
            visible: layerState.visible,
            opacity: layerState.opacity
        };
    });
    
    activeLayerIndex = state.activeLayerIndex;
    
    renderCanvas();
    updateLayersList();
    updateLayerOpacityControl();
    updateHistoryButtons();
}

function updateHistoryButtons() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    
    if (undoBtn) {
        undoBtn.disabled = historyStep <= 0;
    }
    
    if (redoBtn) {
        redoBtn.disabled = historyStep >= history.length - 1;
    }
}

// Image loading for ?img= URL param (Tchoff draw-on-image)
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src.startsWith('/') || src.startsWith('http') ? src : (location.origin + '/' + src);
    });
}

async function initDraw() {
    const imgParam = new URLSearchParams(location.search).get('img');
    const statusEl = document.getElementById('draw-status');
    if (imgParam) {
        if (statusEl) statusEl.textContent = 'Loading image…';
        try {
            const img = await loadImage(imgParam);
            const w = img.naturalWidth || img.width;
            const h = img.naturalHeight || img.height;
            canvas.width = w;
            canvas.height = h;
            layers = [];
            const bgLayer = createLayer('Background');
            bgLayer.ctx.drawImage(img, 0, 0);
            layers.push(bgLayer);
            const drawLayer = createLayer('Drawing');
            layers.unshift(drawLayer);
            activeLayerIndex = 0;
            renderCanvas();
            updateLayersList();
            if (statusEl) statusEl.textContent = w + '×' + h + 'px — Draw on top!';
        } catch (e) {
            if (statusEl) statusEl.textContent = 'Could not load image. Starting blank.';
            initializeLayers();
        }
    } else {
        if (statusEl) statusEl.textContent = 'Blank canvas — start drawing!';
        initializeLayers();
    }
    updateCanvasSizeSelector();
    saveHistory();
}

initDraw();

// Setup collapsible sections
document.querySelectorAll('.section-header').forEach(header => {
    // Click handler for desktop
    header.addEventListener('click', (e) => {
        // Don't trigger if clicking the collapse button directly
        if (e.target.classList.contains('section-collapse-btn')) {
            return;
        }
        
        initAudio();
        playSound('click');
        const toolSection = header.closest('.tool-section');
        toggleSection(toolSection);
    });
    
    // Touch handler for mobile (iOS)
    let touchStartTime;
    header.addEventListener('touchstart', (e) => {
        touchStartTime = Date.now();
    }, { passive: true });
    
    header.addEventListener('touchend', (e) => {
        const touchDuration = Date.now() - touchStartTime;
        // Only trigger if it was a quick tap (not a scroll)
        if (touchDuration < 300) {
            e.preventDefault();
            initAudio();
            playSound('click');
            const toolSection = header.closest('.tool-section');
            toggleSection(toolSection);
        }
    }, { passive: false });
});

document.querySelectorAll('.section-collapse-btn').forEach(btn => {
    // Click handler for desktop
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        initAudio();
        playSound('click');
        
        const toolSection = btn.closest('.tool-section');
        toggleSection(toolSection);
    });
    
    // Touch handler for mobile (iOS) - prevent double trigger
    btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
    }, { passive: false });
});

function toggleSection(section) {
    if (section) {
        section.classList.toggle('collapsed');
        
        // Save collapsed state to localStorage
        const sectionIndex = Array.from(section.parentElement.children).indexOf(section);
        const isCollapsed = section.classList.contains('collapsed');
        localStorage.setItem(`section-${sectionIndex}-collapsed`, isCollapsed);
    }
}

// Restore collapsed state from localStorage
document.querySelectorAll('.tool-section').forEach((section, index) => {
    const wasCollapsed = localStorage.getItem(`section-${index}-collapsed`) === 'true';
    if (wasCollapsed) {
        section.classList.add('collapsed');
    }
});

// Sidebar toggle functionality
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
const mainContent = document.querySelector('.main-content');

function toggleSidebar() {
    if (!mainContent) {
        console.error('Main content not found');
        return;
    }
    
    initAudio();
    playSound('click');
    
    // Toggle the class
    const isCollapsed = mainContent.classList.toggle('sidebar-collapsed');
    
    // Force a reflow to ensure the transition happens
    mainContent.offsetHeight;
    
    // Save state to localStorage
    try {
        localStorage.setItem('sidebar-collapsed', isCollapsed);
    } catch (e) {
        console.warn('Could not save sidebar state:', e);
    }
    
    // Show toast notification
    if (isCollapsed) {
        showToast('🎨 Sidebar hidden - More canvas space!');
    } else {
        showToast('🛠️ Sidebar visible');
    }
    
    // Debug log for iOS testing
    console.log('Sidebar toggled. Collapsed:', isCollapsed);
}

if (sidebarToggleBtn) {
    // Make function globally accessible for onclick fallback
    window.toggleSidebarFromButton = function() {
        toggleSidebar();
    };
    
    // Set onclick as fallback for iOS Safari
    sidebarToggleBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleSidebar();
        return false;
    };
    
    // Desktop click handler
    sidebarToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
    
    // iOS Safari-compatible touch handling
    let touchStarted = false;
    let touchMoved = false;
    
    sidebarToggleBtn.addEventListener('touchstart', (e) => {
        touchStarted = true;
        touchMoved = false;
        // Don't preventDefault here to allow click event to fire as fallback
        // Visual feedback
        sidebarToggleBtn.style.opacity = '0.8';
    }, { passive: true });
    
    sidebarToggleBtn.addEventListener('touchmove', (e) => {
        touchMoved = true;
    }, { passive: true });
    
    sidebarToggleBtn.addEventListener('touchend', (e) => {
        if (touchStarted && !touchMoved) {
            e.preventDefault();
            e.stopPropagation();
            
            // Reset visual feedback
            sidebarToggleBtn.style.opacity = '1';
            // Trigger toggle
            toggleSidebar();
        }
        touchStarted = false;
        touchMoved = false;
    }, { passive: false });
    
    sidebarToggleBtn.addEventListener('touchcancel', (e) => {
        touchStarted = false;
        touchMoved = false;
        sidebarToggleBtn.style.opacity = '1';
    }, { passive: true });
}

// Restore sidebar state from localStorage
const wasSidebarCollapsed = localStorage.getItem('sidebar-collapsed') === 'true';
if (wasSidebarCollapsed && mainContent) {
    mainContent.classList.add('sidebar-collapsed');
}

// Undo/Redo button event listeners
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
if (undoBtn) {
    undoBtn.addEventListener('click', undo);
}
if (redoBtn) {
    redoBtn.addEventListener('click', redo);
}

// Tool buttons
document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        initAudio();
        playSound('click');
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTool = btn.dataset.tool;
        
        // Always re-render to clear any temporary overlays (selection outlines, etc.)
        // This prevents blue glitches from selection outlines persisting
        renderCanvas();
        
        updateToolUI();
        updateCursor();
    });
});

// Update UI based on selected tool
function updateToolUI() {
    const rotationSection = document.getElementById('rotation-section');
    const arcAngleSection = document.getElementById('arc-angle-section');
    
    if (currentTool === 'stamp') {
        // Show rotation section for stamp tool
        if (rotationSection) {
            rotationSection.style.display = 'block';
            updateRotationDisplay();
        }
        if (arcAngleSection) {
            arcAngleSection.style.display = 'none';
        }
    } else if (currentTool === 'arc') {
        // Show arc angle section for arc tool
        if (arcAngleSection) {
            arcAngleSection.style.display = 'block';
            updateArcAngleDisplay();
        }
        if (rotationSection) {
            rotationSection.style.display = 'none';
        }
    } else {
        // Hide both sections for other tools
        if (rotationSection) {
            rotationSection.style.display = 'none';
        }
        if (arcAngleSection) {
            arcAngleSection.style.display = 'none';
        }
    }
}

// Update rotation angle display
function updateRotationDisplay() {
    const rotationAngle = document.getElementById('rotation-angle');
    if (rotationAngle) {
        rotationAngle.textContent = `${Math.round(stampRotation)}°`;
    }
}

// Reset stamp rotation
function resetRotation() {
    stampRotation = 0;
    updateRotationDisplay();
    updateCursor();
    initAudio();
    playSound('click');
}

// Reset rotation button
const resetRotationBtn = document.getElementById('reset-rotation-btn');
if (resetRotationBtn) {
    resetRotationBtn.addEventListener('click', resetRotation);
}

// Arc angle display and control
function updateArcAngleDisplay() {
    const arcAngleDisplay = document.getElementById('arc-angle-display');
    if (arcAngleDisplay) {
        arcAngleDisplay.textContent = `${Math.round(arcSweepAngle)}°`;
    }
}

// Reset arc angle
function resetArcAngle() {
    arcSweepAngle = 90;
    updateArcAngleDisplay();
    initAudio();
    playSound('click');
    showToast('Arc angle reset to 90°');
}

// Reset arc angle button
const resetArcAngleBtn = document.getElementById('reset-arc-angle-btn');
if (resetArcAngleBtn) {
    resetArcAngleBtn.addEventListener('click', resetArcAngle);
}

// Color buttons
document.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        initAudio();
        playSound('click');
        document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentColor = btn.dataset.color;
        rainbowMode = false;
        if (currentTool === 'stamp') updateCursor();
    });
});

// Color picker (color wheel)
const colorPicker = document.getElementById('color-picker');
const colorHex = document.getElementById('color-hex');

function updateColorFromPicker(value) {
    currentColor = value;
    colorHex.textContent = value.toUpperCase();
    rainbowMode = false;
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    if (currentTool === 'stamp') updateCursor();
}

if (colorPicker && colorHex) {
    colorPicker.addEventListener('input', (e) => {
        initAudio();
        updateColorFromPicker(e.target.value);
    });
    
    // Additional change event for iOS
    colorPicker.addEventListener('change', (e) => {
        initAudio();
        updateColorFromPicker(e.target.value);
    });
    
    // Improve iOS color picker opening
    colorPicker.addEventListener('click', (e) => {
        initAudio();
        // Force iOS to show color picker
        e.target.focus();
    });
}

// Brush size
const brushSizeSlider = document.getElementById('brush-size');
const sizeDisplay = document.getElementById('size-display');

function updateBrushSize(value) {
    brushSize = value;
    sizeDisplay.textContent = brushSize;
    if (currentTool === 'stamp') updateCursor();
}

brushSizeSlider.addEventListener('input', (e) => {
    updateBrushSize(e.target.value);
});

// Better touch handling for sliders on iOS
brushSizeSlider.addEventListener('touchmove', (e) => {
    e.stopPropagation(); // Prevent scroll while adjusting
}, { passive: false });

brushSizeSlider.addEventListener('change', (e) => {
    updateBrushSize(e.target.value);
});

// Font selector
const fontSelector = document.getElementById('font-selector');
const fontPreview = document.getElementById('font-preview');

function handleFontChange(value) {
    selectedFont = value;
    fontPreview.style.fontFamily = selectedFont;
    fontSelector.style.fontFamily = selectedFont;
    if (currentTool === 'stamp') updateCursor();
}

fontSelector.addEventListener('change', (e) => {
    initAudio();
    playSound('click');
    handleFontChange(e.target.value);
});

// iOS: Ensure dropdown opens on touch
fontSelector.addEventListener('touchend', (e) => {
    e.stopPropagation();
    // Force focus to open dropdown on iOS
    setTimeout(() => {
        fontSelector.focus();
        fontSelector.click();
    }, 10);
}, { passive: false });

// Case toggle buttons
document.querySelectorAll('.case-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        initAudio();
        playSound('click');
        document.querySelectorAll('.case-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        textCase = btn.dataset.case;
        updateFontPreview();
        if (currentTool === 'stamp') updateCursor();
    });
});

function updateFontPreview() {
    if (textCase === 'upper') {
        fontPreview.innerHTML = '<span style="font-weight: 700;">ABC</span> <span style="opacity: 0.5;">abc</span> 123';
    } else {
        fontPreview.innerHTML = '<span style="opacity: 0.5;">ABC</span> <span style="font-weight: 700;">abc</span> 123';
    }
}

// Pattern buttons
document.querySelectorAll('.pattern-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        initAudio();
        playSound('click');
        document.querySelectorAll('.pattern-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        fillPattern = btn.dataset.pattern;
    });
});

// Secondary color picker
const secondaryColorPicker = document.getElementById('secondary-color');
if (secondaryColorPicker) {
    secondaryColorPicker.addEventListener('input', (e) => {
        initAudio();
        secondaryColor = e.target.value;
    });
    
    // Additional change event for iOS
    secondaryColorPicker.addEventListener('change', (e) => {
        initAudio();
        secondaryColor = e.target.value;
    });
    
    // Improve iOS color picker opening
    secondaryColorPicker.addEventListener('click', (e) => {
        initAudio();
        e.target.focus();
    });
}

// Mirror mode toggle
const mirrorToggleBtn = document.getElementById('mirror-toggle-btn');
if (mirrorToggleBtn) {
    mirrorToggleBtn.setAttribute('aria-pressed', 'false');
    mirrorToggleBtn.addEventListener('click', () => {
        initAudio();
        playSound('click');
        mirrorMode = !mirrorMode;
        mirrorToggleBtn.classList.toggle('is-active', mirrorMode);
        mirrorToggleBtn.setAttribute('aria-pressed', mirrorMode.toString());
        showToast(mirrorMode ? 'Mirror mode enabled' : 'Mirror mode disabled');
        if (currentTool === 'stamp') {
            updateCursor();
        }
    });
}

// Selection action buttons
const copyBtn = document.getElementById('copy-btn');
const cutBtn = document.getElementById('cut-btn');
const pasteBtn = document.getElementById('paste-btn');

function handleCopy() {
    if (selectionData) {
        initAudio();
        playSound('click');
        // Copy the selection data and bounds to clipboard
        clipboard = {
            imageData: selectionData,
            type: selectionType,
            bounds: { ...selectionBounds }  // Create a copy of bounds object
        };
        pasteBtn.disabled = false;
        selectionData = null;
        selectionBounds = null;
        
        // Clear selection outline by re-rendering
        renderCanvas();
        
        // Visual feedback for mobile
        showToast('✓ Copied to clipboard');
    }
}

function handleCut() {
    if (selectionData) {
        initAudio();
        playSound('click');
        // Copy the selection data and bounds to clipboard
        clipboard = {
            imageData: selectionData,
            type: selectionType,
            bounds: { ...selectionBounds }  // Create a copy of bounds object
        };
        pasteBtn.disabled = false;
        
        // Clear the selected area
        clearSelection();
        selectionData = null;
        selectionBounds = null;
        
        // Save history after cutting
        saveHistory();
        
        // Visual feedback for mobile
        showToast('✓ Cut to clipboard');
    }
}

function handlePaste() {
    if (clipboard) {
        initAudio();
        playSound('click');
        currentTool = 'paste';
        // Switch to paste mode
        showToast('Tap canvas to paste');
    }
}

// Show toast notification for mobile feedback
function showToast(message) {
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Remove after 2 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

if (copyBtn) {
    copyBtn.addEventListener('click', handleCopy);
}

if (cutBtn) {
    cutBtn.addEventListener('click', handleCut);
}

if (pasteBtn) {
    pasteBtn.addEventListener('click', handlePaste);
}

// Emoji stamps
document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        initAudio();
        playSound('click');
        document.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedEmoji = btn.dataset.emoji;
        currentTool = 'stamp';
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('[data-tool="stamp"]').classList.add('active');
        updateToolUI();
        updateCursor();
    });
});

// Effects
document.querySelectorAll('.effect-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        initAudio();
        playChord([523.25, 659.25, 783.99]); // C major chord
        const effect = btn.dataset.effect;
        if (effect === 'rainbow') {
            rainbowMode = !rainbowMode;
            sparkleMode = false;
            // Update visual state
            btn.classList.toggle('active', rainbowMode);
            document.querySelector('[data-effect="sparkle"]').classList.remove('active');
            if (currentTool === 'stamp') updateCursor();
        } else if (effect === 'sparkle') {
            sparkleMode = !sparkleMode;
            rainbowMode = false;
            // Update visual state
            btn.classList.toggle('active', sparkleMode);
            document.querySelector('[data-effect="rainbow"]').classList.remove('active');
        }
    });
});

// Layer control event listeners
document.getElementById('add-layer-btn').addEventListener('click', addLayer);
document.getElementById('delete-layer-btn').addEventListener('click', deleteLayer);
document.getElementById('duplicate-layer-btn').addEventListener('click', duplicateLayer);
document.getElementById('merge-down-btn').addEventListener('click', mergeLayerDown);

// Layer panel toggle
document.getElementById('layer-toggle').addEventListener('click', () => {
    initAudio();
    playSound('click');
    const panel = document.querySelector('.layer-panel');
    panel.classList.toggle('collapsed');
});

// Layer opacity control
let opacityChangeTimeout;
const layerOpacitySlider = document.getElementById('layer-opacity');

function handleOpacityChange(value) {
    const opacity = value / 100;
    setLayerOpacity(opacity);
    document.getElementById('opacity-display').textContent = value + '%';
    
    // Save history after user stops adjusting (debounce)
    clearTimeout(opacityChangeTimeout);
    opacityChangeTimeout = setTimeout(() => {
        saveHistory();
    }, 500);
}

layerOpacitySlider.addEventListener('input', (e) => {
    handleOpacityChange(e.target.value);
});

// Better touch handling for opacity slider on iOS
layerOpacitySlider.addEventListener('touchmove', (e) => {
    e.stopPropagation(); // Prevent scroll while adjusting
}, { passive: false });

layerOpacitySlider.addEventListener('change', (e) => {
    handleOpacityChange(e.target.value);
});

// Save button - merge all layers with export scaling
document.getElementById('save-btn').addEventListener('click', () => {
    initAudio();
    playSound('save');
    
    // Get export scale
    const exportSizeSelector = document.getElementById('export-size-selector');
    const exportScale = parseFloat(exportSizeSelector.value);
    
    // Create a temporary canvas to merge all layers
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width * exportScale;
    tempCanvas.height = canvas.height * exportScale;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Scale context if needed
    if (exportScale !== 1) {
        tempCtx.scale(exportScale, exportScale);
    }
    
    // Draw all visible layers
    for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        if (layer.visible) {
            tempCtx.save();
            tempCtx.globalAlpha = layer.opacity;
            tempCtx.drawImage(layer.canvas, 0, 0);
            tempCtx.restore();
        }
    }
    
    // Create a temporary link element
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const scaleSuffix = exportScale !== 1 ? `-${exportScale}x` : '';
    link.download = `stickers-${timestamp}${scaleSuffix}.png`;
    
    // Convert merged canvas to PNG data URL
    link.href = tempCanvas.toDataURL('image/png');
    
    // Trigger download
    link.click();
    
    // Show confirmation with size info
    const width = canvas.width * exportScale;
    const height = canvas.height * exportScale;
    showToast(`💾 Saved ${width}×${height}px PNG!`);
    console.log(`🎨 Masterpiece saved at ${width}×${height}px!`);
});

// Expose merged blob for Post to Tchoff (used by draw-post.js)
function getDrawMergedBlob(scale = 1) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width * scale;
    tempCanvas.height = canvas.height * scale;
    const tempCtx = tempCanvas.getContext('2d');
    if (scale !== 1) tempCtx.scale(scale, scale);
    for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        if (layer.visible) {
            tempCtx.save();
            tempCtx.globalAlpha = layer.opacity;
            tempCtx.drawImage(layer.canvas, 0, 0);
            tempCtx.restore();
        }
    }
    return new Promise((r) => tempCanvas.toBlob(r, 'image/png'));
}
if (typeof window !== 'undefined') window.getDrawMergedBlob = getDrawMergedBlob;

// Replay a collaborative stroke (from another user)
function replayCollabStroke(stroke) {
  if (!stroke || !stroke.points || stroke.points.length < 1) return;
  const ctx = getActiveContext();
  ctx.save();
  ctx.strokeStyle = stroke.color || '#000000';
  ctx.lineWidth = stroke.size || 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.beginPath();
  ctx.moveTo(stroke.points[0][0], stroke.points[0][1]);
  for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i][0], stroke.points[i][1]);
  }
  ctx.stroke();
  ctx.restore();
  renderCanvas();
  updateLayersList();
  if (typeof saveHistory === 'function') saveHistory();
}
if (typeof window !== 'undefined') window.replayCollabStroke = replayCollabStroke;

// Clear button
document.getElementById('clear-btn').addEventListener('click', () => {
    initAudio();
    if (confirm('🎨 Clear active layer?')) {
        playSound('clear');
        // Fun Kid Pix-style clear animation
        clearCanvasWithAnimation();
    }
});

// Zoom controls
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomOutBtn = document.getElementById('zoom-out-btn');
const zoomResetBtn = document.getElementById('zoom-reset-btn');
const zoomDisplay = document.getElementById('zoom-display');

function updateCanvasZoom() {
    const canvasContainer = canvas.parentElement;
    
    // Apply transform to canvas
    canvas.style.transform = `scale(${canvasZoom})`;
    canvas.style.transformOrigin = 'center center';
    
    // Add/remove zoomed class to container for better overflow handling
    if (canvasZoom > 1) {
        canvasContainer.classList.add('zoomed');
    } else {
        canvasContainer.classList.remove('zoomed');
    }
    
    // Update display
    if (zoomDisplay) {
        zoomDisplay.textContent = `${Math.round(canvasZoom * 100)}%`;
    }
}

function zoomIn() {
    if (canvasZoom < 3) {
        canvasZoom = Math.min(3, canvasZoom + 0.25);
        updateCanvasZoom();
        initAudio();
        playSound('click');
    }
}

function zoomOut() {
    if (canvasZoom > 0.25) {
        canvasZoom = Math.max(0.25, canvasZoom - 0.25);
        updateCanvasZoom();
        initAudio();
        playSound('click');
    }
}

function resetZoom() {
    canvasZoom = 1;
    updateCanvasZoom();
    initAudio();
    playSound('click');
}

if (zoomInBtn) {
    zoomInBtn.addEventListener('click', zoomIn);
}

if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', zoomOut);
}

if (zoomResetBtn) {
    zoomResetBtn.addEventListener('click', resetZoom);
}

// Canvas size selector
const canvasSizeSelector = document.getElementById('canvas-size-selector');
if (canvasSizeSelector) {
    canvasSizeSelector.addEventListener('change', (e) => {
        initAudio();
        playSound('click');
        
        const [width, height] = e.target.value.split('x').map(Number);
        
        if (confirm(`🎨 Change canvas size to ${width}×${height}? This will preserve your layers but may crop or add space.`)) {
            changeCanvasSize(width, height);
            showToast(`Canvas resized to ${width}×${height}px`);
        } else {
            // Revert selection
            const currentSize = `${canvas.width}x${canvas.height}`;
            e.target.value = currentSize;
        }
    });
    
    // iOS: Ensure dropdown opens on touch
    canvasSizeSelector.addEventListener('touchend', (e) => {
        e.stopPropagation();
        // Force focus to open dropdown on iOS
        setTimeout(() => {
            canvasSizeSelector.focus();
            canvasSizeSelector.click();
        }, 10);
    }, { passive: false });
}

// Export size selector
const exportSizeSelector = document.getElementById('export-size-selector');
if (exportSizeSelector) {
    // iOS: Ensure dropdown opens on touch
    exportSizeSelector.addEventListener('touchend', (e) => {
        e.stopPropagation();
        // Force focus to open dropdown on iOS
        setTimeout(() => {
            exportSizeSelector.focus();
            exportSizeSelector.click();
        }, 10);
    }, { passive: false });
}

function changeCanvasSize(newWidth, newHeight) {
    // Mark that user has set a custom size
    userSetCanvasSize = true;
    
    // Save current layer data
    const oldLayers = layers.map(layer => ({
        name: layer.name,
        visible: layer.visible,
        opacity: layer.opacity,
        imageData: layer.ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height),
        oldWidth: layer.canvas.width,
        oldHeight: layer.canvas.height
    }));
    
    // Update canvas size
    canvas.width = newWidth;
    canvas.height = newHeight;
    canvas.style.width = newWidth + 'px';
    canvas.style.height = newHeight + 'px';
    
    // Recreate layers with new size
    layers = oldLayers.map(layerData => {
        const layerCanvas = document.createElement('canvas');
        layerCanvas.width = newWidth;
        layerCanvas.height = newHeight;
        const layerCtx = layerCanvas.getContext('2d');
        
        // Fill background with white if it's the background layer
        if (layerData.name === 'Background') {
            layerCtx.fillStyle = 'white';
            layerCtx.fillRect(0, 0, newWidth, newHeight);
        }
        
        // Create a temporary canvas to hold old content
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = layerData.oldWidth;
        tempCanvas.height = layerData.oldHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(layerData.imageData, 0, 0);
        
        // Draw old content at original size (top-left aligned)
        layerCtx.drawImage(tempCanvas, 0, 0);
        
        return {
            id: layerIdCounter++,
            name: layerData.name,
            canvas: layerCanvas,
            ctx: layerCtx,
            visible: layerData.visible,
            opacity: layerData.opacity
        };
    });
    
    renderCanvas();
    updateLayersList();
    updateCanvasSizeSelector();
    saveHistory();
}

// Help button and modal
const helpBtn = document.getElementById('help-btn');
const helpModal = document.getElementById('help-modal');
const helpCloseBtn = document.getElementById('help-close-btn');

if (helpBtn) {
    // Desktop click handler
    helpBtn.addEventListener('click', () => {
        initAudio();
        playSound('click');
        if (helpModal) {
            helpModal.style.display = 'flex';
            document.body.style.overflow = 'hidden'; // Prevent background scroll
        }
    });
}

if (helpCloseBtn) {
    // Desktop click handler
    helpCloseBtn.addEventListener('click', () => {
        initAudio();
        playSound('click');
        if (helpModal) {
            helpModal.style.display = 'none';
            document.body.style.overflow = ''; // Restore scroll
        }
    });
}

// Close help modal when clicking/tapping outside
if (helpModal) {
    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) {
            initAudio();
            playSound('click');
            helpModal.style.display = 'none';
            document.body.style.overflow = ''; // Restore scroll
        }
    });
    
    // Touch handler for mobile
    helpModal.addEventListener('touchend', (e) => {
        if (e.target === helpModal) {
            e.preventDefault();
            initAudio();
            playSound('click');
            helpModal.style.display = 'none';
            document.body.style.overflow = ''; // Restore scroll
        }
    }, { passive: false });
}

function clearCanvasWithAnimation() {
    const activeCtx = getActiveContext();
    let y = 0;
    const clearInterval = setInterval(() => {
        activeCtx.clearRect(0, y, canvas.width, 20);
        renderCanvas();
        y += 20;
        if (y >= canvas.height) {
            clearInterval(clearInterval);
            activeCtx.clearRect(0, 0, canvas.width, canvas.height);
            renderCanvas();
            updateLayersList();
            saveHistory();
        }
    }, 20);
}

// Custom Context Menu
const contextMenu = document.getElementById('context-menu');
let contextMenuTimeout;

function showContextMenu(x, y) {
    if (!contextMenu) return;
    
    initAudio();
    playSound('click');
    
    // Position the menu
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.style.display = 'block';
    
    // Adjust position if menu goes off-screen
    setTimeout(() => {
        const rect = contextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            contextMenu.style.left = `${x - rect.width}px`;
        }
        if (rect.bottom > window.innerHeight) {
            contextMenu.style.top = `${y - rect.height}px`;
        }
    }, 10);
}

function hideContextMenu() {
    if (contextMenu) {
        contextMenu.style.display = 'none';
    }
}

// Right-click handler for canvas
canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY);
});

// Long-press handler for mobile context menu
let longPressTimer;
let longPressStartX, longPressStartY;

// We'll use a separate touchstart for long-press before the main one
const canvasLongPressStart = (e) => {
    if (e.touches.length === 1) {
        const touch = e.touches[0];
        longPressStartX = touch.clientX;
        longPressStartY = touch.clientY;
        isLongPress = false;
        
        // Start long-press timer (650ms)
        longPressTimer = setTimeout(() => {
            isLongPress = true;
            showContextMenu(longPressStartX, longPressStartY);
            // Haptic feedback
            if (navigator.vibrate) {
                navigator.vibrate(50);
            }
        }, 650);
    }
};

const canvasLongPressMove = (e) => {
    // Cancel long-press if finger moves
    if (longPressTimer && e.touches.length > 0) {
        const touch = e.touches[0];
        const moveDistance = Math.sqrt(
            Math.pow(touch.clientX - longPressStartX, 2) +
            Math.pow(touch.clientY - longPressStartY, 2)
        );
        
        if (moveDistance > 10) {
            clearTimeout(longPressTimer);
            isLongPress = false;
        }
    }
};

const canvasLongPressEnd = () => {
    clearTimeout(longPressTimer);
};

// Add long-press handlers (these fire before the main touchstart)
canvas.addEventListener('touchstart', canvasLongPressStart, { passive: true, capture: true });
canvas.addEventListener('touchmove', canvasLongPressMove, { passive: true, capture: true });
canvas.addEventListener('touchend', canvasLongPressEnd, { passive: true, capture: true });

// Context menu actions
if (contextMenu) {
    contextMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.context-menu-item');
        if (!item) return;
        
        const action = item.dataset.action;
        initAudio();
        playSound('click');
        hideContextMenu();
        
        // Handle actions
        switch(action) {
            case 'tool-pencil':
                document.querySelector('[data-tool="pencil"]').click();
                break;
            case 'tool-eraser':
                document.querySelector('[data-tool="eraser"]').click();
                break;
            case 'tool-fill':
                document.querySelector('[data-tool="fill"]').click();
                break;
            case 'tool-stamp':
                document.querySelector('[data-tool="stamp"]').click();
                break;
            case 'toggle-rainbow':
                document.querySelector('[data-effect="rainbow"]').click();
                break;
            case 'toggle-sparkle':
                document.querySelector('[data-effect="sparkle"]').click();
                break;
            case 'undo':
                undo();
                break;
            case 'redo':
                redo();
                break;
            case 'zoom-in':
                zoomIn();
                break;
            case 'zoom-out':
                zoomOut();
                break;
            case 'zoom-reset':
                resetZoom();
                break;
            case 'save':
                document.getElementById('save-btn').click();
                break;
            case 'clear':
                document.getElementById('clear-btn').click();
                break;
        }
    });
}

// Context menu close button
const contextMenuClose = document.getElementById('context-menu-close');
if (contextMenuClose) {
    contextMenuClose.addEventListener('click', (e) => {
        e.stopPropagation();
        initAudio();
        playSound('click');
        hideContextMenu();
    });
}

// Close context menu when clicking elsewhere
document.addEventListener('click', (e) => {
    if (contextMenu && !contextMenu.contains(e.target)) {
        hideContextMenu();
    }
});

document.addEventListener('touchstart', (e) => {
    if (contextMenu && !contextMenu.contains(e.target) && !canvas.contains(e.target)) {
        hideContextMenu();
    }
}, { passive: true });

// Mouse events
canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', (e) => {
    if (currentTool === 'circle' || currentTool === 'square' || currentTool === 'triangle' || 
        currentTool === 'star' || currentTool === 'arc' || currentTool === 'line' || 
        currentTool === 'select-circle' || currentTool === 'select-square') {
        // Don't complete action if mouse leaves canvas
        if (isDrawing) {
            isDrawing = false;
            ctx.beginPath();
        }
    } else {
        stopDrawing(e);
    }
});

// Touch events for mobile (iOS compatible)
let lastTouchX = 0;
let lastTouchY = 0;
let isTwoFingerGesture = false;
let isLongPress = false;

canvas.addEventListener('touchstart', (e) => {
    initAudio();
    isLongPress = false;
    
    // Check if this is a two-finger gesture for rotation
    if (e.touches.length === 2 && currentTool === 'stamp') {
        isTwoFingerGesture = true;
        clearTimeout(longPressTimer); // Cancel long-press
        e.preventDefault();
        return; // Don't trigger drawing
    }
    
    // Single touch - set up for drawing (unless it becomes a long-press)
    if (e.touches.length === 1) {
        e.preventDefault();
        isTwoFingerGesture = false;
        const touch = e.touches[0];
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
        
        // Wait to see if it's a long-press for context menu
        setTimeout(() => {
            // Only start drawing if it wasn't a long press
            if (!isLongPress && e.touches.length === 1) {
                const mouseEvent = new MouseEvent('mousedown', {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    bubbles: true
                });
                canvas.dispatchEvent(mouseEvent);
            }
        }, 100);
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    // If it's a two-finger gesture, don't trigger drawing
    if (isTwoFingerGesture || e.touches.length > 1) {
        return; // Let the rotation handler deal with it
    }
    
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    lastTouchX = touch.clientX;
    lastTouchY = touch.clientY;
    
    const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY,
        bubbles: true
    });
    canvas.dispatchEvent(mouseEvent);
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    
    // Reset two-finger flag
    if (e.touches.length === 0) {
        isTwoFingerGesture = false;
    }
    
    // Only trigger mouseup if it wasn't a two-finger gesture or long-press
    if (!isTwoFingerGesture && !isLongPress) {
        // Use last known touch position for touchend
        const mouseEvent = new MouseEvent('mouseup', {
            clientX: lastTouchX,
            clientY: lastTouchY,
            bubbles: true
        });
        canvas.dispatchEvent(mouseEvent);
    }
    
    // Reset long-press flag
    isLongPress = false;
}, { passive: false });

canvas.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    isTwoFingerGesture = false;
    
    const mouseEvent = new MouseEvent('mouseup', {
        clientX: lastTouchX,
        clientY: lastTouchY,
        bubbles: true
    });
    canvas.dispatchEvent(mouseEvent);
}, { passive: false });

// Mouse wheel for stamp rotation
canvas.addEventListener('wheel', (e) => {
    if (currentTool === 'stamp') {
        e.preventDefault();
        
        // Adjust rotation based on wheel delta
        const rotationStep = 15; // degrees per wheel notch
        if (e.deltaY < 0) {
            // Scroll up - rotate counter-clockwise
            stampRotation -= rotationStep;
        } else {
            // Scroll down - rotate clockwise
            stampRotation += rotationStep;
        }
        
        // Normalize rotation to 0-360 range
        stampRotation = ((stampRotation % 360) + 360) % 360;
        
        // Update UI and cursor to show new rotation
        updateRotationDisplay();
        updateCursor();
        
        // Play a subtle sound
        initAudio();
        playSound('custom', 400 + (stampRotation / 360) * 200, 0.05);
    } else if (currentTool === 'arc') {
        e.preventDefault();
        
        // Adjust arc angle based on wheel delta
        const angleStep = 15; // degrees per wheel notch
        if (e.deltaY < 0) {
            // Scroll up - increase angle
            arcSweepAngle += angleStep;
        } else {
            // Scroll down - decrease angle
            arcSweepAngle -= angleStep;
        }
        
        // Clamp arc angle to 15-360 range
        arcSweepAngle = Math.max(15, Math.min(360, arcSweepAngle));
        
        // Update UI
        updateArcAngleDisplay();
        
        // Play a subtle sound
        initAudio();
        playSound('custom', 300 + (arcSweepAngle / 360) * 300, 0.05);
    }
}, { passive: false });

// Two-finger gestures for stamp rotation and arc angle adjustment on mobile (iOS)
let lastTwoFingerAngle = null;
let lastTwoFingerDistance = null;

canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2 && (currentTool === 'stamp' || currentTool === 'arc')) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        
        if (currentTool === 'stamp') {
            lastTwoFingerAngle = Math.atan2(
                touch2.clientY - touch1.clientY,
                touch2.clientX - touch1.clientX
            ) * 180 / Math.PI;
        } else if (currentTool === 'arc') {
            // For arc, track distance between fingers to adjust angle
            lastTwoFingerDistance = Math.sqrt(
                Math.pow(touch2.clientX - touch1.clientX, 2) +
                Math.pow(touch2.clientY - touch1.clientY, 2)
            );
        }
    }
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        
        if (currentTool === 'stamp') {
            e.preventDefault();
            const currentAngle = Math.atan2(
                touch2.clientY - touch1.clientY,
                touch2.clientX - touch1.clientX
            ) * 180 / Math.PI;
            
            if (lastTwoFingerAngle !== null) {
                let angleDiff = currentAngle - lastTwoFingerAngle;
                
                // Normalize angle difference to -180 to 180
                if (angleDiff > 180) angleDiff -= 360;
                if (angleDiff < -180) angleDiff += 360;
                
                stampRotation += angleDiff;
                stampRotation = ((stampRotation % 360) + 360) % 360;
                
                updateRotationDisplay();
                updateCursor();
            }
            
            lastTwoFingerAngle = currentAngle;
        } else if (currentTool === 'arc') {
            e.preventDefault();
            const currentDistance = Math.sqrt(
                Math.pow(touch2.clientX - touch1.clientX, 2) +
                Math.pow(touch2.clientY - touch1.clientY, 2)
            );
            
            if (lastTwoFingerDistance !== null) {
                // Pinch/spread adjusts arc sweep angle
                const distanceDiff = currentDistance - lastTwoFingerDistance;
                const angleChange = distanceDiff * 0.5; // Sensitivity factor
                
                arcSweepAngle += angleChange;
                // Clamp to 15-360 range
                arcSweepAngle = Math.max(15, Math.min(360, arcSweepAngle));
                
                updateArcAngleDisplay();
                
                // Play subtle sound
                if (Math.abs(angleChange) > 1) {
                    initAudio();
                    playSound('custom', 300 + (arcSweepAngle / 360) * 300, 0.03);
                }
            }
            
            lastTwoFingerDistance = currentDistance;
        }
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
        lastTwoFingerAngle = null;
        lastTwoFingerDistance = null;
    }
}, { passive: true });

function startDrawing(e) {
    initAudio();
    isDrawing = true;
    
    // Add visual feedback for mobile - show canvas is active
    canvas.classList.add('drawing-active');
    
    const coords = getCanvasCoordinates(e.clientX, e.clientY);
    const x = coords.x;
    const y = coords.y;
    
    if (currentTool === 'fill') {
        playSound('fill');
        floodFill(x, y, hexToRgb(currentColor));
        saveHistory();
        isDrawing = false;
    } else if (currentTool === 'stamp') {
        playSound('stamp');
        stampEmoji(x, y);
        saveHistory();
        isDrawing = false;
    } else if (currentTool === 'paste' && clipboard) {
        playSound('stamp');
        pasteClipboard(x, y);
        saveHistory();
        isDrawing = false;
    } else if (currentTool === 'circle' || currentTool === 'square' || currentTool === 'triangle' || 
               currentTool === 'star' || currentTool === 'arc' || currentTool === 'line' || 
               currentTool === 'select-circle' || currentTool === 'select-square') {
        // Store starting position for shapes, lines, and selections
        shapeStartX = x;
        shapeStartY = y;
    } else {
        draw(e);
    }
}

function draw(e) {
    if (!isDrawing) return;
    
    const coords = getCanvasCoordinates(e.clientX, e.clientY);
    const x = coords.x;
    const y = coords.y;
    
    if (currentTool === 'pencil') {
        drawPencil(x, y);
    } else if (currentTool === 'eraser') {
        drawEraser(x, y);
    } else if (currentTool === 'spray') {
        drawSpray(x, y);
    }
    // Shapes are drawn on mouseup, not during drag
}

function stopDrawing(e) {
    if (!isDrawing) return;
    
    // Remove visual feedback
    canvas.classList.remove('drawing-active');
    
    if (e) {
        const coords = getCanvasCoordinates(e.clientX, e.clientY);
        const x = coords.x;
        const y = coords.y;
        
        if (currentTool === 'circle') {
            drawCircle(shapeStartX, shapeStartY, x, y);
            playSound('stamp');
        } else if (currentTool === 'square') {
            drawSquare(shapeStartX, shapeStartY, x, y);
            playSound('stamp');
        } else if (currentTool === 'triangle') {
            drawTriangle(shapeStartX, shapeStartY, x, y);
            playSound('stamp');
        } else if (currentTool === 'star') {
            drawStar(shapeStartX, shapeStartY, x, y);
            playSound('stamp');
        } else if (currentTool === 'arc') {
            drawArc(shapeStartX, shapeStartY, x, y);
            playSound('stamp');
        } else if (currentTool === 'line') {
            drawLine(shapeStartX, shapeStartY, x, y);
            playSound('draw');
        } else if (currentTool === 'select-circle') {
            selectCircle(shapeStartX, shapeStartY, x, y);
            playSound('click');
        } else if (currentTool === 'select-square') {
            selectSquare(shapeStartX, shapeStartY, x, y);
            playSound('click');
        }
    }
    
    isDrawing = false;
    const activeCtx = getActiveContext();
    activeCtx.beginPath();
    
    // Update layer thumbnail and render
    renderCanvas();
    updateLayersList();
    
    // Save to history after drawing
    saveHistory();
}

let lastSoundTime = 0;
const soundThrottle = 50; // milliseconds between sounds

function drawPencil(x, y) {
    const activeCtx = getActiveContext();
    activeCtx.lineCap = 'round';
    activeCtx.lineJoin = 'round';
    activeCtx.lineWidth = brushSize;
    
    if (rainbowMode) {
        rainbowHue = (rainbowHue + 2) % 360;
        activeCtx.strokeStyle = `hsl(${rainbowHue}, 100%, 50%)`;
    } else {
        activeCtx.strokeStyle = currentColor;
    }
    
    activeCtx.lineTo(x, y);
    activeCtx.stroke();
    activeCtx.beginPath();
    activeCtx.moveTo(x, y);
    
    // Render canvas continuously while drawing
    renderCanvas();
    
    // Play sound occasionally
    const now = Date.now();
    if (now - lastSoundTime > soundThrottle) {
        playSound('draw');
        lastSoundTime = now;
    }
    
    if (sparkleMode) {
        addSparkles(x, y);
    }
}

function drawEraser(x, y) {
    const activeCtx = getActiveContext();
    activeCtx.lineCap = 'round';
    activeCtx.lineJoin = 'round';
    activeCtx.lineWidth = brushSize * 2;
    activeCtx.globalCompositeOperation = 'destination-out';
    
    activeCtx.lineTo(x, y);
    activeCtx.stroke();
    activeCtx.beginPath();
    activeCtx.moveTo(x, y);
    
    activeCtx.globalCompositeOperation = 'source-over';
    
    // Render canvas continuously while drawing
    renderCanvas();
    
    // Play sound occasionally
    const now = Date.now();
    if (now - lastSoundTime > soundThrottle) {
        playSound('eraser');
        lastSoundTime = now;
    }
}

function drawSpray(x, y) {
    const activeCtx = getActiveContext();
    const density = brushSize * 2;
    const radius = brushSize * 3;
    
    for (let i = 0; i < density; i++) {
        const offsetX = (Math.random() - 0.5) * radius;
        const offsetY = (Math.random() - 0.5) * radius;
        
        if (rainbowMode) {
            rainbowHue = (rainbowHue + 1) % 360;
            activeCtx.fillStyle = `hsl(${rainbowHue}, 100%, 50%)`;
        } else {
            activeCtx.fillStyle = currentColor;
        }
        
        activeCtx.fillRect(x + offsetX, y + offsetY, 2, 2);
    }
    
    // Render canvas continuously while drawing
    renderCanvas();
    
    // Play sound occasionally
    const now = Date.now();
    if (now - lastSoundTime > soundThrottle) {
        playSound('spray');
        lastSoundTime = now;
    }
    
    if (sparkleMode) {
        addSparkles(x, y);
    }
}

function stampEmoji(x, y) {
    const activeCtx = getActiveContext();
    const size = brushSize * 10;
    
    // Check if it's a text character (letter, number, or common punctuation)
    const isTextCharacter = /^[A-Za-z0-9!?&@#$%*+\-=/]$/.test(selectedEmoji);
    const isLetter = /^[A-Za-z]$/.test(selectedEmoji);
    
    // Apply case transformation to letters
    let charToStamp = selectedEmoji;
    if (isLetter) {
        charToStamp = textCase === 'upper' ? selectedEmoji.toUpperCase() : selectedEmoji.toLowerCase();
    }
    
    // Save context state
    activeCtx.save();
    
    // Apply rotation
    activeCtx.translate(x, y);
    activeCtx.rotate((stampRotation * Math.PI) / 180);
    if (mirrorMode) {
        activeCtx.scale(-1, 1);
    }
    activeCtx.translate(-x, -y);
    
    if (isTextCharacter) {
        // Use selected font for text characters
        activeCtx.font = `bold ${size}px "${selectedFont}", Arial, sans-serif`;
    } else {
        // Use default for emojis
        activeCtx.font = `${size}px Arial`;
    }
    
    activeCtx.textAlign = 'center';
    activeCtx.textBaseline = 'middle';
    
    // Apply current color to text characters
    if (isTextCharacter) {
        if (rainbowMode) {
            rainbowHue = (rainbowHue + 15) % 360;
            activeCtx.fillStyle = `hsl(${rainbowHue}, 100%, 50%)`;
        } else {
            activeCtx.fillStyle = currentColor;
        }
    } else {
        // Emojis use default rendering
        activeCtx.fillStyle = '#000000';
    }
    
    activeCtx.fillText(charToStamp, x, y);
    
    // Restore context state
    activeCtx.restore();
    
    // Add sparkle effect
    if (sparkleMode) {
        addSparkles(x, y);
        addSparkles(x - size/3, y - size/3);
        addSparkles(x + size/3, y - size/3);
        addSparkles(x - size/3, y + size/3);
        addSparkles(x + size/3, y + size/3);
    }
    
    // Render after stamping
    renderCanvas();
    updateLayersList();
    
    // Fun bouncy effect
    let scale = 1.5;
    const bounceInterval = setInterval(() => {
        scale -= 0.1;
        if (scale <= 1) {
            clearInterval(bounceInterval);
        }
    }, 30);
}

function addSparkles(x, y) {
    const activeCtx = getActiveContext();
    const sparkleCount = 3;
    const sparkleRadius = brushSize * 2;
    
    for (let i = 0; i < sparkleCount; i++) {
        const sparkleX = x + (Math.random() - 0.5) * sparkleRadius;
        const sparkleY = y + (Math.random() - 0.5) * sparkleRadius;
        const sparkleSize = Math.random() * 3 + 1;
        
        activeCtx.fillStyle = '#FFFF00';
        activeCtx.beginPath();
        activeCtx.arc(sparkleX, sparkleY, sparkleSize, 0, Math.PI * 2);
        activeCtx.fill();
        
        // Draw star points
        activeCtx.fillStyle = '#FFFFFF';
        activeCtx.fillRect(sparkleX - sparkleSize/2, sparkleY, sparkleSize, 1);
        activeCtx.fillRect(sparkleX, sparkleY - sparkleSize/2, 1, sparkleSize);
    }
}

function createPattern() {
    // Handle rainbow mode for solid fills
    if (fillPattern === 'solid') {
        if (rainbowMode) {
            rainbowHue = (rainbowHue + 10) % 360;
            return `hsl(${rainbowHue}, 100%, 50%)`;
        }
        return currentColor;
    }
    
    if (fillPattern === 'transparent') {
        return null; // Return null for transparent
    }
    
    const patternCanvas = document.createElement('canvas');
    const patternCtx = patternCanvas.getContext('2d');
    
    // Apply rainbow to primary color if rainbow mode is active
    let color1 = currentColor;
    if (rainbowMode) {
        rainbowHue = (rainbowHue + 10) % 360;
        color1 = `hsl(${rainbowHue}, 100%, 50%)`;
    }
    const color2 = secondaryColor;
    
    switch(fillPattern) {
        case 'horizontal':
            patternCanvas.width = 1;
            patternCanvas.height = 8;
            patternCtx.fillStyle = color1;
            patternCtx.fillRect(0, 0, 1, 4);
            patternCtx.fillStyle = color2;
            patternCtx.fillRect(0, 4, 1, 4);
            break;
            
        case 'vertical':
            patternCanvas.width = 8;
            patternCanvas.height = 1;
            patternCtx.fillStyle = color1;
            patternCtx.fillRect(0, 0, 4, 1);
            patternCtx.fillStyle = color2;
            patternCtx.fillRect(4, 0, 4, 1);
            break;
            
        case 'diagonal':
            patternCanvas.width = 10;
            patternCanvas.height = 10;
            patternCtx.fillStyle = color2;
            patternCtx.fillRect(0, 0, 10, 10);
            patternCtx.strokeStyle = color1;
            patternCtx.lineWidth = 3;
            patternCtx.beginPath();
            patternCtx.moveTo(0, 10);
            patternCtx.lineTo(10, 0);
            patternCtx.stroke();
            break;
            
        case 'checkerboard':
            patternCanvas.width = 16;
            patternCanvas.height = 16;
            patternCtx.fillStyle = color2;
            patternCtx.fillRect(0, 0, 16, 16);
            patternCtx.fillStyle = color1;
            patternCtx.fillRect(0, 0, 8, 8);
            patternCtx.fillRect(8, 8, 8, 8);
            break;
            
        case 'dots':
            patternCanvas.width = 12;
            patternCanvas.height = 12;
            patternCtx.fillStyle = color2;
            patternCtx.fillRect(0, 0, 12, 12);
            patternCtx.fillStyle = color1;
            patternCtx.beginPath();
            patternCtx.arc(6, 6, 3, 0, Math.PI * 2);
            patternCtx.fill();
            break;
    }
    
    const activeCtx = getActiveContext();
    if (mirrorMode) {
        const mirroredCanvas = document.createElement('canvas');
        mirroredCanvas.width = patternCanvas.width;
        mirroredCanvas.height = patternCanvas.height;
        const mirroredCtx = mirroredCanvas.getContext('2d');
        mirroredCtx.translate(patternCanvas.width, 0);
        mirroredCtx.scale(-1, 1);
        mirroredCtx.drawImage(patternCanvas, 0, 0);
        return activeCtx.createPattern(mirroredCanvas, 'repeat');
    }
    return activeCtx.createPattern(patternCanvas, 'repeat');
}

function drawCircle(startX, startY, endX, endY) {
    const activeCtx = getActiveContext();
    const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    
    activeCtx.beginPath();
    activeCtx.arc(startX, startY, radius, 0, Math.PI * 2);
    
    const fillStyle = createPattern();
    if (fillStyle !== null) {
        activeCtx.fillStyle = fillStyle;
        activeCtx.fill();
    }
    
    // Apply rainbow mode to stroke
    if (rainbowMode) {
        rainbowHue = (rainbowHue + 10) % 360;
        activeCtx.strokeStyle = `hsl(${rainbowHue}, 100%, 50%)`;
    } else {
        activeCtx.strokeStyle = currentColor;
    }
    activeCtx.lineWidth = Math.max(brushSize / 2, 2);
    activeCtx.stroke();
    
    if (sparkleMode) {
        addSparkles(startX, startY);
        // Add sparkles around the circle
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 * i) / 8;
            const sparkleX = startX + Math.cos(angle) * radius;
            const sparkleY = startY + Math.sin(angle) * radius;
            addSparkles(sparkleX, sparkleY);
        }
    }
    
    renderCanvas();
    updateLayersList();
}

function drawSquare(startX, startY, endX, endY) {
    const activeCtx = getActiveContext();
    const width = endX - startX;
    const height = endY - startY;
    
    activeCtx.beginPath();
    activeCtx.rect(startX, startY, width, height);
    
    const fillStyle = createPattern();
    if (fillStyle !== null) {
        activeCtx.fillStyle = fillStyle;
        activeCtx.fill();
    }
    
    // Apply rainbow mode to stroke
    if (rainbowMode) {
        rainbowHue = (rainbowHue + 10) % 360;
        activeCtx.strokeStyle = `hsl(${rainbowHue}, 100%, 50%)`;
    } else {
        activeCtx.strokeStyle = currentColor;
    }
    activeCtx.lineWidth = Math.max(brushSize / 2, 2);
    activeCtx.stroke();
    
    if (sparkleMode) {
        addSparkles(startX + width/2, startY + height/2);
        // Add sparkles at corners
        addSparkles(startX, startY);
        addSparkles(endX, startY);
        addSparkles(startX, endY);
        addSparkles(endX, endY);
    }
    
    renderCanvas();
    updateLayersList();
}

function drawTriangle(startX, startY, endX, endY) {
    const activeCtx = getActiveContext();
    const width = endX - startX;
    const height = endY - startY;
    
    // Calculate triangle points (equilateral-ish triangle)
    const topX = startX + width / 2;
    const topY = startY;
    const bottomLeftX = startX;
    const bottomLeftY = endY;
    const bottomRightX = endX;
    const bottomRightY = endY;
    
    activeCtx.beginPath();
    activeCtx.moveTo(topX, topY);
    activeCtx.lineTo(bottomLeftX, bottomLeftY);
    activeCtx.lineTo(bottomRightX, bottomRightY);
    activeCtx.closePath();
    
    const fillStyle = createPattern();
    if (fillStyle !== null) {
        activeCtx.fillStyle = fillStyle;
        activeCtx.fill();
    }
    
    // Apply rainbow mode to stroke
    if (rainbowMode) {
        rainbowHue = (rainbowHue + 10) % 360;
        activeCtx.strokeStyle = `hsl(${rainbowHue}, 100%, 50%)`;
    } else {
        activeCtx.strokeStyle = currentColor;
    }
    activeCtx.lineWidth = Math.max(brushSize / 2, 2);
    activeCtx.stroke();
    
    if (sparkleMode) {
        // Add sparkles at triangle points
        addSparkles(topX, topY);
        addSparkles(bottomLeftX, bottomLeftY);
        addSparkles(bottomRightX, bottomRightY);
        addSparkles(startX + width/2, startY + height/2);
    }
    
    renderCanvas();
    updateLayersList();
}

function drawStar(startX, startY, endX, endY) {
    const activeCtx = getActiveContext();
    const centerX = (startX + endX) / 2;
    const centerY = (startY + endY) / 2;
    const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2)) / 2;
    const innerRadius = radius * 0.4; // Inner radius for star points
    const points = 5;
    
    activeCtx.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const angle = (i * Math.PI) / points - Math.PI / 2;
        const r = i % 2 === 0 ? radius : innerRadius;
        const x = centerX + r * Math.cos(angle);
        const y = centerY + r * Math.sin(angle);
        
        if (i === 0) {
            activeCtx.moveTo(x, y);
        } else {
            activeCtx.lineTo(x, y);
        }
    }
    activeCtx.closePath();
    
    const fillStyle = createPattern();
    if (fillStyle !== null) {
        activeCtx.fillStyle = fillStyle;
        activeCtx.fill();
    }
    
    // Apply rainbow mode to stroke
    if (rainbowMode) {
        rainbowHue = (rainbowHue + 10) % 360;
        activeCtx.strokeStyle = `hsl(${rainbowHue}, 100%, 50%)`;
    } else {
        activeCtx.strokeStyle = currentColor;
    }
    activeCtx.lineWidth = Math.max(brushSize / 2, 2);
    activeCtx.stroke();
    
    if (sparkleMode) {
        // Add sparkles at star points
        for (let i = 0; i < points; i++) {
            const angle = (i * 2 * Math.PI) / points - Math.PI / 2;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            addSparkles(x, y);
        }
        addSparkles(centerX, centerY);
    }
    
    renderCanvas();
    updateLayersList();
}

function drawArc(startX, startY, endX, endY) {
    const activeCtx = getActiveContext();
    
    // Calculate radius based on distance from start to end point
    const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    
    // Calculate the starting angle based on the direction from start to end
    const baseAngle = Math.atan2(endY - startY, endX - startX);
    
    // Convert arc sweep angle from degrees to radians
    const sweepRadians = (arcSweepAngle * Math.PI) / 180;
    
    // Calculate start and end angles
    // Center the arc around the base angle
    const startAngle = baseAngle - sweepRadians / 2;
    const endAngle = baseAngle + sweepRadians / 2;
    
    activeCtx.beginPath();
    activeCtx.arc(startX, startY, radius, startAngle, endAngle, false);
    
    // Apply pattern fill if there's a fill pattern
    const fillStyle = createPattern();
    if (fillStyle !== null && radius > 10) {
        // For arc, we'll fill a pie slice
        activeCtx.lineTo(startX, startY);
        activeCtx.closePath();
        activeCtx.fillStyle = fillStyle;
        activeCtx.fill();
        // Redraw the arc outline
        activeCtx.beginPath();
        activeCtx.arc(startX, startY, radius, startAngle, endAngle, false);
    }
    
    // Apply rainbow mode to stroke
    if (rainbowMode) {
        rainbowHue = (rainbowHue + 10) % 360;
        activeCtx.strokeStyle = `hsl(${rainbowHue}, 100%, 50%)`;
    } else {
        activeCtx.strokeStyle = currentColor;
    }
    activeCtx.lineWidth = Math.max(brushSize / 2, 2);
    activeCtx.lineCap = 'round';
    activeCtx.stroke();
    
    if (sparkleMode) {
        // Add sparkles along the arc
        const sparkleCount = Math.min(Math.floor(radius / 20), 12);
        for (let i = 0; i <= sparkleCount; i++) {
            const t = i / sparkleCount;
            const angle = startAngle + (endAngle - startAngle) * t;
            const sparkleX = startX + radius * Math.cos(angle);
            const sparkleY = startY + radius * Math.sin(angle);
            addSparkles(sparkleX, sparkleY);
        }
        // Add sparkles at start and end points
        addSparkles(startX, startY);
        addSparkles(endX, endY);
    }
    
    renderCanvas();
    updateLayersList();
}

function drawLine(startX, startY, endX, endY) {
    const activeCtx = getActiveContext();
    activeCtx.beginPath();
    activeCtx.moveTo(startX, startY);
    activeCtx.lineTo(endX, endY);
    
    if (rainbowMode) {
        activeCtx.strokeStyle = `hsl(${rainbowHue}, 100%, 50%)`;
    } else {
        activeCtx.strokeStyle = currentColor;
    }
    
    activeCtx.lineWidth = brushSize;
    activeCtx.lineCap = 'round';
    activeCtx.stroke();
    
    if (sparkleMode) {
        addSparkles((startX + endX) / 2, (startY + endY) / 2);
    }
    
    renderCanvas();
    updateLayersList();
}

function selectCircle(startX, startY, endX, endY) {
    const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    
    if (radius < 5) return; // Ignore very small selections
    
    // Get the bounding box
    const left = Math.max(0, Math.floor(startX - radius));
    const top = Math.max(0, Math.floor(startY - radius));
    const width = Math.min(canvas.width - left, Math.ceil(radius * 2));
    const height = Math.min(canvas.height - top, Math.ceil(radius * 2));
    
    // Get the image data from the active layer
    const activeCtx = getActiveContext();
    const imageData = activeCtx.getImageData(left, top, width, height);
    
    // Create a mask for the circle
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d');
    
    maskCtx.beginPath();
    maskCtx.arc(startX - left, startY - top, radius, 0, Math.PI * 2);
    maskCtx.fillStyle = 'white';
    maskCtx.fill();
    
    const maskData = maskCtx.getImageData(0, 0, width, height);
    
    // Apply mask to selection
    for (let i = 0; i < imageData.data.length; i += 4) {
        if (maskData.data[i] === 0) {
            imageData.data[i + 3] = 0; // Make transparent
        }
    }
    
    selectionData = imageData;
    selectionType = 'circle';
    selectionBounds = { x: startX, y: startY, radius: radius, left: left, top: top, width: width, height: height };
    
    // Clear previous selection outline and draw new one
    renderCanvas();
    ctx.save();
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 3; // Thicker for better mobile visibility
    ctx.setLineDash([8, 4]); // Larger dashes for mobile
    ctx.beginPath();
    ctx.arc(startX, startY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    
    // Force reset to default state after drawing outline
    ctx.setLineDash([]);
    ctx.strokeStyle = '#000000';
    
    // Visual feedback for mobile
    showToast('Selection created - Copy or Cut');
}

function selectSquare(startX, startY, endX, endY) {
    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    
    if (width < 5 || height < 5) return; // Ignore very small selections
    
    // Get the image data from the active layer
    const activeCtx = getActiveContext();
    const imageData = activeCtx.getImageData(left, top, width, height);
    
    selectionData = imageData;
    selectionType = 'square';
    selectionBounds = { left: left, top: top, width: width, height: height };
    
    // Clear previous selection outline and draw new one
    renderCanvas();
    ctx.save();
    ctx.strokeStyle = '#667eea';
    ctx.lineWidth = 3; // Thicker for better mobile visibility
    ctx.setLineDash([8, 4]); // Larger dashes for mobile
    ctx.strokeRect(left, top, width, height);
    ctx.restore();
    
    // Force reset to default state after drawing outline
    ctx.setLineDash([]);
    ctx.strokeStyle = '#000000';
    
    // Visual feedback for mobile
    showToast('Selection created - Copy or Cut');
}

function clearSelection() {
    if (!selectionBounds) return;
    
    const activeCtx = getActiveContext();
    
    // Clear the selected area on the active layer (make it transparent)
    activeCtx.save();
    activeCtx.globalCompositeOperation = 'destination-out';
    
    if (selectionType === 'circle') {
        activeCtx.beginPath();
        activeCtx.arc(selectionBounds.x, selectionBounds.y, selectionBounds.radius, 0, Math.PI * 2);
        activeCtx.fill();
    } else if (selectionType === 'square') {
        activeCtx.fillRect(selectionBounds.left, selectionBounds.top, selectionBounds.width, selectionBounds.height);
    }
    
    activeCtx.restore();
    
    // Re-render the canvas to show the changes
    renderCanvas();
    updateLayersList();
}

function pasteClipboard(x, y) {
    if (!clipboard) return;
    
    const activeCtx = getActiveContext();
    const imageData = clipboard.imageData;
    const bounds = clipboard.bounds;
    
    // Calculate paste position (centered on click)
    let pasteX = x - bounds.width / 2;
    let pasteY = y - bounds.height / 2;
    
    // Put the image data at the new position on the active layer
    activeCtx.putImageData(imageData, pasteX, pasteY);
    
    // Re-render the canvas to show the changes
    renderCanvas();
    updateLayersList();
    
    if (sparkleMode) {
        addSparkles(x, y);
    }
}

function floodFill(startX, startY, fillColor) {
    const activeCtx = getActiveContext();
    const imageData = activeCtx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const startPos = (Math.floor(startY) * canvas.width + Math.floor(startX)) * 4;
    const startR = pixels[startPos];
    const startG = pixels[startPos + 1];
    const startB = pixels[startPos + 2];
    
    // Find the bounding box of the area to fill
    const stack = [[Math.floor(startX), Math.floor(startY)]];
    const visited = new Set();
    let minX = canvas.width, maxX = 0, minY = canvas.height, maxY = 0;
    
    // First pass: find all pixels to fill and calculate bounds
    while (stack.length > 0) {
        const [x, y] = stack.pop();
        const key = `${x},${y}`;
        
        if (visited.has(key)) continue;
        if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) continue;
        
        visited.add(key);
        
        const pos = (y * canvas.width + x) * 4;
        const r = pixels[pos];
        const g = pixels[pos + 1];
        const b = pixels[pos + 2];
        
        if (r !== startR || g !== startG || b !== startB) continue;
        
        // Update bounds
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        
        stack.push([x + 1, y]);
        stack.push([x - 1, y]);
        stack.push([x, y + 1]);
        stack.push([x, y - 1]);
    }
    
    // Put back the original image
    activeCtx.putImageData(imageData, 0, 0);
    
    if (visited.size === 0) return;
    
    // Create a temporary canvas for the pattern
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = maxX - minX + 1;
    tempCanvas.height = maxY - minY + 1;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Fill the temporary canvas with the pattern
    const fillStyle = createPattern();
    if (fillStyle !== null) {
        tempCtx.fillStyle = fillStyle;
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    }
    
    // Get the pattern image data
    const patternData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    
    // Second pass: apply the pattern to the visited pixels
    const finalImageData = activeCtx.getImageData(0, 0, canvas.width, canvas.height);
    const finalPixels = finalImageData.data;
    
    visited.forEach(key => {
        const [x, y] = key.split(',').map(Number);
        const canvasPos = (y * canvas.width + x) * 4;
        
        // Calculate position in pattern
        const patternX = x - minX;
        const patternY = y - minY;
        const patternPos = (patternY * tempCanvas.width + patternX) * 4;
        
        if (fillStyle === null) {
            // For transparent, don't change the pixel
            return;
        }
        
        finalPixels[canvasPos] = patternData.data[patternPos];
        finalPixels[canvasPos + 1] = patternData.data[patternPos + 1];
        finalPixels[canvasPos + 2] = patternData.data[patternPos + 2];
        finalPixels[canvasPos + 3] = 255;
    });
    
    activeCtx.putImageData(finalImageData, 0, 0);
    
    // Add sparkle effect if enabled
    if (sparkleMode) {
        // Add sparkles at the click point
        addSparkles(startX, startY);
        
        // Add sparkles at random points within the filled area
        const sparkleCount = Math.min(10, Math.floor(visited.size / 100));
        const visitedArray = Array.from(visited);
        for (let i = 0; i < sparkleCount; i++) {
            const randomKey = visitedArray[Math.floor(Math.random() * visitedArray.length)];
            const [x, y] = randomKey.split(',').map(Number);
            addSparkles(x, y);
        }
    }
    
    renderCanvas();
    updateLayersList();
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

// Function to update cursor based on tool and emoji
function updateCursor() {
    const cursorMap = {
        'pencil': 'crosshair',
        'eraser': 'cell',
        'line': 'crosshair',
        'circle': 'crosshair',
        'square': 'crosshair',
        'triangle': 'crosshair',
        'star': 'crosshair',
        'arc': 'crosshair',
        'fill': 'cell',
        'spray': 'crosshair',
        'select-circle': 'crosshair',
        'select-square': 'crosshair',
        'paste': 'copy'
    };
    
    if (currentTool === 'stamp') {
        // Create a custom emoji cursor matching the actual stamp size
        const actualSize = brushSize * 10; // Match the size in stampEmoji()
        const cursorSize = Math.min(actualSize, 128); // Cap at 128px for cursor display
        
        const cursorCanvas = document.createElement('canvas');
        cursorCanvas.width = cursorSize;
        cursorCanvas.height = cursorSize;
        const cursorCtx = cursorCanvas.getContext('2d');
        
        // Check if it's a text character
        const isTextCharacter = /^[A-Za-z0-9!?&@#$%*+\-=/]$/.test(selectedEmoji);
        const isLetter = /^[A-Za-z]$/.test(selectedEmoji);
        
        // Apply case transformation to letters
        let charToDraw = selectedEmoji;
        if (isLetter) {
            charToDraw = textCase === 'upper' ? selectedEmoji.toUpperCase() : selectedEmoji.toLowerCase();
        }
        
        // Apply rotation to cursor
        cursorCtx.save();
        cursorCtx.translate(cursorSize / 2, cursorSize / 2);
        cursorCtx.rotate((stampRotation * Math.PI) / 180);
        if (mirrorMode) {
            cursorCtx.scale(-1, 1);
        }
        cursorCtx.translate(-cursorSize / 2, -cursorSize / 2);
        
        // Set font based on character type - matching stampEmoji() function
        if (isTextCharacter) {
            cursorCtx.font = `bold ${cursorSize}px "${selectedFont}", Arial, sans-serif`;
        } else {
            cursorCtx.font = `${cursorSize}px Arial`;
        }
        
        cursorCtx.textAlign = 'center';
        cursorCtx.textBaseline = 'middle';
        
        // Apply color to text characters
        if (isTextCharacter) {
            if (rainbowMode) {
                cursorCtx.fillStyle = `hsl(${rainbowHue}, 100%, 50%)`;
            } else {
                cursorCtx.fillStyle = currentColor;
            }
        } else {
            cursorCtx.fillStyle = '#000000';
        }
        
        // Draw the emoji/character
        cursorCtx.fillText(charToDraw, cursorSize / 2, cursorSize / 2);
        
        cursorCtx.restore();
        
        // Convert to data URL and set as cursor
        const dataURL = cursorCanvas.toDataURL();
        canvas.style.cursor = `url('${dataURL}') ${cursorSize / 2} ${cursorSize / 2}, auto`;
    } else {
        // Use standard cursor for other tools
        canvas.style.cursor = cursorMap[currentTool] || 'crosshair';
    }
}

// Initialize audio on first touch/click (iOS requirement)
document.addEventListener('touchstart', function initAudioOnTouch() {
    initAudio();
    // Remove listener after first touch
    document.removeEventListener('touchstart', initAudioOnTouch);
}, { once: true, passive: true });

document.addEventListener('click', function initAudioOnClick() {
    initAudio();
    // Remove listener after first click
    document.removeEventListener('click', initAudioOnClick);
}, { once: true });

// Prevent iOS double-tap zoom on buttons and improve touch handling
const buttons = document.querySelectorAll('button');
buttons.forEach(button => {
    let touchStartTime;
    button.addEventListener('touchstart', (e) => {
        touchStartTime = Date.now();
    }, { passive: true });
    
    button.addEventListener('touchend', (e) => {
        e.preventDefault();
        const touchDuration = Date.now() - touchStartTime;
        // Only trigger click if it was a quick tap (not a long press or scroll)
        if (touchDuration < 500) {
            button.click();
        }
    }, { passive: false });
});

// Special handling for color inputs on iOS
const colorInputs = document.querySelectorAll('input[type="color"]');
colorInputs.forEach(input => {
    // Ensure color picker works on iOS
    input.addEventListener('touchend', (e) => {
        e.stopPropagation();
    }, { passive: true });
    
    // Force iOS to open color picker
    input.addEventListener('focus', () => {
        input.click();
    });
});

// Fix iOS viewport height issue
function setViewportHeight() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
}

window.addEventListener('resize', setViewportHeight);
window.addEventListener('orientationchange', setViewportHeight);
setViewportHeight();

// Initialize font preview
if (fontPreview) {
    fontPreview.style.fontFamily = selectedFont;
    updateFontPreview();
}

// Initialize cursor
updateCursor();

// Start with layer panel collapsed on mobile for more canvas space
if (window.innerWidth <= 768) {
    const layerPanel = document.querySelector('.layer-panel');
    if (layerPanel) {
        layerPanel.classList.add('collapsed');
    }
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    const helpModal = document.getElementById('help-modal');
    
    // Escape key to close help modal (works even when typing)
    if (e.key === 'Escape' && helpModal && helpModal.style.display === 'flex') {
        e.preventDefault();
        helpModal.style.display = 'none';
        return;
    }
    
    // F1 or ? to open help (works even when typing, but not in input fields for ?)
    if (e.key === 'F1' || (e.key === '?' && e.target.tagName !== 'INPUT')) {
        e.preventDefault();
        initAudio();
        playSound('click');
        if (helpModal) {
            helpModal.style.display = 'flex';
        }
        return;
    }
    
    // Ignore other shortcuts if user is typing in an input field
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
    }
    
    // Ctrl+Z or Cmd+Z for undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
    }
    // Ctrl+Shift+Z or Cmd+Shift+Z or Ctrl+Y for redo
    else if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') || 
             (e.ctrlKey && e.key === 'y')) {
        e.preventDefault();
        redo();
    }
    // Zoom shortcuts (+ and -)
    else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomIn();
    }
    else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomOut();
    }
    // R key to reset stamp rotation
    else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        resetRotation();
    }
    // G key to reset arc angle
    else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        resetArcAngle();
    }
    // Sidebar toggle (Tab key)
    else if (e.key === 'Tab') {
        e.preventDefault();
        toggleSidebar();
    }
    // Number keys for tool selection (without modifiers)
    else if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
        let toolToSelect = null;
        
        switch(e.key) {
            case '1':
                toolToSelect = 'pencil';
                break;
            case '2':
                toolToSelect = 'line';
                break;
            case '3':
                toolToSelect = 'eraser';
                break;
            case '4':
                toolToSelect = 'fill';
                break;
            case '5':
                toolToSelect = 'spray';
                break;
            case '6':
                toolToSelect = 'circle';
                break;
            case '7':
                toolToSelect = 'square';
                break;
            case '8':
                toolToSelect = 'triangle';
                break;
            case '9':
                toolToSelect = 'star';
                break;
            case 'a':
            case 'A':
                toolToSelect = 'arc';
                break;
            case '0':
                toolToSelect = 'stamp';
                break;
            case '[':
            case '{':
                toolToSelect = 'select-circle';
                break;
            case ']':
            case '}':
                toolToSelect = 'select-square';
                break;
            case 'r':
            case 'R':
                // Reset rotation when stamp tool is active
                if (currentTool === 'stamp') {
                    e.preventDefault();
                    resetRotation();
                }
                return;
        }
        
        if (toolToSelect) {
            e.preventDefault();
            initAudio();
            playSound('click');
            
            // Update active tool button
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            const toolButton = document.querySelector(`[data-tool="${toolToSelect}"]`);
            if (toolButton) {
                toolButton.classList.add('active');
                currentTool = toolToSelect;
                updateToolUI();
                updateCursor();
            }
        }
    }
});

console.log('🎨 Stickers loaded! Have fun drawing!');

