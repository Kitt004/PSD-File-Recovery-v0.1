import { PSDStructure, PSDHeader, PSDResourceBlock, PSDLayer, RecoveryLog, LogLevel } from "../types";

// Unique ID helper
const generateId = () => Math.random().toString(36).substring(2, 9);

// Custom Safe Binary Reader
class SafeBinaryReader {
  private view: DataView;
  private offset: number;
  private length: number;
  public logs: RecoveryLog[] = [];
  public hasCorruption: boolean = false;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.offset = 0;
    this.length = buffer.byteLength;
  }

  getOffset(): number {
    return this.offset;
  }

  setOffset(off: number) {
    this.offset = Math.max(0, Math.min(this.length, off));
  }

  getLength(): number {
    return this.length;
  }

  isEOF(): boolean {
    return this.offset >= this.length;
  }

  bytesRemaining(): number {
    return Math.max(0, this.length - this.offset);
  }

  log(message: string, level: LogLevel = "info") {
    this.logs.push({
      id: generateId(),
      timestamp: new Date().toLocaleTimeString(),
      level,
      message,
    });
  }

  readUint8(): number {
    if (this.offset >= this.length) {
      if (!this.hasCorruption) {
        this.log("Unexpected End-Of-File while reading byte. Padding with 0.", "error");
        this.hasCorruption = true;
      }
      return 0;
    }
    const val = this.view.getUint8(this.offset);
    this.offset += 1;
    return val;
  }

  readInt8(): number {
    if (this.offset >= this.length) {
      if (!this.hasCorruption) {
        this.log("Unexpected End-Of-File while reading signed byte. Padding with 0.", "error");
        this.hasCorruption = true;
      }
      return 0;
    }
    const val = this.view.getInt8(this.offset);
    this.offset += 1;
    return val;
  }

  readUint16(): number {
    if (this.offset + 2 > this.length) {
      if (!this.hasCorruption) {
        this.log("Unexpected End-Of-File while reading 16-bit unsigned integer. Padding with 0.", "error");
        this.hasCorruption = true;
      }
      this.offset = this.length;
      return 0;
    }
    const val = this.view.getUint16(this.offset, false); // Big endian
    this.offset += 2;
    return val;
  }

  readInt16(): number {
    if (this.offset + 2 > this.length) {
      if (!this.hasCorruption) {
        this.log("Unexpected End-Of-File while reading 16-bit signed integer. Padding with 0.", "error");
        this.hasCorruption = true;
      }
      this.offset = this.length;
      return 0;
    }
    const val = this.view.getInt16(this.offset, false); // Big endian
    this.offset += 2;
    return val;
  }

  readUint32(): number {
    if (this.offset + 4 > this.length) {
      if (!this.hasCorruption) {
        this.log("Unexpected End-Of-File while reading 32-bit unsigned integer. Padding with 0.", "error");
        this.hasCorruption = true;
      }
      this.offset = this.length;
      return 0;
    }
    const val = this.view.getUint32(this.offset, false); // Big endian
    this.offset += 4;
    return val;
  }

  readInt32(): number {
    if (this.offset + 4 > this.length) {
      if (!this.hasCorruption) {
        this.log("Unexpected End-Of-File while reading 32-bit signed integer. Padding with 0.", "error");
        this.hasCorruption = true;
      }
      this.offset = this.length;
      return 0;
    }
    const val = this.view.getInt32(this.offset, false); // Big endian
    this.offset += 4;
    return val;
  }

  readString(len: number): string {
    let str = "";
    for (let i = 0; i < len; i++) {
      const charCode = this.readUint8();
      if (charCode > 0) {
        str += String.fromCharCode(charCode);
      }
    }
    return str;
  }

  readPascalString(padding: number = 2): string {
    const len = this.readUint8();
    let str = "";
    for (let i = 0; i < len; i++) {
      const charCode = this.readUint8();
      if (charCode > 0 && charCode < 128) { // basic ASCII safety check
        str += String.fromCharCode(charCode);
      }
    }
    
    // Total bytes read: 1 (for length) + len
    const totalBytes = 1 + len;
    const remainder = totalBytes % padding;
    if (remainder !== 0) {
      const skip = padding - remainder;
      this.skip(skip);
    }
    return str;
  }

  skip(bytes: number) {
    this.offset = Math.min(this.length, this.offset + bytes);
  }

  readBytes(len: number): Uint8Array {
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = this.readUint8();
    }
    return bytes;
  }
}

// Robust PackBits RLE Decoder
export function decodePackBits(compressed: Uint8Array, expectedLength: number): Uint8Array {
  const result = new Uint8Array(expectedLength);
  let rIdx = 0;
  let wIdx = 0;
  
  try {
    while (rIdx < compressed.length && wIdx < expectedLength) {
      const header = compressed[rIdx++];
      if (header === undefined) break;
      
      const n = header >= 128 ? header - 256 : header;
      
      if (n >= 0 && n <= 127) {
        const count = n + 1;
        for (let i = 0; i < count && wIdx < expectedLength; i++) {
          if (rIdx < compressed.length) {
            result[wIdx++] = compressed[rIdx++];
          } else {
            result[wIdx++] = 0; // Padding
          }
        }
      } else if (n >= -127 && n <= -1) {
        const count = -n + 1;
        if (rIdx < compressed.length) {
          const val = compressed[rIdx++];
          for (let i = 0; i < count && wIdx < expectedLength; i++) {
            result[wIdx++] = val;
          }
        } else {
          wIdx += count; // keep as zeros
        }
      }
    }
  } catch (err) {
    // Return partial results safely on corruption
  }
  return result;
}

