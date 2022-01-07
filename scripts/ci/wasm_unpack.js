(function(source, uncompressedSize) {
	function base64DecToArr (sB64Enc) {
		/*\
		|*|
		|*|  Base64 / binary data / UTF-8 strings utilities (#1)
		|*|
		|*|  https://developer.mozilla.org/en-US/docs/Web/API/WindowBase64/Base64_encoding_and_decoding
		|*|
		|*|  Author: madmurphy
		|*|
		\*/
		/* Array of bytes to base64 string decoding */
		function b64ToUint6 (nChr) {
			return nChr > 64 && nChr < 91 ?
				nChr - 65
				: nChr > 96 && nChr < 123 ?
				nChr - 71
				: nChr > 47 && nChr < 58 ?
				nChr + 4
				: nChr === 43 ?
				62
				: nChr === 47 ?
				63
				:
				0;
		}

		var nInLen = sB64Enc.length,
			nOutLen = nInLen * 3 + 1 >>> 2,
			aBytes = new Uint8Array(nOutLen);

		for (var nMod3, nMod4, nUint24 = 0, nOutIdx = 0, nInIdx = 0; nInIdx < nInLen; nInIdx++) {
			nMod4 = nInIdx & 3;
			nUint24 |= b64ToUint6(sB64Enc.charCodeAt(nInIdx)) << 18 - 6 * nMod4;
			if (nMod4 === 3 || nInLen - nInIdx === 1) {
				for (nMod3 = 0; nMod3 < 3 && nOutIdx < nOutLen; nMod3++, nOutIdx++) {
					aBytes[nOutIdx] = nUint24 >>> (16 >>> nMod3 & 24) & 255;
				}
				nUint24 = 0;
			}
		}

		return aBytes;
	}
	function lz4Decompress (src, dst) {
		// lz4.js - An implementation of Lz4 in plain JavaScript.
		// Original source: https://github.com/Benzinga/lz4js

		// Simple hash function, from: http://burtleburtle.net/bob/hash/integer.html.
		// Chosen because it doesn't use multiply and achieves full avalanche.
		function hashU32(a) {
			a = a | 0;
			a = a + 2127912214 + (a << 12) | 0;
			a = a ^ -949894596 ^ a >>> 19;
			a = a + 374761393 + (a << 5) | 0;
			a = a + -744332180 ^ a << 9;
			a = a + -42973499 + (a << 3) | 0;
			return a ^ -1252372727 ^ a >>> 16 | 0;
		};

		// Reads a 64-bit little-endian integer from an array.
		function readU64(b, n) {
			var x = 0;
			x |= b[n++] << 0;
			x |= b[n++] << 8;
			x |= b[n++] << 16;
			x |= b[n++] << 24;
			x |= b[n++] << 32;
			x |= b[n++] << 40;
			x |= b[n++] << 48;
			x |= b[n++] << 56;
			return x;
		};

		// Reads a 32-bit little-endian integer from an array.
		function readU32(b, n) {
			var x = 0;
			x |= b[n++] << 0;
			x |= b[n++] << 8;
			x |= b[n++] << 16;
			x |= b[n++] << 24;
			return x;
		};

		// Writes a 32-bit little-endian integer from an array.
		function writeU32(b, n, x) {
			b[n++] = (x >> 0) & 0xff;
			b[n++] = (x >> 8) & 0xff;
			b[n++] = (x >> 16) & 0xff;
			b[n++] = (x >> 24) & 0xff;
		};

		// Multiplies two numbers using 32-bit integer multiplication.
		// Algorithm from Emscripten.
		function imul(a, b) {
			var ah = a >>> 16;
			var al = a & 65535;
			var bh = b >>> 16;
			var bl = b & 65535;
			return al * bl + (ah * bl + al * bh << 16) | 0;
		};

		function xxhash (seed, src, index, len) {
			var prime1 = 0x9e3779b1;
			var prime2 = 0x85ebca77;
			var prime3 = 0xc2b2ae3d;
			var prime4 = 0x27d4eb2f;
			var prime5 = 0x165667b1;

			// Utility functions/primitives
			// --

			function rotl32 (x, r) {
				x = x | 0;
				r = r | 0;
				return x >>> (32 - r | 0) | x << r | 0;
			}

			function rotmul32 (h, r, m) {
				h = h | 0;
				r = r | 0;
				m = m | 0;
				return imul(h >>> (32 - r | 0) | h << r, m) | 0;
			}

			function shiftxor32 (h, s) {
				h = h | 0;
				s = s | 0;
				return h >>> s ^ h | 0;
			}

			// Implementation
			// --

			function xxhapply (h, src, m0, s, m1) {
				return rotmul32(imul(src, m0) + h, s, m1);
			}

			function xxh1 (h, src, index) {
				return rotmul32((h + imul(src[index], prime5)), 11, prime1);
			}

			function xxh4 (h, src, index) {
				return xxhapply(h, readU32(src, index), prime3, 17, prime4);
			}

			function xxh16 (h, src, index) {
				return [
					xxhapply(h[0], readU32(src, index + 0), prime2, 13, prime1),
					xxhapply(h[1], readU32(src, index + 4), prime2, 13, prime1),
					xxhapply(h[2], readU32(src, index + 8), prime2, 13, prime1),
					xxhapply(h[3], readU32(src, index + 12), prime2, 13, prime1)
				];
			}

			var h, l;
			l = len;
			if (len >= 16) {
				h = [
				seed + prime1 + prime2,
				seed + prime2,
				seed,
				seed - prime1
				];

				while (len >= 16) {
				h = xxh16(h, src, index);

				index += 16;
				len -= 16;
				}

				h = rotl32(h[0], 1) + rotl32(h[1], 7) + rotl32(h[2], 12) + rotl32(h[3], 18) + l;
			} else {
				h = (seed + prime5 + len) >>> 0;
			}

			while (len >= 4) {
				h = xxh4(h, src, index);

				index += 4;
				len -= 4;
			}

			while (len > 0) {
				h = xxh1(h, src, index);

				index++;
				len--;
			}

			h = shiftxor32(imul(shiftxor32(imul(shiftxor32(h, 15), prime2), 13), prime3), 16);

			return h >>> 0;
		};


		// Constants
		// --

		// Compression format parameters/constants.
		var minMatch = 4;
		var minLength = 13;
		var searchLimit = 5;
		var skipTrigger = 6;
		var hashSize = 1 << 16;

		// Token constants.
		var mlBits = 4;
		var mlMask = (1 << mlBits) - 1;
		var runBits = 4;
		var runMask = (1 << runBits) - 1;

		// Shared buffers
		var blockBuf = new Uint8Array(5 << 20);
		var hashTable = new Uint32Array(hashSize);

		// Frame constants.
		var magicNum = 0x184D2204;

		// Frame descriptor flags.
		var fdContentChksum = 0x4;
		var fdContentSize = 0x8;
		var fdBlockChksum = 0x10;
		// var fdBlockIndep = 0x20;
		var fdVersion = 0x40;
		var fdVersionMask = 0xC0;

		// Block sizes.
		var bsUncompressed = 0x80000000;
		var bsDefault = 7;
		var bsShift = 4;
		var bsMask = 7;
		var bsMap = {
			4: 0x10000,
			5: 0x40000,
			6: 0x100000,
			7: 0x400000
		};

		// Utility functions/primitives
		// --

		// Decompresses a block of Lz4.
		function decompressBlock (src, dst, sIndex, sLength, dIndex) {
			var mLength, mOffset, sEnd, n, i;
			var hasCopyWithin = dst.copyWithin !== undefined && dst.fill !== undefined;

			// Setup initial state.
			sEnd = sIndex + sLength;

			// Consume entire input block.
			while (sIndex < sEnd) {
				var token = src[sIndex++];

				// Copy literals.
				var literalCount = (token >> 4);
				if (literalCount > 0) {
					// Parse length.
					if (literalCount === 0xf) {
						while (true) {
							literalCount += src[sIndex];
							if (src[sIndex++] !== 0xff) {
								break;
							}
						}
					}

					// Copy literals
					for (n = sIndex + literalCount; sIndex < n;) {
						dst[dIndex++] = src[sIndex++];
					}
				}

				if (sIndex >= sEnd) {
					break;
				}

				// Copy match.
				mLength = (token & 0xf);

				// Parse offset.
				mOffset = src[sIndex++] | (src[sIndex++] << 8);

				// Parse length.
				if (mLength === 0xf) {
					while (true) {
						mLength += src[sIndex];
						if (src[sIndex++] !== 0xff) {
							break;
						}
					}
				}

				mLength += minMatch;

				// Copy match
				// prefer to use typedarray.copyWithin for larger matches
				// NOTE: copyWithin doesn't work as required by LZ4 for overlapping sequences
				// e.g. mOffset=1, mLength=30 (repeach char 30 times)
				// we special case the repeat char w/ array.fill
				if (hasCopyWithin && mOffset === 1) {
					dst.fill(dst[dIndex - 1] | 0, dIndex, dIndex + mLength);
					dIndex += mLength;
				} else if (hasCopyWithin && mOffset > mLength && mLength > 31) {
					dst.copyWithin(dIndex, dIndex - mOffset, dIndex - mOffset + mLength);
					dIndex += mLength;
				} else {
					for (i = dIndex - mOffset, n = i + mLength; i < n;) {
						dst[dIndex++] = dst[i++] | 0;
					}
				}
			}

			return dIndex;
		};

		var useBlockSum, useContentSum, useContentSize, descriptor;
		var sIndex = 0;
		var dIndex = 0;

		// Read magic number
		if (readU32(src, sIndex) !== magicNum) {
			throw new Error('invalid magic number');
		}

		sIndex += 4;

		// Read descriptor
		descriptor = src[sIndex++];

		// Check version
		if ((descriptor & fdVersionMask) !== fdVersion) {
			throw new Error('incompatible descriptor version');
		}

		// Read flags
		useBlockSum = (descriptor & fdBlockChksum) !== 0;
		useContentSum = (descriptor & fdContentChksum) !== 0;
		useContentSize = (descriptor & fdContentSize) !== 0;

		// Read block size
		var bsIdx = (src[sIndex++] >> bsShift) & bsMask;

		if (bsMap[bsIdx] === undefined) {
			throw new Error('invalid block size');
		}

		if (useContentSize) {
			sIndex += 8;
		}

		sIndex++;

		// Read blocks.
		while (true) {
			var compSize;

			compSize = readU32(src, sIndex);
			sIndex += 4;

			if (compSize === 0) {
				break;
			}

			if (useBlockSum) {
				sIndex += 4;
			}

			// Check if block is compressed
			if ((compSize & bsUncompressed) !== 0) {
				// Mask off the 'uncompressed' bit
				compSize &= ~bsUncompressed;

				// Copy uncompressed data into destination buffer.
				for (var j = 0; j < compSize; j++) {
					dst[dIndex++] = src[sIndex++];
				}
			} else {
				// Decompress into blockBuf
				dIndex = decompressBlock(src, dst, sIndex, compSize, dIndex);
				sIndex += compSize;
			}
		}
	};
	var dest = new Uint8Array(uncompressedSize);
	lz4Decompress(base64DecToArr(source), dest);
	return dest;
})
