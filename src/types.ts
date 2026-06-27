export type LogLevel = "info" | "warn" | "success" | "error" | "repair";

export interface RecoveryLog {
  id: string;
  timestamp: string;
  level: LogLevel;
  message: string;
}

export interface PSDHeader {
  signature: string;
  version: number;
  channels: number;
  height: number;
  width: number;
  depth: number;
  colorMode: number;
  colorModeName: string;
  isCorrupt: boolean;
  issues: string[];
}

export interface PSDResourceBlock {
  id: number;
  signature: string;
  name: string;
  size: number;
  isCorrupt: boolean;
}

export interface PSDLayer {
  id: string;
  name: string;
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
  height: number;
  opacity: number;
  visible: boolean;
  blendMode: string;
  channels: { id: number; length: number }[];
  status: "Healthy" | "Corrupted" | "Repaired" | "Synthesized";
  recoveryNotes: string[];
  // Loaded RGBA pixel data
  rgbaData?: Uint8ClampedArray;
}

export interface PSDStructure {
  fileName: string;
  fileSize: number;
  header: PSDHeader;
  colorModeLength: number;
  resourcesLength: number;
  resourcesCount: number;
  resources: PSDResourceBlock[];
  layersLength: number;
  layersCount: number;
  layers: PSDLayer[];
  compositeCompressed: number; // 0=Raw, 1=RLE, etc.
  compositeRgba?: Uint8ClampedArray;
  isCorrupt: boolean;
  recoveryLogs: RecoveryLog[];
  recoveryProgress: number;
}