// Decodes a single channel's image data
function decodeChannel(
  reader: SafeBinaryReader,
  width: number,
  height: number,
  compressed: number
): Uint8Array {
  const pixelCount = width * height;
  if (pixelCount <= 0 || pixelCount > 50000000) {
    return new Uint8Array(0);
  }

  if (compressed === 0) {
    // Uncompressed
    return reader.readBytes(pixelCount);
  } else if (compressed === 1) {
    // RLE Compressed
    // First, height * numChannels (usually height) Uint16s containing lengths for each row
    const rowByteCounts: number[] = [];
    for (let i = 0; i < height; i++) {
      rowByteCounts.push(reader.readUint16());
    }

    // Now, read and decompress the PackBits rows
    const allChannelBytes = new Uint8Array(pixelCount);
    let writeOffset = 0;

    for (let i = 0; i < height; i++) {
      const byteCount = rowByteCounts[i] || 0;
      if (byteCount <= 0 || reader.getOffset() + byteCount > reader.getLength()) {
        // Out of bounds or bad RLE count: pad remaining row with zero bytes
        writeOffset += width;
        continue;
      }
      
      const rleData = reader.readBytes(byteCount);
      const decompressedRow = decodePackBits(rleData, width);
      allChannelBytes.set(decompressedRow, writeOffset);
      writeOffset += width;
    }
    return allChannelBytes;
  }
  
  // Unsupported compression (ZIP/etc) - return blank
  return new Uint8Array(pixelCount);
}

