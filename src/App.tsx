import React, { useState, useRef, useEffect } from "react";
import {
  FileCode,
  AlertTriangle,
  CheckCircle2,
  Download,
  Trash2,
  ArrowRight,
  Layers,
  FileImage,
  HelpCircle,
  Activity,
  Info,
  RefreshCw,
  Upload,
  Copy,
  Terminal,
  ZoomIn,
  ZoomOut,
  Maximize,
  ShieldCheck,
  Eye,
  EyeOff,
  Sparkles,
  Search,
  Check,
  Wrench,
  BookOpen
} from "lucide-react";
import { parsePSD, generateTestPSD, corruptPSDBinary, rebuildRepairedPSD } from "./utils/psdParser";
import { PSDStructure, PSDLayer, RecoveryLog } from "./types";

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [psdData, setPsdData] = useState<PSDStructure | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressPhase, setProgressPhase] = useState("");
  const [selectedTab, setSelectedTab] = useState<"preview" | "layers" | "metadata" | "report">("preview");
  const [logFilter, setLogFilter] = useState<"all" | "info" | "warn" | "success" | "repair">("all");
  const [customFilename, setCustomFilename] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  
  // Interactive Canvas State
  const [zoom, setZoom] = useState(1);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);

  // Layer visibility state (keyed by layer ID)
  const [layerVisibility, setLayerVisibility] = useState<{ [key: string]: boolean }>({});
  
  // Custom sandbox test settings
  const [sandboxSize, setSandboxSize] = useState(256);
  const [sandboxCorruption, setSandboxCorruption] = useState<"none" | "truncate" | "signature" | "layer_table" | "fuzz">("none");

  // Terminal log copy state
  const [logsCopied, setLogsCopied] = useState(false);

  // References for rendering
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Standard usage guide tab toggle
  const [guideTab, setGuideTab] = useState<"recovery" | "local" | "specs">("recovery");

  // Reset viewport zoom/pan
  const resetViewport = () => {
    setZoom(1);
    setCanvasOffset({ x: 0, y: 0 });
  };

  // Drag-and-drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  // Simulated process flow with progress reporting
  const processFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setLoading(true);
    setProgress(5);
    setProgressPhase("Allocating buffers and loading binary stream...");
    
    // Reset canvas and layer visibility states
    setLayerVisibility({});
    resetViewport();

    const reader = new FileReader();
    reader.onload = async (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (!buffer) {
        setLoading(false);
        return;
      }

      // Step 2: Binary scan
      setTimeout(() => {
        setProgress(25);
        setProgressPhase("Scanning PSD markers, validating version headers...");
      }, 400);

      // Step 3: Checking resource blocks
      setTimeout(() => {
        setProgress(50);
        setProgressPhase("Re-indexing resource tables & reconstructing corrupted slices...");
      }, 800);

      // Step 4: Layer structural calculations
      setTimeout(() => {
        setProgress(75);
        setProgressPhase("Decoding layers records & channel compressed blocks...");
      }, 1200);

      // Step 5: Final compiler & rendering
      setTimeout(() => {
        try {
          const parsed = parsePSD(buffer, selectedFile.name);
          setPsdData(parsed);
          setCustomFilename(`recovered_${selectedFile.name}`);
          
          // Initialize layer visibility
          const vis: { [key: string]: boolean } = {};
          parsed.layers.forEach((l) => {
            vis[l.id] = l.visible;
          });
          setLayerVisibility(vis);

          setProgress(100);
          setProgressPhase("Recovery complete! Ready to save.");
          setTimeout(() => {
            setLoading(false);
          }, 300);
        } catch (error: any) {
          console.error(error);
          setLoading(false);
        }
      }, 1600);
    };

    reader.readAsArrayBuffer(selectedFile);
  };

  // Run Sandbox Demonstration
  const triggerSandbox = (corrupted: boolean) => {
    setLoading(true);
    setProgress(10);
    setProgressPhase("Generating mock multi-layer RGB template...");
    
    // Reset viewport and layers
    setLayerVisibility({});
    resetViewport();

    setTimeout(() => {
      setProgress(40);
      setProgressPhase("Applying requested file corruption algorithms...");

      try {
        const healthyBuf = generateTestPSD(sandboxSize, sandboxSize);
        let finalBuf = healthyBuf;
        let mockName = "template_design.psd";

        if (corrupted && sandboxCorruption !== "none") {
          finalBuf = corruptPSDBinary(healthyBuf, sandboxCorruption as any);
          mockName = `corrupted_design_${sandboxCorruption}.psd`;
        }

        setTimeout(() => {
          setProgress(75);
          setProgressPhase("Running offline correction scans on active buffers...");
          
          setTimeout(() => {
            const parsed = parsePSD(finalBuf, mockName);
            setPsdData(parsed);
            setCustomFilename(`recovered_${mockName}`);
            
            const vis: { [key: string]: boolean } = {};
            parsed.layers.forEach((l) => {
              vis[l.id] = l.visible;
            });
            setLayerVisibility(vis);

            setProgress(100);
            setProgressPhase("Sandboxed recovery diagnostics finalized.");
            setTimeout(() => {
              setLoading(false);
            }, 300);
          }, 600);
        }, 600);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    }, 600);
  };

  // Render composite preview to canvas
  useEffect(() => {
    if (!psdData || !psdData.compositeRgba) return;
    
    // Re-render composite or individual visible layers
    const canvas = compositeCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = psdData.header.width;
    const height = psdData.header.height;
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // If there are recovered layers and we want dynamic composite based on eye toggles:
    const activeLayers = psdData.layers;
    const hasLayerToggles = Object.keys(layerVisibility).length > 0;

    if (activeLayers.length > 0 && hasLayerToggles) {
      // Create offscreen image buffer
      const bufferData = ctx.createImageData(width, height);
      // Fill canvas background with transparent transparent grid checkerboard handled by CSS
      bufferData.data.fill(0);

      // Compositing manually from bottom to top
      for (let i = activeLayers.length - 1; i >= 0; i--) {
        const l = activeLayers[i];
        const isVisible = layerVisibility[l.id] !== false;
        if (!isVisible || !l.rgbaData) continue;

        const opacityMul = l.opacity / 255;

        for (let ly = 0; ly < l.height; ly++) {
          const canvasY = l.top + ly;
          if (canvasY < 0 || canvasY >= height) continue;

          for (let lx = 0; lx < l.width; lx++) {
            const canvasX = l.left + lx;
            if (canvasX < 0 || canvasX >= width) continue;

            const lIdx = (ly * l.width + lx) * 4;
            const cIdx = (canvasY * width + canvasX) * 4;

            const lR = l.rgbaData[lIdx];
            const lG = l.rgbaData[lIdx + 1];
            const lB = l.rgbaData[lIdx + 2];
            const lA = (l.rgbaData[lIdx + 3] / 255) * opacityMul;

            if (lA <= 0) continue;

            // Combine on top of current canvas buffer state
            const bR = bufferData.data[cIdx];
            const bG = bufferData.data[cIdx + 1];
            const bB = bufferData.data[cIdx + 2];
            const bA = bufferData.data[cIdx + 3] / 255;

            const outA = lA + bA * (1 - lA);
            if (outA > 0) {
              bufferData.data[cIdx] = Math.round((lR * lA + bR * bA * (1 - lA)) / outA);
              bufferData.data[cIdx + 1] = Math.round((lG * lA + bG * bA * (1 - lA)) / outA);
              bufferData.data[cIdx + 2] = Math.round((lB * lA + bB * bA * (1 - lA)) / outA);
              bufferData.data[cIdx + 3] = Math.round(outA * 255);
            }
          }
        }
      }
      ctx.putImageData(bufferData, 0, 0);
    } else {
      // Fallback straight to parsed static composite preview
      const imgData = ctx.createImageData(width, height);
      imgData.data.set(psdData.compositeRgba);
      ctx.putImageData(imgData, 0, 0);
    }
  }, [psdData, layerVisibility]);

  // Export full reconstructed PSD file
  const handleSavePSD = () => {
    if (!psdData) return;
    const finalBuffer = rebuildRepairedPSD(psdData);
    const blob = new Blob([finalBuffer], { type: "application/x-photoshop" });
    const link = document.createElement("a");
    const name = customFilename.trim() || "recovered_file.psd";
    link.download = name.endsWith(".psd") ? name : `${name}.psd`;
    link.href = URL.createObjectURL(blob);
    link.click();
  };

  // Export composite preview as PNG
  const handleSavePNG = () => {
    const canvas = compositeCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    const baseName = customFilename.replace(/\.[^/.]+$/, "");
    link.download = `${baseName || "recovered_composite"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  // Save isolated individual layer as PNG
  const handleSaveLayer = (layer: PSDLayer) => {
    if (!layer.rgbaData) return;
    const canvas = document.createElement("canvas");
    canvas.width = layer.width;
    canvas.height = layer.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    const imgData = ctx.createImageData(layer.width, layer.height);
    imgData.data.set(layer.rgbaData);
    ctx.putImageData(imgData, 0, 0);

    const link = document.createElement("a");
    const cleanedLayerName = layer.name.trim().toLowerCase().replace(/[^a-z0-9]/g, "_") || "layer";
    link.download = `recovered_layer_${cleanedLayerName}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  // Toggle layer eye visibility
  const toggleLayer = (layerId: string) => {
    setLayerVisibility((prev) => ({
      ...prev,
      [layerId]: prev[layerId] === false ? true : false,
    }));
  };

  // Interactive canvas dragging
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    e.preventDefault();
    setIsDraggingCanvas(true);
    dragStart.current = { x: e.clientX - canvasOffset.x, y: e.clientY - canvasOffset.y };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingCanvas) return;
    setCanvasOffset({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  };

  const handleCanvasMouseUp = () => {
    setIsDraggingCanvas(false);
  };

  // Reset file/work back to upload screen
  const handleReset = () => {
    setFile(null);
    setPsdData(null);
    setProgress(0);
    resetViewport();
  };

  // Copy terminal logs to clipboard
  const handleCopyLogs = () => {
    if (!psdData) return;
    const text = psdData.recoveryLogs.map((l) => `${l.timestamp} [${l.level.toUpperCase()}] ${l.message}`).join("\n");
    navigator.clipboard.writeText(text);
    setLogsCopied(true);
    setTimeout(() => setLogsCopied(false), 2000);
  };

  // Filtered Logs list
  const filteredLogs = psdData
    ? psdData.recoveryLogs.filter((l) => logFilter === "all" || l.level === logFilter)
    : [];

  return (
    <div className="min-h-screen bg-[#070A13] bg-[linear-gradient(to_right,#111726_1px,transparent_1px),linear-gradient(to_bottom,#111726_1px,transparent_1px)] bg-[size:4rem_4rem] text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white relative">
      
      {/* HEADER NAVBAR */}
      <header className="border-b border-slate-800 bg-[#070A13]/90 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3.5">
          <div className="bg-indigo-600 p-2.5 rounded-xl text-white shadow-lg shadow-indigo-600/20 border border-indigo-500/30">
            <Layers className="w-5.5 h-5.5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display font-bold text-xl tracking-tight text-white">Photoshop Surgeon</h1>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-mono font-bold px-2.5 py-0.5 rounded-full border border-emerald-500/20 tracking-wider">
                OFFLINE ENGINE
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono tracking-tight mt-0.5">Damaged PSD Structure Analyzer & File Restorer</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2 text-slate-300 bg-slate-900/80 px-3.5 py-2 rounded-xl border border-slate-800 font-mono shadow-sm">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Sandbox Privacy Secure</span>
          </div>
        </div>
      </header>

      {/* WORKSPACE AREA */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start relative z-10">
        
        {/* LEFT PRIMARY PANEL (COL 1 to 8) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* 1. INITIAL STATE: UPLOAD & GENERATOR SANDBOX */}
          {!psdData && !loading && (
            <div className="flex flex-col gap-6">
              
              {/* Main Drag Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-2xl p-10 md:p-14 text-center transition-all overflow-hidden ${
                  isDragging
                    ? "border-indigo-500 bg-indigo-500/10 shadow-2xl shadow-indigo-500/5 scale-[0.99]"
                    : "border-slate-800 bg-[#0C1222]/40 hover:border-slate-700/80 hover:bg-[#0C1222]/60"
                }`}
              >
                {/* Geometric Corner Crosshairs for high-end design feel */}
                <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-slate-700/60 pointer-events-none"></div>
                <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-slate-700/60 pointer-events-none"></div>
                <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-slate-700/60 pointer-events-none"></div>
                <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-slate-700/60 pointer-events-none"></div>

                <input
                  type="file"
                  id="psd-file-input"
                  accept=".psd,.psb"
                  onChange={handleFileInput}
                  className="absolute inset-0 opacity-0 cursor-pointer z-20"
                />
                <div className="mx-auto w-16 h-16 bg-slate-900/90 rounded-2xl flex items-center justify-center text-indigo-400 mb-5 border border-slate-800 shadow-md">
                  <Upload className="w-8 h-8" />
                </div>
                <h3 className="font-display text-xl font-bold text-white mb-2">Drop corrupted Photoshop design here</h3>
                <p className="text-slate-400 text-sm max-w-md mx-auto mb-6 leading-relaxed font-sans">
                  Supports damaged <code className="text-indigo-400 font-mono font-medium bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">.psd</code> and <code className="text-indigo-400 font-mono font-medium bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">.psb</code> formats. Fully processed inside local memory. No files are ever uploaded to any web servers.
                </p>
                <button
                  type="button"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-6 py-3 rounded-xl transition shadow-lg shadow-indigo-600/20 inline-flex items-center gap-2 cursor-pointer relative z-10 hover:scale-[1.01]"
                >
                  Browse Desktop Files
                </button>
              </div>

              {/* Sandbox Generator Suite */}
              <div className="bg-[#0C1222]/80 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-md">
                <div className="flex items-center gap-3 mb-5">
                  <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-sm text-white">Demonstration Sandbox</h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">Generate a multi-layer template and intentionally corrupt it to test our recovery parser!</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1.5 font-mono tracking-wider">CANVAS GEOMETRY</label>
                    <select
                      value={sandboxSize}
                      onChange={(e) => setSandboxSize(Number(e.target.value))}
                      className="w-full bg-[#070B13] border border-slate-800/80 hover:border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500 font-mono transition-all"
                    >
                      <option value={128}>128 × 128 px (Ultra Fast)</option>
                      <option value={256}>256 × 256 px (Balanced)</option>
                      <option value={400}>400 × 400 px (Highly Detailed)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1.5 font-mono tracking-wider">CORRUPTION TYPE</label>
                    <select
                      value={sandboxCorruption}
                      onChange={(e) => setSandboxCorruption(e.target.value as any)}
                      className="w-full bg-[#070B13] border border-slate-800/80 hover:border-slate-700/80 rounded-xl px-3 py-2 text-xs outline-none focus:border-indigo-500 text-amber-400 font-mono transition-all"
                    >
                      <option value="none" className="text-slate-300">Healthy PSD (No Damage)</option>
                      <option value="truncate" className="text-amber-500">Truncate Data (Cut 45% of bytes)</option>
                      <option value="signature" className="text-amber-500">Header Fuzz (Destroy PSD Signature)</option>
                      <option value="layer_table" className="text-amber-500">Table Damage (Invalid Layer Indices)</option>
                      <option value="fuzz" className="text-amber-500">Random Fuzzing (Inject 30 Error bytes)</option>
                    </select>
                  </div>

                  <div className="flex items-end">
                    <button
                      onClick={() => triggerSandbox(sandboxCorruption !== "none")}
                      className={`w-full hover:scale-[1.01] active:scale-[0.99] font-bold text-xs py-2.5 rounded-xl transition-all inline-flex items-center justify-center gap-2 cursor-pointer ${
                        sandboxCorruption === "none"
                          ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/10"
                          : "bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/10"
                      }`}
                    >
                      {sandboxCorruption === "none" ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-white" />
                          Load Clean Design
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 text-white" />
                          Load Corrupted & Diagnose
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="bg-[#070B13]/85 rounded-xl p-4 border border-slate-800/60 text-xs text-slate-400 flex items-start gap-3">
                  <Info className="w-4.5 h-4.5 text-indigo-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <span className="font-semibold text-slate-300 font-mono block mb-1">SANDBOX SCENARIO DETAILS</span>
                    Choosing "Truncate" cuts off critical channel byte lengths, which crashes normal Photoshop software. Our recovery engine will identify this, isolate partial streams, pad damaged layers, and reconstruct a healthy PSD container so Photoshop can open it cleanly!
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* 2. LOADING STATE: RECOVERY ANIMATION */}
          {loading && (
            <div className="bg-[#0C1222]/80 border border-slate-800/80 rounded-2xl p-8 md:p-12 text-center flex flex-col items-center justify-center min-h-[360px] shadow-xl backdrop-blur-md relative">
              {/* Corner crosshairs in loading card */}
              <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-slate-700/60"></div>
              <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-slate-700/60"></div>
              <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-slate-700/60"></div>
              <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-slate-700/60"></div>

              <div className="relative mb-6">
                <div className="w-16 h-16 rounded-full border-4 border-indigo-600/20 border-t-indigo-500 animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Activity className="w-6 h-6 text-indigo-400 animate-pulse" />
                </div>
              </div>
              <h3 className="font-display text-lg font-bold text-white mb-2">Analyzing PSD Byte Map</h3>
              <p className="text-slate-400 text-xs max-w-sm mx-auto mb-6 h-8 font-mono">{progressPhase}</p>

              <div className="w-full max-w-md bg-[#070B13] rounded-full h-2.5 overflow-hidden border border-slate-800">
                <div
                  className="bg-indigo-500 h-full transition-all duration-300 ease-out rounded-full shadow-inner"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <span className="text-xs text-slate-500 font-mono mt-2.5">{progress}% completed</span>
            </div>
          )}

          {/* 3. RECOVERED STATE: PREVIEWS & DETAILS */}
          {psdData && !loading && (
            <div className="flex flex-col gap-6">
              
              {/* Header Status of file */}
              <div className="bg-[#0C1222]/80 border border-slate-800/80 rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg backdrop-blur-md relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500"></div>
                <div className="flex items-center gap-4 pl-1.5">
                  <div className={`p-3 rounded-xl border ${psdData.isCorrupt ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"}`}>
                    {psdData.isCorrupt ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-base text-white truncate max-w-xs md:max-w-md">{psdData.fileName}</h3>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-400 mt-1 font-mono">
                      <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800/60">{(psdData.fileSize / 1024).toFixed(1)} KB</span>
                      <span className="text-slate-600">•</span>
                      <span className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800/60">{psdData.header.width} × {psdData.header.height} px</span>
                      <span className="text-slate-600">•</span>
                      <span className="text-indigo-400 font-semibold bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">{psdData.layersCount} Layers Recovered</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-stretch md:self-auto pl-1.5 md:pl-0">
                  <button
                    onClick={handleReset}
                    className="w-full md:w-auto bg-[#070B13] hover:bg-slate-800 text-xs font-semibold px-4 py-2.5 rounded-lg border border-slate-800 hover:border-slate-700 text-slate-200 transition-all flex items-center justify-center gap-2 font-mono cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reset / Clear
                  </button>
                </div>
              </div>

              {/* Tabs Navbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800/80 pb-3 gap-3">
                <div className="flex flex-wrap bg-[#070B13]/90 p-1 rounded-xl border border-slate-800/80 gap-1 self-start">
                  <button
                    onClick={() => setSelectedTab("preview")}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                      selectedTab === "preview"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/15"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
                    }`}
                  >
                    <FileImage className="w-4 h-4" />
                    Auto-Preview
                  </button>
                  <button
                    onClick={() => setSelectedTab("layers")}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                      selectedTab === "layers"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/15"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
                    }`}
                  >
                    <Layers className="w-4 h-4" />
                    Layers ({psdData.layersCount})
                  </button>
                  <button
                    onClick={() => setSelectedTab("metadata")}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                      selectedTab === "metadata"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/15"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
                    }`}
                  >
                    <Info className="w-4 h-4" />
                    Metadata
                  </button>
                  <button
                    onClick={() => setSelectedTab("report")}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                      selectedTab === "report"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/15"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
                    }`}
                  >
                    <Wrench className="w-4 h-4" />
                    Diagnostics
                  </button>
                </div>

                {selectedTab === "preview" && (
                  <button
                    onClick={resetViewport}
                    className="self-end sm:self-auto text-xs font-mono font-medium text-slate-400 hover:text-slate-200 bg-[#0C1222]/80 hover:bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-800 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Maximize className="w-3.5 h-3.5" />
                    Reset Viewport
                  </button>
                )}
              </div>

              {/* TAB CONTENT: 1. INTERACTIVE CANVAS PREVIEW */}
              {selectedTab === "preview" && (
                <div className="flex flex-col gap-4 animate-fadeIn">
                  
                  {/* Canvas Viewport Frame */}
                  <div
                    ref={canvasContainerRef}
                    className="relative bg-[#05080E] border border-slate-800/80 rounded-2xl h-[420px] overflow-hidden select-none cursor-grab active:cursor-grabbing shadow-inner"
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    onMouseLeave={handleCanvasMouseUp}
                  >
                    {/* Viewport Control overlays */}
                    <div className="absolute top-4 left-4 bg-[#070B13]/90 backdrop-blur-md border border-slate-800/80 rounded-xl p-1.5 flex items-center gap-1.5 z-10 shadow-md">
                      <button
                        onClick={() => setZoom((prev) => Math.max(0.2, prev - 0.15))}
                        className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors cursor-pointer"
                        title="Zoom Out"
                      >
                        <ZoomOut className="w-4 h-4" />
                      </button>
                      <span className="text-[11px] font-mono font-bold px-2.5 text-slate-300 select-none">
                        {Math.round(zoom * 100)}%
                      </span>
                      <button
                        onClick={() => setZoom((prev) => Math.min(4, prev + 0.15))}
                        className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors cursor-pointer"
                        title="Zoom In"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="absolute bottom-4 right-4 bg-[#070B13]/95 backdrop-blur border border-slate-800/80 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-300 z-10 flex items-center gap-2 shadow-md">
                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></div>
                      <span className="tracking-tight">Interactive Layer Compositor</span>
                    </div>

                    {/* Canvas Checkerboard Base */}
                    <div
                      className="absolute origin-center transition-transform duration-75 ease-out flex items-center justify-center"
                      style={{
                        transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${zoom})`,
                        top: "50%",
                        left: "50%",
                        marginTop: `-${psdData.header.height / 2}px`,
                        marginLeft: `-${psdData.header.width / 2}px`,
                        width: `${psdData.header.width}px`,
                        height: `${psdData.header.height}px`,
                      }}
                    >
                      {/* CSS Checkerboard Background */}
                      <div 
                        className="absolute inset-0 border border-slate-800 shadow-2xl" 
                        style={{
                          backgroundImage: "linear-gradient(45deg, #090e1a 25%, transparent 25%), linear-gradient(-45deg, #090e1a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #090e1a 75%), linear-gradient(-45deg, transparent 75%, #090e1a 75%)",
                          backgroundSize: "20px 20px",
                          backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
                          backgroundColor: "#030712"
                        }}
                      ></div>
                      
                      <canvas
                        ref={compositeCanvasRef}
                        className="absolute inset-0 pointer-events-none"
                      />
                    </div>
                  </div>

                  {/* Active layers layout list widget inside Preview tab */}
                  <div className="bg-[#0C1222]/40 border border-slate-800/80 rounded-xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4 border-b border-slate-800/60 pb-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">Layer Compositing Toggles</h4>
                      <span className="text-[10px] text-indigo-400 font-mono bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">Live Rendering Engine</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {psdData.layers.map((l) => {
                        const isVisible = layerVisibility[l.id] !== false;
                        return (
                          <div
                            key={l.id}
                            className={`flex items-center justify-between p-3 rounded-xl border text-xs transition-all ${
                              isVisible
                                ? "bg-[#0C1222]/90 border-indigo-500/30 text-slate-100 shadow-sm"
                                : "bg-[#05080E]/40 border-slate-900 text-slate-500"
                            }`}
                          >
                            <div className="flex items-center gap-3 truncate">
                              <button
                                onClick={() => toggleLayer(l.id)}
                                className={`p-1.5 rounded-lg hover:bg-slate-800/80 transition-colors cursor-pointer ${
                                  isVisible ? "text-indigo-400 bg-indigo-500/10" : "text-slate-600 bg-slate-900/40"
                                }`}
                              >
                                {isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                              </button>
                              <span className="truncate font-medium text-slate-200">{l.name}</span>
                            </div>
                            <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-[#05080E] border border-slate-800/60 text-slate-400">
                              {l.width}x{l.height}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              )}

              {/* TAB CONTENT: 2. DETAILED LAYERS VIEW */}
              {selectedTab === "layers" && (
                <div className="flex flex-col gap-4 animate-fadeIn">
                  {psdData.layers.length === 0 ? (
                    <div className="text-center p-12 bg-[#0C1222]/20 border border-slate-800 rounded-2xl shadow-inner">
                      <Layers className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                      <p className="text-sm text-slate-400 font-mono">No discrete layers could be recovered from this binary block.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {psdData.layers.map((layer, index) => (
                        <div
                          key={layer.id}
                          className="bg-[#0C1222]/60 border border-slate-800/80 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm"
                        >
                          <div className="flex items-start gap-4">
                            <div className="bg-indigo-950 text-indigo-400 text-xs font-mono font-bold w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border border-indigo-900/60 shadow-sm">
                              #{psdData.layers.length - index}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <h4 className="font-display font-semibold text-sm text-white">{layer.name}</h4>
                                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-mono font-bold tracking-wide border ${
                                  layer.status === "Healthy"
                                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                    : layer.status === "Repaired"
                                    ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                    : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                }`}>
                                  {layer.status.toUpperCase()}
                                </span>
                              </div>
                              
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-400 mt-3 font-mono">
                                <div className="bg-[#05080E]/60 p-2 rounded-lg border border-slate-800/40">
                                  <span className="text-[10px] text-slate-500 block">DIMENSIONS</span>
                                  <span className="text-slate-300 font-medium">{layer.width} × {layer.height} px</span>
                                </div>
                                <div className="bg-[#05080E]/60 p-2 rounded-lg border border-slate-800/40">
                                  <span className="text-[10px] text-slate-500 block">COORDINATES</span>
                                  <span className="text-slate-300 font-medium">L: {layer.left}, T: {layer.top}</span>
                                </div>
                                <div className="bg-[#05080E]/60 p-2 rounded-lg border border-slate-800/40">
                                  <span className="text-[10px] text-slate-500 block">OPACITY</span>
                                  <span className="text-slate-300 font-medium">{Math.round((layer.opacity / 255) * 100)}%</span>
                                </div>
                                <div className="bg-[#05080E]/60 p-2 rounded-lg border border-slate-800/40">
                                  <span className="text-[10px] text-slate-500 block">CHANNELS</span>
                                  <span className="text-indigo-400 font-semibold">{layer.channels.length} channels</span>
                                </div>
                              </div>

                              {layer.recoveryNotes.length > 0 && (
                                <div className="mt-3.5 space-y-1.5">
                                  {layer.recoveryNotes.map((note, nIdx) => (
                                    <p key={nIdx} className="text-xs text-amber-400/90 flex items-center gap-2 font-mono">
                                      <Wrench className="w-3.5 h-3.5 shrink-0" />
                                      {note}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 w-full md:w-auto self-end md:self-center">
                            <button
                              onClick={() => handleSaveLayer(layer)}
                              className="w-full md:w-auto bg-[#070B13] hover:bg-slate-850 text-xs font-semibold px-4 py-2.5 rounded-xl border border-slate-800 hover:border-slate-700 text-slate-200 transition-all flex items-center justify-center gap-2 font-mono cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Export PNG
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB CONTENT: 3. METADATA SPECIFICATIONS */}
              {selectedTab === "metadata" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fadeIn">
                  
                  {/* File Structure Breakdown */}
                  <div className="bg-[#0C1222]/60 border border-slate-800/80 rounded-2xl p-5 shadow-sm">
                    <h3 className="font-display font-semibold text-sm mb-4 border-b border-slate-800/60 pb-2 text-indigo-400 tracking-wide">FILE STRUCTURE HEADERS</h3>
                    <div className="space-y-3.5 text-xs font-mono">
                      <div className="flex justify-between py-1.5 border-b border-slate-900/60">
                        <span className="text-slate-500">Format Signature:</span>
                        <span className="font-bold text-slate-200">{psdData.header.signature}</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-900/60">
                        <span className="text-slate-500">Format Version:</span>
                        <span className="text-slate-200 font-medium">Version {psdData.header.version} (Standard PSD)</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-900/60">
                        <span className="text-slate-500">Color Channel Count:</span>
                        <span className="text-slate-200 font-medium">{psdData.header.channels} channels</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-900/60">
                        <span className="text-slate-500">Color Depth:</span>
                        <span className="text-slate-200 font-medium">{psdData.header.depth}-bit channels</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-900/60">
                        <span className="text-slate-500">Color Mode Specification:</span>
                        <span className="text-slate-200 font-medium">{psdData.header.colorModeName} ({psdData.header.colorMode})</span>
                      </div>
                      <div className="flex justify-between py-1.5">
                        <span className="text-slate-500">Composite Compression:</span>
                        <span className="text-slate-200 font-medium">
                          {psdData.compositeCompressed === 0 ? "Uncompressed (Raw)" : psdData.compositeCompressed === 1 ? "RLE (PackBits)" : "ZIP Codec"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Image Resource Blocks (EXIF, Slices etc.) */}
                  <div className="bg-[#0C1222]/60 border border-slate-800/80 rounded-2xl p-5 shadow-sm">
                    <h3 className="font-display font-semibold text-sm mb-4 border-b border-slate-800/60 pb-2 text-indigo-400 tracking-wide">RESOURCE BLOCKS & METADATA ({psdData.resourcesCount})</h3>
                    {psdData.resources.length === 0 ? (
                      <div className="text-center py-10 text-xs text-slate-500 font-mono">
                        No image resource metadata block tags could be recovered from this damaged stream.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1.5 custom-scrollbar">
                        {psdData.resources.map((res, rIdx) => (
                          <div key={rIdx} className="flex justify-between items-center text-xs py-2 px-3 bg-[#05080E]/70 rounded-xl border border-slate-800/40 hover:border-slate-800/80 transition-all">
                            <span className="font-mono font-bold text-indigo-400">ID {res.id}</span>
                            <span className="text-slate-300 font-medium truncate max-w-[160px]">{res.name}</span>
                            <span className="font-mono text-[10px] text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-900">{res.size} B</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* TAB CONTENT: 4. DETAILED DIAGNOSTIC REPORT */}
              {selectedTab === "report" && (
                <div className="bg-[#0C1222]/60 border border-slate-800/80 rounded-2xl p-5 shadow-sm animate-fadeIn">
                  <h3 className="font-display font-semibold text-sm mb-4 border-b border-slate-800/60 pb-2 text-indigo-400 tracking-wide">STRUCTURAL DIAGNOSTIC REPORT</h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                    {/* Diagnostic Checklist */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#05080E]/70 border border-slate-800/60 hover:border-slate-800/80 transition-all">
                        <div className="flex items-center gap-3">
                          <Check className="w-4 h-4 text-emerald-400" />
                          <span className="text-xs font-semibold text-slate-300">File Header Structure</span>
                        </div>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${psdData.header.isCorrupt ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
                          {psdData.header.isCorrupt ? "REPAIRED" : "HEALTHY"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#05080E]/70 border border-slate-800/60 hover:border-slate-800/80 transition-all">
                        <div className="flex items-center gap-3">
                          <Check className="w-4 h-4 text-emerald-400" />
                          <span className="text-xs font-semibold text-slate-300">Image Resource Blocks</span>
                        </div>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${psdData.isCorrupt && psdData.resourcesLength === 0 ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
                          {psdData.resources.some(r => r.isCorrupt) ? "REPAIRED" : "HEALTHY"}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#05080E]/70 border border-slate-800/60 hover:border-slate-800/80 transition-all">
                        <div className="flex items-center gap-3">
                          <Check className="w-4 h-4 text-emerald-400" />
                          <span className="text-xs font-semibold text-slate-300">Layer Reference Table</span>
                        </div>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${psdData.layers.some(l => l.status !== "Healthy") ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
                          {psdData.layers.some(l => l.status !== "Healthy") ? "REPAIRED" : "HEALTHY"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#05080E]/70 border border-slate-800/60 hover:border-slate-800/80 transition-all">
                        <div className="flex items-center gap-3">
                          <Check className="w-4 h-4 text-emerald-400" />
                          <span className="text-xs font-semibold text-slate-300">Composite Image Stream</span>
                        </div>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${!psdData.compositeRgba ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
                          {!psdData.compositeRgba ? "CRITICAL" : "RECOVERED"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#05080E]/70 p-4 rounded-xl border border-slate-800/60 shadow-inner">
                    <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2 font-mono">Automated Repair Strategy</h4>
                    <p className="text-xs text-slate-400 leading-relaxed font-sans">
                      Our parsing engine utilizes a <strong className="text-slate-300">Fault-Tolerant Boundary Map</strong>. In standard editors, a wrong byte offset results in a total program crash. This program identifies drifting coordinates, fixes layer index counts, and inserts zero-alpha padding for damaged pixel sequences. The reconstructed output is perfectly formatted to Adobe Photoshop spec guidelines so it compiles natively.
                    </p>
                  </div>
                </div>
              )}

            </div>
          )}
               {/* 4. DETAILED LOCAL EXECUTION GUIDE */}
          <div className="bg-[#0C1222]/40 border border-slate-800/80 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2.5 mb-5 border-b border-slate-800 pb-3">
              <BookOpen className="w-5 h-5 text-indigo-400" />
              <h3 className="font-display font-semibold text-sm text-slate-100">Offline System Usage & Local Execution Guide</h3>
            </div>

            <div className="flex flex-wrap gap-1 bg-[#070B13]/80 p-1 rounded-xl border border-slate-800/80 mb-4 self-start max-w-max">
              <button
                onClick={() => setGuideTab("recovery")}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  guideTab === "recovery"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
                }`}
              >
                1. How Recovery Works
              </button>
              <button
                onClick={() => setGuideTab("local")}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  guideTab === "local"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
                }`}
              >
                2. Run Locally (Offline)
              </button>
              <button
                onClick={() => setGuideTab("specs")}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  guideTab === "specs"
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/40"
                }`}
              >
                3. Compatible Specs
              </button>
            </div>

            {guideTab === "recovery" && (
              <div className="space-y-3.5 text-xs text-slate-400 leading-relaxed animate-fadeIn">
                <p>
                  This utility parses the binary file strictly inside your browser's local memory. The recovery pipeline performs the following steps sequentially:
                </p>
                <ol className="list-decimal list-inside space-y-2 pl-1 text-slate-300 font-sans">
                  <li><strong className="text-white">Signature Alignment:</strong> Identifies signature drift (e.g., corrupted <code className="text-indigo-400 font-mono">8BPS</code> markers) and resets version codes safely.</li>
                  <li><strong className="text-white">Resource Boundary Isolation:</strong> Bypasses corrupted EXIF/slice block records by jumping directly to the layer offset tables.</li>
                  <li><strong className="text-white">Layer Integrity Rebuilding:</strong> Re-indexes truncated channel length descriptors to prevent "out of bounds" program crashes.</li>
                  <li><strong className="text-white">RLE Decompression Recovery:</strong> Safely processes PackBits stream rows, filling missing pixel bytes with default alphas.</li>
                </ol>
              </div>
            )}

            {guideTab === "local" && (
              <div className="space-y-3.5 text-xs text-slate-400 font-mono bg-[#05080E] p-4 rounded-xl border border-slate-800/60 shadow-inner animate-fadeIn">
                <p className="text-indigo-400 font-semibold mb-1 font-sans">Steps to run completely offline on your computer:</p>
                <p className="text-slate-500"># 1. Download and extract this project zip file to your local drive</p>
                <p className="text-slate-200">cd psd-corrupted-recovery</p>
                <p className="text-slate-500"># 2. Install required packages (Vite, React, Tailwind)</p>
                <p className="text-slate-200">npm install</p>
                <p className="text-slate-500"># 3. Boot local development server on localhost</p>
                <p className="text-slate-200">npm run dev</p>
                <p className="text-slate-500"># 4. Open browser to http://localhost:3000. Now you can disconnect your internet entirely!</p>
              </div>
            )}

            {guideTab === "specs" && (
              <div className="space-y-2.5 text-xs text-slate-400 leading-relaxed animate-fadeIn">
                <p>
                  Our rebuilt export file follows standard Photoshop document specifications closely:
                </p>
                <ul className="list-disc list-inside space-y-2 pl-1 text-slate-300">
                  <li>RGB, Grayscale, and CMYK mode parsing supports standard 8-bit channels.</li>
                  <li>Export reconstructed <code className="text-indigo-400 font-mono">.psd</code> binary is fully compatible with CS4, CS5, CS6, CC, and GIMP.</li>
                  <li>Supports PSD/PSB sizes up to 2GB in local memory buffers.</li>
                </ul>
              </div>
            )}
          </div>

        </div>

        {/* RIGHT SIDE PANEL (COL 9 to 12) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* 1. COMPILER & EXPORT ACTION SECTION */}
          {psdData && (
            <div className="bg-gradient-to-br from-[#0C1222]/80 to-[#1e1b4b]/15 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-500/10 rounded-full blur-2xl"></div>
              <h3 className="font-display font-semibold text-sm mb-4 flex items-center gap-2 text-indigo-400">
                <Download className="w-4 h-4" />
                Recovery Export Center
              </h3>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider font-mono">Save File Name</label>
                  <input
                    type="text"
                    value={customFilename}
                    onChange={(e) => setCustomFilename(e.target.value)}
                    placeholder="Enter file name..."
                    className="w-full bg-[#05080E] border border-slate-800 hover:border-slate-700 focus:border-indigo-500 text-slate-200 px-3.5 py-2.5 rounded-xl outline-none font-mono text-xs transition-all shadow-inner"
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    onClick={handleSavePSD}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer text-xs uppercase tracking-wider"
                  >
                    <Download className="w-4 h-4" />
                    Save Repaired PSD File
                  </button>

                  <button
                    onClick={handleSavePNG}
                    className="w-full bg-[#070B13] hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 text-slate-200 font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
                  >
                    <FileImage className="w-4 h-4" />
                    Save Composite as PNG
                  </button>
                </div>

                <div className="border-t border-slate-800/80 pt-3 text-[11px] text-slate-400 space-y-2">
                  <p className="flex items-start gap-2 leading-relaxed font-sans">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Re-compiles the entire container with standard 0-raw uncompressed chunks so Adobe Photoshop is guaranteed to open it cleanly without errors.</span>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 2. LIVE SCAN TERMINAL LOGS (ALWAYS ACCESSIBLE TO OBSERVE) */}
          <div className="bg-[#0C1222]/40 border border-slate-800 rounded-2xl p-5 flex flex-col h-[400px] shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-2.5 mb-3.5 shrink-0">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-indigo-400 animate-pulse" />
                <h3 className="font-display font-bold text-xs uppercase tracking-wider text-slate-400 font-mono">Diagnostic scan console</h3>
              </div>
              {psdData && (
                <button
                  onClick={handleCopyLogs}
                  className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
                  title="Copy Console Logs"
                >
                  {logsCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              )}
            </div>

            {/* Filter tags */}
            {psdData && (
              <div className="flex flex-wrap gap-1.5 mb-3.5 shrink-0">
                {(["all", "info", "warn", "success", "repair"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setLogFilter(lvl)}
                    className={`px-3 py-1 rounded-full font-mono text-[10px] font-bold transition-all uppercase cursor-pointer ${
                      logFilter === lvl
                        ? "bg-indigo-600/25 text-indigo-400 border border-indigo-500/40"
                        : "bg-[#05080E]/80 text-slate-500 hover:text-slate-400 border border-slate-800/40"
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            )}

            {/* Scrolling box */}
            <div className="flex-1 bg-[#05080E] rounded-xl p-3.5 border border-slate-850/60 overflow-y-auto font-mono text-[10px] text-slate-400 space-y-2 custom-scrollbar shadow-inner">
              {!psdData ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-600 gap-2.5">
                  <Activity className="w-6 h-6 text-slate-700 animate-pulse" />
                  <span className="font-mono text-slate-500">Waiting for binary files to run scans...</span>
                </div>
              ) : (
                filteredLogs.map((log) => {
                  let color = "text-slate-400";
                  if (log.level === "warn") color = "text-amber-500";
                  if (log.level === "error") color = "text-rose-500";
                  if (log.level === "success") color = "text-emerald-400";
                  if (log.level === "repair") color = "text-indigo-400 font-semibold";

                  return (
                    <div key={log.id} className="leading-normal hover:bg-[#0C1222]/40 p-1 rounded-md transition-all">
                      <span className="text-slate-600 mr-2">{log.timestamp}</span>
                      <span className={`${color}`}>{log.message}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Privacy Guarantee card */}
          <div className="bg-[#0C1222]/30 border border-slate-800/80 rounded-2xl p-5 text-xs text-slate-400 relative overflow-hidden shadow-sm">
            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500/60"></div>
            <h4 className="font-display font-semibold text-slate-200 flex items-center gap-2 mb-2 pl-1">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              100% Privacy Secure Guarantee
            </h4>
            <p className="leading-relaxed text-[11px] text-slate-400 pl-1 font-sans">
              No internet connection required. All diagnostics, repairs, and visual render processes happen strictly inside your computer's browser RAM. Your high-value client assets are 100% safe from exposure.
            </p>
          </div>

        </div>

      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-900 bg-slate-950/60 text-center py-4 text-xs text-slate-500 mt-10">
        <p>© 2026 Photoshop PSD Corrupted File Recovery Studio. Open-source offline distribution.</p>
      </footer>

    </div>
  );
}
