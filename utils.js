const _ENCODER = new TextEncoder();
const _DECODER = new TextDecoder();

function write_cstring(Module, value) {
	const encoded = _ENCODER.encode(value);
	const ptr = Module._malloc(encoded.length + 1);

	Module.HEAPU8.set(encoded, ptr);
	Module.HEAPU8[ptr + encoded.length] = 0; // null terminate
	return ptr;
}

function write_cstrings(Module, strings) {
	if (strings.length < 1) {
		return 0;
	}

	const array_ptr = Module._malloc((strings.length + 1) * 4);

	for (let idx = 0; idx < strings.length; idx += 1) {
		const encoded = _ENCODER.encode(strings[idx]);
		const str_ptr = Module._malloc(encoded.length + 1);

		Module.HEAPU8.set(encoded, str_ptr);
		Module.HEAPU8[str_ptr + encoded.length] = 0;
		Module.HEAP32[(array_ptr >> 2) + idx] = str_ptr;
	}
	Module.HEAP32[(array_ptr >> 2) + strings.length] = 0; // null terminate
	return array_ptr;
}

function read_utf8string(Module, ptr, length) {
	return _DECODER.decode(Module.HEAPU8.subarray(ptr, ptr + length));
}

function free_array(Module, ptr) {
	let position = 0;

	while (Module.HEAP32[(ptr >> 2) + position] !== 0) {
		Module._free(Module.HEAP32[(ptr >> 2) + position]);
		position += 1;
	}
	Module._free(ptr);
}

export { read_utf8string, write_cstring, write_cstrings, free_array };