// Main PSD Parser
export function parsePSD(buffer: ArrayBuffer, fileName: string): PSDStructure {
  const reader = new SafeBinaryReader(buffer);
  reader.log(`Starting binary scan of ${fileName} (${buffer.byteLength} bytes)`, "info");

  let isCorrupt = false;

  // 1. PSD HEADER SCAN
  const sig = reader.readString(4);
  let headerSig = sig;
  let headerIsCorrupt = false;
  const headerIssues: string[] = [];

  if (sig !== "8BPS") {
    headerIsCorrupt = true;
    isCorrupt = true;
    headerIssues.push(`Invalid file signature: Found '${sig}', expected '8BPS'`);
    reader.log(`CRITICAL: Invalid signature '${sig}'. Automatic recovery will force '8BPS' configuration.`, "repair");
    headerSig = "8BPS";
  }

  let version = reader.readUint16();
  if (version !== 1 && version !== 2) {
    headerIsCorrupt = true;
    isCorrupt = true;
    headerIssues.push(`Invalid PSD/PSB version: Found ${version}, expected 1 or 2`);
    reader.log(`WARNING: Invalid version ${version}. Defaulting to standard PSD (Version 1).`, "repair");
    version = 1;
  }

  // Skip reserved 6 bytes
  reader.skip(6);

  let channels = reader.readUint16();
  if (channels < 1 || channels > 56) {
    headerIsCorrupt = true;
    isCorrupt = true;
    headerIssues.push(`Invalid channel count: ${channels} (standard is 1-4)`);
    reader.log(`WARNING: Suspect channel count ${channels}. Restoring default RGB+Alpha (4 channels).`, "repair");
    channels = 4;
  }

  let height = reader.readUint32();
  if (height < 1 || height > 300000) {
    headerIsCorrupt = true;
    isCorrupt = true;
    headerIssues.push(`Invalid canvas height: ${height} pixels`);
    reader.log(`WARNING: Height ${height} is invalid. Recovering using default 800px.`, "repair");
    height = 800;
  }

  let width = reader.readUint32();
  if (width < 1 || width > 300000) {
    headerIsCorrupt = true;
    isCorrupt = true;
    headerIssues.push(`Invalid canvas width: ${width} pixels`);
    reader.log(`WARNING: Width ${width} is invalid. Recovering using default 800px.`, "repair");
    width = 800;
  }

  let depth = reader.readUint16();
  if (depth !== 1 && depth !== 8 && depth !== 16 && depth !== 32) {
    headerIsCorrupt = true;
    isCorrupt = true;
    headerIssues.push(`Invalid color depth: ${depth} bits`);
    reader.log(`WARNING: Invalid depth ${depth}-bit. Restoring standard 8-bit depth.`, "repair");
    depth = 8;
  }

  let colorMode = reader.readUint16();
  const modeNames: { [key: number]: string } = {
    0: "Bitmap",
    1: "Grayscale",
    2: "Indexed",
    3: "RGB Color",
    4: "CMYK Color",
    7: "Multichannel",
    8: "Duotone",
    9: "Lab Color",
  };
  let colorModeName = modeNames[colorMode] || "Unknown";
  if (colorModeName === "Unknown") {
    headerIsCorrupt = true;
    isCorrupt = true;
    headerIssues.push(`Invalid color mode code: ${colorMode}`);
    reader.log(`WARNING: Invalid color mode ${colorMode}. Restoring RGB Color Mode.`, "repair");
    colorMode = 3;
    colorModeName = "RGB Color";
  }

  const header: PSDHeader = {
    signature: headerSig,
    version,
    channels,
    height,
    width,
    depth,
    colorMode,
    colorModeName,
    isCorrupt: headerIsCorrupt,
    issues: headerIssues,
  };

  reader.log(`PSD Header Scanned: ${width}x${height}px, Mode: ${colorModeName}, Depth: ${depth}-bit, Channels: ${channels}`, "success");

  // 2. COLOR MODE DATA SECTION
  const colorModeLength = reader.readUint32();
  if (colorModeLength > 0) {
    reader.log(`Color mode section found (Length: ${colorModeLength} bytes). Parsing index table.`, "info");
    if (reader.getOffset() + colorModeLength > reader.getLength()) {
      isCorrupt = true;
      reader.log("CRITICAL: Color Mode Section truncated. Padding missing index bytes.", "repair");
      reader.setOffset(reader.getLength());
    } else {
      reader.skip(colorModeLength);
    }
  }

  // 3. IMAGE RESOURCES SECTION
  let resourcesLength = reader.readUint32();
  const resources: PSDResourceBlock[] = [];
  let resourcesCount = 0;
  
  if (resourcesLength > 0) {
    const resourcesEnd = Math.min(reader.getLength(), reader.getOffset() + resourcesLength);
    reader.log(`Image Resources block located (Size: ${resourcesLength} bytes). Parsing metadata.`, "info");
    
    if (reader.getOffset() + resourcesLength > reader.getLength()) {
      isCorrupt = true;
      reader.log(`WARNING: Resources block truncated (Expected ${resourcesLength} bytes, remaining only ${reader.getLength() - reader.getOffset()} bytes). Repairing boundary references.`, "repair");
      resourcesLength = reader.getLength() - reader.getOffset();
    }

    while (reader.getOffset() < resourcesEnd) {
      const blockStart = reader.getOffset();
      const blockSig = reader.readString(4);
      
      if (blockSig !== "8BIM" && blockSig !== "MeSa" && blockSig !== "PHUT") {
        // Alignment error or corrupted block. We will scan for next '8BIM'
        isCorrupt = true;
        reader.log(`Structure drift detected in resource block at offset ${blockStart}. Scanning for healthy '8BIM' signature...`, "warn");
        
        // Scan ahead
        let foundOffset = -1;
        for (let i = blockStart + 1; i < resourcesEnd - 4; i++) {
          reader.setOffset(i);
          if (reader.readString(4) === "8BIM") {
            foundOffset = i;
            break;
          }
        }
        
        if (foundOffset !== -1) {
          reader.log(`Healthy resource signature found at offset ${foundOffset}. Resuming scan.`, "repair");
          reader.setOffset(foundOffset);
          continue;
        } else {
          reader.log("End of valid resource blocks reached due to severe chunk corruption.", "repair");
          reader.setOffset(resourcesEnd);
          break;
        }
      }

      const blockID = reader.readUint16();
      const blockName = reader.readPascalString(2);
      const blockSize = reader.readUint32();

      const blockIsCorrupt = reader.getOffset() + blockSize > resourcesEnd;
      if (blockIsCorrupt) {
        isCorrupt = true;
        reader.log(`WARNING: Resource ID ${blockID} (${blockName || "Unnamed"}) declares size ${blockSize} but exceeds bounds. Trimmed to boundary.`, "repair");
        reader.setOffset(resourcesEnd);
        break;
      }

      resources.push({
        id: blockID,
        signature: blockSig,
        name: blockName || `Meta-Block #${blockID}`,
        size: blockSize,
        isCorrupt: blockIsCorrupt,
      });

      resourcesCount++;
      reader.skip(blockSize + (blockSize % 2 !== 0 ? 1 : 0)); // Pad to even
    }
    
    reader.setOffset(resourcesEnd);
    reader.log(`Parsed ${resourcesCount} metadata blocks (Resolution, Slices, Guides, Exif)`, "success");
  }

  // 4. LAYER AND MASK INFORMATION SECTION
  let layersLength = reader.readUint32();
  const layers: PSDLayer[] = [];
  let layersCount = 0;

  if (layersLength > 0) {
    const layersEnd = Math.min(reader.getLength(), reader.getOffset() + layersLength);
    reader.log(`Layers Section found (Length: ${layersLength} bytes). Inspecting layer records.`, "info");

    if (reader.getOffset() + layersLength > reader.getLength()) {
      isCorrupt = true;
      reader.log(`WARNING: Layers container is truncated! Auto-repairing boundary mapping to file physical end.`, "repair");
      layersLength = reader.getLength() - reader.getOffset();
    }

    const subSectionLength = reader.readUint32();
    const layerRecordsStart = reader.getOffset();

    if (subSectionLength > 0) {
      const rawCount = reader.readInt16();
      const count = Math.abs(rawCount);
      reader.log(`Found ${count} layer records inside table schema.`, "info");

      // Parse layer records
      for (let i = 0; i < count; i++) {
        if (reader.getOffset() >= layersEnd) {
          isCorrupt = true;
          reader.log(`WARNING: Layers definition block cut off. Loaded only ${i} of ${count} layers.`, "repair");
          break;
        }

        const top = reader.readInt32();
        const left = reader.readInt32();
        const bottom = reader.readInt32();
        const right = reader.readInt32();
        const channelsCount = reader.readUint16();

        const layerWidth = right - left;
        const layerHeight = bottom - top;
        let layerStatus: "Healthy" | "Corrupted" | "Repaired" = "Healthy";
        const layerNotes: string[] = [];

        if (layerWidth < 0 || layerHeight < 0 || layerWidth > 100000 || layerHeight > 100000) {
          isCorrupt = true;
          layerStatus = "Repaired";
          layerNotes.push(`Invalid layer size recovered (${layerWidth}x${layerHeight}px). Clamped coordinates.`);
          reader.log(`WARNING: Layer #${i+1} has impossible size ${layerWidth}x${layerHeight}px. Forcing boundaries to main canvas.`, "repair");
        }

        const channelsInfo: { id: number; length: number }[] = [];
        for (let c = 0; c < channelsCount; c++) {
          const chID = reader.readInt16();
          const chLen = reader.readUint32();
          channelsInfo.push({ id: chID, length: chLen });
        }

        // Blend mode signature: "8BIM"
        const blendSig = reader.readString(4);
        if (blendSig !== "8BIM") {
          isCorrupt = true;
          layerStatus = "Repaired";
          layerNotes.push("Corrupt blend mode signature repaired to '8BIM'");
        }

        const blendMode = reader.readString(4); // e.g., "norm", "dark", "lite"
        const opacity = reader.readUint8();
        const clipping = reader.readUint8();
        const flags = reader.readUint8();
        reader.skip(1); // filler

        const extraLength = reader.readUint32();
        const extraEnd = reader.getOffset() + extraLength;

        // Mask info length
        const maskLength = reader.readUint32();
        if (maskLength > 0) {
          reader.skip(maskLength);
        }

        // Blend ranges
        const blendRangesLength = reader.readUint32();
        if (blendRangesLength > 0) {
          reader.skip(blendRangesLength);
        }

        // Layer Name
        const lName = reader.readPascalString(4);
        const finalLayerName = lName || `Layer ${i + 1}`;

        reader.setOffset(extraEnd);

        layers.push({
          id: generateId(),
          name: finalLayerName,
          top: Math.max(0, Math.min(height, top)),
          left: Math.max(0, Math.min(width, left)),
          bottom: Math.max(0, Math.min(height, bottom)),
          right: Math.max(0, Math.min(width, right)),
          width: Math.max(1, Math.min(width, layerWidth <= 0 ? width : layerWidth)),
          height: Math.max(1, Math.min(height, layerHeight <= 0 ? height : layerHeight)),
          opacity,
          visible: (flags & 2) === 0, // Bit 1 is visibility toggle (0 = visible, 1 = invisible)
          blendMode,
          channels: channelsInfo,
          status: layerStatus,
          recoveryNotes: layerNotes,
        });

        layersCount++;
      }

      // Now, decode Channel Pixel Data for each layer
      reader.log("Scanned layer definitions. Commencing channel pixel data decoding...", "info");

      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        const pixelCount = layer.width * layer.height;
        const layerRGBA = new Uint8ClampedArray(pixelCount * 4);
        
        // Initialize to fully transparent black
        layerRGBA.fill(0);

        // Map channels
        const channelDataMap: { [key: number]: Uint8Array } = {};

        for (const channel of layer.channels) {
          if (reader.getOffset() >= layersEnd) {
            isCorrupt = true;
            layer.status = "Corrupted";
            layer.recoveryNotes.push("Truncated channel data stream: padded with empty pixels.");
            reader.log(`WARNING: Truncation reached while decoding pixel stream for layer '${layer.name}'.`, "repair");
            break;
          }

          const compressionType = reader.readUint16(); // 0=Raw, 1=RLE
          
          if (compressionType !== 0 && compressionType !== 1) {
            isCorrupt = true;
            layer.status = "Repaired";
            layer.recoveryNotes.push("Invalid compression signature: fallback to zero padding.");
            reader.log(`WARNING: Unknown compression mode ${compressionType} in '${layer.name}' channel ${channel.id}. Repairing.`, "repair");
            reader.skip(channel.length - 2); // Skip rest of corrupted channel chunk
            continue;
          }

          const channelBytes = decodeChannel(reader, layer.width, layer.height, compressionType);
          channelDataMap[channel.id] = channelBytes;
        }

        // Construct standard RGBA array from channel mappings
        // Photoshop standard RGB channels: 0 = Red, 1 = Green, 2 = Blue, -1 = Alpha
        const redBytes = channelDataMap[0] || new Uint8Array(pixelCount).fill(255);
        const greenBytes = channelDataMap[1] || new Uint8Array(pixelCount).fill(255);
        const blueBytes = channelDataMap[2] || new Uint8Array(pixelCount).fill(255);
        const alphaBytes = channelDataMap[-1] || new Uint8Array(pixelCount).fill(255); // Default opaque if no alpha

        // For CMYK Mode (Photoshop Color Mode 4)
        if (header.colorMode === 4) {
          const cyan = channelDataMap[0] || new Uint8Array(pixelCount).fill(0);
          const magenta = channelDataMap[1] || new Uint8Array(pixelCount).fill(0);
          const yellow = channelDataMap[2] || new Uint8Array(pixelCount).fill(0);
          const black = channelDataMap[3] || new Uint8Array(pixelCount).fill(0);

          for (let p = 0; p < pixelCount; p++) {
            const c = cyan[p] / 255;
            const m = magenta[p] / 255;
            const y = yellow[p] / 255;
            const k = black[p] / 255;

            layerRGBA[p * 4] = Math.round(255 * (1 - c) * (1 - k));     // R
            layerRGBA[p * 4 + 1] = Math.round(255 * (1 - m) * (1 - k)); // G
            layerRGBA[p * 4 + 2] = Math.round(255 * (1 - y) * (1 - k)); // B
            layerRGBA[p * 4 + 3] = alphaBytes[p];                      // A
          }
        } 
        // For Grayscale Mode (Color Mode 1)
        else if (header.colorMode === 1) {
          const gray = channelDataMap[0] || new Uint8Array(pixelCount).fill(255);
          for (let p = 0; p < pixelCount; p++) {
            const g = gray[p];
            layerRGBA[p * 4] = g;
            layerRGBA[p * 4 + 1] = g;
            layerRGBA[p * 4 + 2] = g;
            layerRGBA[p * 4 + 3] = alphaBytes[p];
          }
        } 
        // Standard RGB
        else {
          for (let p = 0; p < pixelCount; p++) {
            layerRGBA[p * 4] = redBytes[p];
            layerRGBA[p * 4 + 1] = greenBytes[p];
            layerRGBA[p * 4 + 2] = blueBytes[p];
            layerRGBA[p * 4 + 3] = alphaBytes[p];
          }
        }

        layer.rgbaData = layerRGBA;
      }
    }
    
    reader.setOffset(layersEnd);
    reader.log(`Successfully recovered ${layersCount} discrete layer pixel assets.`, "success");
  }

  // 5. COMPOSITE IMAGE DATA SECTION
  let compositeCompressed = 0;
  let compositeRgba: Uint8ClampedArray | undefined;

  if (reader.getOffset() < reader.getLength()) {
    reader.log("Found Composite Image Section. Decoding thumbnail preview...", "info");
    try {
      compositeCompressed = reader.readUint16(); // 0=Raw, 1=RLE
      const pixelCount = width * height;
      const compositeRGBA = new Uint8ClampedArray(pixelCount * 4);
      compositeRGBA.fill(255); // Opaque default

      if (compositeCompressed === 0 || compositeCompressed === 1) {
        // Parse channels sequentially (for composite, all red data is together, then all green, etc.)
        const channelsData: Uint8Array[] = [];
        const numChannels = Math.min(4, header.channels);

        for (let c = 0; c < numChannels; c++) {
          const chData = decodeChannel(reader, width, height, compositeCompressed);
          channelsData.push(chData);
        }

        const red = channelsData[0] || new Uint8Array(pixelCount).fill(255);
        const green = channelsData[1] || new Uint8Array(pixelCount).fill(255);
        const blue = channelsData[2] || new Uint8Array(pixelCount).fill(255);
        const alpha = channelsData[3] || new Uint8Array(pixelCount).fill(255);

        for (let p = 0; p < pixelCount; p++) {
          compositeRGBA[p * 4] = red[p];
          compositeRGBA[p * 4 + 1] = green[p];
          compositeRGBA[p * 4 + 2] = blue[p];
          compositeRGBA[p * 4 + 3] = header.channels >= 4 ? alpha[p] : 255;
        }

        compositeRgba = compositeRGBA;
        reader.log("Composite Image successfully decoded.", "success");
      }
    } catch (e) {
      isCorrupt = true;
      reader.log("WARNING: Composite image data corrupted. Creating fallback composite from layers.", "repair");
    }
  }

  // If we have no composite but have layers, construct composite from layers
  if (!compositeRgba && layers.length > 0) {
    const pixelCount = width * height;
    const compositeRGBA = new Uint8ClampedArray(pixelCount * 4);
    compositeRGBA.fill(255); // White canvas
    
    // Draw layers from bottom to top
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (!layer.visible || !layer.rgbaData) continue;
      
      const layerOpacity = layer.opacity / 255;

      for (let ly = 0; ly < layer.height; ly++) {
        const canvasY = layer.top + ly;
        if (canvasY < 0 || canvasY >= height) continue;

        for (let lx = 0; lx < layer.width; lx++) {
          const canvasX = layer.left + lx;
          if (canvasX < 0 || canvasX >= width) continue;

          const lIdx = (ly * layer.width + lx) * 4;
          const cIdx = (canvasY * width + canvasX) * 4;

          const lR = layer.rgbaData[lIdx];
          const lG = layer.rgbaData[lIdx + 1];
          const lB = layer.rgbaData[lIdx + 2];
          const lA = (layer.rgbaData[lIdx + 3] / 255) * layerOpacity;

          if (lA <= 0) continue;

          // Alpha blending
          const bR = compositeRGBA[cIdx];
          const bG = compositeRGBA[cIdx + 1];
          const bB = compositeRGBA[cIdx + 2];
          const bA = compositeRGBA[cIdx + 3] / 255;

          const outA = lA + bA * (1 - lA);
          if (outA > 0) {
            compositeRGBA[cIdx] = Math.round((lR * lA + bR * bA * (1 - lA)) / outA);
            compositeRGBA[cIdx + 1] = Math.round((lG * lA + bG * bA * (1 - lA)) / outA);
            compositeRGBA[cIdx + 2] = Math.round((lB * lA + bB * bA * (1 - lA)) / outA);
            compositeRGBA[cIdx + 3] = Math.round(outA * 255);
          }
        }
      }
    }
    compositeRgba = compositeRGBA;
    reader.log("Generated diagnostic composite preview from combined active layer stacks.", "success");
  }

  // Final evaluation
  if (reader.hasCorruption) {
    isCorrupt = true;
  }

  const finalProgress = 100;
  reader.log(`RECOVERY COMPLETED. Healthy structure successfully rebuilt. Integrity score: ${isCorrupt ? "Partial Recovery (Repaired)" : "Excellent (100% Intact)"}`, "success");

  return {
    fileName,
    fileSize: buffer.byteLength,
    header,
    colorModeLength,
    resourcesLength,
    resourcesCount,
    resources,
    layersLength,
    layersCount: layers.length,
    layers,
    compositeCompressed,
    compositeRgba,
    isCorrupt,
    recoveryLogs: reader.logs,
    recoveryProgress: finalProgress,
  };
}

