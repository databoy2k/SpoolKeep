import { useState, useEffect, useRef } from 'react';
import {
  Plus, Search, RotateCw, Trash2,
  Nfc, Download, AlertCircle, X,
  Settings, Sun, Moon, Monitor,
  SlidersHorizontal, ChevronDown
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import confetti from 'canvas-confetti';
import JSZip from 'jszip';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js';

// ThreeMFLoader resolves JSZip via the global scope rather than an import — this is required.
window.JSZip = JSZip;

// Import utility functions and components
import { getColorNameFromHex, getColourFamily } from './utils/colorUtils';
import SettingsModal from './components/SettingsModal';
import RfidWriterModal from './components/RfidWriterModal';
import RfidReaderModal from './components/RfidReaderModal';
import Model3DViewer from './components/Model3DViewer';
import UploadPrintFileModal from './components/UploadPrintFileModal';
import EditPrintFileModal from './components/EditPrintFileModal';
import AddColourVersionModal from './components/AddColourVersionModal';
import ModelDetailsModal from './components/ModelDetailsModal';
import PrintFileCard from './components/PrintFileCard';
import SpoolCard from './components/SpoolCard';
import AddEditSpoolModal from './components/AddEditSpoolModal';

export default function App() {
  // Theme State
  const [theme, setTheme] = useState(() => localStorage.getItem('spoolkeep-theme') || 'system');

  useEffect(() => {
    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    localStorage.setItem('spoolkeep-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => {
      if (prev === 'system') return 'light';
      if (prev === 'light') return 'dark';
      return 'system';
    });
  };

  // Current Page State (Spools vs. Print Files)
  const [currentPage, setCurrentPage] = useState(() => localStorage.getItem('spoolkeep-page') || 'spools');
  const touchStartX = useRef(null);
  const slideDir = useRef(null);

  const navigateTo = (page) => {
    if (page === currentPage) return;
    slideDir.current = page === 'files' ? 'right' : 'left';
    setCurrentPage(page);
  };
  useEffect(() => {
    localStorage.setItem('spoolkeep-page', currentPage);
  }, [currentPage]);

  // Print Files State
  const [printFiles, setPrintFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [fileSort, setFileSort] = useState('dateAddedNewest');

  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [stlFile, setStlFile] = useState(null);
  const [threeMfFile, setThreeMfFile] = useState(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadSourceUrl, setUploadSourceUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Edit model metadata modal
  const [isEditPrintFileModalOpen, setIsEditPrintFileModalOpen] = useState(false);
  const [editingPrintFile, setEditingPrintFile] = useState(null);

  // Add colour version modal
  const [isAddCvModalOpen, setIsAddCvModalOpen] = useState(false);
  const [addCvTargetModel, setAddCvTargetModel] = useState(null);

  // Model Details Modal
  const [activeModelDetails, setActiveModelDetails] = useState(null);

  // 3D Viewer Modal
  const [activeViewerModel, setActiveViewerModel] = useState(null);

  // Gemini & Inventory Matching Loading states
  const [recommendingColorsMap, setRecommendingColorsMap] = useState({});
  const [matchingSpoolsMap, setMatchingSpoolsMap] = useState({});

  const [spools, setSpools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSpools, setSelectedSpools] = useState(new Set());

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [filterBrand, setFilterBrand] = useState('All');
  const [sortBy, setSortBy] = useState('colour');
  const [isSpoolFiltersExpanded, setIsSpoolFiltersExpanded] = useState(false);
  const [isFileFiltersExpanded, setIsFileFiltersExpanded] = useState(false);
  const [fileTypeFilter, setFileTypeFilter] = useState('All');

  // Modals
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [editingSpool, setEditingSpool] = useState(null);

  const [isNfcModalOpen, setIsNfcModalOpen] = useState(false);
  const [activeNfcSpool, setActiveNfcSpool] = useState(null);
  const [nfcStatus, setNfcStatus] = useState('idle'); // idle | scanning | success | error
  const [nfcErrorMsg, setNfcErrorMsg] = useState('');

  // RFID Tag Reader Modal States
  const [isRfidReadModalOpen, setIsRfidReadModalOpen] = useState(false);
  const [rfidReadStatus, setRfidReadStatus] = useState('idle'); // idle | scanning | success | notFound | error
  const [rfidReadError, setRfidReadError] = useState('');
  const [rfidReadPayload, setRfidReadPayload] = useState(null);
  const [scannedSpool, setScannedSpool] = useState(null);
  const [highlightedSpoolId, setHighlightedSpoolId] = useState(null);

  // Settings State
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [isEnvOverridden, setIsEnvOverridden] = useState(false);
  const [isNfcSupported, setIsNfcSupported] = useState(false);
  const [td1sEnabled, setTd1sEnabled] = useState(false);
  const [dataFolderSize, setDataFolderSize] = useState(0);
  // RFID data for pre-filling AddEditSpoolModal form
  const [rfidFormData, setRfidFormData] = useState(null);

  // PWA install prompt
  const [installPromptEvent, setInstallPromptEvent] = useState(null);

  // Collapsed colour family groups
  const [collapsedFamilies, setCollapsedFamilies] = useState(new Set());
  const toggleFamily = (family) => setCollapsedFamilies(prev => {
    const next = new Set(prev);
    next.has(family) ? next.delete(family) : next.add(family);
    return next;
  });
  const familiesInitializedRef = useRef(false);
  useEffect(() => {
    if (!familiesInitializedRef.current && spools.length > 0) {
      familiesInitializedRef.current = true;
      if (spools.length > 6) {
        setCollapsedFamilies(new Set(spools.map(s => getColourFamily(s.colourHex || '#7f8c8d'))));
      }
    }
  }, [spools]);

  // Fetch data on mount
  useEffect(() => {
    fetchSpools();
    fetchPrintFiles();
    fetchSettings();
    setIsNfcSupported('NDEFReader' in window);

    const handler = (e) => { e.preventDefault(); setInstallPromptEvent(e); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setInstallPromptEvent(null));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallPwa = async () => {
    if (!installPromptEvent) return;
    installPromptEvent.prompt();
    const { outcome } = await installPromptEvent.userChoice;
    if (outcome === 'accepted') setInstallPromptEvent(null);
  };

  async function fetchSpools() {
    setLoading(true);
    try {
      const response = await fetch('/api/spools');
      const data = await response.json();
      setSpools(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch spools:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchPrintFiles() {
    setLoadingFiles(true);
    try {
      const response = await fetch('/api/print-files');
      const data = await response.json();
      setPrintFiles(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch print files:', error);
    } finally {
      setLoadingFiles(false);
    }
  }

  const handleOpenUploadModal = () => {
    setStlFile(null);
    setThreeMfFile(null);
    setUploadName('');
    setUploadDescription('');
    setUploadSourceUrl('');
    setIsUploadModalOpen(true);
  };

  const handleMarkPrinted = async (id, date = undefined) => {
    try {
      const hasDate = date !== undefined;
      const response = await fetch(`/api/print-files/${id}/last-printed`, {
        method: 'PUT',
        headers: hasDate ? { 'Content-Type': 'application/json' } : {},
        body: hasDate ? JSON.stringify({ date }) : undefined,
      });
      if (response.ok) fetchPrintFiles();
    } catch (error) {
      console.error('Error marking as printed:', error);
    }
  };

  const getFilteredPrintFiles = () => {
    const query = fileSearchQuery.toLowerCase();
    let result = printFiles.filter(f => {
      const matchesQuery = f.name.toLowerCase().includes(query) ||
        (f.description && f.description.toLowerCase().includes(query));
      const matchesType = fileTypeFilter === 'All' ||
        (fileTypeFilter === 'STL' && f.stlFile) ||
        (fileTypeFilter === '3MF' && f.threeMfFile);
      return matchesQuery && matchesType;
    });
    result.sort((a, b) => {
      if (fileSort === 'dateAddedNewest') return new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0);
      if (fileSort === 'dateAddedOldest') return new Date(a.dateAdded || 0) - new Date(b.dateAdded || 0);
      if (fileSort === 'lastPrintedNewest') {
        if (!a.lastPrinted && !b.lastPrinted) return 0;
        if (!a.lastPrinted) return 1;
        if (!b.lastPrinted) return -1;
        return new Date(b.lastPrinted) - new Date(a.lastPrinted);
      }
      if (fileSort === 'lastPrintedOldest') {
        if (!a.lastPrinted && !b.lastPrinted) return 0;
        if (!a.lastPrinted) return 1;
        if (!b.lastPrinted) return -1;
        return new Date(a.lastPrinted) - new Date(b.lastPrinted);
      }
      if (fileSort === 'lastCvNewest') {
        const dA = a.colourVersions?.at(-1)?.date || a.dateAdded || 0;
        const dB = b.colourVersions?.at(-1)?.date || b.dateAdded || 0;
        return new Date(dB) - new Date(dA);
      }
      if (fileSort === 'lastCvOldest') {
        const dA = a.colourVersions?.at(-1)?.date || a.dateAdded || 0;
        const dB = b.colourVersions?.at(-1)?.date || b.dateAdded || 0;
        return new Date(dA) - new Date(dB);
      }
      if (fileSort === 'format3mf') {
        if (a.threeMfFile && !b.threeMfFile) return -1;
        if (!a.threeMfFile && b.threeMfFile) return 1;
        return a.name.localeCompare(b.name);
      }
      if (fileSort === 'formatStl') {
        if (a.stlFile && !b.stlFile) return -1;
        if (!a.stlFile && b.stlFile) return 1;
        return a.name.localeCompare(b.name);
      }
      if (fileSort === 'printedFirst') {
        if (a.lastPrinted && !b.lastPrinted) return -1;
        if (!a.lastPrinted && b.lastPrinted) return 1;
        if (!a.lastPrinted && !b.lastPrinted) return a.name.localeCompare(b.name);
        return new Date(b.lastPrinted) - new Date(a.lastPrinted);
      }
      if (fileSort === 'unprintedFirst') {
        if (!a.lastPrinted && b.lastPrinted) return -1;
        if (a.lastPrinted && !b.lastPrinted) return 1;
        if (!a.lastPrinted && !b.lastPrinted) return a.name.localeCompare(b.name);
        return new Date(b.lastPrinted) - new Date(a.lastPrinted);
      }
      return a.name.localeCompare(b.name);
    });
    return result;
  };

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 80) return;
    navigateTo(delta > 0 ? 'spools' : 'files');
  };

  const handleDeletePrintFile = async (id) => {
    if (!confirm('Are you sure you want to delete this print model? This will delete all its versions on disk and cannot be undone.')) {
      return;
    }
    try {
      const response = await fetch(`/api/print-files/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchPrintFiles();
        if (activeModelDetails && activeModelDetails.id === id) {
          setActiveModelDetails(null);
        }
      } else {
        toast.error('Failed to delete print file.');
      }
    } catch (error) {
      console.error('Error deleting print file:', error);
    }
  };

  const handleRecommendColors = async (modelId) => {
    setRecommendingColorsMap(prev => ({ ...prev, [modelId]: true }));
    try {
      const response = await fetch(`/api/print-files/${modelId}/recommend-colors`, {
        method: 'POST'
      });
      const data = await response.json();
      if (response.ok) {
        fetchPrintFiles();
        if (activeModelDetails && activeModelDetails.id === modelId) {
          setActiveModelDetails(data);
        }
        confetti({ particleCount: 40, spread: 30, colors: ['#337150', '#a9f4c3', '#ffffff'] });
      } else {
        if (data.needsApiKey) {
          if (confirm('Gemini API Key is required for STL color recommendations. Open Settings to add it?')) {
            setIsSettingsModalOpen(true);
          }
        } else {
          toast.error(data.error || 'Failed to generate recommendations.');
        }
      }
    } catch (error) {
      console.error('Error generating color recommendations:', error);
      toast.error('Network error during color recommendation.');
    } finally {
      setRecommendingColorsMap(prev => ({ ...prev, [modelId]: false }));
    }
  };

  const handleMatchSpools = async (modelId, cvId) => {
    setMatchingSpoolsMap(prev => ({ ...prev, [cvId]: true }));
    try {
      const response = await fetch(`/api/print-files/${modelId}/colour-versions/${cvId}/match-spools`, {
        method: 'POST'
      });
      const data = await response.json();
      if (response.ok) {
        fetchPrintFiles();
        if (activeModelDetails?.id === modelId) setActiveModelDetails(data);
      } else {
        toast.error(data.error || 'Failed to match spools.');
      }
    } catch (error) {
      console.error('Error matching spools:', error);
    } finally {
      setMatchingSpoolsMap(prev => ({ ...prev, [cvId]: false }));
    }
  };

  const handleUpdateColourVersion = async (modelId, cvId, patch) => {
    try {
      const response = await fetch(`/api/print-files/${modelId}/colour-versions/${cvId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      });
      const data = await response.json();
      if (response.ok) {
        fetchPrintFiles();
        if (activeModelDetails?.id === modelId) setActiveModelDetails(data);
      } else {
        toast.error(data.error || 'Failed to update colour version.');
      }
    } catch (err) {
      console.error('Error updating colour version:', err);
    }
  };

  const handleDeleteColourVersion = async (modelId, cvId) => {
    try {
      const response = await fetch(`/api/print-files/${modelId}/colour-versions/${cvId}`, { method: 'DELETE' });
      const data = await response.json();
      if (response.ok) {
        fetchPrintFiles();
        if (activeModelDetails?.id === modelId) setActiveModelDetails(data);
      } else {
        toast.error(data.error || 'Failed to delete colour version.');
      }
    } catch (err) {
      console.error('Error deleting colour version:', err);
    }
  };

  const generateThumbnailFromBuffer = async (arrayBuffer, fileName) => {
    return new Promise((resolve) => {
      try {
        const fileExt = fileName.split('.').pop().toLowerCase();
        const width = 300;
        const height = 300;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color('#1d211d'); // MD3 surface-container color

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
        scene.add(ambientLight);
        const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.7);
        dirLight1.position.set(1, 1, 1.5).normalize();
        scene.add(dirLight1);
        const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.35);
        dirLight2.position.set(-1, -1, 1).normalize();
        scene.add(dirLight2);

        let mesh;
        if (fileExt === 'stl') {
          const loader = new STLLoader();
          const geometry = loader.parse(arrayBuffer);
          const material = new THREE.MeshStandardMaterial({
            color: 0x337150,
            roughness: 0.5,
            metalness: 0.1
          });
          mesh = new THREE.Mesh(geometry, material);
          scene.add(mesh);
          renderAndComplete();
        } else if (fileExt === '3mf') {
          const blob = new Blob([arrayBuffer]);
          const url = URL.createObjectURL(blob);
          const loader = new ThreeMFLoader();
          loader.load(url, (group) => {
            URL.revokeObjectURL(url);
            mesh = group;
            mesh.traverse(child => {
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
            scene.add(mesh);
            renderAndComplete();
          }, undefined, (err) => {
            console.error('Failed to parse 3MF thumbnail', err);
            URL.revokeObjectURL(url);
            resolve(null);
          });
        } else {
          resolve(null);
        }

        function renderAndComplete() {
          if (!mesh) {
            resolve(null);
            return;
          }
          const box = new THREE.Box3().setFromObject(mesh);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());

          mesh.position.x -= center.x;
          mesh.position.y -= center.y;
          mesh.position.z -= center.z;

          const maxDim = Math.max(size.x, size.y, size.z);
          const fov = 45;
          const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, maxDim * 10);
          const cameraDist = (maxDim / (2 * Math.tan(Math.PI * fov / 360))) * 1.05;

          camera.position.set(cameraDist * 0.9, cameraDist * 0.7, cameraDist * 1.1);
          camera.lookAt(0, 0, 0);

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
          renderer.setSize(width, height);
          renderer.render(scene, camera);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          renderer.dispose();
          resolve(dataUrl);
        }
      } catch (err) {
        console.error('Error generating 3D thumbnail:', err);
        resolve(null);
      }
    });
  };

  const handleUploadPrintFile = async (e) => {
    e.preventDefault();
    if (!stlFile && !threeMfFile) {
      toast.error('Please select at least one file (STL or 3MF).');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      if (stlFile) formData.append('stlFile', stlFile);
      if (threeMfFile) formData.append('threeMfFile', threeMfFile);
      formData.append('name', uploadName);
      formData.append('description', uploadDescription);
      if (uploadSourceUrl) formData.append('sourceUrl', uploadSourceUrl);

      // Generate client-side thumbnail for STL-only uploads
      if (stlFile && !threeMfFile) {
        const buf = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(stlFile);
        });
        const thumbDataUrl = await generateThumbnailFromBuffer(buf, stlFile.name);
        if (thumbDataUrl) formData.append('thumbnail', thumbDataUrl);
      }

      const response = await fetch('/api/print-files', { method: 'POST', body: formData });
      const data = await response.json();

      if (response.ok) {
        fetchPrintFiles();
        setIsUploadModalOpen(false);
        setStlFile(null);
        setThreeMfFile(null);
        setUploadName('');
        setUploadDescription('');
        setUploadSourceUrl('');

        // Auto-recommend colours for STL-only uploads
        if (stlFile && !threeMfFile) {
          handleRecommendColors(data.id);
        }

        confetti({ particleCount: 60, spread: 45, colors: ['#337150', '#ffffff'] });
      } else {
        toast.error(data.error || 'Failed to upload print file.');
      }
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error('Network error while uploading file.');
    } finally {
      setIsUploading(false);
    }
  };


  async function fetchSettings() {
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      setGeminiApiKey(data.geminiApiKey || '');
      setHasGeminiKey(data.hasGeminiKey || false);
      setIsEnvOverridden(data.isEnvOverridden || false);
      if (data.defaultSpoolSort) setSortBy(data.defaultSpoolSort);
      if (data.defaultFilesSort) setFileSort(data.defaultFilesSort);
      setTd1sEnabled(data.td1sEnabled || false);
      setDataFolderSize(data.dataFolderSize || 0);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    }
  }

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (geminiApiKey !== '' && !geminiApiKey.startsWith('AIzaSy') && !geminiApiKey.startsWith('AQ.') && geminiApiKey !== 'AIzaSyMockKeyForTestingOCR' && !geminiApiKey.includes('...')) {
      if (!confirm("Warning: A valid Gemini API key typically starts with 'AIzaSy' or 'AQ.'. The key you entered does not start with these prefixes. Are you sure you want to save it?")) {
        return;
      }
    }
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geminiApiKey, defaultSpoolSort: sortBy, defaultFilesSort: fileSort, td1sEnabled })
      });
      const data = await response.json();
      if (response.ok) {
        setGeminiApiKey(data.geminiApiKey || '');
        setHasGeminiKey(data.hasGeminiKey || false);
        setIsEnvOverridden(data.isEnvOverridden || false);
        setIsSettingsModalOpen(false);
        toast.success('Settings saved.');
      } else {
        toast.error(data.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Network error while saving settings');
    }
  };

  const handleOpenAddModal = () => {
    setEditingSpool(null);
    setRfidFormData(null);
    setIsAddEditModalOpen(true);
  };

  const handleOpenEditModal = (spool) => {
    setEditingSpool(spool);
    setRfidFormData(null);
    setIsAddEditModalOpen(true);
  };

  const handleDeleteSpool = async (id) => {
    if (!confirm('Are you sure you want to delete this spool? This action cannot be undone.')) {
      return;
    }
    try {
      const response = await fetch(`/api/spools/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchSpools();
        const updated = new Set(selectedSpools);
        updated.delete(id);
        setSelectedSpools(updated);
      }
    } catch (error) {
      console.error('Failed to delete spool:', error);
    }
  };

  const handleUpdateStock = async (id, nextStock) => {
    try {
      const response = await fetch(`/api/spools/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: nextStock })
      });
      if (response.ok) {
        fetchSpools();
      }
    } catch (error) {
      console.error('Failed to update stock:', error);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedSpools.size === 0) return;
    const confirmMessage = selectedSpools.size === 1
      ? 'Are you sure you want to delete the selected spool?'
      : `Are you sure you want to delete the ${selectedSpools.size} selected spools?`;
    if (!confirm(confirmMessage)) return;

    try {
      const response = await fetch('/api/spools/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedSpools) })
      });
      if (response.ok) {
        fetchSpools();
        setSelectedSpools(new Set());
      } else {
        toast.error('Failed to delete spools in bulk.');
      }
    } catch (error) {
      console.error('Failed to bulk delete spools:', error);
    }
  };

  const handleOpenNfcWriter = (spool) => {
    setActiveNfcSpool(spool);
    setNfcStatus('idle');
    setNfcErrorMsg('');
    setIsNfcModalOpen(true);
  };

  const generateOpenSpoolPayload = (spool) => {
    const payload = {
      protocol: 'openspool',
      version: '1.0',
      id: spool.id,
      type: spool.type,
      color_hex: (spool.colourHex || spool.colorHex || '').replace('#', '').toUpperCase(),
      brand: spool.brand,
      min_temp: String(spool.minTemp),
      max_temp: String(spool.maxTemp),
      bed_min_temp: String(spool.bedMinTemp || 60),
      bed_max_temp: String(spool.bedMaxTemp || 60)
    };
    if (spool.td !== undefined && spool.td !== null) {
      payload.td = String(spool.td);
    }
    return payload;
  };

  const handleWriteNfc = async () => {
    if (!activeNfcSpool) return;
    setNfcStatus('scanning');
    setNfcErrorMsg('');

    try {
      if (!('NDEFReader' in window)) {
        throw new Error('Web NFC is not supported on this browser or device. Please use Chrome on Android, or copy the JSON payload below for manual NFC writer apps.');
      }

      const ndef = new window.NDEFReader();
      await ndef.scan();

      setNfcStatus('writing');
      const payload = generateOpenSpoolPayload(activeNfcSpool);

      await ndef.write({
        records: [{
          recordType: "mime",
          mediaType: "application/json",
          data: new TextEncoder().encode(JSON.stringify(payload))
        }]
      });

      const updateRes = await fetch(`/api/spools/${activeNfcSpool.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfidLinked: true, rfidId: activeNfcSpool.id })
      });

      if (updateRes.ok) {
        fetchSpools();
      }

      setNfcStatus('success');
      confetti({ particleCount: 80, spread: 60, colors: ['#337150', '#ffffff'] });
    } catch (error) {
      console.error('NFC Write Error:', error);
      setNfcStatus('error');
      setNfcErrorMsg(error.message || 'An unknown error occurred.');
    }
  };

  const handleOpenRfidReader = () => {
    setIsRfidReadModalOpen(true);
    setRfidReadStatus('idle');
    setRfidReadError('');
    setRfidReadPayload(null);
    setScannedSpool(null);

    // Auto-scan if Web NFC is supported
    if ('NDEFReader' in window) {
      startRfidReading();
    }
  };

  const startRfidReading = async () => {
    setRfidReadStatus('scanning');
    setRfidReadError('');
    try {
      const ndef = new window.NDEFReader();
      await ndef.scan();

      ndef.addEventListener("reading", ({ message }) => {
        try {
          const record = message.records[0];
          if (!record) {
            throw new Error('NFC Tag is empty or has no records.');
          }

          const textDecoder = new TextDecoder(record.encoding || 'utf-8');
          const jsonText = textDecoder.decode(record.data);
          const payload = JSON.parse(jsonText);

          handleProcessRfidPayload(payload);
        } catch {
          setRfidReadStatus('error');
          setRfidReadError('Failed to parse tag payload. Make sure it is a valid OpenSpool JSON tag.');
        }
      });

      ndef.addEventListener("readingerror", () => {
        setRfidReadStatus('error');
        setRfidReadError('Hardware error: Could not read tag. Try positioning the tag closer to your device.');
      });
    } catch (err) {
      setRfidReadStatus('error');
      setRfidReadError(err.message || 'Web NFC Scanner could not start.');
    }
  };

  const handleProcessRfidPayload = (payload) => {
    if (!payload || typeof payload !== 'object') {
      setRfidReadStatus('error');
      setRfidReadError('Invalid OpenSpool RFID Tag: Make sure the tag contains valid OpenSpool JSON data.');
      return;
    }

    setRfidReadPayload(payload);

    if (payload.id) {
      // Search database for a spool matching ID or rfidId
      const found = spools.find(s => s.id === payload.id || s.rfidId === payload.id);
      if (found) {
        setScannedSpool(found);
        setRfidReadStatus('success');

        // Close modal and focus on the spool
        setTimeout(() => {
          setIsRfidReadModalOpen(false);
          handleSurfaceSpool(found.id);
        }, 1000);
        return;
      }
    }

    setScannedSpool(null);
    setRfidReadStatus('notFound');
  };

  const handleSurfaceSpool = (spoolId) => {
    setFilterType('All');
    setFilterBrand('All');
    setSearchQuery(spoolId);
    setHighlightedSpoolId(spoolId);

    // Confetti effect!
    confetti({ particleCount: 50, spread: 30, colors: ['#337150', '#a9f4c3', '#ffffff'] });

    // Remove glow after 3.5s
    setTimeout(() => {
      setHighlightedSpoolId(null);
    }, 3500);
  };

  const handleSaveRfidSpool = async () => {
    if (!rfidReadPayload) return;

    const colorName = getColorNameFromHex(rfidReadPayload.colour_hex || rfidReadPayload.color_hex);
    // Reuse existing ID if available, otherwise let the backend generate one
    const payload = {
      id: rfidReadPayload.id || undefined,
      name: `${colorName} ${rfidReadPayload.type || 'PLA'}`,
      brand: rfidReadPayload.brand || 'Generic',
      type: rfidReadPayload.type || 'PLA',
      colourHex: (rfidReadPayload.colour_hex || rfidReadPayload.color_hex) ? `#${rfidReadPayload.colour_hex || rfidReadPayload.color_hex}` : '#7f8c8d',
      minTemp: parseInt(rfidReadPayload.min_temp) || 200,
      maxTemp: parseInt(rfidReadPayload.max_temp) || 220,
      bedMinTemp: parseInt(rfidReadPayload.bed_min_temp) || 50,
      bedMaxTemp: parseInt(rfidReadPayload.bed_max_temp) || 60,
      usedPercentage: 0,
      rfidLinked: !!rfidReadPayload.id,
      rfidId: rfidReadPayload.id || null,
      td: rfidReadPayload.td !== undefined && rfidReadPayload.td !== null ? parseFloat(rfidReadPayload.td) : null,
      notes: rfidReadPayload.notes || ""
    };

    try {
      const response = await fetch('/api/spools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const newSpool = await response.json();
        await fetchSpools();

        if (rfidReadPayload.id) {
          // Immediately show success for pre-existing linked RFID tags
          setScannedSpool(newSpool);
          setRfidReadStatus('success');
          setTimeout(() => {
            setIsRfidReadModalOpen(false);
            handleSurfaceSpool(newSpool.id);
          }, 1200);
        } else {
          // Put the generated spool into active memory and transition state for new tags
          setActiveNfcSpool(newSpool);
          setRfidReadStatus('needsWrite');
        }
      } else {
        const errData = await response.json();
        toast.error(errData.error || 'Failed to save imported spool.');
      }
    } catch (error) {
      console.error('Failed to import RFID spool:', error);
      toast.error('Network error while importing RFID spool.');
    }
  };

  const handleApplyRfidToForm = () => {
    if (!rfidReadPayload) return;

    const colorName = getColorNameFromHex(rfidReadPayload.colour_hex || rfidReadPayload.color_hex);
    const formData = {
      name: rfidReadPayload.name || `${colorName} ${rfidReadPayload.type || 'PLA'}`,
      brand: rfidReadPayload.brand || 'Generic',
      type: rfidReadPayload.type || 'PLA',
      colourHex: (rfidReadPayload.colour_hex || rfidReadPayload.color_hex) ? `#${rfidReadPayload.colour_hex || rfidReadPayload.color_hex}` : '#7f8c8d',
      minTemp: String(rfidReadPayload.min_temp || 200),
      maxTemp: String(rfidReadPayload.max_temp || 220),
      bedMinTemp: String(rfidReadPayload.bed_min_temp || 50),
      bedMaxTemp: String(rfidReadPayload.bed_max_temp || 60),
      td: rfidReadPayload.td !== undefined && rfidReadPayload.td !== null ? String(rfidReadPayload.td) : '',
      notes: rfidReadPayload.notes || '',
      rfidLinked: !!rfidReadPayload.id,
      rfidId: rfidReadPayload.id || null
    };

    setRfidFormData(formData);
    setIsRfidReadModalOpen(false);

    // Open the Add/Edit modal if not already open
    if (!isAddEditModalOpen) {
      setEditingSpool(null);
      setIsAddEditModalOpen(true);
    }
  };

  const handleWriteRfidTagFromReader = async () => {
    if (!activeNfcSpool) return;
    setRfidReadStatus('scanning'); // Show scanning layout while writing

    try {
      if (!('NDEFReader' in window)) {
        throw new Error('Web NFC is not supported on this browser or device.');
      }

      const ndef = new window.NDEFReader();
      await ndef.scan();

      const payload = generateOpenSpoolPayload(activeNfcSpool);

      await ndef.write({
        records: [{
          recordType: "mime",
          mediaType: "application/json",
          data: new TextEncoder().encode(JSON.stringify(payload))
        }]
      });

      // Update the database to link the RFID tag now that writing is successful
      const updateRes = await fetch(`/api/spools/${activeNfcSpool.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rfidLinked: true, rfidId: activeNfcSpool.id })
      });

      if (updateRes.ok) {
        await fetchSpools();
      }

      setRfidReadStatus('success');

      // Auto-close after success and highlight the spool
      setTimeout(() => {
        setIsRfidReadModalOpen(false);
        handleSurfaceSpool(activeNfcSpool.id);
      }, 1200);
    } catch (error) {
      console.error('RFID Write Error:', error);
      setRfidReadStatus('error');
      setRfidReadError(error.message || 'An error occurred during tag writing.');
    }
  };

  const exportOrcaSlicerPresets = async (spoolsToExport) => {
    if (spoolsToExport.length === 0) return;

    const zip = new JSZip();
    spoolsToExport.forEach(spool => {
      const cleanName = spool.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const baseType = spool.type.toUpperCase().replace(/\+/g, '');
      let inheritsParent = 'Generic PLA';
      if (baseType.includes('PETG')) inheritsParent = 'Generic PETG';
      else if (baseType.includes('ABS')) inheritsParent = 'Generic ABS';
      else if (baseType.includes('ASA')) inheritsParent = 'Generic ASA';
      else if (baseType.includes('TPU')) inheritsParent = 'Generic TPU';
      else if (baseType.includes('NYLON') || baseType.includes('PA')) inheritsParent = 'Generic PA';
      else if (baseType.includes('PC')) inheritsParent = 'Generic PC';

      let density = '1.24';
      if (baseType.includes('PETG')) density = '1.27';
      else if (baseType.includes('ABS')) density = '1.04';
      else if (baseType.includes('ASA')) density = '1.07';
      else if (baseType.includes('TPU')) density = '1.20';
      else if (baseType.includes('NYLON') || baseType.includes('PA')) density = '1.14';
      else if (baseType.includes('PC')) density = '1.20';

      const minTempNum = Number(spool.minTemp) || 190;
      const maxTempNum = Number(spool.maxTemp) || 220;
      const avgTempNum = Math.round((minTempNum + maxTempNum) / 2);
      const bedMaxTempNum = Number(spool.bedMaxTemp) || 60;

      // Per-material cooling/fan overrides. OrcaSlicer's generic base profiles inherit
      // aggressive defaults that hurt materials like PETG (too much fan = delamination).
      const materialDefaults = {
        PLA:  { fan_min_speed: '35', fan_max_speed: '100', fan_cooling_layer_time: '20', slow_down_layer_time: '8',  slow_down_min_speed: '10' },
        PETG: { fan_min_speed: '20', fan_max_speed: '80',  fan_cooling_layer_time: '20', slow_down_layer_time: '8',  slow_down_min_speed: '10' },
        ABS:  { fan_min_speed: '0',  fan_max_speed: '30',  fan_cooling_layer_time: '20', slow_down_layer_time: '8',  slow_down_min_speed: '10' },
        ASA:  { fan_min_speed: '0',  fan_max_speed: '30',  fan_cooling_layer_time: '20', slow_down_layer_time: '8',  slow_down_min_speed: '10' },
        TPU:  { fan_min_speed: '30', fan_max_speed: '80',  fan_cooling_layer_time: '20', slow_down_layer_time: '8',  slow_down_min_speed: '10' },
        PA:   { fan_min_speed: '0',  fan_max_speed: '30',  fan_cooling_layer_time: '20', slow_down_layer_time: '8',  slow_down_min_speed: '10' },
        PC:   { fan_min_speed: '0',  fan_max_speed: '20',  fan_cooling_layer_time: '20', slow_down_layer_time: '8',  slow_down_min_speed: '10' },
      };
      const materialKey = Object.keys(materialDefaults).find(k =>
        k === 'PA' ? (baseType.includes('PA') || baseType.includes('NYLON')) : baseType.includes(k)
      );
      const cooling = materialDefaults[materialKey] || {};

      const profileName = `${spool.brand} ${spool.name}`;
      const preset = {
        name: profileName,
        from: 'User',
        inherits: inheritsParent,
        version: '2.2.43.2',
        filament_settings_id: [profileName],
        filament_vendor: [spool.brand],
        filament_type: [spool.type],
        default_filament_colour: [spool.colourHex || spool.colorHex],
        compatible_printers: [],
        compatible_printers_condition: '',
        compatible_prints: [],
        compatible_prints_condition: '',
        nozzle_temperature_range_low: [String(minTempNum)],
        nozzle_temperature_range_high: [String(maxTempNum)],
        nozzle_temperature: [String(avgTempNum)],
        nozzle_temperature_initial_layer: [String(avgTempNum)],
        hot_plate_temp: [String(bedMaxTempNum)],
        hot_plate_temp_initial_layer: [String(bedMaxTempNum)],
        textured_plate_temp: [String(bedMaxTempNum)],
        textured_plate_temp_initial_layer: [String(bedMaxTempNum)],
        filament_density: [density],
        ...Object.fromEntries(Object.entries(cooling).map(([k, v]) => [k, [v]])),
      };

      // Filename must match the name field exactly for OrcaSlicer to accept the import
      zip.file(`filament/${profileName}.json`, JSON.stringify(preset, null, 2));
    });

    try {
      const content = await zip.generateAsync({ type: 'blob' });
      const url = window.URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `SpoolKeep_OrcaSlicer_Profiles.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      confetti({ particleCount: 50, spread: 30, colors: ['#337150', '#ffffff'] });

      // Update database status for exported spools
      await Promise.all(spoolsToExport.map(async (spool) => {
        if (!spool.exportedToOrca) {
          await fetch(`/api/spools/${spool.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exportedToOrca: true })
          });
        }
      }));

      fetchSpools();
    } catch (e) {
      console.error('Failed to generate OrcaSlicer profiles:', e);
      toast.error('Failed to generate profiles.');
    }
  };

  const handleBulkExportOrcaSlicer = async () => {
    if (selectedSpools.size === 0) return;
    const spoolsToExport = spools.filter(s => selectedSpools.has(s.id));
    await exportOrcaSlicerPresets(spoolsToExport);
    setSelectedSpools(new Set());
  };



  const handleToggleSelectSpool = (id) => {
    const updated = new Set(selectedSpools);
    if (updated.has(id)) {
      updated.delete(id);
    } else {
      updated.add(id);
    }
    setSelectedSpools(updated);
  };


  const getFilteredSpools = () => {
    let result = [...spools];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.brand.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    }
    if (filterType !== 'All') {
      result = result.filter(s => s.type.toUpperCase().includes(filterType.toUpperCase()));
    }
    if (filterBrand !== 'All') {
      result = result.filter(s => s.brand.toLowerCase() === filterBrand.toLowerCase());
    }
    const FAMILY_ORDER = ['Red', 'Orange', 'Yellow', 'Brown', 'Green', 'Blue', 'Violet', 'White', 'Grey', 'Dark', 'Black'];
    result.sort((a, b) => {
      if (sortBy === 'colour') {
        const famA = FAMILY_ORDER.indexOf(getColourFamily(a.colourHex || '#7f8c8d'));
        const famB = FAMILY_ORDER.indexOf(getColourFamily(b.colourHex || '#7f8c8d'));
        if (famA !== famB) return famA - famB;
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'brand') return a.brand.localeCompare(b.brand);
      if (sortBy === 'type') return a.type.localeCompare(b.type);
      if (sortBy === 'usedPercentage') return a.usedPercentage - b.usedPercentage;
      if (sortBy === 'dateAddedNewest') {
        return new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0);
      }
      if (sortBy === 'dateAddedOldest') {
        return new Date(a.dateAdded || 0) - new Date(b.dateAdded || 0);
      }
      if (sortBy === 'ageNewest') {
        const isOpenedA = !!a.opened;
        const isOpenedB = !!b.opened;

        if (!isOpenedA && isOpenedB) return -1;
        if (isOpenedA && !isOpenedB) return 1;

        if (!isOpenedA && !isOpenedB) {
          return new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0);
        }

        const dateA = a.dateOpened;
        const dateB = b.dateOpened;

        if (dateA && !dateB) return -1;
        if (!dateA && dateB) return 1;

        if (!dateA && !dateB) {
          return new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0);
        }

        return new Date(dateB) - new Date(dateA);
      }
      if (sortBy === 'ageOldest') {
        const isOpenedA = !!a.opened;
        const isOpenedB = !!b.opened;

        if (!isOpenedA && isOpenedB) return 1;
        if (isOpenedA && !isOpenedB) return -1;

        if (!isOpenedA && !isOpenedB) {
          return new Date(a.dateAdded || 0) - new Date(b.dateAdded || 0);
        }

        const dateA = a.dateOpened;
        const dateB = b.dateOpened;

        if (dateA && !dateB) return 1;
        if (!dateA && dateB) return -1;

        if (!dateA && !dateB) {
          return new Date(a.dateAdded || 0) - new Date(b.dateAdded || 0);
        }

        return new Date(dateA) - new Date(dateB);
      }
      return 0;
    });
    return result;
  };

  const uniqueTypes = ['All', ...new Set(spools.map(s => {
    const base = s.type.toUpperCase().replace(/\+/g, '');
    if (base.includes('PLA')) return 'PLA';
    if (base.includes('PETG')) return 'PETG';
    if (base.includes('ABS')) return 'ABS';
    if (base.includes('ASA')) return 'ASA';
    if (base.includes('TPU')) return 'TPU';
    return base;
  }))];

  const uniqueBrands = ['All', ...new Set(spools.map(s => s.brand))];


  const filteredSpools = getFilteredSpools();

  return (
    <div className="app-container" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <Toaster richColors position="bottom-right" />

      {installPromptEvent && (
        <div style={{
          position: 'fixed', bottom: '1.25rem', left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, display: 'flex', alignItems: 'center', gap: '0.75rem',
          backgroundColor: 'var(--md-sys-color-surface-container-high)',
          border: '1px solid var(--md-sys-color-outline-variant)',
          borderRadius: 'var(--md-shape-corner-large)',
          padding: '0.75rem 1rem', boxShadow: 'var(--md-sys-elevation-3)',
          maxWidth: '420px', width: 'calc(100vw - 2.5rem)',
        }}>
          <img src="/icons/icon-192.png" alt="" style={{ width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: '600', fontSize: '0.875rem' }}>Install SpoolKeep</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-outline)', marginTop: '0.1rem' }}>SpoolKeep operates best as a PWA installed on your desktop. Install it to integrate it into your system and ensure easy access to it.</div>
          </div>
          <button className="btn btn-primary" style={{ flexShrink: 0, padding: '0.4rem 0.9rem', fontSize: '0.8rem' }} onClick={handleInstallPwa}>Install</button>
          <button onClick={() => setInstallPromptEvent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--md-sys-color-outline)', padding: '0.25rem', flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header */}
      <header>
        <div className="logo-section">
          <img
            src={(theme === 'light') ? '/icons/logo-wordmark-light.png' : '/icons/logo-wordmark-dark.png'}
            alt="SpoolKeep"
            style={{ height: '45px', width: 'auto' }}
          />
          {/* Page Tabs */}
          <div className="nav-tabs" style={{ display: 'flex', gap: '0.25rem', backgroundColor: 'var(--md-sys-color-surface-container-high)', padding: '0.25rem', borderRadius: 'var(--md-shape-corner-full)', border: '1px solid var(--md-sys-color-outline-variant)', marginLeft: '1.5rem' }}>
            <button
              className={`nav-tab-btn ${currentPage === 'spools' ? 'active' : ''}`}
              onClick={() => navigateTo('spools')}
              style={{
                padding: '0.4rem 1.15rem',
                borderRadius: 'var(--md-shape-corner-full)',
                fontSize: '0.85rem',
                fontWeight: '600',
                border: 'none',
                background: currentPage === 'spools' ? 'var(--md-sys-color-primary)' : 'none',
                color: currentPage === 'spools' ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-outline)',
                cursor: 'pointer',
                transition: 'var(--transition-m3)'
              }}
            >
              Spools
            </button>
            <button
              className={`nav-tab-btn ${currentPage === 'files' ? 'active' : ''}`}
              onClick={() => navigateTo('files')}
              style={{
                padding: '0.4rem 1.15rem',
                borderRadius: 'var(--md-shape-corner-full)',
                fontSize: '0.85rem',
                fontWeight: '600',
                border: 'none',
                background: currentPage === 'files' ? 'var(--md-sys-color-primary)' : 'none',
                color: currentPage === 'files' ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-outline)',
                cursor: 'pointer',
                transition: 'var(--transition-m3)'
              }}
            >
              Print Files
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary btn-icon-only"
            style={{ width: '40px', height: '40px', borderRadius: '50%' }}
            onClick={toggleTheme}
            title={`Theme: ${theme.charAt(0).toUpperCase() + theme.slice(1)} (Click to toggle)`}
            aria-label="Toggle theme"
          >
            {theme === 'system' && <Monitor size={18} />}
            {theme === 'light' && <Sun size={18} />}
            {theme === 'dark' && <Moon size={18} />}
          </button>
          <button
            className="btn btn-secondary btn-icon-only"
            style={{ width: '40px', height: '40px', borderRadius: '50%' }}
            onClick={() => setIsSettingsModalOpen(true)}
            title="Settings & Statistics"
          >
            <Settings size={18} />
          </button>
          {currentPage === 'spools' && (
            <button
              className="btn btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                opacity: isNfcSupported ? 1 : 0.5,
                cursor: isNfcSupported ? 'pointer' : 'not-allowed'
              }}
              onClick={handleOpenRfidReader}
              disabled={!isNfcSupported}
              title={isNfcSupported ? "Read OpenSpool RFID Tag" : "Web NFC is not supported on this device/browser"}
            >
              <Nfc size={18} />
              Read Tag
            </button>
          )}
          {currentPage === 'spools' ? (
            <button className="btn btn-primary" onClick={handleOpenAddModal}>
              <Plus size={18} />
              Add Spool
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => handleOpenUploadModal()}>
              <Plus size={18} />
              Add File
            </button>
          )}
        </div>
      </header>

      <div key={currentPage} className={slideDir.current ? `page-slide-from-${slideDir.current}` : undefined}>
        {currentPage === 'spools' ? (
          <>
            {/* Filters & Controls */}
            <section className="controls-bar" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', width: '100%' }}>
                <div className="search-container" style={{ flex: 1, minWidth: 0 }}>
                  <Search className="search-icon" size={18} />
                  <input
                    type="text"
                    placeholder="Search spools by name, brand, or material..."
                    className="search-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className={`filter-toggle-btn ${isSpoolFiltersExpanded ? 'active' : ''}`}
                  onClick={() => setIsSpoolFiltersExpanded(!isSpoolFiltersExpanded)}
                  title="Toggle filters"
                >
                  <SlidersHorizontal size={20} />
                </button>
              </div>

              {isSpoolFiltersExpanded && (
                <div className="filter-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem', animation: 'modalInM3 0.2s cubic-bezier(0.2, 0, 0, 1)' }}>
                  <select
                    className="filter-select"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                  >
                    <option value="All">All Types</option>
                    {uniqueTypes.filter(t => t !== 'All').map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>

                  <select
                    className="filter-select"
                    value={filterBrand}
                    onChange={(e) => setFilterBrand(e.target.value)}
                  >
                    <option value="All">All Brands</option>
                    {uniqueBrands.filter(b => b !== 'All').map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>

                  <select
                    className="filter-select"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                  >
                    <option value="colour">Sort by Colour</option>
                    <option value="name">Sort by Name</option>
                    <option value="brand">Sort by Brand</option>
                    <option value="type">Sort by Type</option>
                    <option value="usedPercentage">Sort by Usage %</option>
                    <option value="dateAddedNewest">Date Added (Newest)</option>
                    <option value="dateAddedOldest">Date Added (Oldest)</option>
                    <option value="ageNewest">Age of Spool (Newest / Unopened first)</option>
                    <option value="ageOldest">Age of Spool (Oldest first)</option>
                  </select>
                </div>
              )}
            </section>

            {/* Selection controls */}
            {filteredSpools.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', paddingLeft: '0.75rem', flexWrap: 'wrap' }}>
                <select
                  className="filter-select"
                  style={{ width: 'auto', minWidth: '100px' }}
                  value=""
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'all') setSelectedSpools(new Set(filteredSpools.map(s => s.id)));
                    else if (val === 'unexported') setSelectedSpools(new Set(filteredSpools.filter(s => !s.exportedToOrca).map(s => s.id)));
                    else if (val === 'clear') setSelectedSpools(new Set());
                    e.target.value = '';
                  }}
                >
                  <option value="" disabled>Select</option>
                  <option value="all">All Listed</option>
                  <option value="unexported">Unexported</option>
                  <option value="clear">Clear</option>
                </select>
                {sortBy === 'colour' && (
                  <>
                    <button
                      type="button"
                      className="select-option-btn"
                      onClick={() => setCollapsedFamilies(new Set(filteredSpools.map(s => getColourFamily(s.colourHex || '#7f8c8d'))))}
                    >
                      Collapse All
                    </button>
                    <button
                      type="button"
                      className="select-option-btn"
                      onClick={() => setCollapsedFamilies(new Set())}
                    >
                      Expand All
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Spool Cards Grid */}
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                <RotateCw className="logo-icon" style={{ animation: 'spin 2s linear infinite', color: 'var(--md-sys-color-primary)' }} size={40} />
              </div>
            ) : filteredSpools.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 2rem' }} className="spool-card">
                <AlertCircle size={40} style={{ color: 'var(--md-sys-color-outline)', margin: '0 auto 1rem auto' }} />
                <h3>No Filament Spools Found</h3>
                <p style={{ color: 'var(--md-sys-color-outline)', marginTop: '0.5rem' }}>
                  Try adjusting your search filters or add a new spool to get started!
                </p>
              </div>
            ) : (
              <section className="spool-grid">
                {sortBy === 'colour' ? (() => {
                  const FAMILY_SWATCHES = {
                    Red: '#e84118', Orange: '#e67e22', Yellow: '#f1c40f',
                    Green: '#44bd32', Blue: '#0097e6', Brown: '#573a00',
                    Violet: '#da1d91b9', White: '#ffffffff', Grey: '#718093',
                    Dark: '#023b0c88', Black: '#000000ff'
                  };
                  const groups = [];
                  for (const spool of filteredSpools) {
                    const fam = getColourFamily(spool.colourHex || '#7f8c8d');
                    const last = groups[groups.length - 1];
                    if (last?.family === fam) last.spools.push(spool);
                    else groups.push({ family: fam, spools: [spool] });
                  }
                  return groups.flatMap(({ family, spools: gs }) => {
                    const collapsed = !searchQuery.trim() && collapsedFamilies.has(family);
                    return [
                      <div key={`h-${family}`}
                        onClick={() => toggleFamily(family)}
                        style={{
                          gridColumn: '1 / -1',
                          display: 'flex', alignItems: 'center', gap: '0.6rem',
                          padding: '0.4rem 0.25rem',
                          borderBottom: '1px solid var(--md-sys-color-outline-variant)',
                          marginTop: '0.5rem', cursor: 'pointer', userSelect: 'none',
                        }}>
                        <div style={{
                          width: '14px', height: '14px', borderRadius: '50%',
                          backgroundColor: FAMILY_SWATCHES[family] || '#7f8c8d',
                          border: '1px solid var(--md-sys-color-outline-variant)',
                          flexShrink: 0
                        }} />
                        <span style={{ fontWeight: '600', fontSize: '0.8rem', color: 'var(--md-sys-color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {family}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-outline)' }}>
                          ({gs.length})
                        </span>
                        <ChevronDown size={14} style={{ marginLeft: 'auto', color: 'var(--md-sys-color-outline)', transition: 'transform 0.2s', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
                      </div>,
                      ...(!collapsed ? gs.map(spool => (
                        <SpoolCard
                          key={spool.id}
                          spool={spool}
                          isSelected={selectedSpools.has(spool.id)}
                          isNfcSupported={isNfcSupported}
                          highlightedSpoolId={highlightedSpoolId}
                          onToggleSelect={() => handleToggleSelectSpool(spool.id)}
                          onEdit={() => handleOpenEditModal(spool)}
                          onDelete={() => handleDeleteSpool(spool.id)}
                          onUpdateStock={(nextStock) => handleUpdateStock(spool.id, nextStock)}
                          onOpenNfcWriter={() => handleOpenNfcWriter(spool)}
                        />
                      )) : [])
                    ];
                  });
                })() : filteredSpools.map(spool => (
                  <SpoolCard
                    key={spool.id}
                    spool={spool}
                    isSelected={selectedSpools.has(spool.id)}
                    isNfcSupported={isNfcSupported}
                    highlightedSpoolId={highlightedSpoolId}
                    onToggleSelect={() => handleToggleSelectSpool(spool.id)}
                    onEdit={() => handleOpenEditModal(spool)}
                    onDelete={() => handleDeleteSpool(spool.id)}
                    onUpdateStock={(nextStock) => handleUpdateStock(spool.id, nextStock)}
                    onOpenNfcWriter={() => handleOpenNfcWriter(spool)}
                  />
                ))}
              </section>
            )}
          </>
        ) : (
          <>
            {/* Filters & Controls for Print Files */}
            <section className="controls-bar" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', width: '100%' }}>
                <div className="search-container" style={{ flex: 1, minWidth: 0 }}>
                  <Search className="search-icon" size={18} />
                  <input
                    type="text"
                    placeholder="Search files by name or description..."
                    className="search-input"
                    value={fileSearchQuery}
                    onChange={(e) => setFileSearchQuery(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className={`filter-toggle-btn ${isFileFiltersExpanded ? 'active' : ''}`}
                  onClick={() => setIsFileFiltersExpanded(!isFileFiltersExpanded)}
                  title="Toggle file filters"
                >
                  <SlidersHorizontal size={20} />
                </button>
              </div>

              {isFileFiltersExpanded && (
                <div className="filter-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem', animation: 'modalInM3 0.2s cubic-bezier(0.2, 0, 0, 1)' }}>
                  <select
                    className="filter-select"
                    value={fileTypeFilter}
                    onChange={(e) => setFileTypeFilter(e.target.value)}
                  >
                    <option value="All">All Formats</option>
                    <option value="STL">STL</option>
                    <option value="3MF">3MF</option>
                  </select>
                  <select
                    className="filter-select"
                    value={fileSort}
                    onChange={(e) => setFileSort(e.target.value)}
                  >
                    <option value="dateAddedNewest">Date Added (Newest)</option>
                    <option value="dateAddedOldest">Date Added (Oldest)</option>
                    <option value="lastPrintedNewest">Last Printed (Newest)</option>
                    <option value="lastPrintedOldest">Last Printed (Oldest)</option>
                    <option value="lastCvNewest">Colour Version (Newest)</option>
                    <option value="lastCvOldest">Colour Version (Oldest)</option>
                    <option value="format3mf">Format (3MF first)</option>
                    <option value="formatStl">Format (STL first)</option>
                    <option value="printedFirst">Printed first</option>
                    <option value="unprintedFirst">Unprinted first</option>
                    <option value="name">Name (A–Z)</option>
                  </select>
                </div>
              )}
            </section>

            {/* Print Files Catalog Grid */}
            {loadingFiles ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                <RotateCw className="logo-icon" style={{ animation: 'spin 2s linear infinite', color: 'var(--md-sys-color-primary)' }} size={40} />
              </div>
            ) : printFiles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 2rem' }} className="spool-card">
                <AlertCircle size={40} style={{ color: 'var(--md-sys-color-outline)', margin: '0 auto 1rem auto' }} />
                <h3>No Print Files Stored</h3>
                <p style={{ color: 'var(--md-sys-color-outline)', marginTop: '0.5rem' }}>
                  Upload a `.stl` or `.3mf` file to get started!
                </p>
              </div>
            ) : (() => {
              const filteredFiles = getFilteredPrintFiles();
              if (filteredFiles.length === 0) return (
                <div style={{ textAlign: 'center', padding: '4rem 2rem' }} className="spool-card">
                  <AlertCircle size={40} style={{ color: 'var(--md-sys-color-outline)', margin: '0 auto 1rem auto' }} />
                  <h3>No Matches Found</h3>
                  <p style={{ color: 'var(--md-sys-color-outline)', marginTop: '0.5rem' }}>Try adjusting your search query.</p>
                </div>
              );
              return (
                <section className="print-file-grid">
                  {filteredFiles.map(file => (
                    <PrintFileCard
                      key={file.id}
                      file={file}
                      onDelete={() => handleDeletePrintFile(file.id)}
                      onEdit={() => { setEditingPrintFile(file); setIsEditPrintFileModalOpen(true); }}
                      onView3D={() => setActiveViewerModel(file)}
                      onViewDetails={() => setActiveModelDetails(file)}
                      onRecommendColors={() => handleRecommendColors(file.id)}
                      onMarkPrinted={(date) => handleMarkPrinted(file.id, date)}
                      recommendingColorsMap={recommendingColorsMap}
                    />
                  ))}
                </section>
              );
            })()
            }
          </>
        )}
      </div>

      {/* Floating Bulk Actions Bar */}
      {selectedSpools.size > 0 && (
        <div className="bulk-bar">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: '700', fontSize: '0.95rem' }}>{selectedSpools.size} Spools Selected</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button className="btn btn-secondary" onClick={() => setSelectedSpools(new Set())}>
              Clear
            </button>
            <button
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--md-sys-color-error)', borderColor: 'var(--md-sys-color-error)' }}
              onClick={handleBulkDelete}
            >
              <Trash2 size={16} />
              Delete
            </button>
            <button className="btn btn-primary" onClick={handleBulkExportOrcaSlicer}>
              <Download size={16} />
              Export Presets (.zip)
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit Spool Modal */}
      <AddEditSpoolModal
        isOpen={isAddEditModalOpen}
        onClose={() => { setIsAddEditModalOpen(false); setRfidFormData(null); }}
        editingSpool={editingSpool}
        rfidFormData={rfidFormData}
        td1sEnabled={td1sEnabled}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onSaveSuccess={(savedSpool, shouldPromptRfid) => {
          fetchSpools();
          setIsAddEditModalOpen(false);
          setRfidFormData(null);
          confetti({ particleCount: 60, spread: 40, origin: { y: 0.8 }, colors: ['#337150', '#a9f4c3', '#ffffff'] });

          if (shouldPromptRfid && isNfcSupported) {
            setTimeout(() => {
              const confirmWrite = confirm("You have updated properties that are stored on the physical RFID tag. Would you like to write these updates to the physical tag now?");
              if (confirmWrite) {
                setActiveNfcSpool(savedSpool);
                setNfcStatus('idle');
                setNfcErrorMsg('');
                setIsNfcModalOpen(true);
              }
            }, 600);
          }
        }}
      />

      {/* RFID NFC Writer Dialog */}
      <RfidWriterModal
        isOpen={isNfcModalOpen}
        onClose={() => setIsNfcModalOpen(false)}
        activeNfcSpool={activeNfcSpool}
        nfcStatus={nfcStatus}
        nfcErrorMsg={nfcErrorMsg}
        setNfcStatus={setNfcStatus}
        handleWriteNfc={handleWriteNfc}
        generateOpenSpoolPayload={generateOpenSpoolPayload}
      />

      {/* RFID Tag Reader Dialog */}
      <RfidReaderModal
        isOpen={isRfidReadModalOpen}
        onClose={() => setIsRfidReadModalOpen(false)}
        rfidReadStatus={rfidReadStatus}
        rfidReadError={rfidReadError}
        rfidReadPayload={rfidReadPayload}
        scannedSpool={scannedSpool}
        activeNfcSpool={activeNfcSpool}
        isAddEditModalOpen={isAddEditModalOpen}
        startRfidReading={startRfidReading}
        setRfidReadStatus={setRfidReadStatus}
        handleApplyRfidToForm={handleApplyRfidToForm}
        handleSaveRfidSpool={handleSaveRfidSpool}
        handleWriteRfidTagFromReader={handleWriteRfidTagFromReader}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        geminiApiKey={geminiApiKey}
        setGeminiApiKey={setGeminiApiKey}
        hasGeminiKey={hasGeminiKey}
        isEnvOverridden={isEnvOverridden}
        onSubmit={handleSaveSettings}
        spools={spools}
        printFiles={printFiles}
        defaultSpoolSort={sortBy}
        setDefaultSpoolSort={setSortBy}
        defaultFilesSort={fileSort}
        setDefaultFilesSort={setFileSort}
        td1sEnabled={td1sEnabled}
        setTd1sEnabled={setTd1sEnabled}
        dataFolderSize={dataFolderSize}
      />

      <ModelDetailsModal
        model={activeModelDetails}
        spools={spools}
        onClose={() => setActiveModelDetails(null)}
        onEditDetails={() => {
          setEditingPrintFile(activeModelDetails);
          setIsEditPrintFileModalOpen(true);
        }}
        onAddColourVersion={() => {
          setAddCvTargetModel(activeModelDetails);
          setIsAddCvModalOpen(true);
        }}
        onMatchSpools={handleMatchSpools}
        matchingSpoolsMap={matchingSpoolsMap}
        onRecommendColors={handleRecommendColors}
        recommendingColorsMap={recommendingColorsMap}
        onUpdateColourVersion={handleUpdateColourVersion}
        onDeleteColourVersion={handleDeleteColourVersion}
      />

      <EditPrintFileModal
        isOpen={isEditPrintFileModalOpen}
        onClose={() => { setIsEditPrintFileModalOpen(false); setEditingPrintFile(null); }}
        model={editingPrintFile}
        onSaved={(updated) => {
          fetchPrintFiles();
          if (activeModelDetails?.id === updated.id) setActiveModelDetails(updated);
        }}
      />

      <AddColourVersionModal
        isOpen={isAddCvModalOpen}
        onClose={() => { setIsAddCvModalOpen(false); setAddCvTargetModel(null); }}
        model={addCvTargetModel}
        spools={spools}
        onAdded={(updated) => {
          fetchPrintFiles();
          if (activeModelDetails?.id === updated.id) setActiveModelDetails(updated);
          confetti({ particleCount: 40, spread: 30, colors: ['#337150', '#ffffff'] });
        }}
      />

      {/* 3D Model Viewer Modal */}
      {activeViewerModel && (
        <div className="modal-overlay" onClick={() => setActiveViewerModel(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '750px', width: '90%' }}>
            <div className="modal-header">
              <h2>3D Preview: {activeViewerModel.name}</h2>
              <button className="modal-close" onClick={() => setActiveViewerModel(null)} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              {(activeViewerModel.stlFile || activeViewerModel.threeMfFile) ? (
                <Model3DViewer
                  fileUrl={`/api/print-files/download/${activeViewerModel.id}/${activeViewerModel.threeMfFile ? '3mf' : 'stl'}`}
                  fileName={(activeViewerModel.threeMfFile || activeViewerModel.stlFile)?.fileName}
                />
              ) : (
                <p>No model file available to render.</p>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: '1.25rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-outline)' }}>
                Drag to rotate. Scroll to zoom. Right-click drag to pan.
              </span>
              <button type="button" className="btn btn-secondary" onClick={() => setActiveViewerModel(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Print File Modal */}
      <UploadPrintFileModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        stlFile={stlFile}
        setStlFile={setStlFile}
        threeMfFile={threeMfFile}
        setThreeMfFile={setThreeMfFile}
        uploadName={uploadName}
        setUploadName={setUploadName}
        uploadDescription={uploadDescription}
        setUploadDescription={setUploadDescription}
        uploadSourceUrl={uploadSourceUrl}
        setUploadSourceUrl={setUploadSourceUrl}
        isUploading={isUploading}
        onSubmit={handleUploadPrintFile}
      />
    </div>
  );
}
