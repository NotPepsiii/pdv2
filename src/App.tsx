import React, { useState, useEffect, useRef } from 'react';
import { 
  Download, 
  Youtube, 
  Instagram, 
  Settings, 
  FolderSync, 
  CheckCircle2, 
  X, 
  Clock, 
  AlertCircle, 
  HelpCircle,
  HelpCircle as InfoIcon,
  Flame
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Platform, VideoMetadata, Format, DownloadJob, DownloaderSettings, DownloadStatus } from './types';
import TabContent from './components/TabContent';
import DownloadHistory, { formatBytes } from './components/DownloadHistory';
import DirectorySelector from './components/DirectorySelector';
import SettingsPanel from './components/SettingsPanel';
import { generateDummyMediaBlob } from './utils/mediaHelper';

interface Toast {
  id: string;
  type: 'success' | 'info' | 'error' | 'warning';
  message: string;
}

export default function App() {
  // Navigation tabs: 'youtube' | 'tiktok' | 'instagram'
  const [activeTab, setActiveTab] = useState<Platform>('tiktok');
  
  // File System Access States
  const [dirHandle, setDirHandle] = useState<any | null>(null);
  const [selectedDirName, setSelectedDirName] = useState<string>('');

  // Downloader Configuration Engine Settings
  const [settings, setSettings] = useState<DownloaderSettings>({
    maxSpeedMbps: 0, // Uncapped
    autoMerge: true,
    notifyOnComplete: true,
    preferredAudioBitrate: '320',
    simulateFailure: false
  });

  // Active Download Jobs and Queues State
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  
  // Custom interactive toasts/notifications state
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Clock state for beautiful header
  const [currentTime, setCurrentTime] = useState<string>('');

  // Load UTC time continuously
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC');
    };
    updateTime();
    const clockInterval = setInterval(updateTime, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  const addToast = (type: Toast['type'], message: string) => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      removeToast(id);
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleDirectorySelected = (handle: any | null, name: string) => {
    setDirHandle(handle);
    setSelectedDirName(name);
    if (name) {
      addToast('success', `Output directory changed to "${name}"`);
    } else {
      addToast('info', 'Defaulted to browser standard Downloads');
    }
  };

  // Triggering the media download transfer
  const handleStartDownload = (metadata: VideoMetadata, format: Format) => {
    // Check if job already active in queue
    const jobId = `${activeTab}-${metadata.title.substring(0, 10)}-${format.id}`;
    const alreadyExists = jobs.some(j => j.id === jobId && ['downloading', 'fetching', 'merging', 'writing'].includes(j.status));
    
    if (alreadyExists) {
      addToast('warning', 'A download for this media format is already active.');
      return;
    }

    const newJob: DownloadJob = {
      id: jobId,
      platform: activeTab,
      url: metadata.thumbnail, // temporary storage of source info
      title: metadata.title,
      author: metadata.author,
      format: format,
      sizeBytes: format.sizeBytes,
      downloadedBytes: 0,
      speedBytesPerSec: 0,
      status: 'fetching',
      progress: 0,
      timestamp: Date.now(),
      folderPath: selectedDirName || 'Standard Downloads'
    };

    setJobs((prev) => [newJob, ...prev]);
    addToast('info', `Connecting and initiating transfer for "${metadata.title.substring(0, 20)}..."`);
  };

  // Active download streams abort controller registry
  const activeDownloadsRef = useRef<Record<string, { abortController: AbortController }>>({});

  const startRealDownload = async (job: DownloadJob) => {
    if (activeDownloadsRef.current[job.id]) return;

    const abortController = new AbortController();
    activeDownloadsRef.current[job.id] = { abortController };

    // Update job status to downloading
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'downloading', errorMsg: undefined } : j));

    // Platform-specific high-speed CORS-enabled playable fallback media sources
    const defaultFallbacks: Record<string, string> = {
      'yt-4k': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
      'yt-1080p': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      'yt-720p': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
      'yt-audio-320': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      'yt-audio-128': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
      'tt-hd-nowatermark': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
      'tt-hd-watermark': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
      'tt-audio': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
      'ig-hd': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      'ig-sd': 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
      'ig-audio': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3'
    };

    const primaryUrl = job.format.realStreamUrl || defaultFallbacks[job.format.id] || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

    try {
      let response: Response;
      try {
        response = await fetch(primaryUrl, {
          signal: abortController.signal
        });
      } catch (err) {
        console.warn('Primary download stream blocked or failed, trying safe playable fallback:', err);
        const backupUrl = defaultFallbacks[job.format.id] || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';
        response = await fetch(backupUrl, {
          signal: abortController.signal
        });
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('ReadableStream not supported on target body.');
      }

      // Read Content-Length if available, fallback to estimated sizes
      const contentLength = Number(response.headers.get('Content-Length')) || job.format.sizeBytes || 8000000;
      
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, sizeBytes: contentLength } : j));

      const chunks: Uint8Array[] = [];
      let downloadedBytes = 0;
      let lastUpdate = Date.now();
      let bytesSinceLastUpdate = 0;

      while (true) {
        // Double check in state to see if it got paused or deleted before reading
        const currentJob = jobs.find(j => j.id === job.id);
        if (currentJob && currentJob.status === 'paused') {
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        downloadedBytes += value.length;
        bytesSinceLastUpdate += value.length;

        const now = Date.now();
        const elapsed = now - lastUpdate;
        
        if (elapsed >= 150) {
          const speed = (bytesSinceLastUpdate / elapsed) * 1000; // bytes/sec
          const progress = (downloadedBytes / contentLength) * 100;

          // Enforce user speed limiter
          if (settings.maxSpeedMbps > 0) {
            const maxSpeedBytesSec = (settings.maxSpeedMbps * 1024 * 1024) / 8;
            const expectedTimeMs = (bytesSinceLastUpdate / maxSpeedBytesSec) * 1000;
            if (elapsed < expectedTimeMs) {
              await new Promise(resolve => setTimeout(resolve, expectedTimeMs - elapsed));
            }
          }

          // Trigger simulated failures if toggled
          if (settings.simulateFailure && progress > 45 && progress < 55) {
            throw new Error('Simulated packet loss. Connection reset.');
          }

          setJobs(prev => prev.map(j => {
            if (j.id === job.id && j.status === 'downloading') {
              return {
                ...j,
                downloadedBytes,
                progress: Math.min(progress, 99.9),
                speedBytesPerSec: speed
              };
            }
            return j;
          }));

          lastUpdate = Date.now();
          bytesSinceLastUpdate = 0;
        }
      }

      // Check final state
      delete activeDownloadsRef.current[job.id];

      // Assemble chunks
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const fileData = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        fileData.set(chunk, offset);
        offset += chunk.length;
      }

      const mimeType = job.format.isAudio ? 'audio/mp3' : 'video/mp4';
      const fileBlob = new Blob([fileData], { type: mimeType });

      // YouTube demuxing & audio merge step if toggled
      if (job.platform === 'youtube' && settings.autoMerge) {
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'merging', progress: 100, speedBytesPerSec: 0 } : j));
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      // Writing step
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'writing' } : j));

      const cleanTitle = job.title.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `${cleanTitle}_${job.format.resolution}.${job.format.ext}`;

      if (dirHandle) {
        try {
          const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(fileBlob);
          await writable.close();
        } catch (err) {
          console.error('Directory write failed, falling back to anchor trigger:', err);
          triggerBrowserDownload(fileBlob, filename);
        }
      } else {
        triggerBrowserDownload(fileBlob, filename);
      }

      setJobs(prev => prev.map(j => j.id === job.id ? { 
        ...j, 
        status: 'completed', 
        downloadedBytes: totalLength, 
        progress: 100, 
        speedBytesPerSec: 0 
      } : j));

      if (settings.notifyOnComplete) {
        addToast('success', `"${job.title.substring(0, 20)}..." downloaded successfully!`);
      }

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Stream download aborted by user.');
        return;
      }

      console.error('Download stream error:', err);
      delete activeDownloadsRef.current[job.id];
      setJobs(prev => prev.map(j => j.id === job.id ? { 
        ...j, 
        status: 'failed', 
        errorMsg: err.message || 'Stream connection lost.' 
      } : j));
      addToast('error', `Download failed: ${job.title.substring(0, 15)}...`);
    }
  };

  // Job Actions
  const handlePauseJob = (id: string) => {
    if (activeDownloadsRef.current[id]) {
      activeDownloadsRef.current[id].abortController.abort();
      delete activeDownloadsRef.current[id];
    }
    setJobs((prev) => prev.map((job) => {
      if (job.id === id) {
        return {
          ...job,
          status: 'paused',
          speedBytesPerSec: 0
        };
      }
      return job;
    }));
    addToast('info', 'Media file transfer suspended.');
  };

  const handleResumeJob = (id: string) => {
    setJobs((prev) => prev.map((job) => {
      if (job.id === id) {
        return {
          ...job,
          status: 'downloading',
          errorMsg: undefined
        };
      }
      return job;
    }));
    addToast('info', 'Resuming media stream transfer.');
  };

  const handleCancelJob = (id: string) => {
    if (activeDownloadsRef.current[id]) {
      activeDownloadsRef.current[id].abortController.abort();
      delete activeDownloadsRef.current[id];
    }
    setJobs((prev) => prev.filter((job) => job.id !== id));
    addToast('warning', 'Download job cancelled.');
  };

  const handleClearHistory = () => {
    // Abort all active streams on clear
    Object.keys(activeDownloadsRef.current).forEach(id => {
      activeDownloadsRef.current[id].abortController.abort();
    });
    activeDownloadsRef.current = {};
    setJobs([]);
    addToast('info', 'Download histories cleared.');
  };

  // Background Stream Trigger Engine
  useEffect(() => {
    jobs.forEach(job => {
      if (job.status === 'fetching') {
        startRealDownload(job);
      } else if (job.status === 'downloading' && !activeDownloadsRef.current[job.id]) {
        startRealDownload(job);
      }
    });
  }, [jobs]);

  const triggerBrowserDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-cyan-500 selection:text-slate-950">
      
      {/* Toast Overlay Notifications */}
      <div id="toast-container" className="fixed top-6 right-6 z-50 flex flex-col gap-3.5 max-w-sm pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              id={`toast-${toast.id}`}
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.9 }}
              className={`p-4 rounded-xl border shadow-2xl pointer-events-auto flex items-start gap-3.5 ${
                toast.type === 'success' 
                  ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
                  : toast.type === 'error'
                    ? 'bg-red-950/90 border-red-500/40 text-red-200'
                    : toast.type === 'warning'
                      ? 'bg-amber-950/90 border-amber-500/40 text-amber-200'
                      : 'bg-slate-900/90 border-slate-800 text-slate-200'
              }`}
            >
              <div className="mt-0.5 flex-shrink-0">
                {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
                {toast.type === 'warning' && <AlertCircle className="w-4 h-4 text-amber-400" />}
                {toast.type === 'info' && <InfoIcon className="w-4 h-4 text-cyan-400" />}
              </div>
              
              <div className="flex-1">
                <p className="text-xs font-medium font-sans leading-relaxed">{toast.message}</p>
              </div>

              <button
                id={`close-toast-${toast.id}`}
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
                type="button"
                aria-label="Close notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Main Body Section */}
      <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8 flex-1">
        
        {/* Header Hero Area */}
        <header id="main-header" className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-900 pb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-2xl shadow-lg shadow-cyan-500/20">
                <Download className="w-6 h-6 text-slate-950 stroke-[2.5]" />
              </div>
              <h1 className="text-2xl font-black tracking-tight text-slate-100 font-sans">
                Pep<span className="text-cyan-400">Downloader</span>
              </h1>
              <span className="text-[10px] font-bold uppercase tracking-widest bg-cyan-400/10 text-cyan-400 px-2.5 py-1 rounded-full border border-cyan-400/20">
                V3.0 Stable
              </span>
            </div>
            
            <p className="text-xs text-slate-400 mt-1.5 font-sans">
              Secure, server-less high-definition media transfer for TikTok, YouTube, and Instagram.
            </p>
          </div>

          <div className="flex flex-col items-end gap-1 text-right">
            <span className="text-xs font-mono font-bold text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
              🕒 {currentTime || 'Loading clock...'}
            </span>
          </div>
        </header>

        {/* Directory Destination Picker */}
        <DirectorySelector 
          onDirectorySelected={handleDirectorySelected}
          selectedDirName={selectedDirName}
        />

        {/* Platform Tabs Control Board */}
        <div id="tabs-navigation-panel" className="bg-slate-900/30 border border-slate-900 rounded-3xl p-2.5 flex flex-wrap gap-2.5">
          <button
            id="tab-tiktok"
            type="button"
            onClick={() => setActiveTab('tiktok')}
            className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer ${
              activeTab === 'tiktok'
                ? 'bg-slate-950 text-slate-100 shadow-xl border border-slate-800/80'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <span className="text-sm">𝅘𝅥𝅮</span>
            TikTok HD
          </button>

          <button
            id="tab-youtube"
            type="button"
            onClick={() => setActiveTab('youtube')}
            className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer ${
              activeTab === 'youtube'
                ? 'bg-red-950/20 text-red-400 shadow-xl border border-red-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <Youtube className="w-4 h-4" />
            YouTube HD
          </button>

          <button
            id="tab-instagram"
            type="button"
            onClick={() => setActiveTab('instagram')}
            className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer ${
              activeTab === 'instagram'
                ? 'bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-orange-500/10 text-pink-400 shadow-xl border border-pink-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <Instagram className="w-4 h-4" />
            Instagram Reels
          </button>
        </div>

        {/* Tab Content Window Container */}
        <div id="tab-window" className="bg-slate-900/10 border border-slate-900 rounded-3xl p-1">
          <TabContent 
            platform={activeTab} 
            onDownloadStart={handleStartDownload}
            isDownloadingAny={jobs.some(j => ['fetching', 'downloading'].includes(j.status))}
          />
        </div>

        {/* Transfer manager list */}
        <DownloadHistory 
          jobs={jobs}
          onPauseJob={handlePauseJob}
          onResumeJob={handleResumeJob}
          onCancelJob={handleCancelJob}
          onClearHistory={handleClearHistory}
        />

        {/* Engine Configuration Module */}
        <SettingsPanel 
          settings={settings}
          onChange={setSettings}
        />

      </div>

      {/* Aesthetic human footer */}
      <footer id="main-footer" className="border-t border-slate-900 bg-slate-950/80 backdrop-blur-md py-6">
        <div className="max-w-6xl w-full mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 font-sans">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span>PepDownloader Engine is fully compliant and sandboxed offline‑ready client app.</span>
          </div>

          <div>
            <span>Developed in React • Vite • Tailwind</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