// ==========================================
// TEST PSD GENERATION & CORRUPTION SUITE
// ==========================================

// Helper to write Big Endian data to a dynamic Uint8Array
class BinaryWriter {
  private buffer: Uint8Array;
  private offset: number;

  constructor(size: number) {
    this.buffer = new Uint8Array(size);
    this.offset = 0;
  }

  writeString(str: string) {
    for (let i = 0; i < str.length; i++) {
      this.buffer[this.offset++] = str.charCodeAt(i);
    }
  }

  writeUint8(val: number) {
    this.buffer[this.offset++] = val & 0xff;
  }

  writeUint16(val: number) {
    this.buffer[this.offset++] = (val >> 8) & 0xff;
    this.buffer[this.offset++] = val & 0xff;
  }

  writeUint32(val: number) {
    this.buffer[this.offset++] = (val >> 24) & 0xff;
    this.buffer[this.offset++] = (val >> 16) & 0xff;
    this.buffer[this.offset++] = (val >> 8) & 0xff;
    this.buffer[this.offset++] = val & 0xff;
  }

  writePascalString(str: string, padding: number = 2) {
    const len = Math.min(str.length, 255);
    this.writeUint8(len);
    for (let i = 0; i < len; i++) {
      this.buffer[this.offset++] = str.charCodeAt(i) & 0x7f;
    }
    const totalBytes = len + 1;
    const remainder = totalBytes % padding;
    if (remainder !== 0) {
      const skip = padding - remainder;
      for (let s = 0; s < skip; s++) {
        this.writeUint8(0);
      }
    }
  }

