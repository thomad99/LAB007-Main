// 3D Viewer using Three.js
// Note: THREE, STLLoader, and OrbitControls are loaded via CDN in index.html
let scene, camera, renderer, controls, currentMesh = null;

function init3DViewer() {
    const container = document.getElementById('viewer3d');
    if (!container) return;

    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // Camera setup
    camera = new THREE.PerspectiveCamera(
        75,
        container.clientWidth / container.clientHeight,
        0.1,
        1000
    );
    camera.position.set(0, 0, 5);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight1.position.set(1, 1, 1);
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-1, -1, -1);
    scene.add(directionalLight2);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1;
    controls.maxDistance = 20;

    // Grid helper
    const gridHelper = new THREE.GridHelper(10, 10, 0x888888, 0xcccccc);
    scene.add(gridHelper);

    // Axes helper
    const axesHelper = new THREE.AxesHelper(2);
    scene.add(axesHelper);

    // Handle window resize
    window.addEventListener('resize', onWindowResize);

    // Start animation loop
    animate();
}

function onWindowResize() {
    const container = document.getElementById('viewer3d');
    if (!container || !camera || !renderer) return;

    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

// Expose resize helper so other scripts can trigger it after the viewer becomes visible
window.forceViewerResize = onWindowResize;

function animate() {
    requestAnimationFrame(animate);
    if (controls) {
        controls.update();
    }
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

function loadSTLFile(file) {
    return new Promise((resolve, reject) => {
        addDebugLog('Starting 3D file load...');
        
        if (typeof THREE === 'undefined') {
            addDebugLog('ERROR: THREE.js not loaded', 'error');
            reject(new Error('Three.js library not loaded'));
            return;
        }
        
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        addDebugLog(`File extension: ${ext}`);
        
        if (ext === '.stl') {
            loadSTLFormat(file).then(resolve).catch(reject);
        } else if (ext === '.obj') {
            loadOBJFormat(file).then(resolve).catch(reject);
        } else {
            addDebugLog(`3D preview not supported for ${ext} files`, 'warning');
            reject(new Error(`3D preview not supported for ${ext} files`));
        }
    });
}

function loadSTLFormat(file) {
    return new Promise((resolve, reject) => {
        if (typeof THREE.STLLoader === 'undefined') {
            addDebugLog('ERROR: STLLoader not available', 'error');
            addDebugLog('Attempting to wait for loader...', 'warning');
            setTimeout(() => {
                if (typeof THREE.STLLoader !== 'undefined') {
                    loadSTLFormat(file).then(resolve).catch(reject);
                } else {
                    reject(new Error('STLLoader not available'));
                }
            }, 500);
            return;
        }
        
        addDebugLog(`Reading STL file: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
        const reader = new FileReader();
        
        reader.onload = (event) => {
            try {
                addDebugLog('File read successfully, parsing STL...');
                const loader = new THREE.STLLoader();
                const geometry = loader.parse(event.target.result);
                
                addDebugLog(`STL parsed: ${geometry.attributes.position.count / 3} triangles`);
                
                processGeometry(geometry, 'STL').then(resolve).catch(reject);
            } catch (error) {
                addDebugLog(`ERROR parsing STL: ${error.message}`, 'error');
                reject(error);
            }
        };
        
        reader.onerror = () => {
            addDebugLog('ERROR: Failed to read file', 'error');
            reject(new Error('Failed to read file'));
        };
        reader.readAsArrayBuffer(file);
    });
}

function loadOBJFormat(file) {
    return new Promise((resolve, reject) => {
        if (typeof THREE.OBJLoader === 'undefined') {
            addDebugLog('ERROR: OBJLoader not available', 'error');
            addDebugLog('Attempting to wait for loader...', 'warning');
            setTimeout(() => {
                if (typeof THREE.OBJLoader !== 'undefined') {
                    loadOBJFormat(file).then(resolve).catch(reject);
                } else {
                    reject(new Error('OBJLoader not available'));
                }
            }, 500);
            return;
        }
        
        addDebugLog(`Reading OBJ file: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
        const reader = new FileReader();
        
        reader.onload = (event) => {
            try {
                addDebugLog('File read successfully, parsing OBJ...');
                const loader = new THREE.OBJLoader();
                const objText = event.target.result;
                const object = loader.parse(objText);
                
                // OBJLoader returns a Group, we need to extract geometry
                // Collect all meshes from the group
                const meshes = [];
                object.traverse((child) => {
                    if (child instanceof THREE.Mesh && child.geometry) {
                        meshes.push(child);
                    }
                });
                
                if (meshes.length === 0) {
                    throw new Error('No geometry found in OBJ file');
                }
                
                // If multiple meshes, merge them manually
                let mergedGeometry;
                if (meshes.length === 1) {
                    mergedGeometry = meshes[0].geometry.clone();
                } else {
                    // Create a new geometry and merge attributes
                    mergedGeometry = new THREE.BufferGeometry();
                    const positions = [];
                    const normals = [];
                    
                    for (const mesh of meshes) {
                        const geo = mesh.geometry;
                        const pos = geo.attributes.position;
                        const norm = geo.attributes.normal;
                        
                        for (let i = 0; i < pos.count; i++) {
                            positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
                            if (norm) {
                                normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
                            }
                        }
                    }
                    
                    mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                    if (normals.length > 0) {
                        mergedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
                    }
                    mergedGeometry.computeVertexNormals();
                }
                
                addDebugLog(`OBJ parsed: ${mergedGeometry.attributes.position.count / 3} vertices`);
                
                processGeometry(mergedGeometry, 'OBJ').then(resolve).catch(reject);
            } catch (error) {
                addDebugLog(`ERROR parsing OBJ: ${error.message}`, 'error');
                reject(error);
            }
        };
        
        reader.onerror = () => {
            addDebugLog('ERROR: Failed to read file', 'error');
            reject(new Error('Failed to read file'));
        };
        reader.readAsText(file);
    });
}

function processGeometry(geometry, format) {
    return new Promise((resolve, reject) => {
        try {
            // Center and scale the geometry
            geometry.center();
            const box = new THREE.Box3().setFromObject(new THREE.Mesh(geometry));
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 3 / maxDim;
            geometry.scale(scale, scale, scale);
            
            addDebugLog(`Model dimensions: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`);
            addDebugLog(`Scale factor: ${scale.toFixed(3)}`);
            
            // Remove old mesh
            if (currentMesh) {
                scene.remove(currentMesh);
                if (currentMesh.geometry) currentMesh.geometry.dispose();
                if (currentMesh.material) currentMesh.material.dispose();
            }
            
            // Create material
            const material = new THREE.MeshPhongMaterial({
                color: 0x0066cc,
                specular: 0x111111,
                shininess: 200,
                flatShading: false
            });
            
            // Create mesh
            currentMesh = new THREE.Mesh(geometry, material);
            scene.add(currentMesh);
            
            addDebugLog('3D model added to scene');
            
            // Reset camera position
            camera.position.set(0, 0, 5);
            if (controls && controls.reset) {
                controls.reset();
            }
            
            addDebugLog(`3D preview loaded successfully! (${format})`, 'success');
            resolve();
        } catch (error) {
            addDebugLog(`ERROR processing geometry: ${error.message}`, 'error');
            reject(error);
        }
    });
}

function clear3DViewer() {
    if (currentMesh) {
        scene.remove(currentMesh);
        if (currentMesh.geometry) currentMesh.geometry.dispose();
        if (currentMesh.material) currentMesh.material.dispose();
        currentMesh = null;
    }
}

// Export functions for use in other scripts
window.loadSTLFile = loadSTLFile;
window.clear3DViewer = clear3DViewer;

// Initialize when DOM is ready and Three.js is loaded
function initializeViewer() {
    if (typeof THREE !== 'undefined') {
        addDebugLog('Three.js loaded');
        if (typeof THREE.STLLoader !== 'undefined') {
            addDebugLog('STLLoader available');
            init3DViewer();
            addDebugLog('3D viewer initialized');
        } else {
            addDebugLog('Waiting for STLLoader...', 'warning');
            setTimeout(initializeViewer, 100);
        }
    } else {
        addDebugLog('Waiting for Three.js...', 'warning');
        setTimeout(initializeViewer, 100);
    }
}

// Debug logging function
function addDebugLog(message, type = 'info') {
    if (typeof window.addDebugLog === 'function') {
        window.addDebugLog(message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeViewer);
} else {
    initializeViewer();
}

