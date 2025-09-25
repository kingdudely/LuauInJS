const wasmLocation = import.meta.resolve('./module.wasm');

class ExitStatus extends Error {
	constructor(status) {
		super(`Exit(${status})`);
		this.status = status;
	}
};

const instantiated = await WebAssembly.instantiateStreaming(fetch(wasmLocation), {
	env: {
		__cxa_throw: ptr => { throw new Error(`__cxa_throw (ptr=${ptr})`); },
		__cxa_begin_catch: ptr => ptr,
		__cxa_end_catch: () => {},
		__cxa_find_matching_catch_3: () => 0,
		_abort_js: msg => { throw new WebAssembly.RuntimeError('abort: ' + msg); },
		_emscripten_runtime_keepalive_clear: () => {},
		_setitimer_js: () => 0,
		emscripten_resize_heap: (requestedSize) => {
			const old = memory.buffer.byteLength;
			const pagesNeeded = Math.ceil((requestedSize - old) / Math.pow(2, 16));
			if (pagesNeeded <= 0) return 1;

			try {
				memory.grow(pagesNeeded);
				refreshViews();
				return 1;
			} catch (e) {
				return 0;
			}
		},
		invoke_ii: (i, a) => __indirect_function_table.get(i)(a),
		invoke_v: i => __indirect_function_table.get(i)(),
		invoke_vii: (i, a1, a2) => __indirect_function_table.get(i)(a1, a2),
	},

	wasi_snapshot_preview1: {
		proc_exit: code => { throw new ExitStatus(code); }
	}
});

const { malloc, free, luau_compile, memory, __indirect_function_table  } = instantiated.instance.exports;

const HEAP = {};
function getHeap(arrayType) {
	const heap = HEAP[arrayType];
	const { buffer } = memory;
	if (!ArrayBuffer.isView(heap) || heap.buffer !== buffer) return HEAP[arrayType] = new arrayType(buffer);
	return heap;
}

const textEncoder = new TextEncoder();
function write_cstring(value) {
	const HEAPU8 = getHeap(Uint8Array);

	value += "\0";
	const encoded = textEncoder.encode(value);
	const ptr = malloc(encoded.length);

	HEAPU8.set(encoded, ptr);
	return ptr;
	/*
	const encoded = textEncoder.encode(value);
	const ptr = malloc(encoded.length + 1);

	getHeap(Uint8Array).set(encoded, ptr);
	getHeap(Uint8Array)[ptr + encoded.length] = 0; // null terminate
	return ptr;
	*/
};

function write_cstrings(strings) {
	if (strings.length <= 0) return 0;

	const HEAP32 = getHeap(Int32Array);
	const array_ptr = malloc((strings.length + 1) * 4); // add 1 for null terminator
	const array_base = (array_ptr >> 2);

	for (let i = 0; i < strings.length; i++) { // += 1
		HEAP32[array_base + i] = write_cstring(strings[i]);
	}

	HEAP32[array_base + strings.length] = 0; // null terminate
	return array_ptr;
};

function free_array(pointer) {
	const HEAP32 = getHeap(Int32Array);
	let address = pointer >> 2;
	while (HEAP32[address] !== 0) free(HEAP32[address++]);
	free(pointer);
};

const DEFAULT_COMPILE_OPTIONS = [
	["OptimizationLevel", 1],
	["DebugLevel", 1],
	["TypeInfoLevel", 1],
	["CoverageLevel", 1],
	["VectorLibName", "vector"],
	["VectorLibConstructor", "create"],
	["VectorType", "vector"],
	["MutableGlobals", []],
	["UserdataTypes", 0],
	["LibrariesWithKnownMembers", 0],
	["LibraryMemberTypeCb", 0],
	["LibraryMemberConstantCb", 0],
	["DisabledBuiltins", []],
];

function create_luau_options(options = {}) {
	const HEAP32 = getHeap(Int32Array);

	const
		optionAmount = DEFAULT_COMPILE_OPTIONS.length,
		option_ptr = malloc(optionAmount * 4),
		option_base = option_ptr >> 2; // option_base_ptr
	const
		stringPointers = [option_ptr],
		arrayPointers = [];

	for (let i = 0; i < optionAmount; i++) {
		const [optionName, defaultOptionValue] = DEFAULT_COMPILE_OPTIONS[i];
		let optionValue = options[optionName] ?? defaultOptionValue;

		switch (optionValue?.constructor) {
			case String: optionValue = stringPointers[stringPointers.length] = write_cstring(optionValue); break;
			case Array: optionValue = arrayPointers[arrayPointers.length] = write_cstrings(optionValue); break;
		};

		HEAP32[option_base + i] = optionValue;
	};

	const free_options = () => {
		stringPointers.forEach(free);
		arrayPointers.forEach(free_array);
	};

	return [option_ptr, free_options];
};

export default function (source, options) {
	const
		HEAPU8 = getHeap(Uint8Array),
		HEAP32 = getHeap(Int32Array);

	const [option_ptr, free_options] = create_luau_options(options);

	const src_ptr = write_cstring(source);
	const bc_size_ptr = malloc(8);

	const
		bytecode_ptr = luau_compile(src_ptr, source.length, option_ptr, bc_size_ptr),
		bytecode_size = HEAP32[bc_size_ptr >> 2],
		bytecode = HEAPU8.slice(bytecode_ptr, bytecode_ptr + bytecode_size);

	free_options();
	free(src_ptr);
	free(bc_size_ptr);
	free(bytecode_ptr);

	return bytecode;
};
