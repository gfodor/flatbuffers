import { BitWidth } from './bit-width'
import { toByteWidth, fromByteWidth } from './bit-width-util'
import { toUTF8Array, fromUTF8Array } from './flexbuffers-util'
import { Reference } from './reference'

import { Long } from '../long'

export function validateOffset(dataView: DataView, offset: number, width: number): void {
  if (dataView.byteLength <= offset + width || (offset & (toByteWidth(width) - 1)) !== 0) {
    throw "Bad offset: " + offset + ", width: " + width;
  }
}

export function readInt(dataView: DataView, offset: number, width: number): number | Long | bigint {
  if (width < 2) {
    if (width < 1) {
      return dataView.getInt8(offset);
    } else {
      return dataView.getInt16(offset, true);
    }
  } else {
    if (width < 3) {
      return dataView.getInt32(offset, true)
    } else {
      if (dataView.setBigInt64 === undefined) {
        return new Long(dataView.getUint32(offset, true), dataView.getUint32(offset + 4, true))
      }
      return dataView.getBigInt64(offset, true)
    }
  }
}

export function readUInt(dataView: DataView, offset: number, width: number): number | Long | bigint {
  if (width < 2) {
    if (width < 1) {
      return dataView.getUint8(offset);
    } else {
      return dataView.getUint16(offset, true);
    }
  } else {
    if (width < 3) {
      return dataView.getUint32(offset, true)
    } else {
      if (dataView.getBigUint64 === undefined) {
        return new Long(dataView.getUint32(offset, true), dataView.getUint32(offset + 4, true))
      }
      return dataView.getBigUint64(offset, true)
    }
  }
}

export function readFloat(dataView: DataView, offset: number, width: number): number {
  if (width < BitWidth.WIDTH32) {
    throw "Bad width: " + width;
  }
  if (width === BitWidth.WIDTH32) {
    return dataView.getFloat32(offset, true);
  }
  return dataView.getFloat64(offset, true);
}

export function indirect(dataView: DataView, offset: number, width: number): number {
  const step = Number(readUInt(dataView, offset, width));
  return offset - step;
}

export function keyIndex(key: string, dataView: DataView, offset: number, parentWidth: number, byteWidth: number, length: number): number | null {
  const input = toUTF8Array(key);
  const keysVectorOffset = indirect(dataView, offset, parentWidth) - byteWidth * 3;
  const bitWidth = fromByteWidth(byteWidth);
  const indirectOffset = keysVectorOffset - (Number(readUInt(dataView, keysVectorOffset, bitWidth)));
  const _byteWidth = Number(readUInt(dataView, keysVectorOffset + byteWidth, bitWidth));
  let low = 0;
  let high = length - 1;
  while (low <= high) {
    const mid = (high + low) >> 1;
    const dif = diffKeys(input, mid, dataView, indirectOffset, _byteWidth);
    if (dif === 0) return mid;
    if (dif < 0) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return null;
}

export function diffKeys(input: Uint8Array, index: number, dataView: DataView, offset: number, width: number): number {
  const keyOffset = offset + index * width;
  const keyIndirectOffset = keyOffset - (Number(readUInt(dataView, keyOffset, fromByteWidth(width))));
  for (let i = 0; i < input.length; i++) {
    const dif = input[i] - dataView.getUint8(keyIndirectOffset + i);
    if (dif !== 0) {
      return dif;
    }
  }
  return dataView.getUint8(keyIndirectOffset + input.length) === 0 ? 0 : -1;
}

export function valueForIndexWithKey(index: number, key: string, dataView: DataView, offset: number, parentWidth: number, byteWidth: number, length: number, path: string): Reference {
  const _indirect = indirect(dataView, offset, parentWidth);
  const elementOffset = _indirect + index * byteWidth;
  const packedType = dataView.getUint8(_indirect + length * byteWidth + index);
  return new Reference(dataView, elementOffset, fromByteWidth(byteWidth), packedType, `${path}/${key}`)
}

export function keyForIndex(index: number, dataView: DataView, offset: number, parentWidth: number, byteWidth: number): string {
  const keysVectorOffset = indirect(dataView, offset, parentWidth) - byteWidth * 3;
  const bitWidth = fromByteWidth(byteWidth);
  const indirectOffset = keysVectorOffset - (Number(readUInt(dataView, keysVectorOffset, bitWidth)));
  const _byteWidth = readUInt(dataView, keysVectorOffset + byteWidth, bitWidth) as number;
  const keyOffset = indirectOffset + index * _byteWidth;
  const keyIndirectOffset = keyOffset - (Number(readUInt(dataView, keyOffset, fromByteWidth(_byteWidth))));
  let length = 0;
  while (dataView.getUint8(keyIndirectOffset + length) !== 0) {
    length++;
  }
  return fromUTF8Array(new Uint8Array(dataView.buffer, dataView.byteOffset + keyIndirectOffset, length));
}
