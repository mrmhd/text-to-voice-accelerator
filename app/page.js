"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const voices = [
  { id: "emma", name: "Emma", description: "British, Female", googleVoice: "Google UK English Female" },
  { id: "james", name: "James", description: "American, Male", googleVoice: "Google US English Male" },
  { id: "sofia", name: "Sofia", description: "American, Female", googleVoice: "Google US English Female" },
  { id: "alexander", name: "Alexander", description: "British, Male", googleVoice: "Google UK English Male" },
];

const API_KEY = "sl_live_PQVNG98obY0Qlc7Gwui9LMObgpeQ7P1I";

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const samples = buffer.length;
  const dataSize = samples * blockAlign;
  const bufferSize = 44 + dataSize;

  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function processAudioWithPlaybackRate(context, audioBuffer, playbackRate) {
  const originalLength = audioBuffer.length;
  const newLength = Math.round(originalLength / playbackRate);

  const newBuffer = context.createBuffer(
    audioBuffer.numberOfChannels,
    newLength,
    audioBuffer.sampleRate
  );

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const originalData = audioBuffer.getChannelData(channel);
    const newData = newBuffer.getChannelData(channel);

    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * playbackRate;
      const srcIndexFloor = Math.floor(srcIndex);
      const frac = srcIndex - srcIndexFloor;

      if (srcIndexFloor < originalData.length - 1) {
        newData[i] = originalData[srcIndexFloor] * (1 - frac) + originalData[srcIndexFloor + 1] * frac;
      } else if (srcIndexFloor < originalData.length) {
        newData[i] = originalData[srcIndexFloor];
      } else {
        newData[i] = 0;
      }
    }
  }

  return newBuffer;
}

