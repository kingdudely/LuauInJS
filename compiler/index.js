// This code implements the `-sMODULARIZE` settings by taking the generated
// JS program code (INNER_JS_CODE) and wrapping it in a factory function.

// When targetting node and ES6 we use `await import ..` in the generated code
// so the outer function needs to be marked as async.
async function LuauCompiler(moduleArg = {}) {
	var moduleRtn;

	// include: shell.js
	// The Module object: Our interface to the outside world. We import
	// and export values on it. There are various ways Module can be used:
	// 1. Not defined. We create it here
	// 2. A function parameter, function(moduleArg) => Promise<Module>
	// 3. pre-run appended it, var Module = {}; ..generated code..
	// 4. External script tag defines var Module.
	// We need to check if Module already exists (e.g. case 3 above).
	// Substitution will be replaced with actual code on later stage of the build,
	// this way Closure Compiler will not mangle it (e.g. case 4. above).
	// Note that if you want to run closure, and also to use Module
	// after the generated code, you will need to define   var Module = {};
	// before the code. Then that object will be used in the code, and you
	// can continue to use Module afterwards as well.
	var Module = moduleArg;

	// Determine the runtime environment we are in. You can customize this by
	// setting the ENVIRONMENT setting at compile time (see settings.js).

	var ENVIRONMENT_IS_WEB = true;
	var ENVIRONMENT_IS_WORKER = false;
	var ENVIRONMENT_IS_NODE = false;
	var ENVIRONMENT_IS_SHELL = false;

	// --pre-jses are emitted after the Module integration code, so that they can
	// refer to Module (if they choose; they can also define Module)


	var arguments_ = [];
	var thisProgram = './this.program';
	var quit_ = (status, toThrow) => {
		throw toThrow;
	};

	var _scriptName = import.meta.url;

	// `/` should be present at the end if `scriptDirectory` is not empty
	var scriptDirectory = '';
	function locateFile(path) {
		if (Module['locateFile']) {
			return Module['locateFile'](path, scriptDirectory);
		}
		return scriptDirectory + path;
	}

	// Hooks that are implemented differently in different runtime environments.
	var readAsync, readBinary;

	// Note that this includes Node.js workers when relevant (pthreads is enabled).
	// Node.js workers are detected as a combination of ENVIRONMENT_IS_WORKER and
	// ENVIRONMENT_IS_NODE.
	if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
		try {
			scriptDirectory = new URL('.', _scriptName).href; // includes trailing slash
		} catch {
			// Must be a `blob:` or `data:` URL (e.g. `blob:http://site.com/etc/etc`), we cannot
			// infer anything from them.
		}

		{
			// include: web_or_worker_shell_read.js
			readAsync = async (url) => {
				var response = await fetch(url, { credentials: 'same-origin' });
				if (response.ok) {
					return response.arrayBuffer();
				}
				throw new Error(response.status + ' : ' + response.url);
			};
			// end include: web_or_worker_shell_read.js
		}
	} else {
	}

	var out = console.log.bind(console);
	var err = console.error.bind(console);

	// end include: shell.js

	// include: preamble.js
	// === Preamble library stuff ===

	// Documentation for the public APIs defined in this file must be updated in:
	//    site/source/docs/api_reference/preamble.js.rst
	// A prebuilt local version of the documentation is available at:
	//    site/build/text/docs/api_reference/preamble.js.txt
	// You can also build docs locally as HTML or other formats in site/
	// An online HTML version (which may be of a different version of Emscripten)
	//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

	var wasmBinary;

	// Wasm globals

	//========================================
	// Runtime essentials
	//========================================

	// whether we are quitting the application. no code should run after this.
	// set in exit() and abort()
	var ABORT = false;

	// set by exit() and abort().  Passed to 'onExit' handler.
	// NOTE: This is also used as the process return code code in shell environments
	// but only when noExitRuntime is false.
	var EXITSTATUS;

	// In STRICT mode, we only define assert() when ASSERTIONS is set.  i.e. we
	// don't define it at all in release modes.  This matches the behaviour of
	// MINIMAL_RUNTIME.
	// TODO(sbc): Make this the default even without STRICT enabled.
	/** @type {function(*, string=)} */
	function assert(condition, text) {
		if (!condition) {
			// This build was created without ASSERTIONS defined.  `assert()` should not
			// ever be called in this configuration but in case there are callers in
			// the wild leave this simple abort() implementation here for now.
			abort(text);
		}
	}

	/**
	 * Indicates whether filename is delivered via file protocol (as opposed to http/https)
	 * @noinline
	 */
	var isFileURI = (filename) => filename.startsWith('file://');

	// include: runtime_common.js
	// include: runtime_stack_check.js
	// end include: runtime_stack_check.js
	// include: runtime_exceptions.js
	// end include: runtime_exceptions.js
	// include: runtime_debug.js
	// end include: runtime_debug.js
	var readyPromiseResolve, readyPromiseReject;

	// Memory management

	var wasmMemory;

	var
		/** @type {!Int8Array} */
		HEAP8,
		/** @type {!Uint8Array} */
		HEAPU8,
		/** @type {!Int16Array} */
		HEAP16,
		/** @type {!Uint16Array} */
		HEAPU16,
		/** @type {!Int32Array} */
		HEAP32,
		/** @type {!Uint32Array} */
		HEAPU32,
		/** @type {!Float32Array} */
		HEAPF32,
		/** @type {!Float64Array} */
		HEAPF64;

	// BigInt64Array type is not correctly defined in closure
	var
		/** not-@type {!BigInt64Array} */
		HEAP64,
		/* BigUint64Array type is not correctly defined in closure
		/** not-@type {!BigUint64Array} */
		HEAPU64;

	var runtimeInitialized = false;



	function updateMemoryViews() {
		var b = wasmMemory.buffer;
		HEAP8 = new Int8Array(b);
		HEAP16 = new Int16Array(b);
		Module['HEAPU8'] = HEAPU8 = new Uint8Array(b);
		HEAPU16 = new Uint16Array(b);
		Module['HEAP32'] = HEAP32 = new Int32Array(b);
		HEAPU32 = new Uint32Array(b);
		HEAPF32 = new Float32Array(b);
		HEAPF64 = new Float64Array(b);
		HEAP64 = new BigInt64Array(b);
		HEAPU64 = new BigUint64Array(b);
	}

	// include: memoryprofiler.js
	// end include: memoryprofiler.js
	// end include: runtime_common.js
	function preRun() {
		if (Module['preRun']) {
			if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
			while (Module['preRun'].length) {
				addOnPreRun(Module['preRun'].shift());
			}
		}
		// Begin ATPRERUNS hooks
		callRuntimeCallbacks(onPreRuns);
		// End ATPRERUNS hooks
	}

	function initRuntime() {
		runtimeInitialized = true;

		// No ATINITS hooks



		// No ATPOSTCTORS hooks
	}

	function postRun() {
		// PThreads reuse the runtime from the main thread.

		if (Module['postRun']) {
			if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
			while (Module['postRun'].length) {
				addOnPostRun(Module['postRun'].shift());
			}
		}

		// Begin ATPOSTRUNS hooks
		callRuntimeCallbacks(onPostRuns);
		// End ATPOSTRUNS hooks
	}

	// A counter of dependencies for calling run(). If we need to
	// do asynchronous work before running, increment this and
	// decrement it. Incrementing must happen in a place like
	// Module.preRun (used by emcc to add file preloading).
	// Note that you can add dependencies in preRun, even though
	// it happens right before run - run will be postponed until
	// the dependencies are met.
	var runDependencies = 0;
	var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled

	function addRunDependency(id) {
		runDependencies++;

		Module['monitorRunDependencies']?.(runDependencies);

	}

	function removeRunDependency(id) {
		runDependencies--;

		Module['monitorRunDependencies']?.(runDependencies);

		if (runDependencies == 0) {
			if (dependenciesFulfilled) {
				var callback = dependenciesFulfilled;
				dependenciesFulfilled = null;
				callback(); // can add another dependenciesFulfilled
			}
		}
	}

	/** @param {string|number=} what */
	function abort(what) {
		Module['onAbort']?.(what);

		what = 'Aborted(' + what + ')';
		// TODO(sbc): Should we remove printing and leave it up to whoever
		// catches the exception?
		err(what);

		ABORT = true;

		what += '. Build with -sASSERTIONS for more info.';

		// Use a wasm runtime error, because a JS error might be seen as a foreign
		// exception, which means we'd run destructors on it. We need the error to
		// simply make the program stop.
		// FIXME This approach does not work in Wasm EH because it currently does not assume
		// all RuntimeErrors are from traps; it decides whether a RuntimeError is from
		// a trap or not based on a hidden field within the object. So at the moment
		// we don't have a way of throwing a wasm trap from JS. TODO Make a JS API that
		// allows this in the wasm spec.

		// Suppress closure compiler warning here. Closure compiler's builtin extern
		// definition for WebAssembly.RuntimeError claims it takes no arguments even
		// though it can.
		// TODO(https://github.com/google/closure-compiler/pull/3913): Remove if/when upstream closure gets fixed.
		/** @suppress {checkTypes} */
		var e = new WebAssembly.RuntimeError(what);

		readyPromiseReject?.(e);
		// Throw the error whether or not MODULARIZE is set because abort is used
		// in code paths apart from instantiation where an exception is expected
		// to be thrown when abort is called.
		throw e;
	}

	var wasmBinaryFile = new Uint8Array(await readAsync(locateFile("./module.wasm")));

	function getBinarySync(file) {
		if (ArrayBuffer.isView(file)) {
			return file;
		}
		if (file == wasmBinaryFile && wasmBinary) {
			return new Uint8Array(wasmBinary);
		}
		if (readBinary) {
			return readBinary(file);
		}
		throw 'both async and sync fetching of the wasm failed';
	}

	async function getWasmBinary(binaryFile) {

		// Otherwise, getBinarySync should be able to get it synchronously
		return getBinarySync(binaryFile);
	}

	async function instantiateArrayBuffer(binaryFile, imports) {
		try {
			var binary = await getWasmBinary(binaryFile);
			var instance = await WebAssembly.instantiate(binary, imports);
			return instance;
		} catch (reason) {
			err(`failed to asynchronously prepare wasm: ${reason}`);

			abort(reason);
		}
	}

	async function instantiateAsync(binary, binaryFile, imports) {
		return instantiateArrayBuffer(binaryFile, imports);
	}

	function getWasmImports() {
		// prepare imports
		return {
			'env': wasmImports,
			'wasi_snapshot_preview1': wasmImports,
		}
	}

	// Create the wasm instance.
	// Receives the wasm imports, returns the exports.
	async function createWasm() {
		// Load the wasm module and create an instance of using native support in the JS engine.
		// handle a generated wasm instance, receiving its exports and
		// performing other necessary setup
		/** @param {WebAssembly.Module=} module*/
		function receiveInstance(instance, module) {
			wasmExports = instance.exports;



			wasmMemory = wasmExports['memory'];

			updateMemoryViews();

			wasmTable = wasmExports['__indirect_function_table'];


			assignWasmExports(wasmExports);
			removeRunDependency('wasm-instantiate');
			return wasmExports;
		}
		// wait for the pthread pool (if any)
		addRunDependency('wasm-instantiate');

		// Prefer streaming instantiation if available.
		function receiveInstantiationResult(result) {
			// 'result' is a ResultObject object which has both the module and instance.
			// receiveInstance() will swap in the exports (to Module.asm) so they can be called
			// TODO: Due to Closure regression https://github.com/google/closure-compiler/issues/3193, the above line no longer optimizes out down to the following line.
			// When the regression is fixed, can restore the above PTHREADS-enabled path.
			return receiveInstance(result['instance']);
		}

		var info = getWasmImports();

		// User shell pages can write their own Module.instantiateWasm = function(imports, successCallback) callback
		// to manually instantiate the Wasm module themselves. This allows pages to
		// run the instantiation parallel to any other async startup actions they are
		// performing.
		// Also pthreads and wasm workers initialize the wasm instance through this
		// path.
		if (Module['instantiateWasm']) {
			return new Promise((resolve, reject) => {
				Module['instantiateWasm'](info, (mod, inst) => {
					resolve(receiveInstance(mod, inst));
				});
			});
		}

		wasmBinaryFile ??= findWasmBinary();
		var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info);
		var exports = receiveInstantiationResult(result);
		return exports;
	}

	// end include: preamble.js

	// Begin JS library code


	class ExitStatus {
		name = 'ExitStatus';
		constructor(status) {
			this.message = `Program terminated with exit(${status})`;
			this.status = status;
		}
	}

	var callRuntimeCallbacks = (callbacks) => {
		while (callbacks.length > 0) {
			// Pass the module as the first argument.
			callbacks.shift()(Module);
		}
	};
	var onPostRuns = [];
	var addOnPostRun = (cb) => onPostRuns.push(cb);

	var onPreRuns = [];
	var addOnPreRun = (cb) => onPreRuns.push(cb);

	/** @noinline */
	var base64Decode = (b64) => {

		var b1, b2, i = 0, j = 0, bLength = b64.length;
		var output = new Uint8Array((bLength * 3 >> 2) - (b64[bLength - 2] == '=') - (b64[bLength - 1] == '='));
		for (; i < bLength; i += 4, j += 3) {
			b1 = base64ReverseLookup[b64.charCodeAt(i + 1)];
			b2 = base64ReverseLookup[b64.charCodeAt(i + 2)];
			output[j] = base64ReverseLookup[b64.charCodeAt(i)] << 2 | b1 >> 4;
			output[j + 1] = b1 << 4 | b2 >> 2;
			output[j + 2] = b2 << 6 | base64ReverseLookup[b64.charCodeAt(i + 3)];
		}
		return output;
	};



	/**
	 * @param {number} ptr
	 * @param {string} type
	 */
	function getValue(ptr, type = 'i8') {
		if (type.endsWith('*')) type = '*';
		switch (type) {
			case 'i1': return HEAP8[ptr];
			case 'i8': return HEAP8[ptr];
			case 'i16': return HEAP16[((ptr) >> 1)];
			case 'i32': return HEAP32[((ptr) >> 2)];
			case 'i64': return HEAP64[((ptr) >> 3)];
			case 'float': return HEAPF32[((ptr) >> 2)];
			case 'double': return HEAPF64[((ptr) >> 3)];
			case '*': return HEAPU32[((ptr) >> 2)];
			default: abort(`invalid type for getValue: ${type}`);
		}
	}

	var noExitRuntime = true;


	/**
	 * @param {number} ptr
	 * @param {number} value
	 * @param {string} type
	 */
	function setValue(ptr, value, type = 'i8') {
		if (type.endsWith('*')) type = '*';
		switch (type) {
			case 'i1': HEAP8[ptr] = value; break;
			case 'i8': HEAP8[ptr] = value; break;
			case 'i16': HEAP16[((ptr) >> 1)] = value; break;
			case 'i32': HEAP32[((ptr) >> 2)] = value; break;
			case 'i64': HEAP64[((ptr) >> 3)] = BigInt(value); break;
			case 'float': HEAPF32[((ptr) >> 2)] = value; break;
			case 'double': HEAPF64[((ptr) >> 3)] = value; break;
			case '*': HEAPU32[((ptr) >> 2)] = value; break;
			default: abort(`invalid type for setValue: ${type}`);
		}
	}

	var stackRestore = (val) => __emscripten_stack_restore(val);

	var stackSave = () => _emscripten_stack_get_current();

	var exceptionCaught = [];



	var uncaughtExceptionCount = 0;
	var ___cxa_begin_catch = (ptr) => {
		var info = new ExceptionInfo(ptr);
		if (!info.get_caught()) {
			info.set_caught(true);
			uncaughtExceptionCount--;
		}
		info.set_rethrown(false);
		exceptionCaught.push(info);
		___cxa_increment_exception_refcount(ptr);
		return ___cxa_get_exception_ptr(ptr);
	};


	var exceptionLast = 0;


	var ___cxa_end_catch = () => {
		// Clear state flag.
		_setThrew(0, 0);
		// Call destructor if one is registered then clear it.
		var info = exceptionCaught.pop();

		___cxa_decrement_exception_refcount(info.excPtr);
		exceptionLast = 0; // XXX in decRef?
	};


	class ExceptionInfo {
		// excPtr - Thrown object pointer to wrap. Metadata pointer is calculated from it.
		constructor(excPtr) {
			this.excPtr = excPtr;
			this.ptr = excPtr - 24;
		}

		set_type(type) {
			HEAPU32[(((this.ptr) + (4)) >> 2)] = type;
		}

		get_type() {
			return HEAPU32[(((this.ptr) + (4)) >> 2)];
		}

		set_destructor(destructor) {
			HEAPU32[(((this.ptr) + (8)) >> 2)] = destructor;
		}

		get_destructor() {
			return HEAPU32[(((this.ptr) + (8)) >> 2)];
		}

		set_caught(caught) {
			caught = caught ? 1 : 0;
			HEAP8[(this.ptr) + (12)] = caught;
		}

		get_caught() {
			return HEAP8[(this.ptr) + (12)] != 0;
		}

		set_rethrown(rethrown) {
			rethrown = rethrown ? 1 : 0;
			HEAP8[(this.ptr) + (13)] = rethrown;
		}

		get_rethrown() {
			return HEAP8[(this.ptr) + (13)] != 0;
		}

		// Initialize native structure fields. Should be called once after allocated.
		init(type, destructor) {
			this.set_adjusted_ptr(0);
			this.set_type(type);
			this.set_destructor(destructor);
		}

		set_adjusted_ptr(adjustedPtr) {
			HEAPU32[(((this.ptr) + (16)) >> 2)] = adjustedPtr;
		}

		get_adjusted_ptr() {
			return HEAPU32[(((this.ptr) + (16)) >> 2)];
		}
	}


	var setTempRet0 = (val) => __emscripten_tempret_set(val);
	var findMatchingCatch = (args) => {
		var thrown =
			exceptionLast;
		if (!thrown) {
			// just pass through the null ptr
			setTempRet0(0);
			return 0;
		}
		var info = new ExceptionInfo(thrown);
		info.set_adjusted_ptr(thrown);
		var thrownType = info.get_type();
		if (!thrownType) {
			// just pass through the thrown ptr
			setTempRet0(0);
			return thrown;
		}

		// can_catch receives a **, add indirection
		// The different catch blocks are denoted by different types.
		// Due to inheritance, those types may not precisely match the
		// type of the thrown object. Find one which matches, and
		// return the type of the catch block which should be called.
		for (var caughtType of args) {
			if (caughtType === 0 || caughtType === thrownType) {
				// Catch all clause matched or exactly the same type is caught
				break;
			}
			var adjusted_ptr_addr = info.ptr + 16;
			if (___cxa_can_catch(caughtType, thrownType, adjusted_ptr_addr)) {
				setTempRet0(caughtType);
				return thrown;
			}
		}
		setTempRet0(thrownType);
		return thrown;
	};
	var ___cxa_find_matching_catch_3 = (arg0) => findMatchingCatch([arg0]);



	var ___cxa_throw = (ptr, type, destructor) => {
		var info = new ExceptionInfo(ptr);
		// Initialize ExceptionInfo content after it was allocated in __cxa_allocate_exception.
		info.init(type, destructor);
		exceptionLast = ptr;
		uncaughtExceptionCount++;
		throw exceptionLast;
	};

	var __abort_js = () =>
		abort('');

	var runtimeKeepaliveCounter = 0;
	var __emscripten_runtime_keepalive_clear = () => {
		noExitRuntime = false;
		runtimeKeepaliveCounter = 0;
	};

	var timers = {
	};

	var handleException = (e) => {
		// Certain exception types we do not treat as errors since they are used for
		// internal control flow.
		// 1. ExitStatus, which is thrown by exit()
		// 2. "unwind", which is thrown by emscripten_unwind_to_js_event_loop() and others
		//    that wish to return to JS event loop.
		if (e instanceof ExitStatus || e == 'unwind') {
			return EXITSTATUS;
		}
		quit_(1, e);
	};


	var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;
	var _proc_exit = (code) => {
		EXITSTATUS = code;
		if (!keepRuntimeAlive()) {
			Module['onExit']?.(code);
			ABORT = true;
		}
		quit_(code, new ExitStatus(code));
	};
	/** @suppress {duplicate } */
	/** @param {boolean|number=} implicit */
	var exitJS = (status, implicit) => {
		EXITSTATUS = status;

		_proc_exit(status);
	};
	var _exit = exitJS;


	var maybeExit = () => {
		if (!keepRuntimeAlive()) {
			try {
				_exit(EXITSTATUS);
			} catch (e) {
				handleException(e);
			}
		}
	};
	var callUserCallback = (func) => {
		if (ABORT) {
			return;
		}
		try {
			func();
			maybeExit();
		} catch (e) {
			handleException(e);
		}
	};


	var _emscripten_get_now = () => performance.now();
	var __setitimer_js = (which, timeout_ms) => {
		// First, clear any existing timer.
		if (timers[which]) {
			clearTimeout(timers[which].id);
			delete timers[which];
		}

		// A timeout of zero simply cancels the current timeout so we have nothing
		// more to do.
		if (!timeout_ms) return 0;

		var id = setTimeout(() => {
			delete timers[which];
			callUserCallback(() => __emscripten_timeout(which, _emscripten_get_now()));
		}, timeout_ms);
		timers[which] = { id, timeout_ms };
		return 0;
	};

	var getHeapMax = () =>
		// Stay one Wasm page short of 4GB: while e.g. Chrome is able to allocate
		// full 4GB Wasm memories, the size will wrap back to 0 bytes in Wasm side
		// for any code that deals with heap sizes, which would require special
		// casing all heap size related code to treat 0 specially.
		2147483648;

	var alignMemory = (size, alignment) => {
		return Math.ceil(size / alignment) * alignment;
	};

	var growMemory = (size) => {
		var oldHeapSize = wasmMemory.buffer.byteLength;
		var pages = ((size - oldHeapSize + 65535) / 65536) | 0;
		try {
			// round size grow request up to wasm page size (fixed 64KB per spec)
			wasmMemory.grow(pages); // .grow() takes a delta compared to the previous size
			updateMemoryViews();
			return 1 /*success*/;
		} catch (e) {
		}
		// implicit 0 return to save code size (caller will cast "undefined" into 0
		// anyhow)
	};
	var _emscripten_resize_heap = (requestedSize) => {
		var oldSize = HEAPU8.length;
		// With CAN_ADDRESS_2GB or MEMORY64, pointers are already unsigned.
		requestedSize >>>= 0;
		// With multithreaded builds, races can happen (another thread might increase the size
		// in between), so return a failure, and let the caller retry.

		// Memory resize rules:
		// 1.  Always increase heap size to at least the requested size, rounded up
		//     to next page multiple.
		// 2a. If MEMORY_GROWTH_LINEAR_STEP == -1, excessively resize the heap
		//     geometrically: increase the heap size according to
		//     MEMORY_GROWTH_GEOMETRIC_STEP factor (default +20%), At most
		//     overreserve by MEMORY_GROWTH_GEOMETRIC_CAP bytes (default 96MB).
		// 2b. If MEMORY_GROWTH_LINEAR_STEP != -1, excessively resize the heap
		//     linearly: increase the heap size by at least
		//     MEMORY_GROWTH_LINEAR_STEP bytes.
		// 3.  Max size for the heap is capped at 2048MB-WASM_PAGE_SIZE, or by
		//     MAXIMUM_MEMORY, or by ASAN limit, depending on which is smallest
		// 4.  If we were unable to allocate as much memory, it may be due to
		//     over-eager decision to excessively reserve due to (3) above.
		//     Hence if an allocation fails, cut down on the amount of excess
		//     growth, in an attempt to succeed to perform a smaller allocation.

		// A limit is set for how much we can grow. We should not exceed that
		// (the wasm binary specifies it, so if we tried, we'd fail anyhow).
		var maxHeapSize = getHeapMax();
		if (requestedSize > maxHeapSize) {
			return false;
		}

		// Loop through potential heap size increases. If we attempt a too eager
		// reservation that fails, cut down on the attempted size and reserve a
		// smaller bump instead. (max 3 times, chosen somewhat arbitrarily)
		for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
			var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown); // ensure geometric growth
			// but limit overreserving (default to capping at +96MB overgrowth at most)
			overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);

			var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));

			var replacement = growMemory(newSize);
			if (replacement) {

				return true;
			}
		}
		return false;
	};


	/** @type {WebAssembly.Table} */
	var wasmTable;
	/** @suppress{checkTypes} */
	var getWasmTableEntry = (funcPtr) => {
		// In -Os and -Oz builds, do not implement a JS side wasm table mirror for small
		// code size, but directly access wasmTable, which is a bit slower as uncached.
		return wasmTable.get(funcPtr);
	};



	// Precreate a reverse lookup table from chars
	// "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/" back to
	// bytes to make decoding fast.
	for (var base64ReverseLookup = new Uint8Array(123/*'z'+1*/), i = 25; i >= 0; --i) {
		base64ReverseLookup[48 + i] = 52 + i; // '0-9'
		base64ReverseLookup[65 + i] = i; // 'A-Z'
		base64ReverseLookup[97 + i] = 26 + i; // 'a-z'
	}
	base64ReverseLookup[43] = 62; // '+'
	base64ReverseLookup[47] = 63; // '/'
	;
	// End JS library code

	// include: postlibrary.js
	// This file is included after the automatically-generated JS library code
	// but before the wasm module is created.

	{

		// Begin ATMODULES hooks
		if (Module['noExitRuntime']) noExitRuntime = Module['noExitRuntime'];
		if (Module['print']) out = Module['print'];
		if (Module['printErr']) err = Module['printErr'];
		if (Module['wasmBinary']) wasmBinary = Module['wasmBinary'];
		// End ATMODULES hooks

		if (Module['arguments']) arguments_ = Module['arguments'];
		if (Module['thisProgram']) thisProgram = Module['thisProgram'];

	}

	// Begin runtime exports
	Module['setValue'] = setValue;
	Module['getValue'] = getValue;
	// End runtime exports
	// Begin JS library exports
	// End JS library exports

	// end include: postlibrary.js


	// Imports from the Wasm binary.
	var _luau_compile,
		_strlen,
		_malloc,
		_luau_set_compile_constant_nil,
		_luau_set_compile_constant_boolean,
		_luau_set_compile_constant_number,
		_luau_set_compile_constant_vector,
		_luau_set_compile_constant_string,
		__emscripten_timeout,
		_free,
		_setThrew,
		__emscripten_tempret_set,
		__emscripten_stack_restore,
		__emscripten_stack_alloc,
		_emscripten_stack_get_current,
		___cxa_free_exception,
		___cxa_increment_exception_refcount,
		___cxa_decrement_exception_refcount,
		___cxa_can_catch,
		___cxa_get_exception_ptr;


	function assignWasmExports(wasmExports) {
		Module['_luau_compile'] = _luau_compile = wasmExports['luau_compile'];
		Module['_strlen'] = _strlen = wasmExports['strlen'];
		Module['_malloc'] = _malloc = wasmExports['malloc'];
		Module['_luau_set_compile_constant_nil'] = _luau_set_compile_constant_nil = wasmExports['luau_set_compile_constant_nil'];
		Module['_luau_set_compile_constant_boolean'] = _luau_set_compile_constant_boolean = wasmExports['luau_set_compile_constant_boolean'];
		Module['_luau_set_compile_constant_number'] = _luau_set_compile_constant_number = wasmExports['luau_set_compile_constant_number'];
		Module['_luau_set_compile_constant_vector'] = _luau_set_compile_constant_vector = wasmExports['luau_set_compile_constant_vector'];
		Module['_luau_set_compile_constant_string'] = _luau_set_compile_constant_string = wasmExports['luau_set_compile_constant_string'];
		__emscripten_timeout = wasmExports['_emscripten_timeout'];
		Module['_free'] = _free = wasmExports['free'];
		_setThrew = wasmExports['setThrew'];
		__emscripten_tempret_set = wasmExports['_emscripten_tempret_set'];
		__emscripten_stack_restore = wasmExports['_emscripten_stack_restore'];
		__emscripten_stack_alloc = wasmExports['_emscripten_stack_alloc'];
		_emscripten_stack_get_current = wasmExports['emscripten_stack_get_current'];
		___cxa_free_exception = wasmExports['__cxa_free_exception'];
		___cxa_increment_exception_refcount = wasmExports['__cxa_increment_exception_refcount'];
		___cxa_decrement_exception_refcount = wasmExports['__cxa_decrement_exception_refcount'];
		___cxa_can_catch = wasmExports['__cxa_can_catch'];
		___cxa_get_exception_ptr = wasmExports['__cxa_get_exception_ptr'];
	}
	var wasmImports = {
		/** @export */
		__cxa_begin_catch: ___cxa_begin_catch,
		/** @export */
		__cxa_end_catch: ___cxa_end_catch,
		/** @export */
		__cxa_find_matching_catch_3: ___cxa_find_matching_catch_3,
		/** @export */
		__cxa_throw: ___cxa_throw,
		/** @export */
		_abort_js: __abort_js,
		/** @export */
		_emscripten_runtime_keepalive_clear: __emscripten_runtime_keepalive_clear,
		/** @export */
		_setitimer_js: __setitimer_js,
		/** @export */
		emscripten_resize_heap: _emscripten_resize_heap,
		/** @export */
		invoke_ii,
		/** @export */
		invoke_v,
		/** @export */
		invoke_vii,
		/** @export */
		proc_exit: _proc_exit
	};
	var wasmExports = await createWasm();

	function invoke_vii(index, a1, a2) {
		var sp = stackSave();
		try {
			getWasmTableEntry(index)(a1, a2);
		} catch (e) {
			stackRestore(sp);
			if (e !== e + 0) throw e;
			_setThrew(1, 0);
		}
	}

	function invoke_ii(index, a1) {
		var sp = stackSave();
		try {
			return getWasmTableEntry(index)(a1);
		} catch (e) {
			stackRestore(sp);
			if (e !== e + 0) throw e;
			_setThrew(1, 0);
		}
	}

	function invoke_v(index) {
		var sp = stackSave();
		try {
			getWasmTableEntry(index)();
		} catch (e) {
			stackRestore(sp);
			if (e !== e + 0) throw e;
			_setThrew(1, 0);
		}
	}


	// include: postamble.js
	// === Auto-generated postamble setup entry stuff ===

	function run() {

		if (runDependencies > 0) {
			dependenciesFulfilled = run;
			return;
		}

		preRun();

		// a preRun added a dependency, run will be called later
		if (runDependencies > 0) {
			dependenciesFulfilled = run;
			return;
		}

		function doRun() {
			// run may have just been called through dependencies being fulfilled just in this very frame,
			// or while the async setStatus time below was happening
			Module['calledRun'] = true;

			if (ABORT) return;

			initRuntime();

			readyPromiseResolve?.(Module);
			Module['onRuntimeInitialized']?.();

			postRun();
		}

		if (Module['setStatus']) {
			Module['setStatus']('Running...');
			setTimeout(() => {
				setTimeout(() => Module['setStatus'](''), 1);
				doRun();
			}, 1);
		} else {
			doRun();
		}
	}

	function preInit() {
		if (Module['preInit']) {
			if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
			while (Module['preInit'].length > 0) {
				Module['preInit'].shift()();
			}
		}
	}

	preInit();
	run();

	// end include: postamble.js

	// include: postamble_modularize.js
	// In MODULARIZE mode we wrap the generated code in a factory function
	// and return either the Module itself, or a promise of the module.
	//
	// We assign to the `moduleRtn` global here and configure closure to see
	// this as and extern so it won't get minified.

	if (runtimeInitialized) {
		moduleRtn = Module;
	} else {
		// Set up the promise that indicates the Module is initialized
		moduleRtn = new Promise((resolve, reject) => {
			readyPromiseResolve = resolve;
			readyPromiseReject = reject;
		});
	}

	// end include: postamble_modularize.js



	return moduleRtn;
}