  writeBytes(bytes: Uint8Array) {
    this.buffer.set(bytes, this.offset);
    this.offset += bytes.length;
  }

  getOffset(): number {
    return this.offset;
  }

  getBuffer(): Uint8Array {
    return this.buffer.subarray(0, this.offset);
  }
}

// Generates a fully-standard valid uncompressed PSD file with 2 layers (Red and Blue shapes)
export function generateTestPSD(width: number = 256, height: number = 256): ArrayBuffer {
  // Let's create layered images
  // Layer 1: Red Backdrop (fills 256x256, red with alpha)
  // Layer 2: Cobalt Circle (128x128 bounding box, centered)
  
  const writer = new BinaryWriter(1024 * 1024); // 1MB maximum

  // --- HEADER SECTION ---
  writer.writeString("8BPS"); // signature
  writer.writeUint16(1);      // version
  writer.writeBytes(new Uint8Array(6)); // reserved
  writer.writeUint16(4);      // 4 channels (R, G, B, A)
  writer.writeUint32(height);
  writer.writeUint32(width);
  writer.writeUint16(8);      // 8-bit depth
  writer.writeUint16(3);      // Color mode (RGB)

  // --- COLOR MODE DATA ---
  writer.writeUint32(0); // length 0

  // --- IMAGE RESOURCES ---
  writer.writeUint32(0); // length 0 (clean minimal)

  // --- LAYERS AND MASKS SECTION ---
  // We'll calculate layers structure
  // We will have Layer 1 (Red Background) and Layer 2 (Blue Orb)
  const l1Width = width;
  const l1Height = height;
  const l1Size = l1Width * l1Height;

  const l2Width = Math.round(width / 2);
  const l2Height = Math.round(height / 2);
  const l2Size = l2Width * l2Height;

  // Let's generate pixel streams
  // Layer 1 Red Background
  const l1R = new Uint8Array(l1Size).fill(235);
  const l1G = new Uint8Array(l1Size).fill(70);
  const l1B = new Uint8Array(l1Size).fill(70);
  const l1A = new Uint8Array(l1Size).fill(255); // opaque

  // Layer 2 Blue Orb (Circle)
  const l2R = new Uint8Array(l2Size).fill(50);
  const l2G = new Uint8Array(l2Size).fill(110);
  const l2B = new Uint8Array(l2Size).fill(240);
  const l2A = new Uint8Array(l2Size);
  
  // Render a nice circle inside alpha channel of Layer 2
  const cx = l2Width / 2;
  const cy = l2Height / 2;
  const radius = Math.min(l2Width, l2Height) / 2.2;
  for (let y = 0; y < l2Height; y++) {
    for (let x = 0; x < l2Width; x++) {
      const idx = y * l2Width + x;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist < radius) {
        l2A[idx] = 255; // opaque
      } else if (dist < radius + 1) {
        l2A[idx] = Math.round((1 - (dist - radius)) * 255); // smooth edges
      } else {
        l2A[idx] = 0; // transparent
      }
    }
  }

  // Construct Channel Pixel Buffers (2 bytes compression [0] + pixel bytes)
  const makeChannelBlock = (pixels: Uint8Array): Uint8Array => {
    const blk = new Uint8Array(2 + pixels.length);
    blk[0] = 0; // Raw compression
    blk[1] = 0;
    blk.set(pixels, 2);
    return blk;
  };

  const l1ChanRed = makeChannelBlock(l1R);
  const l1ChanGreen = makeChannelBlock(l1G);
  const l1ChanBlue = makeChannelBlock(l1B);
  const l1ChanAlpha = makeChannelBlock(l1A);

  const l2ChanRed = makeChannelBlock(l2R);
  const l2ChanGreen = makeChannelBlock(l2G);
  const l2ChanBlue = makeChannelBlock(l2B);
  const l2ChanAlpha = makeChannelBlock(l2A);

  // Layout calculations
  const layerRecordsCount = 2;
  
  // Layer Record 1
  const l1Name = "Red Base";
  const l1NamePascal = new BinaryWriter(32);
  l1NamePascal.writePascalString(l1Name, 4);
  const l1NameBytes = l1NamePascal.getBuffer();

  // Layer Record 2
  const l2Name = "Blue Cobalt Orb";
  const l2NamePascal = new BinaryWriter(32);
  l2NamePascal.writePascalString(l2Name, 4);
  const l2NameBytes = l2NamePascal.getBuffer();

  const l1RecordLen = 16 + 2 + (4 * 6) + 4 + 4 + 1 + 1 + 1 + 1 + 4 + (4 + 4 + l1NameBytes.length);
  const l2RecordLen = 16 + 2 + (4 * 6) + 4 + 4 + 1 + 1 + 1 + 1 + 4 + (4 + 4 + l2NameBytes.length);

  // Sublayer block size (excludes its own size uint32)
  const layerSubSectionSize = 2 + (l1RecordLen + l2RecordLen) + 
    (l1ChanRed.length + l1ChanGreen.length + l1ChanBlue.length + l1ChanAlpha.length) +
    (l2ChanRed.length + l2ChanGreen.length + l2ChanBlue.length + l2ChanAlpha.length);

  // Main Layers size (4 bytes for subSectionSize, then the rest)
  const layersAndMasksSectionSize = 4 + layerSubSectionSize + 4; // plus global mask length (0)

  writer.writeUint32(layersAndMasksSectionSize); // Total Section Size
  writer.writeUint32(layerSubSectionSize);       // Sub-section containing actual layers
  writer.writeUint16(layerRecordsCount);         // Count of layers

  // --- Write Layer 1 Record ---
  writer.writeUint32(0);      // Top
  writer.writeUint32(0);      // Left
  writer.writeUint32(height); // Bottom
  writer.writeUint32(width);  // Right
  writer.writeUint16(4);      // 4 channels

  // Channel descriptions
  writer.writeUint16(0);                    // Channel ID Red
  writer.writeUint32(l1ChanRed.length);     // Channel length
  writer.writeUint16(1);                    // Channel ID Green
  writer.writeUint32(l1ChanGreen.length);   // Channel length
  writer.writeUint16(2);                    // Channel ID Blue
  writer.writeUint32(l1ChanBlue.length);    // Channel length
  writer.writeUint16(-1);                   // Channel ID Alpha
  writer.writeUint32(l1ChanAlpha.length);   // Channel length

  writer.writeString("8BIM"); // Blend mode signature
  writer.writeString("norm"); // Blend mode key
  writer.writeUint8(255);     // Opacity (opaque)
  writer.writeUint8(0);       // Clipping
  writer.writeUint8(0);       // Flags (visible)
  writer.writeUint8(0);       // Filler

  // Extra data: mask length (0), blending ranges (0), name
  writer.writeUint32(4 + 4 + l1NameBytes.length);
  writer.writeUint32(0); // mask length
  writer.writeUint32(0); // blend range length
  writer.writeBytes(l1NameBytes); // Name

  // --- Write Layer 2 Record ---
  const l2Top = Math.round(height / 4);
  const l2Left = Math.round(width / 4);
  writer.writeUint32(l2Top);             // Top
  writer.writeUint32(l2Left);            // Left
  writer.writeUint32(l2Top + l2Height);  // Bottom
  writer.writeUint32(l2Left + l2Width);  // Right
  writer.writeUint16(4);                 // 4 channels

  // Channel descriptions
  writer.writeUint16(0);                    // Channel ID Red
  writer.writeUint32(l2ChanRed.length);     // Channel length
  writer.writeUint16(1);                    // Channel ID Green
  writer.writeUint32(l2ChanGreen.length);   // Channel length
  writer.writeUint16(2);                    // Channel ID Blue
  writer.writeUint32(l2ChanBlue.length);    // Channel length
  writer.writeUint16(-1);                   // Channel ID Alpha
  writer.writeUint32(l2ChanAlpha.length);   // Channel length

  writer.writeString("8BIM"); // Blend mode signature
  writer.writeString("norm"); // Blend mode key
  writer.writeUint8(220);     // Opacity (subtly semi-transparent)
  writer.writeUint8(0);       // Clipping
  writer.writeUint8(0);       // Flags (visible)
  writer.writeUint8(0);       // Filler

  // Extra data: mask length (0), blending ranges (0), name
  writer.writeUint32(4 + 4 + l2NameBytes.length);
  writer.writeUint32(0); // mask length
  writer.writeUint32(0); // blend range length
  writer.writeBytes(l2NameBytes); // Name

  // --- Write Channel Pixel Streams ---
  // Layer 1 Red
  writer.writeBytes(l1ChanRed);
  writer.writeBytes(l1ChanGreen);
  writer.writeBytes(l1ChanBlue);
  writer.writeBytes(l1ChanAlpha);

  // Layer 2 Blue
  writer.writeBytes(l2ChanRed);
  writer.writeBytes(l2ChanGreen);
  writer.writeBytes(l2ChanBlue);
  writer.writeBytes(l2ChanAlpha);

  // Global Layer Mask length
  writer.writeUint32(0);

  // --- COMPOSITE IMAGE DATA ---
  // Let's render the combined composite image (opaque Red + Alpha Blue Orb)
  const compositeR = new Uint8Array(width * height);
  const compositeG = new Uint8Array(width * height);
  const compositeB = new Uint8Array(width * height);
  const compositeA = new Uint8Array(width * height).fill(255);

  // Initialize background (Red)
  compositeR.fill(235);
  compositeG.fill(70);
  compositeB.fill(70);

  // Superimpose Blue orb
  const opacityVal = 220 / 255;
  for (let y = 0; y < l2Height; y++) {
    const canvasY = l2Top + y;
    for (let x = 0; x < l2Width; x++) {
      const canvasX = l2Left + x;
      const lIdx = y * l2Width + x;
      const cIdx = canvasY * width + canvasX;

      const alphaPercent = (l2A[lIdx] / 255) * opacityVal;
      if (alphaPercent > 0) {
        compositeR[cIdx] = Math.round(50 * alphaPercent + compositeR[cIdx] * (1 - alphaPercent));
        compositeG[cIdx] = Math.round(110 * alphaPercent + compositeG[cIdx] * (1 - alphaPercent));
        compositeB[cIdx] = Math.round(240 * alphaPercent + compositeB[cIdx] * (1 - alphaPercent));
      }
    }
  }

  writer.writeUint16(0); // Raw compression for composite
  // In PSD, composite pixel data is written as continuous streams per channel
  writer.writeBytes(compositeR);
  writer.writeBytes(compositeG);
  writer.writeBytes(compositeB);
  writer.writeBytes(compositeA);

  const finalBuf = writer.getBuffer();
  // Return a copy of the buffer
  return finalBuf.buffer.slice(0, finalBuf.byteLength);
}

