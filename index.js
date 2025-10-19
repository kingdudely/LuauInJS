async function Module(moduleArg = {}) {
	var moduleRtn;
	var Module = moduleArg;
	var ENVIRONMENT_IS_WEB = true;
	var ENVIRONMENT_IS_WORKER = false;
	var quit_ = (status, toThrow) => {
		throw toThrow
	};
	var _scriptName = import.meta.url;
	var scriptDirectory = "";
	var readAsync, readBinary;
	if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
		try {
			scriptDirectory = new URL(".", _scriptName).href
		} catch { } {
			readAsync = async url => {
				var response = await fetch(url, {
					credentials: "same-origin"
				});
				if (response.ok) {
					return response.arrayBuffer()
				}
				throw new Error(response.status + " : " + response.url)
			}
		}
	} else { }
	var out = console.log.bind(console);
	var err = console.error.bind(console);
	var wasmBinary;
	var ABORT = false;
	var EXITSTATUS;
	var readyPromiseResolve, readyPromiseReject;
	var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
	var runtimeInitialized = false;

	function updateMemoryViews() {
		var b = wasmMemory.buffer;
		HEAP8 = Module["HEAP8"] = new Int8Array(b);
		HEAP16 = Module["HEAP16"] = new Int16Array(b);
		HEAPU8 = Module["HEAPU8"] = new Uint8Array(b);
		HEAPU16 = Module["HEAPU16"] = new Uint16Array(b);
		HEAP32 = Module["HEAP32"] = new Int32Array(b);
		HEAPU32 = Module["HEAPU32"] = new Uint32Array(b);
		HEAPF32 = Module["HEAPF32"] = new Float32Array(b);
		HEAPF64 = Module["HEAPF64"] = new Float64Array(b);
	}

	function preRun() { }

	function initRuntime() {
		runtimeInitialized = true;
		wasmExports["v"]()
	}

	function preMain() { }

	function postRun() { }

	function abort(what) {
		what = "Aborted(" + what + ")";
		err(what);
		ABORT = true;
		what += ". Build with -sASSERTIONS for more info.";
		var e = new WebAssembly.RuntimeError(what);
		readyPromiseReject?.(e);
		throw e
	}
	var wasmBinaryFile = new Uint8Array(await readAsync(import.meta.resolve("./module.wasm")));

	function getBinarySync(file) {
		if (ArrayBuffer.isView(file)) {
			return file
		}
		if (readBinary) {
			return readBinary(file)
		}
		throw "both async and sync fetching of the wasm failed"
	}
	async function getWasmBinary(binaryFile) {
		return getBinarySync(binaryFile)
	}
	async function instantiateArrayBuffer(binaryFile, imports) {
		try {
			var binary = await getWasmBinary(binaryFile);
			var instance = await WebAssembly.instantiate(binary, imports);
			return instance
		} catch (reason) {
			err(`failed to asynchronously prepare wasm: ${reason}`);
			abort(reason)
		}
	}
	async function instantiateAsync(binary, binaryFile, imports) {
		return instantiateArrayBuffer(binaryFile, imports)
	}

	function getWasmImports() {
		return {
			a: wasmImports
		}
	}
	async function createWasm() {
		function receiveInstance(instance, module) {
			wasmExports = instance.exports;
			assignWasmExports(wasmExports);
			updateMemoryViews();
			return wasmExports
		}

		function receiveInstantiationResult(result) {
			return receiveInstance(result["instance"])
		}
		var info = getWasmImports();
		wasmBinaryFile ??= findWasmBinary();
		var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info);
		var exports = receiveInstantiationResult(result);
		return exports
	}
	var tempDouble;
	var tempI64;
	class ExitStatus {
		name = "ExitStatus";
		constructor(status) {
			this.message = `Program terminated with exit(${status})`;
			this.status = status
		}
	}
	var base64Decode = b64 => {
		var b1, b2, i = 0,
			j = 0,
			bLength = b64.length;
		var output = new Uint8Array((bLength * 3 >> 2) - (b64[bLength - 2] == "=") - (b64[bLength - 1] == "="));
		for (; i < bLength; i += 4, j += 3) {
			b1 = base64ReverseLookup[b64.charCodeAt(i + 1)];
			b2 = base64ReverseLookup[b64.charCodeAt(i + 2)];
			output[j] = base64ReverseLookup[b64.charCodeAt(i)] << 2 | b1 >> 4;
			output[j + 1] = b1 << 4 | b2 >> 2;
			output[j + 2] = b2 << 6 | base64ReverseLookup[b64.charCodeAt(i + 3)]
		}
		return output
	};
	var stackRestore = val => __emscripten_stack_restore(val);
	var stackSave = () => _emscripten_stack_get_current();
	class ExceptionInfo {
		constructor(excPtr) {
			this.excPtr = excPtr;
			this.ptr = excPtr - 24
		}
		set_type(type) {
			HEAPU32[this.ptr + 4 >> 2] = type
		}
		get_type() {
			return HEAPU32[this.ptr + 4 >> 2]
		}
		set_destructor(destructor) {
			HEAPU32[this.ptr + 8 >> 2] = destructor
		}
		get_destructor() {
			return HEAPU32[this.ptr + 8 >> 2]
		}
		set_caught(caught) {
			caught = caught ? 1 : 0;
			HEAP8[this.ptr + 12] = caught
		}
		get_caught() {
			return HEAP8[this.ptr + 12] != 0
		}
		set_rethrown(rethrown) {
			rethrown = rethrown ? 1 : 0;
			HEAP8[this.ptr + 13] = rethrown
		}
		get_rethrown() {
			return HEAP8[this.ptr + 13] != 0
		}
		init(type, destructor) {
			this.set_adjusted_ptr(0);
			this.set_type(type);
			this.set_destructor(destructor)
		}
		set_adjusted_ptr(adjustedPtr) {
			HEAPU32[this.ptr + 16 >> 2] = adjustedPtr
		}
		get_adjusted_ptr() {
			return HEAPU32[this.ptr + 16 >> 2]
		}
	}
	var exceptionLast = 0;
	var uncaughtExceptionCount = 0;
	var ___cxa_throw = (ptr, type, destructor) => {
		var info = new ExceptionInfo(ptr);
		info.init(type, destructor);
		exceptionLast = ptr;
		uncaughtExceptionCount++;
		throw exceptionLast
	};
	var __abort_js = () => abort("");
	var __embind_register_bigint = (primitiveType, name, size, minRange, maxRange) => { };
	var AsciiToString = ptr => {
		var str = "";
		while (1) {
			var ch = HEAPU8[ptr++];
			if (!ch) return str;
			str += String.fromCharCode(ch)
		}
	};
	var awaitingDependencies = {};
	var registeredTypes = {};
	var typeDependencies = {};
	var BindingError = class BindingError extends Error {
		constructor(message) {
			super(message);
			this.name = "BindingError"
		}
	};
	var throwBindingError = message => {
		throw new BindingError(message)
	};

	function sharedRegisterType(rawType, registeredInstance, options = {}) {
		var name = registeredInstance.name;
		if (!rawType) {
			throwBindingError(`type "${name}" must have a positive integer typeid pointer`)
		}
		if (registeredTypes.hasOwnProperty(rawType)) {
			if (options.ignoreDuplicateRegistrations) {
				return
			} else {
				throwBindingError(`Cannot register type '${name}' twice`)
			}
		}
		registeredTypes[rawType] = registeredInstance;
		delete typeDependencies[rawType];
		if (awaitingDependencies.hasOwnProperty(rawType)) {
			var callbacks = awaitingDependencies[rawType];
			delete awaitingDependencies[rawType];
			callbacks.forEach(cb => cb())
		}
	}

	function registerType(rawType, registeredInstance, options = {}) {
		return sharedRegisterType(rawType, registeredInstance, options)
	}
	var __embind_register_bool = (rawType, name, trueValue, falseValue) => {
		name = AsciiToString(name);
		registerType(rawType, {
			name,
			fromWireType: function (wt) {
				return !!wt
			},
			toWireType: function (destructors, o) {
				return o ? trueValue : falseValue
			},
			readValueFromPointer: function (pointer) {
				return this.fromWireType(HEAPU8[pointer])
			},
			destructorFunction: null
		})
	};
	var emval_freelist = [];
	var emval_handles = [0, 1, , 1, null, 1, true, 1, false, 1];
	var __emval_decref = handle => {
		if (handle > 9 && 0 === --emval_handles[handle + 1]) {
			emval_handles[handle] = undefined;
			emval_freelist.push(handle)
		}
	};
	var Emval = {
		toValue: handle => {
			if (!handle) {
				throwBindingError(`Cannot use deleted val. handle = ${handle}`)
			}
			return emval_handles[handle]
		},
		toHandle: value => {
			switch (value) {
				case undefined:
					return 2;
				case null:
					return 4;
				case true:
					return 6;
				case false:
					return 8;
				default: {
					const handle = emval_freelist.pop() || emval_handles.length;
					emval_handles[handle] = value;
					emval_handles[handle + 1] = 1;
					return handle
				}
			}
		}
	};

	function readPointer(pointer) {
		return this.fromWireType(HEAPU32[pointer >> 2])
	}
	var EmValType = {
		name: "emscripten::val",
		fromWireType: handle => {
			var rv = Emval.toValue(handle);
			__emval_decref(handle);
			return rv
		},
		toWireType: (destructors, value) => Emval.toHandle(value),
		readValueFromPointer: readPointer,
		destructorFunction: null
	};
	var __embind_register_emval = rawType => registerType(rawType, EmValType);
	var floatReadValueFromPointer = (name, width) => {
		switch (width) {
			case 4:
				return function (pointer) {
					return this.fromWireType(HEAPF32[pointer >> 2])
				};
			case 8:
				return function (pointer) {
					return this.fromWireType(HEAPF64[pointer >> 3])
				};
			default:
				throw new TypeError(`invalid float width (${width}): ${name}`)
		}
	};
	var __embind_register_float = (rawType, name, size) => {
		name = AsciiToString(name);
		registerType(rawType, {
			name,
			fromWireType: value => value,
			toWireType: (destructors, value) => value,
			readValueFromPointer: floatReadValueFromPointer(name, size),
			destructorFunction: null
		})
	};
	var integerReadValueFromPointer = (name, width, signed) => {
		switch (width) {
			case 1:
				return signed ? pointer => HEAP8[pointer] : pointer => HEAPU8[pointer];
			case 2:
				return signed ? pointer => HEAP16[pointer >> 1] : pointer => HEAPU16[pointer >> 1];
			case 4:
				return signed ? pointer => HEAP32[pointer >> 2] : pointer => HEAPU32[pointer >> 2];
			default:
				throw new TypeError(`invalid integer width (${width}): ${name}`)
		}
	};
	var __embind_register_integer = (primitiveType, name, size, minRange, maxRange) => {
		name = AsciiToString(name);
		const isUnsignedType = minRange === 0;
		let fromWireType = value => value;
		if (isUnsignedType) {
			var bitshift = 32 - 8 * size;
			fromWireType = value => value << bitshift >>> bitshift;
			maxRange = fromWireType(maxRange)
		}
		registerType(primitiveType, {
			name,
			fromWireType,
			toWireType: (destructors, value) => value,
			readValueFromPointer: integerReadValueFromPointer(name, size, minRange !== 0),
			destructorFunction: null
		})
	};
	var __embind_register_memory_view = (rawType, dataTypeIndex, name) => {
		var typeMapping = [Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array];
		var TA = typeMapping[dataTypeIndex];

		function decodeMemoryView(handle) {
			var size = HEAPU32[handle >> 2];
			var data = HEAPU32[handle + 4 >> 2];
			return new TA(HEAP8.buffer, data, size)
		}
		name = AsciiToString(name);
		registerType(rawType, {
			name,
			fromWireType: decodeMemoryView,
			readValueFromPointer: decodeMemoryView
		}, {
			ignoreDuplicateRegistrations: true
		})
	};
	var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
		if (!(maxBytesToWrite > 0)) return 0;
		var startIdx = outIdx;
		var endIdx = outIdx + maxBytesToWrite - 1;
		for (var i = 0; i < str.length; ++i) {
			var u = str.codePointAt(i);
			if (u <= 127) {
				if (outIdx >= endIdx) break;
				heap[outIdx++] = u
			} else if (u <= 2047) {
				if (outIdx + 1 >= endIdx) break;
				heap[outIdx++] = 192 | u >> 6;
				heap[outIdx++] = 128 | u & 63
			} else if (u <= 65535) {
				if (outIdx + 2 >= endIdx) break;
				heap[outIdx++] = 224 | u >> 12;
				heap[outIdx++] = 128 | u >> 6 & 63;
				heap[outIdx++] = 128 | u & 63
			} else {
				if (outIdx + 3 >= endIdx) break;
				heap[outIdx++] = 240 | u >> 18;
				heap[outIdx++] = 128 | u >> 12 & 63;
				heap[outIdx++] = 128 | u >> 6 & 63;
				heap[outIdx++] = 128 | u & 63;
				i++
			}
		}
		heap[outIdx] = 0;
		return outIdx - startIdx
	};
	var stringToUTF8 = (str, outPtr, maxBytesToWrite) => stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
	var lengthBytesUTF8 = str => {
		var len = 0;
		for (var i = 0; i < str.length; ++i) {
			var c = str.charCodeAt(i);
			if (c <= 127) {
				len++
			} else if (c <= 2047) {
				len += 2
			} else if (c >= 55296 && c <= 57343) {
				len += 4;
				++i
			} else {
				len += 3
			}
		}
		return len
	};
	var UTF8Decoder = globalThis.TextDecoder && new TextDecoder;
	var findStringEnd = (heapOrArray, idx, maxBytesToRead, ignoreNul) => {
		var maxIdx = idx + maxBytesToRead;
		if (ignoreNul) return maxIdx;
		while (heapOrArray[idx] && !(idx >= maxIdx)) ++idx;
		return idx
	};
	var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead, ignoreNul) => {
		var endPtr = findStringEnd(heapOrArray, idx, maxBytesToRead, ignoreNul);
		if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
			return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr))
		}
		var str = "";
		while (idx < endPtr) {
			var u0 = heapOrArray[idx++];
			if (!(u0 & 128)) {
				str += String.fromCharCode(u0);
				continue
			}
			var u1 = heapOrArray[idx++] & 63;
			if ((u0 & 224) == 192) {
				str += String.fromCharCode((u0 & 31) << 6 | u1);
				continue
			}
			var u2 = heapOrArray[idx++] & 63;
			if ((u0 & 240) == 224) {
				u0 = (u0 & 15) << 12 | u1 << 6 | u2
			} else {
				u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heapOrArray[idx++] & 63
			}
			if (u0 < 65536) {
				str += String.fromCharCode(u0)
			} else {
				var ch = u0 - 65536;
				str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023)
			}
		}
		return str
	};
	var UTF8ToString = (ptr, maxBytesToRead, ignoreNul) => ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead, ignoreNul) : "";
	var __embind_register_std_string = (rawType, name) => {
		name = AsciiToString(name);
		var stdStringIsUTF8 = true;
		registerType(rawType, {
			name,
			fromWireType(value) {
				var length = HEAPU32[value >> 2];
				var payload = value + 4;
				var str;
				if (stdStringIsUTF8) {
					str = UTF8ToString(payload, length, true)
				} else {
					str = "";
					for (var i = 0; i < length; ++i) {
						str += String.fromCharCode(HEAPU8[payload + i])
					}
				}
				_free(value);
				return str
			},
			toWireType(destructors, value) {
				if (value instanceof ArrayBuffer) {
					value = new Uint8Array(value)
				}
				var length;
				var valueIsOfTypeString = typeof value == "string";
				if (!(valueIsOfTypeString || ArrayBuffer.isView(value) && value.BYTES_PER_ELEMENT == 1)) {
					throwBindingError("Cannot pass non-string to std::string")
				}
				if (stdStringIsUTF8 && valueIsOfTypeString) {
					length = lengthBytesUTF8(value)
				} else {
					length = value.length
				}
				var base = _malloc(4 + length + 1);
				var ptr = base + 4;
				HEAPU32[base >> 2] = length;
				if (valueIsOfTypeString) {
					if (stdStringIsUTF8) {
						stringToUTF8(value, ptr, length + 1)
					} else {
						for (var i = 0; i < length; ++i) {
							var charCode = value.charCodeAt(i);
							if (charCode > 255) {
								_free(base);
								throwBindingError("String has UTF-16 code units that do not fit in 8 bits")
							}
							HEAPU8[ptr + i] = charCode
						}
					}
				} else {
					HEAPU8.set(value, ptr)
				}
				if (destructors !== null) {
					destructors.push(_free, base)
				}
				return base
			},
			readValueFromPointer: readPointer,
			destructorFunction(ptr) {
				_free(ptr)
			}
		})
	};
	var UTF16Decoder = globalThis.TextDecoder ? new TextDecoder("utf-16le") : undefined;
	var UTF16ToString = (ptr, maxBytesToRead, ignoreNul) => {
		var idx = ptr >> 1;
		var endIdx = findStringEnd(HEAPU16, idx, maxBytesToRead / 2, ignoreNul);
		if (endIdx - idx > 16 && UTF16Decoder) return UTF16Decoder.decode(HEAPU16.subarray(idx, endIdx));
		var str = "";
		for (var i = idx; i < endIdx; ++i) {
			var codeUnit = HEAPU16[i];
			str += String.fromCharCode(codeUnit)
		}
		return str
	};
	var stringToUTF16 = (str, outPtr, maxBytesToWrite) => {
		maxBytesToWrite ??= 2147483647;
		if (maxBytesToWrite < 2) return 0;
		maxBytesToWrite -= 2;
		var startPtr = outPtr;
		var numCharsToWrite = maxBytesToWrite < str.length * 2 ? maxBytesToWrite / 2 : str.length;
		for (var i = 0; i < numCharsToWrite; ++i) {
			var codeUnit = str.charCodeAt(i);
			HEAP16[outPtr >> 1] = codeUnit;
			outPtr += 2
		}
		HEAP16[outPtr >> 1] = 0;
		return outPtr - startPtr
	};
	var lengthBytesUTF16 = str => str.length * 2;
	var UTF32ToString = (ptr, maxBytesToRead, ignoreNul) => {
		var str = "";
		var startIdx = ptr >> 2;
		for (var i = 0; !(i >= maxBytesToRead / 4); i++) {
			var utf32 = HEAPU32[startIdx + i];
			if (!utf32 && !ignoreNul) break;
			str += String.fromCodePoint(utf32)
		}
		return str
	};
	var stringToUTF32 = (str, outPtr, maxBytesToWrite) => {
		maxBytesToWrite ??= 2147483647;
		if (maxBytesToWrite < 4) return 0;
		var startPtr = outPtr;
		var endPtr = startPtr + maxBytesToWrite - 4;
		for (var i = 0; i < str.length; ++i) {
			var codePoint = str.codePointAt(i);
			if (codePoint > 65535) {
				i++
			}
			HEAP32[outPtr >> 2] = codePoint;
			outPtr += 4;
			if (outPtr + 4 > endPtr) break
		}
		HEAP32[outPtr >> 2] = 0;
		return outPtr - startPtr
	};
	var lengthBytesUTF32 = str => {
		var len = 0;
		for (var i = 0; i < str.length; ++i) {
			var codePoint = str.codePointAt(i);
			if (codePoint > 65535) {
				i++
			}
			len += 4
		}
		return len
	};
	var __embind_register_std_wstring = (rawType, charSize, name) => {
		name = AsciiToString(name);
		var decodeString, encodeString, lengthBytesUTF;
		if (charSize === 2) {
			decodeString = UTF16ToString;
			encodeString = stringToUTF16;
			lengthBytesUTF = lengthBytesUTF16
		} else {
			decodeString = UTF32ToString;
			encodeString = stringToUTF32;
			lengthBytesUTF = lengthBytesUTF32
		}
		registerType(rawType, {
			name,
			fromWireType: value => {
				var length = HEAPU32[value >> 2];
				var str = decodeString(value + 4, length * charSize, true);
				_free(value);
				return str
			},
			toWireType: (destructors, value) => {
				if (!(typeof value == "string")) {
					throwBindingError(`Cannot pass non-string to C++ string type ${name}`)
				}
				var length = lengthBytesUTF(value);
				var ptr = _malloc(4 + length + charSize);
				HEAPU32[ptr >> 2] = length / charSize;
				encodeString(value, ptr + 4, length + charSize);
				if (destructors !== null) {
					destructors.push(_free, ptr)
				}
				return ptr
			},
			readValueFromPointer: readPointer,
			destructorFunction(ptr) {
				_free(ptr)
			}
		})
	};
	var __embind_register_void = (rawType, name) => {
		name = AsciiToString(name);
		registerType(rawType, {
			isVoid: true,
			name,
			fromWireType: () => undefined,
			toWireType: (destructors, o) => undefined
		})
	};
	var __emscripten_throw_longjmp = () => {
		throw Infinity
	};
	var convertI32PairToI53Checked = (lo, hi) => hi + 2097152 >>> 0 < 4194305 - !!lo ? (lo >>> 0) + hi * 4294967296 : NaN;

	function __gmtime_js(time_low, time_high, tmPtr) {
		var time = convertI32PairToI53Checked(time_low, time_high);
		var date = new Date(time * 1e3);
		HEAP32[tmPtr >> 2] = date.getUTCSeconds();
		HEAP32[tmPtr + 4 >> 2] = date.getUTCMinutes();
		HEAP32[tmPtr + 8 >> 2] = date.getUTCHours();
		HEAP32[tmPtr + 12 >> 2] = date.getUTCDate();
		HEAP32[tmPtr + 16 >> 2] = date.getUTCMonth();
		HEAP32[tmPtr + 20 >> 2] = date.getUTCFullYear() - 1900;
		HEAP32[tmPtr + 24 >> 2] = date.getUTCDay();
		var start = Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
		var yday = (date.getTime() - start) / (1e3 * 60 * 60 * 24) | 0;
		HEAP32[tmPtr + 28 >> 2] = yday
	}
	var isLeapYear = year => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
	var MONTH_DAYS_LEAP_CUMULATIVE = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
	var MONTH_DAYS_REGULAR_CUMULATIVE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
	var ydayFromDate = date => {
		var leap = isLeapYear(date.getFullYear());
		var monthDaysCumulative = leap ? MONTH_DAYS_LEAP_CUMULATIVE : MONTH_DAYS_REGULAR_CUMULATIVE;
		var yday = monthDaysCumulative[date.getMonth()] + date.getDate() - 1;
		return yday
	};

	function __localtime_js(time_low, time_high, tmPtr) {
		var time = convertI32PairToI53Checked(time_low, time_high);
		var date = new Date(time * 1e3);
		HEAP32[tmPtr >> 2] = date.getSeconds();
		HEAP32[tmPtr + 4 >> 2] = date.getMinutes();
		HEAP32[tmPtr + 8 >> 2] = date.getHours();
		HEAP32[tmPtr + 12 >> 2] = date.getDate();
		HEAP32[tmPtr + 16 >> 2] = date.getMonth();
		HEAP32[tmPtr + 20 >> 2] = date.getFullYear() - 1900;
		HEAP32[tmPtr + 24 >> 2] = date.getDay();
		var yday = ydayFromDate(date) | 0;
		HEAP32[tmPtr + 28 >> 2] = yday;
		HEAP32[tmPtr + 36 >> 2] = -(date.getTimezoneOffset() * 60);
		var start = new Date(date.getFullYear(), 0, 1);
		var summerOffset = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
		var winterOffset = start.getTimezoneOffset();
		var dst = (summerOffset != winterOffset && date.getTimezoneOffset() == Math.min(winterOffset, summerOffset)) | 0;
		HEAP32[tmPtr + 32 >> 2] = dst
	}
	var __tzset_js = (timezone, daylight, std_name, dst_name) => {
		var currentYear = (new Date).getFullYear();
		var winter = new Date(currentYear, 0, 1);
		var summer = new Date(currentYear, 6, 1);
		var winterOffset = winter.getTimezoneOffset();
		var summerOffset = summer.getTimezoneOffset();
		var stdTimezoneOffset = Math.max(winterOffset, summerOffset);
		HEAPU32[timezone >> 2] = stdTimezoneOffset * 60;
		HEAP32[daylight >> 2] = Number(winterOffset != summerOffset);
		var extractZone = timezoneOffset => {
			var sign = timezoneOffset >= 0 ? "-" : "+";
			var absOffset = Math.abs(timezoneOffset);
			var hours = String(Math.floor(absOffset / 60)).padStart(2, "0");
			var minutes = String(absOffset % 60).padStart(2, "0");
			return `UTC${sign}${hours}${minutes}`
		};
		var winterName = extractZone(winterOffset);
		var summerName = extractZone(summerOffset);
		if (summerOffset < winterOffset) {
			stringToUTF8(winterName, std_name, 17);
			stringToUTF8(summerName, dst_name, 17)
		} else {
			stringToUTF8(winterName, dst_name, 17);
			stringToUTF8(summerName, std_name, 17)
		}
	};
	var _emscripten_get_now = () => performance.now();
	var _emscripten_date_now = () => Date.now();
	var nowIsMonotonic = 1;
	var checkWasiClock = clock_id => clock_id >= 0 && clock_id <= 3;

	function _clock_time_get(clk_id, ignored_precision_low, ignored_precision_high, ptime) {
		var ignored_precision = convertI32PairToI53Checked(ignored_precision_low, ignored_precision_high);
		if (!checkWasiClock(clk_id)) {
			return 28
		}
		var now;
		if (clk_id === 0) {
			now = _emscripten_date_now()
		} else if (nowIsMonotonic) {
			now = _emscripten_get_now()
		} else {
			return 52
		}
		var nsec = Math.round(now * 1e3 * 1e3);
		tempI64 = [nsec >>> 0, (tempDouble = nsec, +Math.abs(tempDouble) >= 1 ? tempDouble > 0 ? +Math.floor(tempDouble / 4294967296) >>> 0 : ~~+Math.ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[ptime >> 2] = tempI64[0], HEAP32[ptime + 4 >> 2] = tempI64[1];
		return 0
	}
	var getHeapMax = () => 2147483648;
	var alignMemory = (size, alignment) => Math.ceil(size / alignment) * alignment;
	var growMemory = size => {
		var oldHeapSize = wasmMemory.buffer.byteLength;
		var pages = (size - oldHeapSize + 65535) / 65536 | 0;
		try {
			wasmMemory.grow(pages);
			updateMemoryViews();
			return 1
		} catch (e) { }
	};
	var _emscripten_resize_heap = requestedSize => {
		var oldSize = HEAPU8.length;
		requestedSize >>>= 0;
		var maxHeapSize = getHeapMax();
		if (requestedSize > maxHeapSize) {
			return false
		}
		for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
			var overGrownHeapSize = oldSize * (1 + .2 / cutDown);
			overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
			var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));
			var replacement = growMemory(newSize);
			if (replacement) {
				return true
			}
		}
		return false
	};
	var printCharBuffers = [null, [],
		[]
	];
	var printChar = (stream, curr) => {
		var buffer = printCharBuffers[stream];
		if (curr === 0 || curr === 10) {
			(stream === 1 ? out : err)(UTF8ArrayToString(buffer));
			buffer.length = 0
		} else {
			buffer.push(curr)
		}
	};
	var _fd_write = (fd, iov, iovcnt, pnum) => {
		var num = 0;
		for (var i = 0; i < iovcnt; i++) {
			var ptr = HEAPU32[iov >> 2];
			var len = HEAPU32[iov + 4 >> 2];
			iov += 8;
			for (var j = 0; j < len; j++) {
				printChar(fd, HEAPU8[ptr + j])
			}
			num += len
		}
		HEAPU32[pnum >> 2] = num;
		return 0
	};
	var keepRuntimeAlive = () => true;
	var _proc_exit = code => {
		EXITSTATUS = code;
		if (!keepRuntimeAlive()) {
			ABORT = true
		}
		quit_(code, new ExitStatus(code))
	};
	var exitJS = (status, implicit) => {
		EXITSTATUS = status;
		_proc_exit(status)
	};
	var handleException = e => {
		if (e instanceof ExitStatus || e == "unwind") {
			return EXITSTATUS
		}
		quit_(1, e)
	};
	var wasmTableMirror = [];
	var getWasmTableEntry = funcPtr => {
		var func = wasmTableMirror[funcPtr];
		if (!func) {
			wasmTableMirror[funcPtr] = func = wasmTable.get(funcPtr)
		}
		return func
	};
	for (var base64ReverseLookup = new Uint8Array(123), i = 25; i >= 0; --i) {
		base64ReverseLookup[48 + i] = 52 + i;
		base64ReverseLookup[65 + i] = i;
		base64ReverseLookup[97 + i] = 26 + i
	}
	base64ReverseLookup[43] = 62;
	base64ReverseLookup[47] = 63;
	{ }
	var _main, _luau_compile, _luaL_newstate, _lua_close, _malloc, _luau_set_compile_constant_nil, _luau_set_compile_constant_boolean, _luau_set_compile_constant_number, _luau_set_compile_constant_vector, _luau_set_compile_constant_string, _lua_checkstack, _lua_rawcheckstack, _lua_xmove, _lua_xpush, _lua_newthread, _lua_mainthread, _lua_absindex, _lua_gettop, _lua_settop, _lua_remove, _lua_insert, _lua_replace, _lua_pushvalue, _lua_type, _lua_typename, _lua_iscfunction, _lua_isLfunction, _lua_isnumber, _lua_isstring, _lua_isuserdata, _lua_rawequal, _lua_equal, _lua_lessthan, _lua_tonumberx, _lua_tointegerx, _lua_tounsignedx, _lua_toboolean, _lua_tolstring, _lua_tostringatom, _lua_tolstringatom, _lua_namecallatom, _lua_tovector, _lua_objlen, _lua_tocfunction, _lua_tolightuserdata, _lua_tolightuserdatatagged, _lua_touserdata, _lua_touserdatatagged, _lua_userdatatag, _lua_lightuserdatatag, _lua_tothread, _lua_tobuffer, _lua_topointer, _lua_pushnil, _lua_pushnumber, _lua_pushinteger, _lua_pushunsigned, _lua_pushvector, _lua_pushlstring, _lua_pushstring, _lua_pushvfstring, _lua_pushfstringL, _lua_pushcclosurek, _lua_pushboolean, _lua_pushlightuserdatatagged, _lua_pushthread, _lua_gettable, _lua_getfield, _lua_rawgetfield, _lua_rawget, _lua_rawgeti, _lua_createtable, _lua_setreadonly, _lua_getreadonly, _lua_setsafeenv, _lua_getmetatable, _lua_getfenv, _lua_settable, _lua_setfield, _lua_rawsetfield, _lua_rawset, _lua_rawseti, _lua_setmetatable, _lua_setfenv, _lua_call, _lua_pcall, _lua_cpcall, _lua_status, _lua_costatus, _lua_getthreaddata, _lua_setthreaddata, _lua_gc, _lua_error, _lua_next, _lua_rawiter, _lua_concat, _lua_newuserdatatagged, _lua_newuserdatataggedwithmetatable, _lua_newuserdatadtor, _lua_newbuffer, _lua_getupvalue, _lua_setupvalue, _lua_encodepointer, _lua_ref, _lua_unref, _lua_setuserdatatag, _lua_setuserdatadtor, _lua_getuserdatadtor, _lua_setuserdatametatable, _lua_getuserdatametatable, _lua_setlightuserdataname, _lua_getlightuserdataname, _lua_clonefunction, _lua_cleartable, _lua_clonetable, _lua_callbacks, _lua_setmemcat, _lua_totalbytes, _lua_getallocf, _luaL_argerrorL, _luaL_errorL, _luaL_where, _luaL_typeerrorL, _luaL_checkoption, _luaL_optlstring, _luaL_checklstring, _luaL_newmetatable, _luaL_checkudata, _luaL_checkbuffer, _luaL_checkstack, _luaL_checktype, _luaL_checkany, _luaL_checknumber, _luaL_optnumber, _luaL_checkboolean, _luaL_optboolean, _luaL_checkinteger, _luaL_optinteger, _luaL_checkunsigned, _luaL_optunsigned, _luaL_checkvector, _luaL_optvector, _luaL_getmetafield, _luaL_callmeta, _luaL_register, _luaL_findtable, _luaL_typename, _luaL_callyieldable, _luaL_buffinit, _luaL_buffinitsize, _luaL_prepbuffsize, _luaL_addlstring, _luaL_addvalue, _luaL_addvalueany, _luaL_tolstring, _luaL_pushresult, _luaL_pushresultsize, _luaopen_base, _luaopen_bit32, _luaopen_buffer, _luaopen_coroutine, _luaopen_debug, _lua_getargument, _lua_getlocal, _lua_setlocal, _lua_stackdepth, _lua_getinfo, _lua_singlestep, _lua_breakpoint, _lua_getcoverage, _lua_debugtrace, _lua_resume, _lua_resumeerror, _lua_yield, _lua_break, _lua_isyieldable, _luaL_openlibs, _luaL_sandbox, _luaL_sandboxthread, _lua_clock, _lua_resetthread, _luaopen_table, _luaopen_os, _luaopen_string, _luaopen_math, _luaopen_utf8, _luaopen_vector, _lua_newstate, _free, _lua_isthreadreset, _luau_load, _setThrew, __emscripten_stack_restore, _emscripten_stack_get_current, dynCall_jiji, wasmMemory, wasmTable;

	function assignWasmExports(wasmExports) {
		_main = Module["_main"] = wasmExports["w"];
		_luau_compile = Module["_luau_compile"] = wasmExports["x"];
		_luaL_newstate = Module["_luaL_newstate"] = wasmExports["y"];
		_lua_close = Module["_lua_close"] = wasmExports["z"];
		_malloc = Module["_malloc"] = wasmExports["B"];
		_luau_set_compile_constant_nil = Module["_luau_set_compile_constant_nil"] = wasmExports["C"];
		_luau_set_compile_constant_boolean = Module["_luau_set_compile_constant_boolean"] = wasmExports["D"];
		_luau_set_compile_constant_number = Module["_luau_set_compile_constant_number"] = wasmExports["E"];
		_luau_set_compile_constant_vector = Module["_luau_set_compile_constant_vector"] = wasmExports["F"];
		_luau_set_compile_constant_string = Module["_luau_set_compile_constant_string"] = wasmExports["G"];
		_lua_checkstack = Module["_lua_checkstack"] = wasmExports["H"];
		_lua_rawcheckstack = Module["_lua_rawcheckstack"] = wasmExports["I"];
		_lua_xmove = Module["_lua_xmove"] = wasmExports["J"];
		_lua_xpush = Module["_lua_xpush"] = wasmExports["K"];
		_lua_newthread = Module["_lua_newthread"] = wasmExports["L"];
		_lua_mainthread = Module["_lua_mainthread"] = wasmExports["M"];
		_lua_absindex = Module["_lua_absindex"] = wasmExports["N"];
		_lua_gettop = Module["_lua_gettop"] = wasmExports["O"];
		_lua_settop = Module["_lua_settop"] = wasmExports["P"];
		_lua_remove = Module["_lua_remove"] = wasmExports["Q"];
		_lua_insert = Module["_lua_insert"] = wasmExports["R"];
		_lua_replace = Module["_lua_replace"] = wasmExports["S"];
		_lua_pushvalue = Module["_lua_pushvalue"] = wasmExports["T"];
		_lua_type = Module["_lua_type"] = wasmExports["U"];
		_lua_typename = Module["_lua_typename"] = wasmExports["V"];
		_lua_iscfunction = Module["_lua_iscfunction"] = wasmExports["W"];
		_lua_isLfunction = Module["_lua_isLfunction"] = wasmExports["X"];
		_lua_isnumber = Module["_lua_isnumber"] = wasmExports["Y"];
		_lua_isstring = Module["_lua_isstring"] = wasmExports["Z"];
		_lua_isuserdata = Module["_lua_isuserdata"] = wasmExports["_"];
		_lua_rawequal = Module["_lua_rawequal"] = wasmExports["$"];
		_lua_equal = Module["_lua_equal"] = wasmExports["aa"];
		_lua_lessthan = Module["_lua_lessthan"] = wasmExports["ba"];
		_lua_tonumberx = Module["_lua_tonumberx"] = wasmExports["ca"];
		_lua_tointegerx = Module["_lua_tointegerx"] = wasmExports["da"];
		_lua_tounsignedx = Module["_lua_tounsignedx"] = wasmExports["ea"];
		_lua_toboolean = Module["_lua_toboolean"] = wasmExports["fa"];
		_lua_tolstring = Module["_lua_tolstring"] = wasmExports["ga"];
		_lua_tostringatom = Module["_lua_tostringatom"] = wasmExports["ha"];
		_lua_tolstringatom = Module["_lua_tolstringatom"] = wasmExports["ia"];
		_lua_namecallatom = Module["_lua_namecallatom"] = wasmExports["ja"];
		_lua_tovector = Module["_lua_tovector"] = wasmExports["ka"];
		_lua_objlen = Module["_lua_objlen"] = wasmExports["la"];
		_lua_tocfunction = Module["_lua_tocfunction"] = wasmExports["ma"];
		_lua_tolightuserdata = Module["_lua_tolightuserdata"] = wasmExports["na"];
		_lua_tolightuserdatatagged = Module["_lua_tolightuserdatatagged"] = wasmExports["oa"];
		_lua_touserdata = Module["_lua_touserdata"] = wasmExports["pa"];
		_lua_touserdatatagged = Module["_lua_touserdatatagged"] = wasmExports["qa"];
		_lua_userdatatag = Module["_lua_userdatatag"] = wasmExports["ra"];
		_lua_lightuserdatatag = Module["_lua_lightuserdatatag"] = wasmExports["sa"];
		_lua_tothread = Module["_lua_tothread"] = wasmExports["ta"];
		_lua_tobuffer = Module["_lua_tobuffer"] = wasmExports["ua"];
		_lua_topointer = Module["_lua_topointer"] = wasmExports["va"];
		_lua_pushnil = Module["_lua_pushnil"] = wasmExports["wa"];
		_lua_pushnumber = Module["_lua_pushnumber"] = wasmExports["xa"];
		_lua_pushinteger = Module["_lua_pushinteger"] = wasmExports["ya"];
		_lua_pushunsigned = Module["_lua_pushunsigned"] = wasmExports["za"];
		_lua_pushvector = Module["_lua_pushvector"] = wasmExports["Aa"];
		_lua_pushlstring = Module["_lua_pushlstring"] = wasmExports["Ba"];
		_lua_pushstring = Module["_lua_pushstring"] = wasmExports["Ca"];
		_lua_pushvfstring = Module["_lua_pushvfstring"] = wasmExports["Da"];
		_lua_pushfstringL = Module["_lua_pushfstringL"] = wasmExports["Ea"];
		_lua_pushcclosurek = Module["_lua_pushcclosurek"] = wasmExports["Fa"];
		_lua_pushboolean = Module["_lua_pushboolean"] = wasmExports["Ga"];
		_lua_pushlightuserdatatagged = Module["_lua_pushlightuserdatatagged"] = wasmExports["Ha"];
		_lua_pushthread = Module["_lua_pushthread"] = wasmExports["Ia"];
		_lua_gettable = Module["_lua_gettable"] = wasmExports["Ja"];
		_lua_getfield = Module["_lua_getfield"] = wasmExports["Ka"];
		_lua_rawgetfield = Module["_lua_rawgetfield"] = wasmExports["La"];
		_lua_rawget = Module["_lua_rawget"] = wasmExports["Ma"];
		_lua_rawgeti = Module["_lua_rawgeti"] = wasmExports["Na"];
		_lua_createtable = Module["_lua_createtable"] = wasmExports["Oa"];
		_lua_setreadonly = Module["_lua_setreadonly"] = wasmExports["Pa"];
		_lua_getreadonly = Module["_lua_getreadonly"] = wasmExports["Qa"];
		_lua_setsafeenv = Module["_lua_setsafeenv"] = wasmExports["Ra"];
		_lua_getmetatable = Module["_lua_getmetatable"] = wasmExports["Sa"];
		_lua_getfenv = Module["_lua_getfenv"] = wasmExports["Ta"];
		_lua_settable = Module["_lua_settable"] = wasmExports["Ua"];
		_lua_setfield = Module["_lua_setfield"] = wasmExports["Va"];
		_lua_rawsetfield = Module["_lua_rawsetfield"] = wasmExports["Wa"];
		_lua_rawset = Module["_lua_rawset"] = wasmExports["Xa"];
		_lua_rawseti = Module["_lua_rawseti"] = wasmExports["Ya"];
		_lua_setmetatable = Module["_lua_setmetatable"] = wasmExports["Za"];
		_lua_setfenv = Module["_lua_setfenv"] = wasmExports["_a"];
		_lua_call = Module["_lua_call"] = wasmExports["$a"];
		_lua_pcall = Module["_lua_pcall"] = wasmExports["ab"];
		_lua_cpcall = Module["_lua_cpcall"] = wasmExports["bb"];
		_lua_status = Module["_lua_status"] = wasmExports["cb"];
		_lua_costatus = Module["_lua_costatus"] = wasmExports["db"];
		_lua_getthreaddata = Module["_lua_getthreaddata"] = wasmExports["eb"];
		_lua_setthreaddata = Module["_lua_setthreaddata"] = wasmExports["fb"];
		_lua_gc = Module["_lua_gc"] = wasmExports["gb"];
		_lua_error = Module["_lua_error"] = wasmExports["hb"];
		_lua_next = Module["_lua_next"] = wasmExports["ib"];
		_lua_rawiter = Module["_lua_rawiter"] = wasmExports["jb"];
		_lua_concat = Module["_lua_concat"] = wasmExports["kb"];
		_lua_newuserdatatagged = Module["_lua_newuserdatatagged"] = wasmExports["lb"];
		_lua_newuserdatataggedwithmetatable = Module["_lua_newuserdatataggedwithmetatable"] = wasmExports["mb"];
		_lua_newuserdatadtor = Module["_lua_newuserdatadtor"] = wasmExports["nb"];
		_lua_newbuffer = Module["_lua_newbuffer"] = wasmExports["ob"];
		_lua_getupvalue = Module["_lua_getupvalue"] = wasmExports["pb"];
		_lua_setupvalue = Module["_lua_setupvalue"] = wasmExports["qb"];
		_lua_encodepointer = Module["_lua_encodepointer"] = wasmExports["rb"];
		_lua_ref = Module["_lua_ref"] = wasmExports["sb"];
		_lua_unref = Module["_lua_unref"] = wasmExports["tb"];
		_lua_setuserdatatag = Module["_lua_setuserdatatag"] = wasmExports["ub"];
		_lua_setuserdatadtor = Module["_lua_setuserdatadtor"] = wasmExports["vb"];
		_lua_getuserdatadtor = Module["_lua_getuserdatadtor"] = wasmExports["wb"];
		_lua_setuserdatametatable = Module["_lua_setuserdatametatable"] = wasmExports["xb"];
		_lua_getuserdatametatable = Module["_lua_getuserdatametatable"] = wasmExports["yb"];
		_lua_setlightuserdataname = Module["_lua_setlightuserdataname"] = wasmExports["zb"];
		_lua_getlightuserdataname = Module["_lua_getlightuserdataname"] = wasmExports["Ab"];
		_lua_clonefunction = Module["_lua_clonefunction"] = wasmExports["Bb"];
		_lua_cleartable = Module["_lua_cleartable"] = wasmExports["Cb"];
		_lua_clonetable = Module["_lua_clonetable"] = wasmExports["Db"];
		_lua_callbacks = Module["_lua_callbacks"] = wasmExports["Eb"];
		_lua_setmemcat = Module["_lua_setmemcat"] = wasmExports["Fb"];
		_lua_totalbytes = Module["_lua_totalbytes"] = wasmExports["Gb"];
		_lua_getallocf = Module["_lua_getallocf"] = wasmExports["Hb"];
		_luaL_argerrorL = Module["_luaL_argerrorL"] = wasmExports["Ib"];
		_luaL_errorL = Module["_luaL_errorL"] = wasmExports["Jb"];
		_luaL_where = Module["_luaL_where"] = wasmExports["Kb"];
		_luaL_typeerrorL = Module["_luaL_typeerrorL"] = wasmExports["Lb"];
		_luaL_checkoption = Module["_luaL_checkoption"] = wasmExports["Mb"];
		_luaL_optlstring = Module["_luaL_optlstring"] = wasmExports["Nb"];
		_luaL_checklstring = Module["_luaL_checklstring"] = wasmExports["Ob"];
		_luaL_newmetatable = Module["_luaL_newmetatable"] = wasmExports["Pb"];
		_luaL_checkudata = Module["_luaL_checkudata"] = wasmExports["Qb"];
		_luaL_checkbuffer = Module["_luaL_checkbuffer"] = wasmExports["Rb"];
		_luaL_checkstack = Module["_luaL_checkstack"] = wasmExports["Sb"];
		_luaL_checktype = Module["_luaL_checktype"] = wasmExports["Tb"];
		_luaL_checkany = Module["_luaL_checkany"] = wasmExports["Ub"];
		_luaL_checknumber = Module["_luaL_checknumber"] = wasmExports["Vb"];
		_luaL_optnumber = Module["_luaL_optnumber"] = wasmExports["Wb"];
		_luaL_checkboolean = Module["_luaL_checkboolean"] = wasmExports["Xb"];
		_luaL_optboolean = Module["_luaL_optboolean"] = wasmExports["Yb"];
		_luaL_checkinteger = Module["_luaL_checkinteger"] = wasmExports["Zb"];
		_luaL_optinteger = Module["_luaL_optinteger"] = wasmExports["_b"];
		_luaL_checkunsigned = Module["_luaL_checkunsigned"] = wasmExports["$b"];
		_luaL_optunsigned = Module["_luaL_optunsigned"] = wasmExports["ac"];
		_luaL_checkvector = Module["_luaL_checkvector"] = wasmExports["bc"];
		_luaL_optvector = Module["_luaL_optvector"] = wasmExports["cc"];
		_luaL_getmetafield = Module["_luaL_getmetafield"] = wasmExports["dc"];
		_luaL_callmeta = Module["_luaL_callmeta"] = wasmExports["ec"];
		_luaL_register = Module["_luaL_register"] = wasmExports["fc"];
		_luaL_findtable = Module["_luaL_findtable"] = wasmExports["gc"];
		_luaL_typename = Module["_luaL_typename"] = wasmExports["hc"];
		_luaL_callyieldable = Module["_luaL_callyieldable"] = wasmExports["ic"];
		_luaL_buffinit = Module["_luaL_buffinit"] = wasmExports["jc"];
		_luaL_buffinitsize = Module["_luaL_buffinitsize"] = wasmExports["kc"];
		_luaL_prepbuffsize = Module["_luaL_prepbuffsize"] = wasmExports["lc"];
		_luaL_addlstring = Module["_luaL_addlstring"] = wasmExports["mc"];
		_luaL_addvalue = Module["_luaL_addvalue"] = wasmExports["nc"];
		_luaL_addvalueany = Module["_luaL_addvalueany"] = wasmExports["oc"];
		_luaL_tolstring = Module["_luaL_tolstring"] = wasmExports["pc"];
		_luaL_pushresult = Module["_luaL_pushresult"] = wasmExports["qc"];
		_luaL_pushresultsize = Module["_luaL_pushresultsize"] = wasmExports["rc"];
		_luaopen_base = Module["_luaopen_base"] = wasmExports["sc"];
		_luaopen_bit32 = Module["_luaopen_bit32"] = wasmExports["tc"];
		_luaopen_buffer = Module["_luaopen_buffer"] = wasmExports["uc"];
		_luaopen_coroutine = Module["_luaopen_coroutine"] = wasmExports["vc"];
		_luaopen_debug = Module["_luaopen_debug"] = wasmExports["wc"];
		_lua_getargument = Module["_lua_getargument"] = wasmExports["xc"];
		_lua_getlocal = Module["_lua_getlocal"] = wasmExports["yc"];
		_lua_setlocal = Module["_lua_setlocal"] = wasmExports["zc"];
		_lua_stackdepth = Module["_lua_stackdepth"] = wasmExports["Ac"];
		_lua_getinfo = Module["_lua_getinfo"] = wasmExports["Bc"];
		_lua_singlestep = Module["_lua_singlestep"] = wasmExports["Cc"];
		_lua_breakpoint = Module["_lua_breakpoint"] = wasmExports["Dc"];
		_lua_getcoverage = Module["_lua_getcoverage"] = wasmExports["Ec"];
		_lua_debugtrace = Module["_lua_debugtrace"] = wasmExports["Fc"];
		_lua_resume = Module["_lua_resume"] = wasmExports["Gc"];
		_lua_resumeerror = Module["_lua_resumeerror"] = wasmExports["Hc"];
		_lua_yield = Module["_lua_yield"] = wasmExports["Ic"];
		_lua_break = Module["_lua_break"] = wasmExports["Jc"];
		_lua_isyieldable = Module["_lua_isyieldable"] = wasmExports["Kc"];
		_luaL_openlibs = Module["_luaL_openlibs"] = wasmExports["Lc"];
		_luaL_sandbox = Module["_luaL_sandbox"] = wasmExports["Mc"];
		_luaL_sandboxthread = Module["_luaL_sandboxthread"] = wasmExports["Nc"];
		_lua_clock = Module["_lua_clock"] = wasmExports["Oc"];
		_lua_resetthread = Module["_lua_resetthread"] = wasmExports["Pc"];
		_luaopen_table = Module["_luaopen_table"] = wasmExports["Qc"];
		_luaopen_os = Module["_luaopen_os"] = wasmExports["Rc"];
		_luaopen_string = Module["_luaopen_string"] = wasmExports["Sc"];
		_luaopen_math = Module["_luaopen_math"] = wasmExports["Tc"];
		_luaopen_utf8 = Module["_luaopen_utf8"] = wasmExports["Uc"];
		_luaopen_vector = Module["_luaopen_vector"] = wasmExports["Vc"];
		_lua_newstate = Module["_lua_newstate"] = wasmExports["Wc"];
		_free = Module["_free"] = wasmExports["Xc"];
		_lua_isthreadreset = Module["_lua_isthreadreset"] = wasmExports["Yc"];
		_luau_load = Module["_luau_load"] = wasmExports["Zc"];
		_setThrew = wasmExports["_c"];
		__emscripten_stack_restore = wasmExports["$c"];
		_emscripten_stack_get_current = wasmExports["ad"];
		dynCall_jiji = wasmExports["dynCall_jiji"];
		wasmMemory = wasmExports["u"];
		wasmTable = Module["functionTable"] = wasmExports["A"]
	}
	var wasmImports = {
		c: ___cxa_throw,
		r: __abort_js,
		q: __embind_register_bigint,
		j: __embind_register_bool,
		m: __embind_register_emval,
		e: __embind_register_float,
		b: __embind_register_integer,
		a: __embind_register_memory_view,
		l: __embind_register_std_string,
		d: __embind_register_std_wstring,
		i: __embind_register_void,
		h: __emscripten_throw_longjmp,
		p: __gmtime_js,
		o: __localtime_js,
		t: __tzset_js,
		n: _clock_time_get,
		s: _emscripten_date_now,
		g: _emscripten_resize_heap,
		f: _fd_write,
		k: invoke_vii
	};

	function invoke_vii(index, a1, a2) {
		var sp = stackSave();
		try {
			getWasmTableEntry(index)(a1, a2)
		} catch (e) {
			stackRestore(sp);
			if (e !== e + 0) throw e;
			_setThrew(1, 0)
		}
	}

	function callMain() {
		var entryFunction = _main;
		var argc = 0;
		var argv = 0;
		try {
			var ret = entryFunction(argc, argv);
			exitJS(ret, true);
			return ret
		} catch (e) {
			return handleException(e)
		}
	}

	function run() {
		preRun();

		function doRun() {
			Module["calledRun"] = true;
			if (ABORT) return;
			initRuntime();
			preMain();
			readyPromiseResolve?.(Module);
			var noInitialRun = true;
			if (!noInitialRun) callMain();
			postRun()
		} {
			doRun()
		}
	}
	var wasmExports;
	wasmExports = await (createWasm());
	run();

	Object.assign(Module, {
		stringToUTF16,
		stringToUTF32,
		stringToUTF8,
		UTF8ToString,
		AsciiToString,
		UTF16ToString,
		UTF32ToString,
	})

	if (runtimeInitialized) {
		moduleRtn = Module
	} else {
		moduleRtn = new Promise((resolve, reject) => {
			readyPromiseResolve = resolve;
			readyPromiseReject = reject
		})
	};

	return moduleRtn
}
export default Module;