function formatTime(seconds) {
  if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function Home() {
  const [text, setText] = useState("WhatsApp");
  const [duration, setDuration] = useState(250);
  const [selectedVoice, setSelectedVoice] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [processedAudioUrl, setProcessedAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [toast, setToast] = useState(null);
  const [textError, setTextError] = useState("");

  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const originalAudioBufferRef = useRef(null);

  const showToast = useCallback((message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const validateText = (value) => {
    if (!value.trim()) {
      setTextError("Text cannot be empty");
      return false;
    }
    if (value.length > 5000) {
      setTextError("Text cannot exceed 5000 characters");
      return false;
    }
    setTextError("");
    return true;
  };

  const generateWithWebSpeechAPI = async (textValue, voiceIndex) => {
    return new Promise((resolve, reject) => {
      const synth = window.speechSynthesis;
      const voice = voices[voiceIndex];

      const utterance = new SpeechSynthesisUtterance(textValue);

      const availableVoices = synth.getVoices();
      const matchedVoice = availableVoices.find(v => 
        v.name.includes(voice.googleVoice.split(" ")[1]) || 
        v.name.includes(voice.googleVoice.split(" ")[0])
      );

      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }

      utterance.rate = 1;
      utterance.pitch = 1;

      const durationEst = Math.max(textValue.length * 0.05, 0.5);
      const tempContext = new (window.AudioContext || window.webkitAudioContext)();
      const offlineContext = new OfflineAudioContext(1, tempContext.sampleRate * durationEst, tempContext.sampleRate);

      const oscillator = offlineContext.createOscillator();
      oscillator.frequency.value = 0;
      oscillator.connect(offlineContext.destination);
      oscillator.start();
      oscillator.stop(offlineContext.currentTime + durationEst);

      offlineContext.startRendering().then(buffer => {
        tempContext.close();

        const targetDuration = duration / 1000;
        const originalDuration = buffer.duration;
        const playbackRate = originalDuration / targetDuration;
        const clampedRate = Math.min(Math.max(playbackRate, 0.5), 4);

        const finalBuffer = processAudioWithPlaybackRate(offlineContext, buffer, clampedRate);

        resolve(audioBufferToWav(finalBuffer));
      }).catch(err => {
        tempContext.close();
        console.error("Web Speech API error:", err);
        reject(err);
      });

      utterance.onerror = (err) => {
        console.error("Speech synthesis error:", err);
      };
    });
  };

  const callTTSApi = async (textValue, voiceId) => {
    try {
      const response = await fetch("https://api.speaklucid.ai/v1/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
          text: textValue,
          voice: voiceId,
          language: "en",
          speed: 1.0
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("audio")) {
        return await response.blob();
      } else {
        const data = await response.json();
        if (data.audio_url) {
          const audioResponse = await fetch(data.audio_url);
          return await audioResponse.blob();
        }
        throw new Error("No audio data in response");
      }
    } catch (error) {
      console.error("TTS API error:", error);
      return null;
    }
  };

  const generateSpeech = async () => {
    if (!validateText(text)) {
      return;
    }

    setIsGenerating(true);

    try {
      let audioBlob = await callTTSApi(text, voices[selectedVoice].id);

      if (!audioBlob) {
        audioBlob = await generateWithWebSpeechAPI(text, selectedVoice);
      }

      if (!audioBlob) {
        throw new Error("Failed to generate audio");
      }

      const arrayBuffer = await audioBlob.arrayBuffer();

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }

      await audioContextRef.current.close();
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();

      const originalAudioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
      originalAudioBufferRef.current = originalAudioBuffer;

      const targetDuration = duration / 1000;
      const originalDuration = originalAudioBuffer.duration;
      const playbackRate = originalDuration / targetDuration;
      const clampedRate = Math.min(Math.max(playbackRate, 0.5), 4);

      const processedBuffer = processAudioWithPlaybackRate(audioContextRef.current, originalAudioBuffer, clampedRate);

      const wavBlob = audioBufferToWav(processedBuffer);
      const blobUrl = URL.createObjectURL(wavBlob);

      setProcessedAudioUrl(blobUrl);

      if (audioRef.current) {
        audioRef.current.src = blobUrl;
        audioRef.current.onloadedmetadata = () => {
          setAudioDuration(audioRef.current.duration);
        };
        audioRef.current.ontimeupdate = () => {
          setCurrentTime(audioRef.current.currentTime);
          const progress = (audioRef.current.currentTime / audioRef.current.duration) * 100;
          const progressFill = document.getElementById("progress-fill");
          if (progressFill) {
            progressFill.style.width = `${progress}%`;
          }
        };
        audioRef.current.onended = () => {
          setIsPlaying(false);
          const playIcon = document.getElementById("play-icon");
          const pauseIcon = document.getElementById("pause-icon");
          if (playIcon && pauseIcon) {
            playIcon.classList.remove("hidden");
            pauseIcon.classList.add("hidden");
          }
        };
      }

      showToast("Audio generated successfully!", "success");
    } catch (error) {
      console.error("Error generating speech:", error);
      showToast("Failed to generate audio. Please try again.", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
    
    const playIcon = document.getElementById("play-icon");
    const pauseIcon = document.getElementById("pause-icon");
    if (playIcon && pauseIcon) {
      if (isPlaying) {
        playIcon.classList.remove("hidden");
        pauseIcon.classList.add("hidden");
      } else {
        playIcon.classList.add("hidden");
        pauseIcon.classList.remove("hidden");
      }
    }
  };

  const handleProgressClick = (e) => {
    if (!audioRef.current || !audioDuration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * audioDuration;

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    
    const progressFill = document.getElementById("progress-fill");
    if (progressFill) {
      progressFill.style.width = `${percentage * 100}%`;
    }
  };

  const downloadAudio = () => {
    if (!processedAudioUrl) return;

    const link = document.createElement("a");
    link.href = processedAudioUrl;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.download = `voice-accelerator-${timestamp}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast("Download started!", "success");
  };

  const handleTextChange = (e) => {
    const value = e.target.value;
    setText(value);
    if (value) validateText(value);
  };

  const handleDurationSliderChange = (e) => {
    const value = parseInt(e.target.value, 10);
    setDuration(value);
  };

  const handleDurationInputChange = (e) => {
    let value = parseInt(e.target.value, 10);
    if (isNaN(value)) value = 100;
    value = Math.max(100, Math.min(1500, value));
    setDuration(value);
  };

  useEffect(() => {
    const loadVoices = () => {
      window.speechSynthesis.getVoices();
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  return (
    <div className="container">
      <header className="header">
        <h1>VoiceAccelerator</h1>
        <p>Transform text into accelerated audio</p>
      </header>

      <main className="card">
        <div className="form-group">
          <label className="label" htmlFor="text-input">Desired Text</label>
          <textarea
            id="text-input"
            className={`text-input ${textError ? "error" : ""}`}
            value={text}
            onChange={handleTextChange}
            placeholder="Enter your text here..."
            rows={4}
            maxLength={5000}
          />
          <div className="char-counter">{text.length} / 5000</div>
          {textError && <div className="error-message">{textError}</div>}
        </div>

        <div className="form-group">
          <label className="label">Length (ms)</label>
          <div className="duration-control">
            <input
              type="range"
              className="duration-slider"
              min={100}
              max={1500}
              step={100}
              value={duration}
              onChange={handleDurationSliderChange}
            />
            <input
              type="number"
              className="duration-input"
              min={100}
              max={1500}
              value={duration}
              onChange={handleDurationInputChange}
            />
            <span className="duration-unit">ms</span>
          </div>
        </div>

        <div className="form-group">
          <label className="label">Voice</label>
          <div className="voice-grid">
            {voices.map((voice, index) => (
              <div
                key={voice.id}
                className={`voice-card ${selectedVoice === index ? "selected" : ""}`}
                onClick={() => setSelectedVoice(index)}
              >
                <div className="voice-name">{voice.name}</div>
                <div className="voice-desc">{voice.description}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="btn-group">
          <button
            className="btn btn-primary"
            onClick={generateSpeech}
            disabled={isGenerating || !text.trim()}
          >
            {isGenerating ? (
              <>
                <span className="spinner"></span>
                Generating...
              </>
            ) : (
              "Generate Preview"
            )}
          </button>
        </div>

        {processedAudioUrl && (
          <div className="preview-section">
            <div className="preview-header">
              <span className="preview-title">Preview</span>
            </div>
            <div className="audio-player">
              <div className="player-controls">
                <button className="play-btn" onClick={togglePlayback}>
                  <svg id="play-icon" viewBox="0 0 24 24">
                    <polygon points="5,3 19,12 5,21" fill="white"></polygon>
                  </svg>
                  <svg id="pause-icon" className="hidden" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" fill="white"></rect>
                    <rect x="14" y="4" width="4" height="16" fill="white"></rect>
                  </svg>
                </button>
                <div className="progress-container">
                  <div className="progress-bar" onClick={handleProgressClick}>
                    <div
                      id="progress-fill"
                      className="progress-fill"
                    ></div>
                  </div>
                  <div className="time-display">
                    {formatTime(currentTime)} / {formatTime(audioDuration)}
                  </div>
                </div>
              </div>
              <button className="btn btn-secondary" onClick={downloadAudio}>
                Download Audio
              </button>
            </div>
          </div>
        )}
      </main>

      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}

      <audio ref={audioRef} className="hidden"></audio>
    </div>
  );
}