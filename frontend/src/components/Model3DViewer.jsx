import { useState, useEffect, useRef } from 'react';
import { RotateCw, AlertCircle } from 'lucide-react';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export default function Model3DViewer({ fileUrl, fileName }) {
  const mountRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let currentMount = mountRef.current;
    if (!currentMount) return;

    const fileExt = fileName.split('.').pop().toLowerCase();
    
    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0c0f0d');

    // Camera setup
    const width = currentMount.clientWidth;
    const height = 400;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 0, 100);

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    currentMount.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight1.position.set(1, 1, 1.5).normalize();
    scene.add(dirLight1);
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.35);
    dirLight2.position.set(-1, -1, 1).normalize();
    scene.add(dirLight2);

    let animationFrameId;
    let modelMesh;

    // Load geometry
    const loadModel = async () => {
      try {
        setLoading(true);
        setError(null);
        
        if (fileExt === 'stl') {
          const loader = new STLLoader();
          loader.load(fileUrl, (geometry) => {
            const material = new THREE.MeshStandardMaterial({
              color: 0x337150,
              roughness: 0.5,
              metalness: 0.1
            });
            modelMesh = new THREE.Mesh(geometry, material);
            scene.add(modelMesh);
            centerAndScaleModel();
            setLoading(false);
          }, undefined, (err) => {
            console.error('Error loading STL:', err);
            setError('Failed to load STL model.');
            setLoading(false);
          });
        } else if (fileExt === '3mf') {
          const loader = new ThreeMFLoader();
          loader.load(fileUrl, (group) => {
            modelMesh = group;
            modelMesh.traverse(child => {
              if (child.isMesh) {
                if (!child.material || child.material.color.getHex() === 0xffffff) {
                  child.material = new THREE.MeshStandardMaterial({
                    color: 0x337150,
                    roughness: 0.5,
                    metalness: 0.1
                  });
                }
              }
            });
            scene.add(modelMesh);
            centerAndScaleModel();
            setLoading(false);
          }, undefined, (err) => {
            console.error('Error loading 3MF:', err);
            setError('Failed to load 3MF model. Make sure it is sliced correctly.');
            setLoading(false);
          });
        } else {
          setError('Unsupported file type.');
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        setError('Error rendering 3D preview.');
        setLoading(false);
      }
    };

    function centerAndScaleModel() {
      if (!modelMesh) return;

      const box = new THREE.Box3().setFromObject(modelMesh);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());

      modelMesh.position.x -= center.x;
      modelMesh.position.y -= center.y;
      modelMesh.position.z -= center.z;

      const maxDim = Math.max(size.x, size.y, size.z);
      const fovRad = camera.fov * (Math.PI / 180);
      const cameraDist = (maxDim / (2 * Math.tan(fovRad / 2))) * 1.5;

      camera.position.set(cameraDist * 0.7, cameraDist * 0.6, cameraDist * 0.9);
      camera.lookAt(0, 0, 0);
      controls.target.set(0, 0, 0);
      controls.update();
    }

    loadModel();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!currentMount) return;
      const w = currentMount.clientWidth;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      if (controls) controls.dispose();
      if (renderer) {
        renderer.dispose();
        if (currentMount.contains(renderer.domElement)) {
          currentMount.removeChild(renderer.domElement);
        }
      }
    };
  }, [fileUrl, fileName]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '400px', backgroundColor: '#0c0f0d', borderRadius: 'var(--md-shape-corner-large)', overflow: 'hidden' }}>
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12,15,13,0.85)', zIndex: 10 }}>
          <RotateCw style={{ animation: 'spin 1.5s linear infinite', color: 'var(--md-sys-color-primary)', marginBottom: '0.75rem' }} size={36} />
          <span style={{ fontSize: '0.9rem', color: 'var(--md-sys-color-outline)' }}>Loading 3D Model...</span>
        </div>
      )}
      {error && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0c0f0d', color: 'var(--md-sys-color-error)', padding: '1rem', textAlign: 'center', zIndex: 10 }}>
          <AlertCircle size={36} style={{ marginBottom: '0.75rem' }} />
          <span style={{ fontWeight: '600' }}>{error}</span>
        </div>
      )}
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
