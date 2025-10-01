import { applyDefaults } from "/modules/utilities/general.js";
const textEncoder = new TextEncoder();
const wasmLocation = import.meta.resolve('./module.wasm');

const instantiated = await WebAssembly.instantiateStreaming(fetch(wasmLocation), {
	env: {
		__cxa_throw: ptr => { throw new Error(`__cxa_throw (ptr=${ptr})`); },
		__cxa_begin_catch: ptr => ptr,
		__cxa_end_catch: () => { },
		__cxa_find_matching_catch_3: () => 0,
		_abort_js: msg => { throw new WebAssembly.RuntimeError('abort: ' + msg); },
		_emscripten_runtime_keepalive_clear: () => { },
		_setitimer_js: () => 0,
		emscripten_resize_heap: (requestedSize) => {
			const old = memory.buffer.byteLength;
			const pagesNeeded = Math.ceil((requestedSize - old) / Math.pow(2, 16));
			if (pagesNeeded <= 0) return 1;

			try {
				memory.grow(pagesNeeded);
				return 1;
			} catch {
				return 0;
			}
		},
		invoke_ii: (i, a) => __indirect_function_table.get(i)(a),
		invoke_v: i => __indirect_function_table.get(i)(),
		invoke_vii: (i, a1, a2) => __indirect_function_table.get(i)(a1, a2),
	},

	wasi_snapshot_preview1: {
		proc_exit: code => { throw new WebAssembly.RuntimeError(`Return code ${code}`); } // ExitStatus
	}
});

const { malloc, free, luau_compile, memory, __indirect_function_table } = instantiated.instance.exports;
const HEAP = {};

function getHeap(arrayType) {
	const heap = HEAP[arrayType];
	const { buffer } = memory;
	if (!ArrayBuffer.isView(heap) || heap.buffer !== buffer) return HEAP[arrayType] = new arrayType(buffer);
	return heap;
}

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

const OptionOrder = [ // Respective
	"OptimizationLevel",
	"DebugLevel",
	"TypeInfoLevel",
	"CoverageLevel",
	"VectorLibName",
	"VectorLibConstructor",
	"VectorType",
	"MutableGlobals",
	"UserdataTypes",
	"LibrariesWithKnownMembers",
	"LibraryMemberTypeCb",
	"LibraryMemberConstantCb",
	"DisabledBuiltins",
];
const OptionAmount = OptionOrder.length;
// export const CompileOptions

export default function (Source, Options) {
	Options = applyDefaults(Options, {
		"OptimizationLevel": 1,
		"DebugLevel": 1,
		"TypeInfoLevel": 1,
		"CoverageLevel": 1,
		"VectorLibName": "vector",
		"VectorLibConstructor": "create",
		"VectorType": "vector",
		"MutableGlobals": [],
		"UserdataTypes": 0,
		"LibrariesWithKnownMembers": 0,
		"LibraryMemberTypeCb": 0,
		"LibraryMemberConstantCb": 0,
		"DisabledBuiltins": []
	});

	const
		HEAPU8 = getHeap(Uint8Array),
		HEAP32 = getHeap(Int32Array);

	const
		option_ptr = malloc(OptionAmount * 4),
		option_base = option_ptr >> 2; // option_base_ptr

	const
		pointers = [option_ptr],
		arrayPointers = [];

	for (let i = 0; i < OptionAmount; i++) {
		const optionName = OptionOrder[i];
		let optionValue = Options[optionName];

		switch (optionValue?.constructor) {
			// What about number
			case String: optionValue = pointers[pointers.length] = write_cstring(optionValue); break;
			case Array: optionValue = arrayPointers[arrayPointers.length] = write_cstrings(optionValue); break;
		};

		HEAP32[option_base + i] = optionValue;
	};

	const src_ptr = pointers[pointers.length] = write_cstring(Source);
	const bc_size_ptr = pointers[pointers.length] = malloc(8);

	const
		bytecode_ptr = pointers[pointers.length] = luau_compile(src_ptr, Source.length, option_ptr, bc_size_ptr),
		bytecode_size = HEAP32[bc_size_ptr >> 2],
		bytecode = HEAPU8.slice(bytecode_ptr, bytecode_ptr + bytecode_size);

	pointers.forEach(free);
	arrayPointers.forEach(free_array);

	return bytecode.buffer;
}
