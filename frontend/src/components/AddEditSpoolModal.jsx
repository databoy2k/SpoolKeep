import { useState, useEffect, useRef } from 'react';
import {
  X, Sparkles, Camera, Nfc, RotateCw, Trash2, Sliders
} from 'lucide-react';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { hexToHsl, hslToHex } from '../utils/colorUtils';
import { parseTd1sData, parseCsvString } from '../utils/td1sParser';

export default function AddEditSpoolModal({
  isOpen,
  onClose,
  editingSpool,
  onOpenSettings,
  onSaveSuccess,
  rfidFormData,
  td1sEnabled = false,
  profileDbEnabled = false
}) {
  // Form State
  const [formName, setFormName] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formType, setFormType] = useState('PLA');
  const [formColourHex, setFormColourHex] = useState('#337150');

  // Custom Color Picker popover HSL values
  const [popoverH, setPopoverH] = useState(148);
  const [popoverS, setPopoverS] = useState(38);
  const [popoverL, setPopoverL] = useState(32);

  const [formMinTemp, setFormMinTemp] = useState('190');
  const [formMaxTemp, setFormMaxTemp] = useState('220');
  const [formBedMinTemp, setFormBedMinTemp] = useState('50');
  const [formBedMaxTemp, setFormBedMaxTemp] = useState('60');
  const [formUsedPercentage, setFormUsedPercentage] = useState('0');
  const [formExportedToOrca, setFormExportedToOrca] = useState(false);
  const [formNotes, setFormNotes] = useState('');
  const [formTd, setFormTd] = useState('');
  const [formStock, setFormStock] = useState('1');
  const [formRfidLinked, setFormRfidLinked] = useState(false);
  const [formRfidId, setFormRfidId] = useState(null);
  const [formOpened, setFormOpened] = useState(false);
  const [formDateOpened, setFormDateOpened] = useState('');
  const [formNetWeight, setFormNetWeight] = useState('1000');

  // SimplyPrint profile database cross-reference
  const [profileMatch, setProfileMatch] = useState(null);
  const [profileMatchLoading, setProfileMatchLoading] = useState(false);
  const [showProfilePanel, setShowProfilePanel] = useState(false);

  // Show color popover state
  const [showColorPopover, setShowColorPopover] = useState(false);

  // Spectrometer / TD1s state
  const [td1sConnected, setTd1sConnected] = useState(false);
  const [td1sListening, setTd1sListening] = useState(false);
  const [td1sStatusText, setTd1sStatusText] = useState('TD1s Disconnected');

  // Weight Calculator State
  const [showWeightCalc, setShowWeightCalc] = useState(false);
  const [measuredWeight, setMeasuredWeight] = useState('');
  const [emptySpoolWeight, setEmptySpoolWeight] = useState('250');
  const [startingWeight, setStartingWeight] = useState('1000');
  const [weightUnit, setWeightUnit] = useState('g');

  // Scraping & Open Filament DB
  const [autofillTab, setAutofillTab] = useState('scrape'); // scrape | ofdb | websearch
  const [isAutofillExpanded, setIsAutofillExpanded] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapedData, setScrapedData] = useState(null);
  const [showMergePanel, setShowMergePanel] = useState(false);
  const [mergeSelections, setMergeSelections] = useState({});

  // OFDB State
  const [ofdbBrands, setOfdbBrands] = useState([]);
  const [ofdbLoading, setOfdbLoading] = useState(false);
  const [ofdbSearch, setOfdbSearch] = useState('');

  const [selectedBrand, setSelectedBrand] = useState(null); // { name, slug }
  const [brandMaterials, setBrandMaterials] = useState([]); // [{ material, slug, filament_count }]
  const [selectedMaterial, setSelectedMaterial] = useState(null); // { material, slug }
  const [materialFilaments, setMaterialFilaments] = useState([]); // [{ name, slug, variant_count }]
  const [selectedFilament, setSelectedFilament] = useState(null); // { name, slug }
  const [filamentDetails, setFilamentDetails] = useState(null); // full filament variant object

  const [ofdbMode, setOfdbMode] = useState('drilldown'); // drilldown | global
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState([]);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);

  // Web Search State
  const [webSearchQuery, setWebSearchQuery] = useState('');
  const [webSearchResults, setWebSearchResults] = useState([]);
  const [webSearchLoading, setWebSearchLoading] = useState(false);

  // Photo OCR State
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);

  // Connection references
  const usbDeviceRef = useRef(null);
  const usbReadLoopActiveRef = useRef(false);
  const serialPortRef = useRef(null);
  const serialReadLoopActiveRef = useRef(false);
  const usbStringBufferRef = useRef('');
  const midiAccessRef = useRef(null);
  const midiInputRef = useRef(null);

  const td1sListeningRef = useRef(td1sListening);
  useEffect(() => {
    td1sListeningRef.current = td1sListening;
  }, [td1sListening]);

  // HSL picker color synchronization
  useEffect(() => {
    let val = formColourHex ? formColourHex.trim() : '';
    if (val && !val.startsWith('#')) val = '#' + val;
    if (/^#[0-9A-Fa-f]{6}$/.test(val) || /^#[0-9A-Fa-f]{3}$/.test(val)) {
      const currentHexFromHsl = hslToHex(popoverH, popoverS, popoverL);
      if (val.toLowerCase() !== currentHexFromHsl.toLowerCase()) {
        const { h, s, l } = hexToHsl(val);
        setPopoverH(h);
        setPopoverS(s);
        setPopoverL(l);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formColourHex]);

  // Load and reset form state on edit/add transitions
  useEffect(() => {
    if (!isOpen) {
      cleanupConnections();
      return;
    }

    if (editingSpool) {
      setFormName(editingSpool.name);
      setFormBrand(editingSpool.brand);
      setFormType(editingSpool.type);
      setFormColourHex(editingSpool.colourHex || editingSpool.colorHex);
      setFormMinTemp(String(editingSpool.minTemp));
      setFormMaxTemp(String(editingSpool.maxTemp));
      setFormBedMinTemp(String(editingSpool.bedMinTemp));
      setFormBedMaxTemp(String(editingSpool.bedMaxTemp));
      setFormUsedPercentage(String(editingSpool.usedPercentage));
      setFormExportedToOrca(editingSpool.exportedToOrca || false);
      setFormNotes(editingSpool.notes || '');
      setFormTd(editingSpool.td !== undefined && editingSpool.td !== null ? String(editingSpool.td) : '');
      setFormStock(editingSpool.stock !== undefined ? String(editingSpool.stock) : '1');
      setFormRfidLinked(editingSpool.rfidLinked || false);
      setFormRfidId(editingSpool.rfidId || null);
      setFormOpened(editingSpool.opened || false);
      setFormDateOpened(editingSpool.dateOpened || '');
      setFormNetWeight(editingSpool.netWeight !== undefined && editingSpool.netWeight !== null ? String(editingSpool.netWeight) : '1000');
      setStartingWeight(editingSpool.netWeight !== undefined && editingSpool.netWeight !== null ? String(editingSpool.netWeight) : '1000');
    } else {
      setFormName('');
      setFormBrand('');
      setFormType('PLA');
      setFormColourHex('#337150');
      setFormMinTemp('190');
      setFormMaxTemp('220');
      setFormBedMinTemp('50');
      setFormBedMaxTemp('60');
      setFormUsedPercentage('0');
      setFormExportedToOrca(false);
      setFormNotes('');
      setFormTd('');
      setFormStock('1');
      setFormRfidLinked(false);
      setFormRfidId(null);
      setFormOpened(false);
      setFormDateOpened('');
      setFormNetWeight('1000');
      setStartingWeight('1000');
    }

    // Reset helper states
    setScrapeUrl('');
    setScrapedData(null);
    setShowMergePanel(false);
    setSelectedBrand(null);
    setBrandMaterials([]);
    setSelectedMaterial(null);
    setMaterialFilaments([]);
    setSelectedFilament(null);
    setFilamentDetails(null);
    setOfdbSearch('');
    setOfdbMode('drilldown');
    setGlobalSearchQuery('');
    setGlobalSearchResults([]);
    setWebSearchQuery('');
    setWebSearchResults([]);
    setOcrResult(null);
    setOcrLoading(false);
    setShowWeightCalc(false);
    setMeasuredWeight('');
    setEmptySpoolWeight('250');
    setStartingWeight('1000');
    setWeightUnit('g');
    setAutofillTab('scrape');
    setIsAutofillExpanded(false);
    setShowColorPopover(false);

    // Initial check for paired spectrometer
    initializeSpectrometer();
    fetchOfdbBrands();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingSpool]);

  // Look the spool up in the SimplyPrint profile database. Debounced because it
  // re-runs on every keystroke in the brand / name fields.
  useEffect(() => {
    if (!isOpen || !profileDbEnabled || !formBrand.trim() || !formName.trim()) {
      setProfileMatch(null);
      return undefined;
    }
    setProfileMatchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          brand: formBrand, name: formName, type: formType,
          minTemp: formMinTemp, maxTemp: formMaxTemp, bedMaxTemp: formBedMaxTemp
        });
        const response = await fetch(`/api/profile-db/match?${params}`);
        setProfileMatch(response.ok ? await response.json() : null);
      } catch {
        setProfileMatch(null);
      } finally {
        setProfileMatchLoading(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [isOpen, profileDbEnabled, formBrand, formName, formType, formMinTemp, formMaxTemp, formBedMaxTemp]);

  // Apply RFID pre-fill data when received from parent
  useEffect(() => {
    if (rfidFormData && isOpen) {
      if (rfidFormData.name !== undefined) setFormName(rfidFormData.name);
      if (rfidFormData.brand !== undefined) setFormBrand(rfidFormData.brand);
      if (rfidFormData.type !== undefined) setFormType(rfidFormData.type);
      if (rfidFormData.colourHex !== undefined) setFormColourHex(rfidFormData.colourHex);
      if (rfidFormData.minTemp !== undefined) setFormMinTemp(String(rfidFormData.minTemp));
      if (rfidFormData.maxTemp !== undefined) setFormMaxTemp(String(rfidFormData.maxTemp));
      if (rfidFormData.bedMinTemp !== undefined) setFormBedMinTemp(String(rfidFormData.bedMinTemp));
      if (rfidFormData.bedMaxTemp !== undefined) setFormBedMaxTemp(String(rfidFormData.bedMaxTemp));
      if (rfidFormData.td !== undefined) setFormTd(String(rfidFormData.td));
      if (rfidFormData.notes !== undefined) setFormNotes(rfidFormData.notes);
      if (rfidFormData.rfidLinked !== undefined) setFormRfidLinked(rfidFormData.rfidLinked);
      if (rfidFormData.rfidId !== undefined) setFormRfidId(rfidFormData.rfidId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfidFormData]);

  // Monitor plug/unplug events
  useEffect(() => {
    if (!isOpen) return;

    const handleUsbDisconnect = (event) => {
      if (usbDeviceRef.current && usbDeviceRef.current === event.device) {
        if (import.meta.env.DEV) console.log('TD1s USB disconnected');
        disconnectUsbDevice();
      }
    };

    const handleUsbConnect = (event) => {
      if (event.device.vendorId === 58546) {
        if (import.meta.env.DEV) console.log('TD1s USB plugged in, connecting...');
        connectToUsbDevice(event.device);
      }
    };

    const handleSerialDisconnect = (event) => {
      if (serialPortRef.current && serialPortRef.current === event.target) {
        if (import.meta.env.DEV) console.log('TD1s Serial disconnected');
        disconnectSerialDevice();
      }
    };

    const handleSerialConnect = (event) => {
      const info = event.target.getInfo();
      if (info.usbVendorId === 58546) {
        if (import.meta.env.DEV) console.log('TD1s Serial plugged in, connecting...');
        connectToSerialDevice(event.target);
      }
    };

    if ('usb' in navigator) {
      navigator.usb.addEventListener('disconnect', handleUsbDisconnect);
      navigator.usb.addEventListener('connect', handleUsbConnect);
    }
    if ('serial' in navigator) {
      navigator.serial.addEventListener('disconnect', handleSerialDisconnect);
      navigator.serial.addEventListener('connect', handleSerialConnect);
    }

    return () => {
      if ('usb' in navigator) {
        navigator.usb.removeEventListener('disconnect', handleUsbDisconnect);
        navigator.usb.removeEventListener('connect', handleUsbConnect);
      }
      if ('serial' in navigator) {
        navigator.serial.removeEventListener('disconnect', handleSerialDisconnect);
        navigator.serial.removeEventListener('connect', handleSerialConnect);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // API Methods
  const fetchOfdbBrands = async () => {
    try {
      const response = await fetch('/api/openfilament/brands');
      const data = await response.json();
      if (data && data.brands) {
        setOfdbBrands(data.brands);
      }
    } catch (error) {
      console.error('Failed to fetch OFDB brands:', error);
    }
  };

  const handleFetchBrandDetails = async (slug) => {
    setOfdbLoading(true);
    const brand = ofdbBrands.find(b => b.slug === slug) || { name: slug, slug };
    setSelectedBrand(brand);
    setSelectedMaterial(null);
    setMaterialFilaments([]);
    setSelectedFilament(null);
    setFilamentDetails(null);

    try {
      const response = await fetch(`/api/openfilament/brand/${slug}`);
      const data = await response.json();
      setBrandMaterials(data.materials || []);
    } catch (error) {
      console.error('Failed to fetch brand details:', error);
    } finally {
      setOfdbLoading(false);
    }
  };

  const handleFetchMaterialDetails = async (materialSlug) => {
    setOfdbLoading(true);
    const material = brandMaterials.find(m => m.slug === materialSlug) || { material: materialSlug.toUpperCase(), slug: materialSlug };
    setSelectedMaterial(material);
    setSelectedFilament(null);
    setFilamentDetails(null);

    try {
      const response = await fetch(`/api/openfilament/brand/${selectedBrand.slug}/material/${materialSlug}`);
      const data = await response.json();
      setMaterialFilaments(data.filaments || []);
    } catch (error) {
      console.error('Failed to fetch material details:', error);
    } finally {
      setOfdbLoading(false);
    }
  };

  const handleFetchFilamentDetails = async (filamentSlug) => {
    setOfdbLoading(true);
    const filament = materialFilaments.find(f => f.slug === filamentSlug) || { name: filamentSlug, slug: filamentSlug };
    setSelectedFilament(filament);

    try {
      const response = await fetch(`/api/openfilament/brand/${selectedBrand.slug}/material/${selectedMaterial.slug}/filament/${filamentSlug}`);
      const data = await response.json();
      setFilamentDetails(data);
    } catch (error) {
      console.error('Failed to fetch filament details:', error);
    } finally {
      setOfdbLoading(false);
    }
  };

  const handleSelectOfdbVariant = (variant) => {
    const minNozzle = filamentDetails?.min_print_temperature || 200;
    const maxNozzle = filamentDetails?.max_print_temperature || 220;
    const minBed = filamentDetails?.min_bed_temperature || 50;
    const maxBed = filamentDetails?.max_bed_temperature || 60;
    const formattedColour = (variant.colour_hex || variant.color_hex) ? ((variant.colour_hex || variant.color_hex).startsWith('#') ? (variant.colour_hex || variant.color_hex) : `#${variant.colour_hex || variant.color_hex}`) : '#337150';

    setFormName(`${variant.name} ${selectedMaterial?.material || 'PLA'}`);
    setFormBrand(selectedBrand?.name || 'Generic');
    setFormType(selectedMaterial?.material || 'PLA');
    setFormColourHex(formattedColour);
    setFormMinTemp(String(minNozzle));
    setFormMaxTemp(String(maxNozzle));
    setFormBedMinTemp(String(minBed));
    setFormBedMaxTemp(String(maxBed));
    setFormTd(variant.td !== undefined && variant.td !== null ? String(variant.td) : '');
    setFormNotes('');

    // Reset OFDB state
    setSelectedBrand(null);
    setBrandMaterials([]);
    setSelectedMaterial(null);
    setMaterialFilaments([]);
    setSelectedFilament(null);
    setFilamentDetails(null);
    setOfdbSearch('');

    setIsAutofillExpanded(false);
  };

  const handleGlobalSearch = async (query) => {
    if (!query) {
      setGlobalSearchResults([]);
      return;
    }
    setGlobalSearchLoading(true);
    try {
      const response = await fetch(`/api/openfilament/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      setGlobalSearchResults(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Global search failed:', error);
    } finally {
      setGlobalSearchLoading(false);
    }
  };

  const handleSelectGlobalResult = (result) => {
    setFormName(`${result.colorName || result.name} ${result.type}`);
    setFormBrand(result.brand);
    setFormType(result.type);
    setFormColourHex(result.colourHex || result.colorHex);
    setFormMinTemp(String(result.minTemp));
    setFormMaxTemp(String(result.maxTemp));
    setFormBedMinTemp(String(result.bedMinTemp));
    setFormBedMaxTemp(String(result.bedMaxTemp));
    setFormTd(result.td !== undefined && result.td !== null ? String(result.td) : '');
    setFormNotes('');

    // Clear states
    setGlobalSearchQuery('');
    setGlobalSearchResults([]);
    setIsAutofillExpanded(false);
  };

  const handleWebSearch = async (e) => {
    if (e) e.preventDefault();
    if (!webSearchQuery) return;
    setWebSearchLoading(true);
    setWebSearchResults([]);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(webSearchQuery)}`);
      const data = await response.json();
      if (response.ok) {
        setWebSearchResults(data);
      } else {
        toast.error(data.error || 'Web search failed.');
      }
    } catch (error) {
      console.error('Web search error:', error);
      toast.error('Network error during web search.');
    } finally {
      setWebSearchLoading(false);
    }
  };

  const handleScrapeFromSearch = async (url) => {
    setAutofillTab('scrape');
    setScrapeUrl(url);
    setScraping(true);
    setScrapedData(null);
    setShowMergePanel(false);
    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await response.json();
      if (response.ok) {
        setScrapedData(data);
        const initialSelections = {};
        Object.keys(data).forEach(key => {
          initialSelections[key] = 'scraped';
        });
        setMergeSelections(initialSelections);
        setShowMergePanel(true);
      } else {
        toast.error(data.error || 'Failed to scrape URL.');
      }
    } catch (error) {
      console.error('Scraping error:', error);
      toast.error('Network error while trying to scrape website.');
    } finally {
      setScraping(false);
    }
  };

  const handleScrapeUrl = async () => {
    if (!scrapeUrl) return;
    setScraping(true);
    setScrapedData(null);
    setShowMergePanel(false);
    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: scrapeUrl })
      });
      const data = await response.json();
      if (response.ok) {
        setScrapedData(data);
        const initialSelections = {};
        Object.keys(data).forEach(key => {
          initialSelections[key] = 'scraped';
        });
        setMergeSelections(initialSelections);
        setShowMergePanel(true);
      } else {
        toast.error(data.error || 'Failed to scrape URL.');
      }
    } catch (error) {
      console.error('Scraping error:', error);
      toast.error('Network error while trying to scrape website.');
    } finally {
      setScraping(false);
    }
  };

  const applyMergeSelections = () => {
    if (!scrapedData) return;
    if (mergeSelections.name === 'scraped') setFormName(scrapedData.name);
    if (mergeSelections.brand === 'scraped') setFormBrand(scrapedData.brand);
    if (mergeSelections.type === 'scraped') setFormType(scrapedData.type);
    if (mergeSelections.colourHex === 'scraped') setFormColourHex(scrapedData.colourHex || scrapedData.colorHex);
    if (mergeSelections.minTemp === 'scraped') setFormMinTemp(String(scrapedData.minTemp));
    if (mergeSelections.maxTemp === 'scraped') setFormMaxTemp(String(scrapedData.maxTemp));
    if (mergeSelections.bedMinTemp === 'scraped') setFormBedMinTemp(String(scrapedData.bedMinTemp));
    if (mergeSelections.bedMaxTemp === 'scraped') setFormBedMaxTemp(String(scrapedData.bedMaxTemp));
    if (mergeSelections.td === 'scraped') setFormTd(scrapedData.td !== null && scrapedData.td !== undefined ? String(scrapedData.td) : '');
    if (mergeSelections.notes === 'scraped') setFormNotes(scrapedData.notes);

    setShowMergePanel(false);
    setScrapedData(null);
    setScrapeUrl('');
    setIsAutofillExpanded(false);
  };

  const handlePhotoOcr = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAutofillExpanded(true);
    setOcrLoading(true);
    setOcrResult(null);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = reader.result;
      try {
        const response = await fetch('/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Data })
        });
        const data = await response.json();
        if (response.ok) {
          setOcrResult(data);
        } else {
          if (data.needsApiKey) {
            if (confirm('Gemini API Key is required for Photo OCR. Would you like to open Settings to add your key?')) {
              onOpenSettings();
            }
          } else {
            const errorMsg = data.details
              ? `${data.error || 'OCR analysis failed'}: ${data.details}`
              : (data.error || 'OCR analysis failed.');
            toast.error(errorMsg);
          }
        }
      } catch (error) {
        console.error('OCR API error:', error);
        toast.error('Network error while analyzing image.');
      } finally {
        setOcrLoading(false);
        e.target.value = '';
      }
    };
    reader.onerror = () => {
      toast.error('Failed to read image file.');
      setOcrLoading(false);
    };
    reader.readAsDataURL(file);
  };

  // Spectrometer (TD1s) Hardware methods
  function handleMidiMessage(event) {
    if (!td1sListeningRef.current) return;
    const parsed = parseTd1sData(event.data);
    if (parsed) {
      const { tdValue, hexColour } = parsed;
      const cleanHex = hexColour.replace(/[^0-9a-fA-F]/g, '');
      if (cleanHex.length === 6 || cleanHex.length === 3) {
        const formattedColour = `#${cleanHex}`;

        setFormColourHex(formattedColour);
        setFormTd(tdValue);

        confetti({
          particleCount: 30,
          spread: 30,
          colors: [formattedColour, '#ffffff'],
          origin: { y: 0.8 }
        });

        setTd1sListening(false);
        setTd1sStatusText('Tap To Read TD1s');
      }
    }
  }

  function disconnectMidiDevice() {
    if (midiInputRef.current) {
      midiInputRef.current.onmidimessage = null;
      midiInputRef.current = null;
    }
    setTd1sConnected(false);
    setTd1sListening(false);
    setTd1sStatusText('TD1s Disconnected');

  }

  async function connectToMidiDevice(input) {
    midiInputRef.current = input;
    setTd1sConnected(true);
    setTd1sStatusText('Tap To Read TD1s');

    input.onmidimessage = handleMidiMessage;
  }

  async function handleConnectTd1sMidi() {
    if (!('requestMIDIAccess' in navigator)) return false;
    try {
      setTd1sStatusText('Connecting...');
      const midiAccess = await navigator.requestMIDIAccess({ sysex: true });
      midiAccessRef.current = midiAccess;

      midiAccess.onstatechange = (event) => {
        const port = event.port;
        if (port.type === 'input' && (port.name.toLowerCase().includes('td-1') || port.name.toLowerCase().includes('td1'))) {
          if (port.state === 'connected') {
            if (import.meta.env.DEV) console.log('TD-1 MIDI device plugged in');
            connectToMidiDevice(port);
          } else if (port.state === 'disconnected') {
            if (import.meta.env.DEV) console.log('TD-1 MIDI device disconnected');
            disconnectMidiDevice();
          }
        }
      };

      const input = Array.from(midiAccess.inputs.values()).find(i =>
        i.name.toLowerCase().includes('td-1') || i.name.toLowerCase().includes('td1')
      );
      if (input) {
        await connectToMidiDevice(input);
        return true;
      }
      return false;
    } catch (err) {
      console.warn('WebMIDI connection failed:', err);
      return false;
    }
  }

  async function connectToUsbDevice(device) {
    try {
      await device.open();
      if (device.configuration === null) {
        await device.selectConfiguration(1);
      }

      usbDeviceRef.current = device;
  
      startUsbReadLoop(device);
    } catch (err) {
      console.error('Failed to connect to USB device:', err);
      setTd1sConnected(false);
      setTd1sStatusText('Connection Failed');
      usbDeviceRef.current = null;
  
    }
  }

  async function disconnectUsbDevice() {
    usbReadLoopActiveRef.current = false;
    if (usbDeviceRef.current) {
      try {
        await usbDeviceRef.current.close();
      } catch (e) {
        console.warn('Error closing USB device:', e);
      }
      usbDeviceRef.current = null;
    }
    setTd1sConnected(false);
    setTd1sListening(false);
    setTd1sStatusText('TD1s Disconnected');

  }

  async function startUsbReadLoop(device) {
    if (usbReadLoopActiveRef.current) return;
    usbReadLoopActiveRef.current = true;

    let interfaceNumber = 1;
    let endpointNumber = 2;
    try {
      const iface = device.configuration.interfaces.find(i =>
        i.alternates[0] && i.alternates[0].interfaceClass === 10
      );
      if (iface) {
        interfaceNumber = iface.interfaceNumber;
        const alternate = iface.alternates[0];
        const inEndpoint = alternate.endpoints.find(ep => ep.direction === 'in');
        if (inEndpoint) {
          endpointNumber = inEndpoint.endpointNumber;
        }
      }
    } catch (e) {
      console.warn('Error determining CDC interface dynamically:', e);
    }

    if (import.meta.env.DEV) console.log(`Connecting WebUSB: claiming interface ${interfaceNumber}, endpoint ${endpointNumber}`);

    try {
      await device.claimInterface(interfaceNumber);
      setTd1sConnected(true);
      setTd1sStatusText('Tap To Read TD1s');
    } catch (err) {
      console.error('Failed to claim interface:', err);
      setTd1sConnected(false);
      setTd1sStatusText('Connection Failed');
      usbDeviceRef.current = null;
      usbReadLoopActiveRef.current = false;
  
      return;
    }

    usbStringBufferRef.current = '';

    while (usbReadLoopActiveRef.current && usbDeviceRef.current === device) {
      try {
        const result = await device.transferIn(endpointNumber, 64);
        if (result.status === 'ok' && result.data) {
          const dataBytes = new Uint8Array(result.data.buffer, result.data.byteOffset, result.data.byteLength);

          if (dataBytes.length > 0) {
            const decoder = new TextDecoder('utf-8');
            const chunkText = decoder.decode(dataBytes);
            usbStringBufferRef.current += chunkText;

            let newlineIdx;
            while ((newlineIdx = usbStringBufferRef.current.indexOf('\n')) !== -1) {
              const line = usbStringBufferRef.current.slice(0, newlineIdx).trim();
              usbStringBufferRef.current = usbStringBufferRef.current.slice(newlineIdx + 1);

              if (td1sListeningRef.current && line.length > 0) {
                if (line === 'clearScreen') continue;

                const parsed = parseCsvString(line);
                if (parsed) {
                  const { tdValue, hexColour } = parsed;
                  const cleanHex = hexColour.replace(/[^0-9a-fA-F]/g, '');
                  if (cleanHex.length === 6 || cleanHex.length === 3) {
                    const formattedColour = `#${cleanHex}`;

                    setFormColourHex(formattedColour);
                    setFormTd(tdValue);

                    confetti({
                      particleCount: 30,
                      spread: 30,
                      colors: [formattedColour, '#ffffff'],
                      origin: { y: 0.8 }
                    });

                    setTd1sListening(false);
                    setTd1sStatusText('Tap To Read TD1s');
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        if (err.name === 'NotFoundError' || err.name === 'DeviceError' || err.name === 'NetworkError') {
          if (import.meta.env.DEV) console.log('USB transfer loop stopped due to error:', err.message);
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    usbReadLoopActiveRef.current = false;
  }

  async function handleConnectTd1sUsb() {
    if (!('usb' in navigator)) {
      setTd1sStatusText('USB Un-supported');
      return;
    }
    try {
      setTd1sStatusText('Connecting...');
      const device = await navigator.usb.requestDevice({
        filters: [
          { vendorId: 58546 }, // Custom TD1S Vendor ID
          { vendorId: 6790 },  // CH340 / CH341
          { vendorId: 4292 },  // CP210x
          { vendorId: 1027 },  // FTDI
          { vendorId: 1659 }   // PL2303
        ]
      });
      await connectToUsbDevice(device);
    } catch (err) {
      console.warn('WebUSB requestDevice failed/cancelled:', err);
      if (usbDeviceRef.current) {
        setTd1sStatusText('Tap To Read TD1s');
      } else {
        setTd1sStatusText('TD1s Disconnected');
      }
    }
  }

  async function connectToSerialDevice(port) {
    try {
      await port.open({ baudRate: 115200 });
      serialPortRef.current = port;
      setTd1sConnected(true);
      setTd1sStatusText('Tap To Read TD1s');
  
      startSerialReadLoop(port);
    } catch (err) {
      console.error('Failed to open Serial port:', err);
      setTd1sConnected(false);
      setTd1sStatusText('Connection Failed');
      serialPortRef.current = null;
  
    }
  }

  async function disconnectSerialDevice() {
    serialReadLoopActiveRef.current = false;
    if (serialPortRef.current) {
      try {
        await serialPortRef.current.close();
      } catch (e) {
        console.warn('Error closing Serial port:', e);
      }
      serialPortRef.current = null;
    }
    setTd1sConnected(false);
    setTd1sListening(false);
    setTd1sStatusText('TD1s Disconnected');

  }

  async function startSerialReadLoop(port) {
    if (serialReadLoopActiveRef.current) return;
    serialReadLoopActiveRef.current = true;

    usbStringBufferRef.current = '';

    while (serialReadLoopActiveRef.current && serialPortRef.current === port) {
      try {
        const reader = port.readable.getReader();
        try {
          while (serialReadLoopActiveRef.current && serialPortRef.current === port) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value && value.length > 0) {
              const decoder = new TextDecoder('utf-8');
              const chunkText = decoder.decode(value);
              usbStringBufferRef.current += chunkText;

              let newlineIdx;
              while ((newlineIdx = usbStringBufferRef.current.indexOf('\n')) !== -1) {
                const line = usbStringBufferRef.current.slice(0, newlineIdx).trim();
                usbStringBufferRef.current = usbStringBufferRef.current.slice(newlineIdx + 1);

                if (td1sListeningRef.current && line.length > 0) {
                  if (line === 'clearScreen') continue;

                  const parsed = parseCsvString(line);
                  if (parsed) {
                    const { tdValue, hexColour } = parsed;
                    const cleanHex = hexColour.replace(/[^0-9a-fA-F]/g, '');
                    if (cleanHex.length === 6 || cleanHex.length === 3) {
                      const formattedColour = `#${cleanHex}`;

                      setFormColourHex(formattedColour);
                      setFormTd(tdValue);

                      confetti({
                        particleCount: 30,
                        spread: 30,
                        colors: [formattedColour, '#ffffff'],
                        origin: { y: 0.8 }
                      });

                      setTd1sListening(false);
                      setTd1sStatusText('Tap To Read TD1s');
                    }
                  }
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      } catch (err) {
        console.warn('Serial read loop encountered error:', err);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    serialReadLoopActiveRef.current = false;
  }

  async function handleConnectTd1sSerial() {
    if (!('serial' in navigator)) return;
    try {
      setTd1sStatusText('Connecting...');
      const port = await navigator.serial.requestPort({
        filters: [{ usbVendorId: 58546 }]
      });
      await connectToSerialDevice(port);
    } catch (err) {
      console.warn('WebSerial requestPort failed/cancelled:', err);
      if (serialPortRef.current) {
        setTd1sStatusText('Tap To Read TD1s');
      } else {
        setTd1sStatusText('TD1s Disconnected');
      }
    }
  }

  async function handleConnectTd1s() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if ('serial' in navigator && !isMobile) {
      await handleConnectTd1sSerial();
    } else {
      const midiSuccess = await handleConnectTd1sMidi();
      if (!midiSuccess) {
        await handleConnectTd1sUsb();
      }
    }
  }

  function initializeSpectrometer() {
    const checkWebUsbAutoConnect = () => {
      if ('usb' in navigator) {
  
        navigator.usb.getDevices().then(devices => {
          const pairedDevice = devices.find(d => d.vendorId === 58546);
          if (pairedDevice) {
            if (import.meta.env.DEV) console.log('Found already paired USB device, auto-connecting...');
            connectToUsbDevice(pairedDevice);
          }
        }).catch(err => {
          console.warn('Failed to get paired USB devices:', err);
        });
      } else {
        setTd1sStatusText('USB Un-supported');
      }
    };

    const checkWebMidiAutoConnect = () => {
      if ('requestMIDIAccess' in navigator) {
        navigator.requestMIDIAccess({ sysex: true }).then(midiAccess => {
          midiAccessRef.current = midiAccess;
          midiAccess.onstatechange = (event) => {
            const port = event.port;
            if (port.type === 'input' && (port.name.toLowerCase().includes('td-1') || port.name.toLowerCase().includes('td1'))) {
              if (port.state === 'connected') {
                if (import.meta.env.DEV) console.log('TD-1 MIDI device plugged in, auto-connecting...');
                connectToMidiDevice(port);
              } else if (port.state === 'disconnected') {
                if (import.meta.env.DEV) console.log('TD-1 MIDI device disconnected');
                disconnectMidiDevice();
              }
            }
          };

          const input = Array.from(midiAccess.inputs.values()).find(i =>
            i.name.toLowerCase().includes('td-1') || i.name.toLowerCase().includes('td1')
          );
          if (input) {
            if (import.meta.env.DEV) console.log('Found already paired WebMIDI device, auto-connecting...');
            connectToMidiDevice(input);
          } else {
            checkWebUsbAutoConnect();
          }
        }).catch(() => {
          checkWebUsbAutoConnect();
        });
      } else {
        checkWebUsbAutoConnect();
      }
    };

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if ('serial' in navigator && !isMobile) {

      navigator.serial.getPorts().then(ports => {
        const pairedPort = ports.find(p => p.getInfo().usbVendorId === 58546);
        if (pairedPort) {
          if (import.meta.env.DEV) console.log('Found already paired Serial device, auto-connecting...');
          connectToSerialDevice(pairedPort);
        } else {
          checkWebUsbAutoConnect();
        }
      }).catch(() => {
        checkWebUsbAutoConnect();
      });
    } else {
      checkWebMidiAutoConnect();
    }
  }

  async function cleanupConnections() {
    serialReadLoopActiveRef.current = false;
    if (serialPortRef.current) {
      try {
        await serialPortRef.current.close();
      } catch (e) {
        console.warn('Error closing Serial port:', e);
      }
      serialPortRef.current = null;
    }

    usbReadLoopActiveRef.current = false;
    if (usbDeviceRef.current) {
      try {
        await usbDeviceRef.current.close();
      } catch (e) {
        console.warn('Error closing USB device:', e);
      }
      usbDeviceRef.current = null;
    }

    if (midiInputRef.current) {
      midiInputRef.current.onmidimessage = null;
      midiInputRef.current = null;
    }

    setTd1sConnected(false);
    setTd1sListening(false);
    setTd1sStatusText('TD1s Disconnected');

  }

  const handleSaveSpool = async (e) => {
    e.preventDefault();
    const payload = {
      name: formName,
      brand: formBrand,
      type: formType,
      colourHex: formColourHex,
      minTemp: parseInt(formMinTemp),
      maxTemp: parseInt(formMaxTemp),
      bedMinTemp: parseInt(formBedMinTemp),
      bedMaxTemp: parseInt(formBedMaxTemp),
      usedPercentage: parseInt(formUsedPercentage),
      netWeight: parseFloat(formNetWeight) > 0 ? parseFloat(formNetWeight) : 1000,
      exportedToOrca: formExportedToOrca,
      td: formTd !== '' ? parseFloat(formTd) : null,
      notes: formNotes,
      stock: parseInt(formStock) || 1,
      rfidLinked: formRfidLinked,
      rfidId: formRfidId,
      opened: formOpened,
      dateOpened: formOpened ? (formDateOpened || null) : null
    };

    let shouldPromptRfid = false;
    if (editingSpool && editingSpool.rfidLinked) {
      const origColor = (editingSpool.colourHex || editingSpool.colorHex || '').trim().toLowerCase();
      const newColor = (formColourHex || '').trim().toLowerCase();
      const origTd = editingSpool.td !== undefined && editingSpool.td !== null ? String(editingSpool.td) : '';
      const newTd = formTd !== '' ? String(formTd) : '';

      if (
        editingSpool.brand !== formBrand ||
        editingSpool.type !== formType ||
        origColor !== newColor ||
        Number(editingSpool.minTemp) !== Number(formMinTemp) ||
        Number(editingSpool.maxTemp) !== Number(formMaxTemp) ||
        Number(editingSpool.bedMinTemp) !== Number(formBedMinTemp) ||
        Number(editingSpool.bedMaxTemp) !== Number(formBedMaxTemp) ||
        origTd !== newTd
      ) {
        shouldPromptRfid = true;
      }
    }

    try {
      let response;
      if (editingSpool) {
        response = await fetch(`/api/spools/${editingSpool.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        response = await fetch('/api/spools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (response.ok) {
        const savedSpool = await response.json();
        onSaveSuccess(savedSpool, shouldPromptRfid);
      }
    } catch (error) {
      console.error('Failed to save spool:', error);
    }
  };

  if (!isOpen) return null;

  const syncState = !profileMatch?.match
    ? 'unmatched'
    : (profileMatch.differences?.length ? 'differs' : 'synced');
  const syncTitle = {
    unmatched: 'No match in the SimplyPrint profile database',
    differs: `Matches ${profileMatch?.match?.base} — ${profileMatch?.differences?.length} settings differ`,
    synced: `In sync with ${profileMatch?.match?.base}`
  }[syncState];

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>{editingSpool ? 'Edit Filament Spool' : 'Add Filament Spool'}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ position: 'relative', display: 'flex' }}>
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                transition: 'transform 0.1s ease'
              }}
              onClick={() => setFormExportedToOrca(!formExportedToOrca)}
              title={formExportedToOrca ? "Exported to OrcaSlicer (Click to toggle off)" : "Not exported to OrcaSlicer (Click to toggle on)"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 64 64"
                style={{
                  filter: formExportedToOrca ? 'none' : 'grayscale(100%) opacity(0.4)',
                  transition: 'filter 0.2s ease',
                  borderRadius: '6px'
                }}
              >
                <rect width="64" height="64" rx="14" fill="#e9e9e9" />
                <path d="M13.84,50.354a19.7,19.7,0,0,0,13.883,5.79A19.944,19.944,0,0,0,41.858,22.182Z" fill="#292826" />
                <path d="M41.858,22.181,13.84,50.354l.061.059A220.548,220.548,0,0,0,46.378,29.277a19.964,19.964,0,0,0-4.52-7.1" fill="#009789" />
                <path d="M36.381,7.856A19.943,19.943,0,0,0,22.327,41.818L50.345,13.646a19.693,19.693,0,0,0-13.964-5.79" fill="#292826" />
                <path d="M36.381,7.856A19.636,19.636,0,0,0,26.04,10.782a22.742,22.742,0,0,0-5.91-.745,23.084,23.084,0,0,0-9.477,2.124.632.632,0,0,0,.129,1.191,13.52,13.52,0,0,1,8.069,5.137A20.06,20.06,0,0,0,17.41,33.534a19.873,19.873,0,0,1,2-3.488c1.819-2.5,3.743-3.8,6.585-5.723,2.093-1.416,5-3.077,13.359-6.512a28.421,28.421,0,0,0,6.12-2.821c1.4-.831,2.461-1.615,2.8-2.842.024-.086.045-.172.065-.256A19.655,19.655,0,0,0,36.381,7.856" fill="#262523" />
                <path d="M39.69,14.551c.727,1.285-.728,3.495-3.249,4.937s-5.154,1.569-5.88.284.727-3.495,3.248-4.937,5.154-1.569,5.881-.284" fill="#fff" />
              </svg>
            </button>
            {profileDbEnabled && (
              <button
                type="button"
                className={`profile-sync-dot ${syncState}`}
                onClick={() => setShowProfilePanel(!showProfilePanel)}
                title={syncTitle}
                style={{ padding: 0, cursor: 'pointer', opacity: profileMatchLoading ? 0.4 : 1 }}
              />
            )}
            </div>
            <button type="button" className="modal-close" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        {profileDbEnabled && showProfilePanel && (
          <div style={{ marginTop: '0.75rem', padding: '0.75rem', borderRadius: 'var(--md-shape-corner-medium)', border: '1px solid var(--md-sys-color-outline-variant)', backgroundColor: 'var(--md-sys-color-surface-container-high)' }}>
            {!profileMatch?.match ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-outline)' }}>
                No profile in the SimplyPrint database matches this brand and name.
                {profileMatch?.alternates?.length > 0 && (
                  <> Closest: {profileMatch.alternates.slice(0, 3).map(a => a.base).join(', ')}.</>
                )}
              </div>
            ) : (
              <>
                <div style={{ fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.15rem' }}>
                  {profileMatch.match.base}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-outline)', marginBottom: '0.5rem' }}>
                  {profileMatch.match.variant ? `@${profileMatch.match.variant} · ` : ''}
                  {profileMatch.match.printerVendor} · match score {profileMatch.match.score}
                </div>

                {profileMatch.differences?.length ? (
                  <>
                    <div style={{ maxHeight: '160px', overflowY: 'auto', marginBottom: '0.5rem' }}>
                      <table style={{ width: '100%', fontSize: '0.72rem', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ textAlign: 'left', color: 'var(--md-sys-color-outline)' }}>
                            <th style={{ padding: '0.15rem 0.3rem' }}>Setting</th>
                            <th style={{ padding: '0.15rem 0.3rem' }}>Database</th>
                            <th style={{ padding: '0.15rem 0.3rem' }}>Yours</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profileMatch.differences.map(d => (
                            <tr key={d.key} style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }}>
                              <td style={{ padding: '0.15rem 0.3rem', fontFamily: 'monospace' }}>{d.key}</td>
                              <td style={{ padding: '0.15rem 0.3rem' }}>{String(d.db?.[0] ?? d.db ?? '')}</td>
                              <td style={{ padding: '0.15rem 0.3rem', color: 'var(--md-sys-color-outline)' }}>
                                {d.current === null ? '—' : String(d.current?.[0] ?? d.current)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--md-sys-color-outline)' }}>
                      These differences come from the material baseline, not this spool. Adjust them in
                      Settings → Filament Profile Defaults for <strong>{formType}</strong>.
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-outline)' }}>
                    Every setting the database carries already matches your baseline.
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Scraping & Open Filament DB Autofills */}
        {!editingSpool && (
          <div className="autofill-section" style={{ padding: '0.75rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isAutofillExpanded ? '0.75rem' : 0, flexWrap: 'wrap', gap: '0.5rem' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setIsAutofillExpanded(!isAutofillExpanded)}
              >
                <Sparkles size={16} style={{ color: 'var(--md-sys-color-primary)', flexShrink: 0 }} />
                <span className="autofill-title" style={{ margin: 0 }}>
                  Autopopulate Specifications
                </span>
                <span style={{ display: 'inline-block', fontSize: '0.7rem', color: 'var(--md-sys-color-outline)', marginLeft: '0.25rem' }}>
                  {isAutofillExpanded ? '▼' : '▶'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {/* Photo OCR Label Scan */}
                <label
                  className="btn btn-secondary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.35rem',
                    padding: isAutofillExpanded ? '0.4rem 0.8rem' : '0.4rem',
                    minWidth: isAutofillExpanded ? 'auto' : '32px',
                    height: '32px',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    margin: 0
                  }}
                  title="Scan Spool Label with Gemini OCR"
                >
                  <Camera size={14} />
                  {isAutofillExpanded && 'Scan Label Photo'}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={handlePhotoOcr}
                  />
                </label>
              </div>
            </div>

            {isAutofillExpanded && (
              <>
                <div className="autofill-tabs" style={{ marginBottom: '0.75rem' }}>
                  <button
                    type="button"
                    className={`autofill-tab ${autofillTab === 'scrape' ? 'active' : ''}`}
                    onClick={() => setAutofillTab('scrape')}
                  >
                    Scrape URL
                  </button>
                  <button
                    type="button"
                    className={`autofill-tab ${autofillTab === 'ofdb' ? 'active' : ''}`}
                    onClick={() => setAutofillTab('ofdb')}
                  >
                    Open Filament DB
                  </button>
                  <button
                    type="button"
                    className={`autofill-tab ${autofillTab === 'websearch' ? 'active' : ''}`}
                    onClick={() => setAutofillTab('websearch')}
                  >
                    Web Search
                  </button>
                </div>

                {/* Photo OCR Loader and Results */}
                {ocrLoading && (
                  <div className="merge-container" style={{ margin: '0 0 1rem 0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                    <RotateCw className="logo-icon" style={{ animation: 'spin 2s linear infinite', color: 'var(--md-sys-color-primary)', marginBottom: '1rem' }} size={28} />
                    <h4 style={{ margin: 0 }}>Analyzing spool label...</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-outline)', marginTop: '0.25rem', textAlign: 'center' }}>
                      Gemini is identifying brand, type, colour, and temperature settings.
                    </p>
                  </div>
                )}

                {ocrResult && (
                  <div className="merge-container" style={{ margin: '0 0 1rem 0', padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: 'var(--md-sys-color-primary)' }}>
                      <Sparkles size={16} />
                      <strong style={{ fontSize: '0.9rem' }}>Gemini OCR Extracted Details</strong>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
                      <div>
                        <span style={{ color: 'var(--md-sys-color-outline)', display: 'block', fontSize: '0.75rem' }}>Brand</span>
                        <strong>{ocrResult.brand || 'Not identified'}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--md-sys-color-outline)', display: 'block', fontSize: '0.75rem' }}>Type</span>
                        <strong>{ocrResult.type || 'Not identified'}</strong>
                      </div>
                      <div style={{ gridColumn: 'span 2' }}>
                        <span style={{ color: 'var(--md-sys-color-outline)', display: 'block', fontSize: '0.75rem' }}>Suggested Name</span>
                        <strong>{ocrResult.searchQuery || 'Not identified'}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--md-sys-color-outline)', display: 'block', fontSize: '0.75rem' }}>Colour Name</span>
                        <strong>{ocrResult.colour || ocrResult.color || 'Not identified'}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--md-sys-color-outline)', display: 'block', fontSize: '0.75rem' }}>Nozzle / Bed Temps</span>
                        <strong>{ocrResult.minTemp}°-{ocrResult.maxTemp}°C / {ocrResult.bedMinTemp}°-{ocrResult.bedMaxTemp}°C</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--md-sys-color-outline)', display: 'block', fontSize: '0.75rem' }}>TD Value</span>
                        <strong>{ocrResult.td !== undefined && ocrResult.td !== null ? `${ocrResult.td} mm` : 'Not identified'}</strong>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                        onClick={() => {
                          if (ocrResult.searchQuery) setFormName(ocrResult.searchQuery);
                          if (ocrResult.brand) setFormBrand(ocrResult.brand);
                          if (ocrResult.type) setFormType(ocrResult.type);
                          if (ocrResult.minTemp) setFormMinTemp(String(ocrResult.minTemp));
                          if (ocrResult.maxTemp) setFormMaxTemp(String(ocrResult.maxTemp));
                          if (ocrResult.bedMinTemp) setFormBedMinTemp(String(ocrResult.bedMinTemp));
                          if (ocrResult.bedMaxTemp) setFormBedMaxTemp(String(ocrResult.bedMaxTemp));
                          if (ocrResult.td !== undefined && ocrResult.td !== null) setFormTd(String(ocrResult.td));
                          setFormNotes('');
                          setOcrResult(null);
                          setIsAutofillExpanded(false);
                        }}
                      >
                        Apply Directly
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                        onClick={() => {
                          setWebSearchQuery(ocrResult.searchQuery || `${ocrResult.brand || ''} ${ocrResult.type || ''} ${ocrResult.colour || ocrResult.color || ''}`);
                          setAutofillTab('websearch');
                          setOcrResult(null);
                        }}
                      >
                        Search Web
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                        onClick={() => {
                          setOfdbMode('global');
                          setGlobalSearchQuery(ocrResult.searchQuery || `${ocrResult.brand || ''} ${ocrResult.type || ''} ${ocrResult.colour || ocrResult.color || ''}`);
                          handleGlobalSearch(ocrResult.searchQuery || `${ocrResult.brand || ''} ${ocrResult.type || ''} ${ocrResult.colour || ocrResult.color || ''}`);
                          setAutofillTab('ofdb');
                          setOcrResult(null);
                        }}
                      >
                        Search OFDB
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-icon-only"
                        style={{ width: '28px', height: '28px' }}
                        onClick={() => setOcrResult(null)}
                        title="Dismiss"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                )}

                {autofillTab === 'scrape' && (
                  <div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-outline)', marginBottom: '0.5rem' }}>
                      Paste a link from Amazon, 3D Filament Profiles, or a supplier website:
                    </p>
                    <div className="autofill-row">
                      <input
                        type="url"
                        placeholder="https://www.amazon.com/dp/..."
                        className="autofill-input"
                        value={scrapeUrl}
                        onChange={(e) => setScrapeUrl(e.target.value)}
                      />
                      <button
                        className="btn btn-primary"
                        onClick={handleScrapeUrl}
                        disabled={scraping || !scrapeUrl}
                      >
                        {scraping ? 'Reading...' : 'Autofill'}
                      </button>
                    </div>
                  </div>
                )}

                {autofillTab === 'ofdb' && (
                  <div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', borderBottom: '1px solid var(--md-sys-color-outline-variant)', paddingBottom: '0.5rem' }}>
                      <button
                        type="button"
                        className={`autofill-tab ${ofdbMode === 'drilldown' ? 'active' : ''}`}
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                        onClick={() => setOfdbMode('drilldown')}
                      >
                        Browse by Brand
                      </button>
                      <button
                        type="button"
                        className={`autofill-tab ${ofdbMode === 'global' ? 'active' : ''}`}
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                        onClick={() => setOfdbMode('global')}
                      >
                        Global Search
                      </button>
                    </div>

                    {/* Drilldown Mode */}
                    {ofdbMode === 'drilldown' && (
                      <div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-outline)', marginBottom: '0.75rem' }}>
                          Search and drill down to the exact manufacturer variant from the Open Filament Database:
                        </p>

                        {!selectedBrand && (
                          <div>
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                              <input
                                type="text"
                                placeholder="Type manufacturer (e.g. eSun, Overture, Polymaker)..."
                                className="autofill-input"
                                value={ofdbSearch}
                                onChange={(e) => setOfdbSearch(e.target.value)}
                              />
                            </div>

                            {ofdbSearch && (
                              <div className="brand-results">
                                {ofdbBrands
                                  .filter(brand => brand.name.toLowerCase().includes(ofdbSearch.toLowerCase()))
                                  .slice(0, 15)
                                  .map(brand => (
                                    <div
                                      key={brand.slug}
                                      className="brand-result-item"
                                      onClick={() => handleFetchBrandDetails(brand.slug)}
                                      style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                    >
                                      <strong>{brand.name}</strong>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-outline)' }}>
                                        {brand.material_count} material types
                                      </span>
                                    </div>
                                  ))
                                }
                                {ofdbBrands.filter(brand => brand.name.toLowerCase().includes(ofdbSearch.toLowerCase())).length === 0 && (
                                  <div style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--md-sys-color-outline)' }}>
                                    No manufacturer found matching "{ofdbSearch}"
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {selectedBrand && !selectedMaterial && (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>
                              <div>
                                <span style={{ fontSize: '0.7rem', color: 'var(--md-sys-color-outline)', fontWeight: '700', textTransform: 'uppercase' }}>Manufacturer</span>
                                <h3 style={{ fontSize: '1rem', color: 'var(--md-sys-color-on-surface)' }}>{selectedBrand.name}</h3>
                              </div>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                                onClick={() => setSelectedBrand(null)}
                              >
                                Back
                              </button>
                            </div>

                            {ofdbLoading ? (
                              <div style={{ padding: '2rem 1rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                <RotateCw className="logo-icon" style={{ animation: 'spin 2s linear infinite', color: 'var(--md-sys-color-primary)' }} size={16} />
                                <span>Loading material types...</span>
                              </div>
                            ) : (
                              <div>
                                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--md-sys-color-outline)', textTransform: 'uppercase' }}>
                                  Select Material Type:
                                </span>
                                <div className="brand-results" style={{ marginTop: '0.35rem', maxHeight: '200px' }}>
                                  {brandMaterials.map((mat) => (
                                    <div
                                      key={mat.slug}
                                      className="brand-result-item"
                                      style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                      onClick={() => handleFetchMaterialDetails(mat.slug)}
                                    >
                                      <strong>{mat.material}</strong>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-outline)' }}>
                                        {mat.filament_count} product line(s)
                                      </span>
                                    </div>
                                  ))}
                                  {brandMaterials.length === 0 && (
                                    <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--md-sys-color-outline)' }}>
                                      No material types found for this brand.
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {selectedBrand && selectedMaterial && !selectedFilament && (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>
                              <div>
                                <span style={{ fontSize: '0.7rem', color: 'var(--md-sys-color-outline)', fontWeight: '700', textTransform: 'uppercase' }}>Manufacturer &gt; Material</span>
                                <h3 style={{ fontSize: '1.0rem', color: 'var(--md-sys-color-on-surface)' }}>
                                  {selectedBrand.name} &gt; {selectedMaterial.material}
                                </h3>
                              </div>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                                onClick={() => {
                                  setSelectedMaterial(null);
                                  setMaterialFilaments([]);
                                }}
                              >
                                Back
                              </button>
                            </div>

                            {ofdbLoading ? (
                              <div style={{ padding: '2rem 1rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                <RotateCw className="logo-icon" style={{ animation: 'spin 2s linear infinite', color: 'var(--md-sys-color-primary)' }} size={16} />
                                <span>Loading product lines...</span>
                              </div>
                            ) : (
                              <div>
                                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--md-sys-color-outline)', textTransform: 'uppercase' }}>
                                  Select Product / Filament:
                                </span>
                                <div className="brand-results" style={{ marginTop: '0.35rem', maxHeight: '200px' }}>
                                  {materialFilaments.map((fil) => (
                                    <div
                                      key={fil.slug}
                                      className="brand-result-item"
                                      style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                      onClick={() => handleFetchFilamentDetails(fil.slug)}
                                    >
                                      <strong>{fil.name}</strong>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-outline)' }}>
                                        {fil.variant_count} color variant(s)
                                      </span>
                                    </div>
                                  ))}
                                  {materialFilaments.length === 0 && (
                                    <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--md-sys-color-outline)' }}>
                                      No filament products found.
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {selectedBrand && selectedMaterial && selectedFilament && (
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>
                              <div>
                                <span style={{ fontSize: '0.7rem', color: 'var(--md-sys-color-outline)', fontWeight: '700', textTransform: 'uppercase' }}>Manufacturer &gt; Product</span>
                                <h3 style={{ fontSize: '0.95rem', color: 'var(--md-sys-color-on-surface)' }}>
                                  {selectedBrand.name} &gt; {selectedFilament.name}
                                </h3>
                              </div>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                                onClick={() => {
                                  setSelectedFilament(null);
                                  setFilamentDetails(null);
                                }}
                              >
                                Back
                              </button>
                            </div>

                            {ofdbLoading ? (
                              <div style={{ padding: '2rem 1rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                                <RotateCw className="logo-icon" style={{ animation: 'spin 2s linear infinite', color: 'var(--md-sys-color-primary)' }} size={16} />
                                <span>Loading color variants...</span>
                              </div>
                            ) : (
                              <div>
                                <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--md-sys-color-outline)', textTransform: 'uppercase' }}>
                                  Select Color Variant:
                                </span>
                                <div className="brand-results" style={{ marginTop: '0.35rem', maxHeight: '200px' }}>
                                  {filamentDetails?.variants?.map((v) => {
                                    const variantColor = v.color_hex ? (v.color_hex.startsWith('#') ? v.color_hex : `#${v.color_hex}`) : '#337150';
                                    return (
                                      <div
                                        key={v.slug}
                                        className="brand-result-item"
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem' }}
                                        onClick={() => handleSelectOfdbVariant(v)}
                                      >
                                        <span
                                          className="merge-color-swatch"
                                          style={{
                                            backgroundColor: variantColor,
                                            border: '1px solid var(--md-sys-color-outline-variant)',
                                            width: '18px',
                                            height: '18px',
                                            borderRadius: '50%',
                                            flexShrink: 0
                                          }}
                                        />
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                          <span style={{ fontWeight: '600', color: 'var(--md-sys-color-on-surface)' }}>{v.name}</span>
                                          <span style={{ fontSize: '0.725rem', color: 'var(--md-sys-color-outline)' }}>
                                            Nozzle: {filamentDetails.min_print_temperature}°-{filamentDetails.max_print_temperature}°C | Bed: {filamentDetails.min_bed_temperature || 50}°-{filamentDetails.max_bed_temperature || 60}°C
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                  {(!filamentDetails || !filamentDetails.variants || filamentDetails.variants.length === 0) && (
                                    <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--md-sys-color-outline)' }}>
                                      No color variants found.
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Global Search Mode */}
                    {ofdbMode === 'global' && (
                      <div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-outline)', marginBottom: '0.75rem' }}>
                          Type a color name, brand, or type to search all 14,000+ variants globally:
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <input
                            type="text"
                            placeholder="e.g. Rock White, eSun PLA Black, Hatchbox PETG Red..."
                            className="autofill-input"
                            value={globalSearchQuery}
                            onChange={(e) => setGlobalSearchQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleGlobalSearch(globalSearchQuery);
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => handleGlobalSearch(globalSearchQuery)}
                            disabled={globalSearchLoading || !globalSearchQuery}
                          >
                            Search
                          </button>
                        </div>

                        {globalSearchLoading ? (
                          <div style={{ padding: '2rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                            <RotateCw className="logo-icon" style={{ animation: 'spin 2s linear infinite', color: 'var(--md-sys-color-primary)' }} size={16} />
                            <span>Searching Open Filament DB...</span>
                          </div>
                        ) : (
                          globalSearchResults.length > 0 && (
                            <div className="brand-results" style={{ maxHeight: '200px' }}>
                              {globalSearchResults.map((r, idx) => {
                                const colHex = r.colourHex || r.colorHex || '#337150';
                                return (
                                  <div
                                    key={idx}
                                    className="brand-result-item"
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem' }}
                                    onClick={() => handleSelectGlobalResult(r)}
                                  >
                                    <span
                                      className="merge-color-swatch"
                                      style={{
                                        backgroundColor: colHex,
                                        border: '1px solid var(--md-sys-color-outline-variant)',
                                        width: '18px',
                                        height: '18px',
                                        borderRadius: '50%',
                                        flexShrink: 0
                                      }}
                                    />
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                      <strong>{r.brand} - {r.colorName || r.name}</strong>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-outline)' }}>
                                        Material: {r.type} | Temp: {r.minTemp}°-{r.maxTemp}°C | Bed: {r.bedMinTemp}°-{r.bedMaxTemp}°C {r.td !== undefined && r.td !== null ? `| TD: ${r.td}` : ''}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )
                        )}
                        {!globalSearchLoading && globalSearchQuery && globalSearchResults.length === 0 && (
                          <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--md-sys-color-outline)' }}>
                            No global search results.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {autofillTab === 'websearch' && (
                  <div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-outline)', marginBottom: '0.5rem' }}>
                      Query Google for specifications (min/max temperatures, TD index values):
                    </p>
                    <form onSubmit={handleWebSearch} className="autofill-row" style={{ marginBottom: '0.75rem' }}>
                      <input
                        type="text"
                        placeholder="e.g. Polymaker PolyLite PLA Teal specifications..."
                        className="autofill-input"
                        value={webSearchQuery}
                        onChange={(e) => setWebSearchQuery(e.target.value)}
                      />
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={webSearchLoading || !webSearchQuery}
                      >
                        {webSearchLoading ? 'Searching...' : 'Google'}
                      </button>
                    </form>

                    {webSearchLoading ? (
                      <div style={{ padding: '2.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <RotateCw className="logo-icon" style={{ animation: 'spin 2s linear infinite', color: 'var(--md-sys-color-primary)', marginBottom: '0.75rem' }} size={24} />
                        <span>Searching the web & reading specifications...</span>
                      </div>
                    ) : (
                      webSearchResults.length > 0 && (
                        <div className="brand-results" style={{ maxHeight: '200px' }}>
                          {webSearchResults.map((res, idx) => (
                            <div
                              key={idx}
                              className="brand-result-item"
                              style={{ padding: '0.75rem 1rem' }}
                              onClick={() => handleScrapeFromSearch(res.url)}
                            >
                              <div style={{ fontWeight: '700', fontSize: '0.85rem' }}>{res.title}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-primary)', textDecoration: 'underline', marginBottom: '0.2rem', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                {res.url}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-outline)', lineHeight: '1.2' }}>
                                {res.snippet}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    )}
                    {!webSearchLoading && webSearchQuery && webSearchResults.length === 0 && (
                      <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--md-sys-color-outline)' }}>
                        No search results found. Make sure backend search is configured.
                      </div>
                    )}
                  </div>
                )}

                {/* Merge comparison Panel for Scraped details */}
                {showMergePanel && scrapedData && (
                  <div className="merge-container" style={{ margin: '1rem 0 0 0', padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: 'var(--md-sys-color-primary)' }}>
                      <Sparkles size={16} />
                      <strong style={{ fontSize: '0.9rem' }}>Scraped Data Merge Panel</strong>
                    </div>

                    <table className="merge-table">
                      <thead>
                        <tr>
                          <th>Field</th>
                          <th>Current Form</th>
                          <th>Scraped Value</th>
                          <th>Select Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { key: 'name', label: 'Name', current: formName, scraped: scrapedData.name },
                          { key: 'brand', label: 'Brand', current: formBrand, scraped: scrapedData.brand },
                          { key: 'type', label: 'Type', current: formType, scraped: scrapedData.type },
                          { key: 'colourHex', label: 'Colour', current: formColourHex, scraped: scrapedData.colourHex || scrapedData.colorHex, isColor: true },
                          { key: 'minTemp', label: 'Nozzle Min', current: formMinTemp, scraped: scrapedData.minTemp },
                          { key: 'maxTemp', label: 'Nozzle Max', current: formMaxTemp, scraped: scrapedData.maxTemp },
                          { key: 'bedMinTemp', label: 'Bed Min', current: formBedMinTemp, scraped: scrapedData.bedMinTemp },
                          { key: 'bedMaxTemp', label: 'Bed Max', current: formBedMaxTemp, scraped: scrapedData.bedMaxTemp },
                          { key: 'td', label: 'TD Value', current: formTd, scraped: scrapedData.td },
                          { key: 'notes', label: 'Notes', current: formNotes, scraped: scrapedData.notes }
                        ].map(({ key, label, current, scraped, isColor }) => {
                          if (scraped === undefined || scraped === null) return null;
                          return (
                            <tr key={key}>
                              <td><strong>{label}</strong></td>
                              <td>
                                {isColor ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span className="merge-color-swatch" style={{ backgroundColor: current }} />
                                    <span>{current}</span>
                                  </div>
                                ) : (
                                  current || <em style={{ color: 'var(--md-sys-color-outline)' }}>empty</em>
                                )}
                              </td>
                              <td style={{ backgroundColor: 'rgba(51, 113, 80, 0.08)' }}>
                                {isColor ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span className="merge-color-swatch" style={{ backgroundColor: scraped }} />
                                    <span>{scraped}</span>
                                  </div>
                                ) : (
                                  String(scraped) || <em style={{ color: 'var(--md-sys-color-outline)' }}>empty</em>
                                )}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.35rem' }}>
                                  <button
                                    type="button"
                                    className={`merge-select-btn ${mergeSelections[key] !== 'scraped' ? 'active' : ''}`}
                                    onClick={() => setMergeSelections(prev => ({ ...prev, [key]: 'current' }))}
                                  >
                                    Keep
                                  </button>
                                  <button
                                    type="button"
                                    className={`merge-select-btn ${mergeSelections[key] === 'scraped' ? 'active' : ''}`}
                                    onClick={() => setMergeSelections(prev => ({ ...prev, [key]: 'scraped' }))}
                                  >
                                    Accept
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setShowMergePanel(false);
                          setScrapedData(null);
                          setScrapeUrl('');
                        }}
                      >
                        Discard
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={applyMergeSelections}
                      >
                        Apply Merge
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Modal Form */}
        <form onSubmit={handleSaveSpool} style={{ marginTop: '1.5rem' }}>
          <div className="form-grid">
            <div className="form-group full-width">
              <label className="form-label">Spool/Filament Name</label>
              <input
                type="text"
                required
                placeholder="e.g. PolyLite Teal, Silk Gold, Matte Black"
                className="form-input"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Brand / Manufacturer</label>
              <input
                type="text"
                required
                placeholder="e.g. Polymaker, eSun, Overture"
                className="form-input"
                value={formBrand}
                onChange={(e) => setFormBrand(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Filament Material / Type</label>
              <select
                className="form-input"
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
              >
                <option value="PLA">PLA</option>
                <option value="PLA+">PLA+</option>
                <option value="PETG">PETG</option>
                <option value="ABS">ABS</option>
                <option value="ASA">ASA</option>
                <option value="TPU">TPU</option>
                <option value="PVA">PVA</option>
                <option value="Nylon">Nylon</option>
                <option value="PC">PC</option>
                <option value="PET">PET</option>
                <option value="PP">PP</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="form-group" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label className="form-label" style={{ marginBottom: 0 }}>Filament Colour (Hex)</label>
                {td1sEnabled && td1sStatusText !== 'USB Un-supported' && (
                  <div
                    className={`td1s-badge ${td1sConnected ? 'connected' : 'disconnected'} ${td1sListening ? 'listening' : ''}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.3rem',
                      fontSize: '0.7rem', fontWeight: '600',
                      borderRadius: '6px', padding: '0.25rem 0.5rem',
                      cursor: 'pointer', userSelect: 'none',
                      border: '1px solid var(--md-sys-color-outline-variant)',
                      backgroundColor: td1sListening
                        ? '#ffeaa7'
                        : (td1sConnected ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-surface-container-high)'),
                      color: td1sListening
                        ? '#d63031'
                        : (td1sConnected ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-outline)'),
                      transition: 'var(--transition-m3)'
                    }}
                    onClick={() => {
                      if (!td1sConnected) {
                        handleConnectTd1s();
                      } else if (td1sListening) {
                        setTd1sListening(false);
                        setTd1sStatusText('Tap To Read TD1s');
                      } else {
                        setTd1sListening(true);
                        setTd1sStatusText('Listening for Scan...');
                      }
                    }}
                  >
                    <span style={{
                      width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
                      backgroundColor: td1sListening ? '#ffeaa7' : (td1sConnected ? '#44bd32' : '#718093'),
                      animation: td1sListening ? 'pulse-amber 1.2s infinite' : 'none'
                    }} />
                    {td1sStatusText}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="color-swatch-btn"
                  style={{
                    backgroundColor: formColourHex,
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    border: '1px solid var(--md-sys-color-outline-variant)',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                  onClick={() => setShowColorPopover(!showColorPopover)}
                  title="Choose from color picker"
                />
                <input
                  type="text"
                  required
                  placeholder="e.g. #337150"
                  className="form-input"
                  value={formColourHex}
                  onChange={(e) => setFormColourHex(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              {/* Color Picker Popover */}
              {showColorPopover && (
                <div
                  className="color-picker-popover"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    zIndex: 100,
                    backgroundColor: 'var(--md-sys-color-surface-container-high)',
                    border: '1px solid var(--md-sys-color-outline-variant)',
                    borderRadius: '12px',
                    padding: '1.25rem',
                    boxShadow: 'var(--elevation-3)',
                    marginTop: '0.5rem',
                    width: '240px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>HSL Color Tuner</span>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--md-sys-color-outline)' }}
                      onClick={() => setShowColorPopover(false)}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Spectrometer Connection Badge inside Color Popover */}
                  {td1sStatusText !== 'USB Un-supported' && (
                    <div
                      className={`td1s-badge ${td1sConnected ? 'connected' : 'disconnected'} ${td1sListening ? 'listening' : ''}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        borderRadius: '6px',
                        padding: '0.4rem 0.5rem',
                        marginBottom: '1rem',
                        cursor: 'pointer',
                        userSelect: 'none',
                        border: '1px solid var(--md-sys-color-outline-variant)',
                        backgroundColor: td1sListening
                          ? '#ffeaa7'
                          : (td1sConnected ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-surface-container-high)'),
                        color: td1sListening
                          ? '#d63031'
                          : (td1sConnected ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-outline)'),
                        transition: 'var(--transition-m3)'
                      }}
                      onClick={() => {
                        if (!td1sConnected) {
                          handleConnectTd1s();
                        } else {
                          if (td1sListening) {
                            setTd1sListening(false);
                            setTd1sStatusText('Tap To Read TD1s');
                          } else {
                            setTd1sListening(true);
                            setTd1sStatusText('Listening for Scan...');
                          }
                        }
                      }}
                    >
                      <span
                        className="pulse-indicator"
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: td1sListening
                            ? '#ffeaa7'
                            : (td1sConnected ? '#44bd32' : '#718093'),
                          animation: td1sListening ? 'pulse-amber 1.2s infinite' : 'none'
                        }}
                      />
                      {td1sStatusText}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                        <span>Hue ({popoverH}°)</span>
                        <span>Red/Green/Blue</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        className="color-slider"
                        style={{
                          width: '100%',
                          background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)'
                        }}
                        value={popoverH}
                        onChange={(e) => {
                          const h = parseInt(e.target.value);
                          setPopoverH(h);
                          setFormColourHex(hslToHex(h, popoverS, popoverL));
                        }}
                      />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                        <span>Saturation ({popoverS}%)</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        className="color-slider"
                        style={{
                          width: '100%',
                          background: `linear-gradient(to right, ${hslToHex(popoverH, 0, popoverL)}, ${hslToHex(popoverH, 100, popoverL)})`
                        }}
                        value={popoverS}
                        onChange={(e) => {
                          const s = parseInt(e.target.value);
                          setPopoverS(s);
                          setFormColourHex(hslToHex(popoverH, s, popoverL));
                        }}
                      />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                        <span>Lightness ({popoverL}%)</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        className="color-slider"
                        style={{
                          width: '100%',
                          background: `linear-gradient(to right, #000, ${hslToHex(popoverH, popoverS, 50)}, #fff)`
                        }}
                        value={popoverL}
                        onChange={(e) => {
                          const l = parseInt(e.target.value);
                          setPopoverL(l);
                          setFormColourHex(hslToHex(popoverH, popoverS, l));
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Used Percentage ({formUsedPercentage}%)</span>
                <button
                  type="button"
                  onClick={() => setShowWeightCalc(!showWeightCalc)}
                  className="btn btn-secondary"
                  style={{
                    padding: '0.15rem 0.5rem',
                    fontSize: '0.7rem',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                >
                  <Sliders size={12} />
                  Calculate Weights
                </button>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                className="color-slider"
                style={{ width: '100%', margin: '0.5rem 0' }}
                value={formUsedPercentage}
                onChange={(e) => setFormUsedPercentage(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Spool Filament Weight (g)</label>
              <input
                type="number"
                step="any"
                min="1"
                className="form-input"
                placeholder="1000"
                value={formNetWeight}
                onChange={(e) => setFormNetWeight(e.target.value)}
                title="Net filament weight when the spool is full — used for Spoolman/printer usage tracking"
              />
            </div>

            {/* Weight Calculator Sub-panel */}
            {showWeightCalc && (
              <div
                className="autofill-section full-width"
                style={{
                  padding: '1rem',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                  backgroundColor: 'var(--md-sys-color-surface-container-high)',
                  borderRadius: '8px',
                  marginBottom: '1rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <strong style={{ fontSize: '0.85rem' }}>Spool Weight Usage Calculator</strong>
                  <div style={{ display: 'flex', gap: '0.25rem', backgroundColor: 'var(--md-sys-color-surface-container-highest)', borderRadius: '4px', padding: '0.15rem' }}>
                    <button
                      type="button"
                      onClick={() => setWeightUnit('g')}
                      className={`merge-select-btn ${weightUnit === 'g' ? 'active' : ''}`}
                      style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem', height: '20px' }}
                    >
                      g
                    </button>
                    <button
                      type="button"
                      onClick={() => setWeightUnit('lb')}
                      className={`merge-select-btn ${weightUnit === 'lb' ? 'active' : ''}`}
                      style={{ padding: '0.15rem 0.4rem', fontSize: '0.7rem', height: '20px' }}
                    >
                      lb
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Measured Gross ({weightUnit})</label>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      style={{ padding: '0.5rem', fontSize: '0.85rem' }}
                      placeholder="Spool on scale"
                      value={measuredWeight}
                      onChange={(e) => setMeasuredWeight(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Empty Spool ({weightUnit})</label>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      style={{ padding: '0.5rem', fontSize: '0.85rem' }}
                      value={emptySpoolWeight}
                      onChange={(e) => setEmptySpoolWeight(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Starting Net ({weightUnit})</label>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      style={{ padding: '0.5rem', fontSize: '0.85rem' }}
                      value={startingWeight}
                      onChange={(e) => setStartingWeight(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', backgroundColor: 'var(--md-sys-color-surface-container-high)', borderRadius: '6px', padding: '0.5rem 0.75rem', border: '1px solid var(--md-sys-color-outline-variant)' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--md-sys-color-outline)', fontWeight: 'bold' }}>CALCULATED VALUES</span>
                    {parseFloat(measuredWeight) > 0 && parseFloat(startingWeight) > 0 ? (
                      <div style={{ fontSize: '0.8rem', color: 'var(--md-sys-color-on-surface)' }}>
                        Remaining Filament: <strong>{Math.max(0, parseFloat(measuredWeight) - parseFloat(emptySpoolWeight)).toFixed(weightUnit === 'g' ? 0 : 3)}{weightUnit} ({Math.max(0, Math.round(((parseFloat(measuredWeight) - parseFloat(emptySpoolWeight)) / parseFloat(startingWeight)) * 100)) || 0}%)</strong>
                        <br />
                        Used Filament: <strong>{100 - Math.max(0, Math.round(((parseFloat(measuredWeight) - parseFloat(emptySpoolWeight)) / parseFloat(startingWeight)) * 100)) || 0}%</strong>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--md-sys-color-outline)', fontStyle: 'italic' }}>Enter weights to calculate...</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
                    onClick={() => setShowWeightCalc(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
                    disabled={!(parseFloat(measuredWeight) > 0 && parseFloat(startingWeight) > 0)}
                    onClick={() => {
                      const mVal = parseFloat(measuredWeight) || 0;
                      const eVal = parseFloat(emptySpoolWeight) || 0;
                      const sVal = parseFloat(startingWeight) || 1;
                      const rem = mVal - eVal;
                      const pctUsed = 100 - Math.max(0, Math.min(100, Math.round((rem / sVal) * 100)));
                      setFormUsedPercentage(String(pctUsed));
                      setShowWeightCalc(false);
                    }}
                  >
                    Apply Calculation
                  </button>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Nozzle Temp Range (°C)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="number"
                  placeholder="Min"
                  className="form-input"
                  style={{ width: '100%' }}
                  value={formMinTemp}
                  onChange={(e) => setFormMinTemp(e.target.value)}
                />
                <span>-</span>
                <input
                  type="number"
                  placeholder="Max"
                  className="form-input"
                  style={{ width: '100%' }}
                  value={formMaxTemp}
                  onChange={(e) => setFormMaxTemp(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Bed Temp Range (°C)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="number"
                  placeholder="Min"
                  className="form-input"
                  style={{ width: '100%' }}
                  value={formBedMinTemp}
                  onChange={(e) => setFormBedMinTemp(e.target.value)}
                />
                <span>-</span>
                <input
                  type="number"
                  placeholder="Max"
                  className="form-input"
                  style={{ width: '100%' }}
                  value={formBedMaxTemp}
                  onChange={(e) => setFormBedMaxTemp(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Transmission Distance (TD value)</label>
              <input
                type="number"
                step="any"
                className="form-input"
                placeholder="e.g. 4.5, 0.8 (optional)"
                value={formTd}
                onChange={(e) => setFormTd(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Stock Quantity</label>
              <input
                type="number"
                min="0"
                className="form-input"
                placeholder="e.g. 1"
                value={formStock}
                onChange={(e) => setFormStock(e.target.value)}
              />
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <input
                  type="checkbox"
                  id="formOpened"
                  className="spool-checkbox"
                  checked={formOpened}
                  onChange={(e) => {
                    setFormOpened(e.target.checked);
                    if (!e.target.checked) setFormDateOpened('');
                  }}
                />
                <label htmlFor="formOpened" className="form-label" style={{ cursor: 'pointer', margin: 0 }}>
                  Spool is Opened
                </label>
              </div>
              <input
                type="date"
                className="form-input"
                value={formDateOpened}
                onChange={(e) => setFormDateOpened(e.target.value)}
                disabled={!formOpened}
                style={{ width: '100%' }}
              />
            </div>

            {formRfidLinked && (
              <div className="form-group">
                <label className="form-label" style={{ position: 'relative', top: '2px' }}>
                  RFID Tag
                </label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  backgroundColor: 'var(--md-sys-color-primary-container)',
                  color: 'var(--md-sys-color-on-primary-container)',
                  padding: '0.85rem',
                  borderRadius: '8px',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                  fontSize: '0.85rem',
                  height: '47px',
                  boxSizing: 'border-box',
                  position: 'relative',
                  top: '7px'
                }}>
                  <Nfc size={16} style={{ flexShrink: 0 }} />
                  <span style={{
                    fontFamily: 'monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1
                  }}>
                    {formRfidId}
                  </span>
                  <button
                    type="button"
                    style={{
                      marginLeft: 'auto',
                      background: 'none',
                      border: 'none',
                      color: 'var(--md-sys-color-error)',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      padding: '0 0.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      flexShrink: 0
                    }}
                    onClick={() => {
                      if (confirm("Are you sure you want to unlink this spool from the physical RFID tag?")) {
                        setFormRfidLinked(false);
                        setFormRfidId(null);
                      }
                    }}
                    title="Unlink tag"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )}

            <div className="form-group full-width">
              <label className="form-label">Notes</label>
              <textarea
                rows="2"
                className="form-input"
                placeholder="Batch ID, drying cycles, or notes..."
                style={{ resize: 'vertical' }}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', borderTop: '1px solid var(--md-sys-color-outline-variant)', paddingTop: '1.25rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editingSpool ? 'Update Spool' : 'Add Spool'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