// Export using a UMD style export, or ES6 exports if selected
import { write_cstring, write_cstrings, free_array } from "../utils.js";

const _ENCODER = new TextEncoder();

const DEFAULT_COMPILE_OPTIONS = {
	OptimizationLevel: 1,
	DebugLevel: 1,
	TypeInfoLevel: 1,
	CoverageLevel: 1,

	VectorLibName: "vector",
	VectorLibConstructor: "create",
	VectorType: "vector",
};

const luau_compile = await LuauCompiler().then(function (_Module) {
	const Module = _Module;

	const _memfree = Module["_free"];
	const _malloc = Module["_malloc"];

	const _luau_compile = Module["_luau_compile"];

	function create_luau_options(options) {
		// lua_compileOptions struct (from: luau/Compiler/include/luacode.h)
		const option_ptr = _malloc(52);
		const vectorlibname_ptr = write_cstring(
			Module,
			options.VectorLibName || DEFAULT_COMPILE_OPTIONS.VectorLibName
		);
		const vectorlibcons_ptr = write_cstring(
			Module,
			options.VectorLibConstructor || DEFAULT_COMPILE_OPTIONS.VectorLibConstructor
		);
		const vectortype_ptr = write_cstring(
			Module,
			options.VectorType || DEFAULT_COMPILE_OPTIONS.VectorType
		);

		const mutable_globals_ptrarr = write_cstrings(Module, options.MutableGlobals || []);
		const disabledbuiltins_ptrarr = write_cstrings(Module, options.DisabledBuiltins || []);

		Module.HEAP32[(option_ptr >> 2) + 0] = options.OptimizationLevel;
		Module.HEAP32[(option_ptr >> 2) + 1] = options.DebugLevel;
		Module.HEAP32[(option_ptr >> 2) + 2] = options.TypeInfoLevel;
		Module.HEAP32[(option_ptr >> 2) + 3] = options.CoverageLevel;
		Module.HEAP32[(option_ptr >> 2) + 4] = vectorlibname_ptr;
		Module.HEAP32[(option_ptr >> 2) + 5] = vectorlibcons_ptr;
		Module.HEAP32[(option_ptr >> 2) + 6] = vectortype_ptr;
		Module.HEAP32[(option_ptr >> 2) + 7] = mutable_globals_ptrarr;
		Module.HEAP32[(option_ptr >> 2) + 8] = 0;
		Module.HEAP32[(option_ptr >> 2) + 9] = 0;
		Module.HEAP32[(option_ptr >> 2) + 10] = 0;
		Module.HEAP32[(option_ptr >> 2) + 11] = 0;
		Module.HEAP32[(option_ptr >> 2) + 12] = disabledbuiltins_ptrarr;

		function _free_func() {
			_memfree(option_ptr);
			_memfree(vectorlibname_ptr);
			_memfree(vectorlibcons_ptr);
			_memfree(vectortype_ptr);
			free_array(Module, mutable_globals_ptrarr);
			free_array(Module, disabledbuiltins_ptrarr);
		}

		return [option_ptr, _free_func];
	}

	function luau_compile(source, options = {}) {
		const [option_ptr, option_free] = create_luau_options(options);

		const source_length = _ENCODER.encode(source).length;
		const src_ptr = write_cstring(Module, source);
		const bc_size_ptr = _malloc(8);

		const bytecode_ptr = _luau_compile(src_ptr, source_length, option_ptr, bc_size_ptr);
		const bytecode_size = Module.HEAP32[bc_size_ptr >> 2];
		const bytecode = Module.HEAPU8.slice(bytecode_ptr, bytecode_ptr + bytecode_size);

		option_free();
		_memfree(src_ptr);
		_memfree(bc_size_ptr);
		_memfree(bytecode_ptr);

		return bytecode;
	}

	return luau_compile;
});

export default luau_compile;