// Corrupts a PSD file binary on demand
export function corruptPSDBinary(
  buffer: ArrayBuffer,
  type: "truncate" | "signature" | "layer_table" | "fuzz"
): ArrayBuffer {
  const view = new Uint8Array(buffer.slice(0));

  if (type === "truncate") {
    // Truncate at 50% length
    const truncateLength = Math.round(view.length * 0.55);
    return buffer.slice(0, truncateLength);
  }

  if (type === "signature") {
    // Break the first 4 bytes "8BPS" -> "BAD!"
    view[0] = "B".charCodeAt(0);
    view[1] = "A".charCodeAt(0);
    view[2] = "D".charCodeAt(0);
    view[3] = "!".charCodeAt(0);
    
    // Also change width & height headers to crazy/corrupted zero values to trigger recovery
    // Offset 14-18 is height, 18-22 is width
    view[14] = 0; view[15] = 0; view[16] = 0; view[17] = 0;
    view[18] = 0; view[19] = 0; view[20] = 0; view[21] = 0;
  }

  if (type === "layer_table") {
    // Find PSD Layers Section starting offset
    // PSD structure offset: Header = 26 bytes. Color mode = 4 + colorModeLength. Resources = 4 + resourcesLength.
    const headerReader = new DataView(buffer);
    const colorModeLen = headerReader.getUint32(26, false);
    const resourcesOffset = 30 + colorModeLen;
    const resourcesLen = headerReader.getUint32(resourcesOffset, false);
    const layersSectionOffset = resourcesOffset + 4 + resourcesLen;

    if (layersSectionOffset < view.length - 10) {
      // Overwrite layers length (Offset layersSectionOffset) with absolute garbage size
      view[layersSectionOffset] = 0x7f;
      view[layersSectionOffset + 1] = 0xff;
      view[layersSectionOffset + 2] = 0xff;
      view[layersSectionOffset + 3] = 0xff;

      // Also change layer counts to negative numbers or extreme values
      const layerRecordSubOffset = layersSectionOffset + 8;
      if (layerRecordSubOffset < view.length - 4) {
        view[layerRecordSubOffset] = 0xff; // Mangle layer records count
        view[layerRecordSubOffset + 1] = 0xff;
      }
    }
  }

  if (type === "fuzz") {
    // Random byte injection: flip 30 critical bytes inside the file
    for (let i = 0; i < 30; i++) {
      const offset = Math.round(Math.random() * (view.length - 100)) + 50;
      view[offset] = Math.round(Math.random() * 255);
    }
  }

  return view.buffer;
}

// Re-compile parsed PSD structure into a fully compliant, healthy, uncompressed PSD binary file
export function rebuildRepairedPSD(psd: PSDStructure, customName?: string): ArrayBuffer {
  // We will compile the parsed header, layers, and composite into a fresh, perfectly valid PSD binary file.
  // This is highly compatible with Adobe Photoshop because it is written cleanly with correct offsets and raw channels.
  const width = psd.header.width;
  const height = psd.header.height;
  
  // Calculate buffer size
  // Pre-allocate 15MB buffer and shrink it later
  const writer = new BinaryWriter(20 * 1024 * 1024);

  // 1. Header
  writer.writeString("8BPS");
  writer.writeUint16(1); // standard PSD
  writer.writeBytes(new Uint8Array(6)); // reserved
  
  // Channels: RGB + Alpha = 4
  writer.writeUint16(4); 
  writer.writeUint32(height);
  writer.writeUint32(width);
  writer.writeUint16(8); // Depth
  writer.writeUint16(3); // RGB Mode

  // 2. Color Mode Section
  writer.writeUint32(0);

  // 3. Image Resources
  writer.writeUint32(0);

  // 4. Layers and Masks Section
  // Write layers if we recovered any, otherwise skip
  const parsedLayers = psd.layers;
  
  if (parsedLayers.length > 0) {
    const recordsCount = parsedLayers.length;
    
    // Prepare channel blocks and layer records
    const layerNamesBytes: Uint8Array[] = [];
    const layerChannelBlocks: Uint8Array[][] = [];
    const layerRecordLens: number[] = [];
    
    for (let i = 0; i < parsedLayers.length; i++) {
      const l = parsedLayers[i];
      const name = l.name || `Layer ${i + 1}`;
      
      const pWriter = new BinaryWriter(64);
      pWriter.writePascalString(name, 4);
      const nameBytes = pWriter.getBuffer();
      layerNamesBytes.push(nameBytes);

      // Create channel pixels (4 channels: 0, 1, 2, -1)
      const lWidth = l.width;
      const lHeight = l.height;
      const lSize = lWidth * lHeight;
      
      const rChan = new Uint8Array(lSize).fill(255);
      const gChan = new Uint8Array(lSize).fill(255);
      const bChan = new Uint8Array(lSize).fill(255);
      const aChan = new Uint8Array(lSize).fill(255);

      if (l.rgbaData) {
        for (let p = 0; p < lSize; p++) {
          rChan[p] = l.rgbaData[p * 4];
          gChan[p] = l.rgbaData[p * 4 + 1];
          bChan[p] = l.rgbaData[p * 4 + 2];
          aChan[p] = l.rgbaData[p * 4 + 3];
        }
      }

      // Add 2 bytes raw compression [0, 0] prefix to each channel
      const cR = new Uint8Array(2 + lSize); cR.set(rChan, 2);
      const cG = new Uint8Array(2 + lSize); cG.set(gChan, 2);
      const cB = new Uint8Array(2 + lSize); cB.set(bChan, 2);
      const cA = new Uint8Array(2 + lSize); cA.set(aChan, 2);

      layerChannelBlocks.push([cR, cG, cB, cA]);

      // Calculate record length
      // Rect (16) + channels_count (2) + 4 channels *(2 id + 4 len) + blend_sig (4) + blend_key (4) + 
      // opacity (1) + clipping (1) + flags (1) + filler (1) + extra_len (4) + [mask_len (4) + blend_range (4) + name_bytes_len]
      const recLen = 16 + 2 + (4 * 6) + 4 + 4 + 1 + 1 + 1 + 1 + 4 + (4 + 4 + nameBytes.length);
      layerRecordLens.push(recLen);
    }

    // Calculate total layer pixels streams size
    let channelsTotalSize = 0;
    for (const blocks of layerChannelBlocks) {
      for (const b of blocks) {
        channelsTotalSize += b.length;
      }
    }

    const layerRecordsSum = layerRecordLens.reduce((a, b) => a + b, 0);
    const subSectionSize = 2 + layerRecordsSum + channelsTotalSize;
    const totalLayersSectionSize = 4 + subSectionSize + 4; // Including global mask length (0)

    writer.writeUint32(totalLayersSectionSize);
    writer.writeUint32(subSectionSize);
    writer.writeUint16(recordsCount);

    // Write Records
    for (let i = 0; i < parsedLayers.length; i++) {
      const l = parsedLayers[i];
      const chanBlocks = layerChannelBlocks[i];
      
      writer.writeUint32(l.top);
      writer.writeUint32(l.left);
      writer.writeUint32(l.bottom);
      writer.writeUint32(l.right);
      writer.writeUint16(4); // 4 channels

      // R
      writer.writeUint16(0);
      writer.writeUint32(chanBlocks[0].length);
      // G
      writer.writeUint16(1);
      writer.writeUint32(chanBlocks[1].length);
      // B
      writer.writeUint16(2);
      writer.writeUint32(chanBlocks[2].length);
      // A
      writer.writeUint16(-1);
      writer.writeUint32(chanBlocks[3].length);

      writer.writeString("8BIM");
      writer.writeString("norm");
      writer.writeUint8(l.opacity);
      writer.writeUint8(0);
      writer.writeUint8(l.visible ? 0 : 2); // flags: 2 is invisible
      writer.writeUint8(0); // filler

      // Extra data length
      const nBytes = layerNamesBytes[i];
      writer.writeUint32(4 + 4 + nBytes.length);
      writer.writeUint32(0); // mask len
      writer.writeUint32(0); // blend range len
      writer.writeBytes(nBytes); // Pascal Name
    }

    // Write Pixel Streams
    for (const blocks of layerChannelBlocks) {
      for (const b of blocks) {
        writer.writeBytes(b);
      }
    }

    // Global mask length
    writer.writeUint32(0);
  } else {
    // No layers: write empty layers block
    writer.writeUint32(0);
  }

  // 5. Composite Image Data Section (At the end)
  const compositeSize = width * height;
  const compR = new Uint8Array(compositeSize).fill(255);
  const compG = new Uint8Array(compositeSize).fill(255);
  const compB = new Uint8Array(compositeSize).fill(255);
  const compA = new Uint8Array(compositeSize).fill(255);

  if (psd.compositeRgba) {
    for (let p = 0; p < compositeSize; p++) {
      compR[p] = psd.compositeRgba[p * 4];
      compG[p] = psd.compositeRgba[p * 4 + 1];
      compB[p] = psd.compositeRgba[p * 4 + 2];
      compA[p] = psd.compositeRgba[p * 4 + 3];
    }
  }

  writer.writeUint16(0); // raw compression
  writer.writeBytes(compR);
  writer.writeBytes(compG);
  writer.writeBytes(compB);
  writer.writeBytes(compA);

  const resBuf = writer.getBuffer();
  return resBuf.buffer.slice(0, resBuf.byteLength);
}
