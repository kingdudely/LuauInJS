import { write_cstring } from "../utils.js";
// This code implements the `-sMODULARIZE` settings by taking the generated
// JS program code (INNER_JS_CODE) and wrapping it in a factory function.

// When targetting node and ES6 we use `await import ..` in the generated code
// so the outer function needs to be marked as async.
async function LuauVM(moduleArg = {}) {
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

	var wasmBinaryFile = new Uint8Array(await readAsync(locateFile("./module.wasm")))

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

	var __abort_js = () =>
		abort('');

	var runtimeKeepaliveCounter = 0;
	var __emscripten_runtime_keepalive_clear = () => {
		noExitRuntime = false;
		runtimeKeepaliveCounter = 0;
	};

	var __emscripten_throw_longjmp = () => {
		throw Infinity;
	};

	var INT53_MAX = 9007199254740992;

	var INT53_MIN = -9007199254740992;
	var bigintToI53Checked = (num) => (num < INT53_MIN || num > INT53_MAX) ? NaN : Number(num);
	function __gmtime_js(time, tmPtr) {
		time = bigintToI53Checked(time);


		var date = new Date(time * 1000);
		HEAP32[((tmPtr) >> 2)] = date.getUTCSeconds();
		HEAP32[(((tmPtr) + (4)) >> 2)] = date.getUTCMinutes();
		HEAP32[(((tmPtr) + (8)) >> 2)] = date.getUTCHours();
		HEAP32[(((tmPtr) + (12)) >> 2)] = date.getUTCDate();
		HEAP32[(((tmPtr) + (16)) >> 2)] = date.getUTCMonth();
		HEAP32[(((tmPtr) + (20)) >> 2)] = date.getUTCFullYear() - 1900;
		HEAP32[(((tmPtr) + (24)) >> 2)] = date.getUTCDay();
		var start = Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
		var yday = ((date.getTime() - start) / (1000 * 60 * 60 * 24)) | 0;
		HEAP32[(((tmPtr) + (28)) >> 2)] = yday;
		;
	}

	var isLeapYear = (year) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);

	var MONTH_DAYS_LEAP_CUMULATIVE = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

	var MONTH_DAYS_REGULAR_CUMULATIVE = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
	var ydayFromDate = (date) => {
		var leap = isLeapYear(date.getFullYear());
		var monthDaysCumulative = (leap ? MONTH_DAYS_LEAP_CUMULATIVE : MONTH_DAYS_REGULAR_CUMULATIVE);
		var yday = monthDaysCumulative[date.getMonth()] + date.getDate() - 1; // -1 since it's days since Jan 1

		return yday;
	};

	function __localtime_js(time, tmPtr) {
		time = bigintToI53Checked(time);


		var date = new Date(time * 1000);
		HEAP32[((tmPtr) >> 2)] = date.getSeconds();
		HEAP32[(((tmPtr) + (4)) >> 2)] = date.getMinutes();
		HEAP32[(((tmPtr) + (8)) >> 2)] = date.getHours();
		HEAP32[(((tmPtr) + (12)) >> 2)] = date.getDate();
		HEAP32[(((tmPtr) + (16)) >> 2)] = date.getMonth();
		HEAP32[(((tmPtr) + (20)) >> 2)] = date.getFullYear() - 1900;
		HEAP32[(((tmPtr) + (24)) >> 2)] = date.getDay();

		var yday = ydayFromDate(date) | 0;
		HEAP32[(((tmPtr) + (28)) >> 2)] = yday;
		HEAP32[(((tmPtr) + (36)) >> 2)] = -(date.getTimezoneOffset() * 60);

		// Attention: DST is in December in South, and some regions don't have DST at all.
		var start = new Date(date.getFullYear(), 0, 1);
		var summerOffset = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
		var winterOffset = start.getTimezoneOffset();
		var dst = (summerOffset != winterOffset && date.getTimezoneOffset() == Math.min(winterOffset, summerOffset)) | 0;
		HEAP32[(((tmPtr) + (32)) >> 2)] = dst;
		;
	}

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

	var stringToUTF8Array = (str, heap, outIdx, maxBytesToWrite) => {
		// Parameter maxBytesToWrite is not optional. Negative values, 0, null,
		// undefined and false each don't write out any bytes.
		if (!(maxBytesToWrite > 0))
			return 0;

		var startIdx = outIdx;
		var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
		for (var i = 0; i < str.length; ++i) {
			// For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description
			// and https://www.ietf.org/rfc/rfc2279.txt
			// and https://tools.ietf.org/html/rfc3629
			var u = str.codePointAt(i);
			if (u <= 0x7F) {
				if (outIdx >= endIdx) break;
				heap[outIdx++] = u;
			} else if (u <= 0x7FF) {
				if (outIdx + 1 >= endIdx) break;
				heap[outIdx++] = 0xC0 | (u >> 6);
				heap[outIdx++] = 0x80 | (u & 63);
			} else if (u <= 0xFFFF) {
				if (outIdx + 2 >= endIdx) break;
				heap[outIdx++] = 0xE0 | (u >> 12);
				heap[outIdx++] = 0x80 | ((u >> 6) & 63);
				heap[outIdx++] = 0x80 | (u & 63);
			} else {
				if (outIdx + 3 >= endIdx) break;
				heap[outIdx++] = 0xF0 | (u >> 18);
				heap[outIdx++] = 0x80 | ((u >> 12) & 63);
				heap[outIdx++] = 0x80 | ((u >> 6) & 63);
				heap[outIdx++] = 0x80 | (u & 63);
				// Gotcha: if codePoint is over 0xFFFF, it is represented as a surrogate pair in UTF-16.
				// We need to manually skip over the second code unit for correct iteration.
				i++;
			}
		}
		// Null-terminate the pointer to the buffer.
		heap[outIdx] = 0;
		return outIdx - startIdx;
	};
	var stringToUTF8 = (str, outPtr, maxBytesToWrite) => {
		return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
	};
	var __tzset_js = (timezone, daylight, std_name, dst_name) => {
		// TODO: Use (malleable) environment variables instead of system settings.
		var currentYear = new Date().getFullYear();
		var winter = new Date(currentYear, 0, 1);
		var summer = new Date(currentYear, 6, 1);
		var winterOffset = winter.getTimezoneOffset();
		var summerOffset = summer.getTimezoneOffset();

		// Local standard timezone offset. Local standard time is not adjusted for
		// daylight savings.  This code uses the fact that getTimezoneOffset returns
		// a greater value during Standard Time versus Daylight Saving Time (DST).
		// Thus it determines the expected output during Standard Time, and it
		// compares whether the output of the given date the same (Standard) or less
		// (DST).
		var stdTimezoneOffset = Math.max(winterOffset, summerOffset);

		// timezone is specified as seconds west of UTC ("The external variable
		// `timezone` shall be set to the difference, in seconds, between
		// Coordinated Universal Time (UTC) and local standard time."), the same
		// as returned by stdTimezoneOffset.
		// See http://pubs.opengroup.org/onlinepubs/009695399/functions/tzset.html
		HEAPU32[((timezone) >> 2)] = stdTimezoneOffset * 60;

		HEAP32[((daylight) >> 2)] = Number(winterOffset != summerOffset);

		var extractZone = (timezoneOffset) => {
			// Why inverse sign?
			// Read here https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getTimezoneOffset
			var sign = timezoneOffset >= 0 ? "-" : "+";

			var absOffset = Math.abs(timezoneOffset)
			var hours = String(Math.floor(absOffset / 60)).padStart(2, "0");
			var minutes = String(absOffset % 60).padStart(2, "0");

			return `UTC${sign}${hours}${minutes}`;
		}

		var winterName = extractZone(winterOffset);
		var summerName = extractZone(summerOffset);
		if (summerOffset < winterOffset) {
			// Northern hemisphere
			stringToUTF8(winterName, std_name, 17);
			stringToUTF8(summerName, dst_name, 17);
		} else {
			stringToUTF8(winterName, dst_name, 17);
			stringToUTF8(summerName, std_name, 17);
		}
	};


	var _emscripten_date_now = () => Date.now();

	var nowIsMonotonic = 1;

	var checkWasiClock = (clock_id) => clock_id >= 0 && clock_id <= 3;

	function _clock_time_get(clk_id, ignored_precision, ptime) {
		ignored_precision = bigintToI53Checked(ignored_precision);


		if (!checkWasiClock(clk_id)) {
			return 28;
		}
		var now;
		// all wasi clocks but realtime are monotonic
		if (clk_id === 0) {
			now = _emscripten_date_now();
		} else if (nowIsMonotonic) {
			now = _emscripten_get_now();
		} else {
			return 52;
		}
		// "now" is in ms, and wasi times are in ns.
		var nsec = Math.round(now * 1000 * 1000);
		HEAP64[((ptime) >> 3)] = BigInt(nsec);
		return 0;
		;
	}


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

	var printCharBuffers = [null, [], []];

	var UTF8Decoder = new TextDecoder();

	var findStringEnd = (heapOrArray, idx, maxBytesToRead, ignoreNul) => {
		var maxIdx = idx + maxBytesToRead;
		if (ignoreNul) return maxIdx;
		// TextDecoder needs to know the byte length in advance, it doesn't stop on
		// null terminator by itself.
		// As a tiny code save trick, compare idx against maxIdx using a negation,
		// so that maxBytesToRead=undefined/NaN means Infinity.
		while (heapOrArray[idx] && !(idx >= maxIdx)) ++idx;
		return idx;
	};

	/**
	 * Given a pointer 'idx' to a null-terminated UTF8-encoded string in the given
	 * array that contains uint8 values, returns a copy of that string as a
	 * Javascript String object.
	 * heapOrArray is either a regular array, or a JavaScript typed array view.
	 * @param {number=} idx
	 * @param {number=} maxBytesToRead
	 * @param {boolean=} ignoreNul - If true, the function will not stop on a NUL character.
	 * @return {string}
	 */
	var UTF8ArrayToString = (heapOrArray, idx = 0, maxBytesToRead, ignoreNul) => {

		var endPtr = findStringEnd(heapOrArray, idx, maxBytesToRead, ignoreNul);

		return UTF8Decoder.decode(heapOrArray.buffer ? heapOrArray.subarray(idx, endPtr) : new Uint8Array(heapOrArray.slice(idx, endPtr)));
	};
	var printChar = (stream, curr) => {
		var buffer = printCharBuffers[stream];
		if (curr === 0 || curr === 10) {
			(stream === 1 ? out : err)(UTF8ArrayToString(buffer));
			buffer.length = 0;
		} else {
			buffer.push(curr);
		}
	};

	var flush_NO_FILESYSTEM = () => {
		// flush anything remaining in the buffers during shutdown
		if (printCharBuffers[1].length) printChar(1, 10);
		if (printCharBuffers[2].length) printChar(2, 10);
	};




	/**
	 * Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the
	 * emscripten HEAP, returns a copy of that string as a Javascript String object.
	 *
	 * @param {number} ptr
	 * @param {number=} maxBytesToRead - An optional length that specifies the
	 *   maximum number of bytes to read. You can omit this parameter to scan the
	 *   string until the first 0 byte. If maxBytesToRead is passed, and the string
	 *   at [ptr, ptr+maxBytesToReadr[ contains a null byte in the middle, then the
	 *   string will cut short at that byte index.
	 * @param {boolean=} ignoreNul - If true, the function will not stop on a NUL character.
	 * @return {string}
	 */
	var UTF8ToString = (ptr, maxBytesToRead, ignoreNul) => {
		if (!ptr) return '';
		var end = findStringEnd(HEAPU8, ptr, maxBytesToRead, ignoreNul);
		return UTF8Decoder.decode(HEAPU8.subarray(ptr, end));
	};
	var SYSCALLS = {
		varargs: undefined,
		getStr(ptr) {
			var ret = UTF8ToString(ptr);
			return ret;
		},
	};
	var _fd_write = (fd, iov, iovcnt, pnum) => {
		// hack to support printf in SYSCALLS_REQUIRE_FILESYSTEM=0
		var num = 0;
		for (var i = 0; i < iovcnt; i++) {
			var ptr = HEAPU32[((iov) >> 2)];
			var len = HEAPU32[(((iov) + (4)) >> 2)];
			iov += 8;
			for (var j = 0; j < len; j++) {
				printChar(fd, HEAPU8[ptr + j]);
			}
			num += len;
		}
		HEAPU32[((pnum) >> 2)] = num;
		return 0;
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
	var _luaL_newstate,
		_lua_close,
		_lua_checkstack,
		_lua_rawcheckstack,
		_lua_xmove,
		_lua_xpush,
		_lua_newthread,
		_lua_mainthread,
		_lua_absindex,
		_lua_gettop,
		_lua_settop,
		_lua_remove,
		_lua_insert,
		_lua_replace,
		_lua_pushvalue,
		_lua_type,
		_lua_typename,
		_lua_iscfunction,
		_lua_isLfunction,
		_lua_isnumber,
		_lua_isstring,
		_lua_isuserdata,
		_lua_rawequal,
		_lua_equal,
		_lua_lessthan,
		_lua_tonumberx,
		_lua_tointegerx,
		_lua_tounsignedx,
		_lua_toboolean,
		_lua_tolstring,
		_lua_tostringatom,
		_lua_tolstringatom,
		_lua_namecallatom,
		_lua_tovector,
		_lua_objlen,
		_lua_tocfunction,
		_lua_tolightuserdata,
		_lua_tolightuserdatatagged,
		_lua_touserdata,
		_lua_touserdatatagged,
		_lua_userdatatag,
		_lua_lightuserdatatag,
		_lua_tothread,
		_lua_tobuffer,
		_lua_topointer,
		_lua_pushnil,
		_lua_pushnumber,
		_lua_pushinteger,
		_lua_pushunsigned,
		_lua_pushvector,
		_lua_pushlstring,
		_lua_pushstring,
		_lua_pushvfstring,
		_lua_pushfstringL,
		_lua_pushcclosurek,
		_lua_pushboolean,
		_lua_pushlightuserdatatagged,
		_lua_pushthread,
		_lua_gettable,
		_lua_getfield,
		_lua_rawgetfield,
		_lua_rawget,
		_lua_rawgeti,
		_lua_createtable,
		_lua_setreadonly,
		_lua_getreadonly,
		_lua_setsafeenv,
		_lua_getmetatable,
		_lua_getfenv,
		_lua_settable,
		_lua_setfield,
		_lua_rawsetfield,
		_lua_rawset,
		_lua_rawseti,
		_lua_setmetatable,
		_lua_setfenv,
		_lua_call,
		_lua_pcall,
		_lua_status,
		_lua_costatus,
		_lua_getthreaddata,
		_lua_setthreaddata,
		_lua_gc,
		_lua_error,
		_lua_next,
		_lua_rawiter,
		_lua_concat,
		_lua_newuserdatatagged,
		_lua_newuserdatataggedwithmetatable,
		_lua_newuserdatadtor,
		_lua_newbuffer,
		_lua_getupvalue,
		_lua_setupvalue,
		_lua_encodepointer,
		_lua_ref,
		_lua_unref,
		_lua_setuserdatatag,
		_lua_setuserdatadtor,
		_lua_getuserdatadtor,
		_lua_setuserdatametatable,
		_lua_getuserdatametatable,
		_lua_setlightuserdataname,
		_lua_getlightuserdataname,
		_lua_clonefunction,
		_lua_cleartable,
		_lua_clonetable,
		_lua_callbacks,
		_lua_setmemcat,
		_lua_totalbytes,
		_lua_getallocf,
		_luaL_argerrorL,
		_luaL_errorL,
		_luaL_where,
		_luaL_typeerrorL,
		_luaL_checkoption,
		_luaL_optlstring,
		_luaL_checklstring,
		_luaL_newmetatable,
		_luaL_checkudata,
		_luaL_checkbuffer,
		_luaL_checkstack,
		_luaL_checktype,
		_luaL_checkany,
		_luaL_checknumber,
		_luaL_optnumber,
		_luaL_checkboolean,
		_luaL_optboolean,
		_luaL_checkinteger,
		_luaL_optinteger,
		_luaL_checkunsigned,
		_luaL_optunsigned,
		_luaL_checkvector,
		_luaL_optvector,
		_luaL_getmetafield,
		_luaL_callmeta,
		_luaL_register,
		_luaL_findtable,
		_luaL_typename,
		_luaL_callyieldable,
		_luaL_buffinit,
		_luaL_buffinitsize,
		_luaL_prepbuffsize,
		_luaL_addlstring,
		_luaL_addvalue,
		_luaL_addvalueany,
		_luaL_tolstring,
		_luaL_pushresult,
		_luaL_pushresultsize,
		_luaopen_base,
		_luaopen_bit32,
		_luaopen_buffer,
		_luaopen_coroutine,
		_luaopen_debug,
		_lua_getargument,
		_lua_getlocal,
		_lua_setlocal,
		_lua_stackdepth,
		_lua_getinfo,
		_lua_singlestep,
		_lua_breakpoint,
		_lua_getcoverage,
		_lua_debugtrace,
		_lua_resume,
		_lua_resumeerror,
		_lua_yield,
		_lua_break,
		_lua_isyieldable,
		_luaL_openlibs,
		_luaL_sandbox,
		_luaL_sandboxthread,
		_lua_clock,
		_strlen,
		_lua_newstate,
		_free,
		_lua_resetthread,
		_luaopen_table,
		_luaopen_os,
		_luaopen_string,
		_luaopen_math,
		_luaopen_utf8,
		_luaopen_vector,
		_lua_isthreadreset,
		_luau_load,
		__emscripten_timeout,
		_malloc,
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
		Module['_luaL_newstate'] = _luaL_newstate = wasmExports['luaL_newstate'];
		Module['_lua_close'] = _lua_close = wasmExports['lua_close'];
		Module['_lua_checkstack'] = _lua_checkstack = wasmExports['lua_checkstack'];
		Module['_lua_rawcheckstack'] = _lua_rawcheckstack = wasmExports['lua_rawcheckstack'];
		Module['_lua_xmove'] = _lua_xmove = wasmExports['lua_xmove'];
		Module['_lua_xpush'] = _lua_xpush = wasmExports['lua_xpush'];
		Module['_lua_newthread'] = _lua_newthread = wasmExports['lua_newthread'];
		Module['_lua_mainthread'] = _lua_mainthread = wasmExports['lua_mainthread'];
		Module['_lua_absindex'] = _lua_absindex = wasmExports['lua_absindex'];
		Module['_lua_gettop'] = _lua_gettop = wasmExports['lua_gettop'];
		Module['_lua_settop'] = _lua_settop = wasmExports['lua_settop'];
		Module['_lua_remove'] = _lua_remove = wasmExports['lua_remove'];
		Module['_lua_insert'] = _lua_insert = wasmExports['lua_insert'];
		Module['_lua_replace'] = _lua_replace = wasmExports['lua_replace'];
		Module['_lua_pushvalue'] = _lua_pushvalue = wasmExports['lua_pushvalue'];
		Module['_lua_type'] = _lua_type = wasmExports['lua_type'];
		Module['_lua_typename'] = _lua_typename = wasmExports['lua_typename'];
		Module['_lua_iscfunction'] = _lua_iscfunction = wasmExports['lua_iscfunction'];
		Module['_lua_isLfunction'] = _lua_isLfunction = wasmExports['lua_isLfunction'];
		Module['_lua_isnumber'] = _lua_isnumber = wasmExports['lua_isnumber'];
		Module['_lua_isstring'] = _lua_isstring = wasmExports['lua_isstring'];
		Module['_lua_isuserdata'] = _lua_isuserdata = wasmExports['lua_isuserdata'];
		Module['_lua_rawequal'] = _lua_rawequal = wasmExports['lua_rawequal'];
		Module['_lua_equal'] = _lua_equal = wasmExports['lua_equal'];
		Module['_lua_lessthan'] = _lua_lessthan = wasmExports['lua_lessthan'];
		Module['_lua_tonumberx'] = _lua_tonumberx = wasmExports['lua_tonumberx'];
		Module['_lua_tointegerx'] = _lua_tointegerx = wasmExports['lua_tointegerx'];
		Module['_lua_tounsignedx'] = _lua_tounsignedx = wasmExports['lua_tounsignedx'];
		Module['_lua_toboolean'] = _lua_toboolean = wasmExports['lua_toboolean'];
		Module['_lua_tolstring'] = _lua_tolstring = wasmExports['lua_tolstring'];
		Module['_lua_tostringatom'] = _lua_tostringatom = wasmExports['lua_tostringatom'];
		Module['_lua_tolstringatom'] = _lua_tolstringatom = wasmExports['lua_tolstringatom'];
		Module['_lua_namecallatom'] = _lua_namecallatom = wasmExports['lua_namecallatom'];
		Module['_lua_tovector'] = _lua_tovector = wasmExports['lua_tovector'];
		Module['_lua_objlen'] = _lua_objlen = wasmExports['lua_objlen'];
		Module['_lua_tocfunction'] = _lua_tocfunction = wasmExports['lua_tocfunction'];
		Module['_lua_tolightuserdata'] = _lua_tolightuserdata = wasmExports['lua_tolightuserdata'];
		Module['_lua_tolightuserdatatagged'] = _lua_tolightuserdatatagged = wasmExports['lua_tolightuserdatatagged'];
		Module['_lua_touserdata'] = _lua_touserdata = wasmExports['lua_touserdata'];
		Module['_lua_touserdatatagged'] = _lua_touserdatatagged = wasmExports['lua_touserdatatagged'];
		Module['_lua_userdatatag'] = _lua_userdatatag = wasmExports['lua_userdatatag'];
		Module['_lua_lightuserdatatag'] = _lua_lightuserdatatag = wasmExports['lua_lightuserdatatag'];
		Module['_lua_tothread'] = _lua_tothread = wasmExports['lua_tothread'];
		Module['_lua_tobuffer'] = _lua_tobuffer = wasmExports['lua_tobuffer'];
		Module['_lua_topointer'] = _lua_topointer = wasmExports['lua_topointer'];
		Module['_lua_pushnil'] = _lua_pushnil = wasmExports['lua_pushnil'];
		Module['_lua_pushnumber'] = _lua_pushnumber = wasmExports['lua_pushnumber'];
		Module['_lua_pushinteger'] = _lua_pushinteger = wasmExports['lua_pushinteger'];
		Module['_lua_pushunsigned'] = _lua_pushunsigned = wasmExports['lua_pushunsigned'];
		Module['_lua_pushvector'] = _lua_pushvector = wasmExports['lua_pushvector'];
		Module['_lua_pushlstring'] = _lua_pushlstring = wasmExports['lua_pushlstring'];
		Module['_lua_pushstring'] = _lua_pushstring = wasmExports['lua_pushstring'];
		Module['_lua_pushvfstring'] = _lua_pushvfstring = wasmExports['lua_pushvfstring'];
		Module['_lua_pushfstringL'] = _lua_pushfstringL = wasmExports['lua_pushfstringL'];
		Module['_lua_pushcclosurek'] = _lua_pushcclosurek = wasmExports['lua_pushcclosurek'];
		Module['_lua_pushboolean'] = _lua_pushboolean = wasmExports['lua_pushboolean'];
		Module['_lua_pushlightuserdatatagged'] = _lua_pushlightuserdatatagged = wasmExports['lua_pushlightuserdatatagged'];
		Module['_lua_pushthread'] = _lua_pushthread = wasmExports['lua_pushthread'];
		Module['_lua_gettable'] = _lua_gettable = wasmExports['lua_gettable'];
		Module['_lua_getfield'] = _lua_getfield = wasmExports['lua_getfield'];
		Module['_lua_rawgetfield'] = _lua_rawgetfield = wasmExports['lua_rawgetfield'];
		Module['_lua_rawget'] = _lua_rawget = wasmExports['lua_rawget'];
		Module['_lua_rawgeti'] = _lua_rawgeti = wasmExports['lua_rawgeti'];
		Module['_lua_createtable'] = _lua_createtable = wasmExports['lua_createtable'];
		Module['_lua_setreadonly'] = _lua_setreadonly = wasmExports['lua_setreadonly'];
		Module['_lua_getreadonly'] = _lua_getreadonly = wasmExports['lua_getreadonly'];
		Module['_lua_setsafeenv'] = _lua_setsafeenv = wasmExports['lua_setsafeenv'];
		Module['_lua_getmetatable'] = _lua_getmetatable = wasmExports['lua_getmetatable'];
		Module['_lua_getfenv'] = _lua_getfenv = wasmExports['lua_getfenv'];
		Module['_lua_settable'] = _lua_settable = wasmExports['lua_settable'];
		Module['_lua_setfield'] = _lua_setfield = wasmExports['lua_setfield'];
		Module['_lua_rawsetfield'] = _lua_rawsetfield = wasmExports['lua_rawsetfield'];
		Module['_lua_rawset'] = _lua_rawset = wasmExports['lua_rawset'];
		Module['_lua_rawseti'] = _lua_rawseti = wasmExports['lua_rawseti'];
		Module['_lua_setmetatable'] = _lua_setmetatable = wasmExports['lua_setmetatable'];
		Module['_lua_setfenv'] = _lua_setfenv = wasmExports['lua_setfenv'];
		Module['_lua_call'] = _lua_call = wasmExports['lua_call'];
		Module['_lua_pcall'] = _lua_pcall = wasmExports['lua_pcall'];
		Module['_lua_status'] = _lua_status = wasmExports['lua_status'];
		Module['_lua_costatus'] = _lua_costatus = wasmExports['lua_costatus'];
		Module['_lua_getthreaddata'] = _lua_getthreaddata = wasmExports['lua_getthreaddata'];
		Module['_lua_setthreaddata'] = _lua_setthreaddata = wasmExports['lua_setthreaddata'];
		Module['_lua_gc'] = _lua_gc = wasmExports['lua_gc'];
		Module['_lua_error'] = _lua_error = wasmExports['lua_error'];
		Module['_lua_next'] = _lua_next = wasmExports['lua_next'];
		Module['_lua_rawiter'] = _lua_rawiter = wasmExports['lua_rawiter'];
		Module['_lua_concat'] = _lua_concat = wasmExports['lua_concat'];
		Module['_lua_newuserdatatagged'] = _lua_newuserdatatagged = wasmExports['lua_newuserdatatagged'];
		Module['_lua_newuserdatataggedwithmetatable'] = _lua_newuserdatataggedwithmetatable = wasmExports['lua_newuserdatataggedwithmetatable'];
		Module['_lua_newuserdatadtor'] = _lua_newuserdatadtor = wasmExports['lua_newuserdatadtor'];
		Module['_lua_newbuffer'] = _lua_newbuffer = wasmExports['lua_newbuffer'];
		Module['_lua_getupvalue'] = _lua_getupvalue = wasmExports['lua_getupvalue'];
		Module['_lua_setupvalue'] = _lua_setupvalue = wasmExports['lua_setupvalue'];
		Module['_lua_encodepointer'] = _lua_encodepointer = wasmExports['lua_encodepointer'];
		Module['_lua_ref'] = _lua_ref = wasmExports['lua_ref'];
		Module['_lua_unref'] = _lua_unref = wasmExports['lua_unref'];
		Module['_lua_setuserdatatag'] = _lua_setuserdatatag = wasmExports['lua_setuserdatatag'];
		Module['_lua_setuserdatadtor'] = _lua_setuserdatadtor = wasmExports['lua_setuserdatadtor'];
		Module['_lua_getuserdatadtor'] = _lua_getuserdatadtor = wasmExports['lua_getuserdatadtor'];
		Module['_lua_setuserdatametatable'] = _lua_setuserdatametatable = wasmExports['lua_setuserdatametatable'];
		Module['_lua_getuserdatametatable'] = _lua_getuserdatametatable = wasmExports['lua_getuserdatametatable'];
		Module['_lua_setlightuserdataname'] = _lua_setlightuserdataname = wasmExports['lua_setlightuserdataname'];
		Module['_lua_getlightuserdataname'] = _lua_getlightuserdataname = wasmExports['lua_getlightuserdataname'];
		Module['_lua_clonefunction'] = _lua_clonefunction = wasmExports['lua_clonefunction'];
		Module['_lua_cleartable'] = _lua_cleartable = wasmExports['lua_cleartable'];
		Module['_lua_clonetable'] = _lua_clonetable = wasmExports['lua_clonetable'];
		Module['_lua_callbacks'] = _lua_callbacks = wasmExports['lua_callbacks'];
		Module['_lua_setmemcat'] = _lua_setmemcat = wasmExports['lua_setmemcat'];
		Module['_lua_totalbytes'] = _lua_totalbytes = wasmExports['lua_totalbytes'];
		Module['_lua_getallocf'] = _lua_getallocf = wasmExports['lua_getallocf'];
		Module['_luaL_argerrorL'] = _luaL_argerrorL = wasmExports['luaL_argerrorL'];
		Module['_luaL_errorL'] = _luaL_errorL = wasmExports['luaL_errorL'];
		Module['_luaL_where'] = _luaL_where = wasmExports['luaL_where'];
		Module['_luaL_typeerrorL'] = _luaL_typeerrorL = wasmExports['luaL_typeerrorL'];
		Module['_luaL_checkoption'] = _luaL_checkoption = wasmExports['luaL_checkoption'];
		Module['_luaL_optlstring'] = _luaL_optlstring = wasmExports['luaL_optlstring'];
		Module['_luaL_checklstring'] = _luaL_checklstring = wasmExports['luaL_checklstring'];
		Module['_luaL_newmetatable'] = _luaL_newmetatable = wasmExports['luaL_newmetatable'];
		Module['_luaL_checkudata'] = _luaL_checkudata = wasmExports['luaL_checkudata'];
		Module['_luaL_checkbuffer'] = _luaL_checkbuffer = wasmExports['luaL_checkbuffer'];
		Module['_luaL_checkstack'] = _luaL_checkstack = wasmExports['luaL_checkstack'];
		Module['_luaL_checktype'] = _luaL_checktype = wasmExports['luaL_checktype'];
		Module['_luaL_checkany'] = _luaL_checkany = wasmExports['luaL_checkany'];
		Module['_luaL_checknumber'] = _luaL_checknumber = wasmExports['luaL_checknumber'];
		Module['_luaL_optnumber'] = _luaL_optnumber = wasmExports['luaL_optnumber'];
		Module['_luaL_checkboolean'] = _luaL_checkboolean = wasmExports['luaL_checkboolean'];
		Module['_luaL_optboolean'] = _luaL_optboolean = wasmExports['luaL_optboolean'];
		Module['_luaL_checkinteger'] = _luaL_checkinteger = wasmExports['luaL_checkinteger'];
		Module['_luaL_optinteger'] = _luaL_optinteger = wasmExports['luaL_optinteger'];
		Module['_luaL_checkunsigned'] = _luaL_checkunsigned = wasmExports['luaL_checkunsigned'];
		Module['_luaL_optunsigned'] = _luaL_optunsigned = wasmExports['luaL_optunsigned'];
		Module['_luaL_checkvector'] = _luaL_checkvector = wasmExports['luaL_checkvector'];
		Module['_luaL_optvector'] = _luaL_optvector = wasmExports['luaL_optvector'];
		Module['_luaL_getmetafield'] = _luaL_getmetafield = wasmExports['luaL_getmetafield'];
		Module['_luaL_callmeta'] = _luaL_callmeta = wasmExports['luaL_callmeta'];
		Module['_luaL_register'] = _luaL_register = wasmExports['luaL_register'];
		Module['_luaL_findtable'] = _luaL_findtable = wasmExports['luaL_findtable'];
		Module['_luaL_typename'] = _luaL_typename = wasmExports['luaL_typename'];
		Module['_luaL_callyieldable'] = _luaL_callyieldable = wasmExports['luaL_callyieldable'];
		Module['_luaL_buffinit'] = _luaL_buffinit = wasmExports['luaL_buffinit'];
		Module['_luaL_buffinitsize'] = _luaL_buffinitsize = wasmExports['luaL_buffinitsize'];
		Module['_luaL_prepbuffsize'] = _luaL_prepbuffsize = wasmExports['luaL_prepbuffsize'];
		Module['_luaL_addlstring'] = _luaL_addlstring = wasmExports['luaL_addlstring'];
		Module['_luaL_addvalue'] = _luaL_addvalue = wasmExports['luaL_addvalue'];
		Module['_luaL_addvalueany'] = _luaL_addvalueany = wasmExports['luaL_addvalueany'];
		Module['_luaL_tolstring'] = _luaL_tolstring = wasmExports['luaL_tolstring'];
		Module['_luaL_pushresult'] = _luaL_pushresult = wasmExports['luaL_pushresult'];
		Module['_luaL_pushresultsize'] = _luaL_pushresultsize = wasmExports['luaL_pushresultsize'];
		Module['_luaopen_base'] = _luaopen_base = wasmExports['luaopen_base'];
		Module['_luaopen_bit32'] = _luaopen_bit32 = wasmExports['luaopen_bit32'];
		Module['_luaopen_buffer'] = _luaopen_buffer = wasmExports['luaopen_buffer'];
		Module['_luaopen_coroutine'] = _luaopen_coroutine = wasmExports['luaopen_coroutine'];
		Module['_luaopen_debug'] = _luaopen_debug = wasmExports['luaopen_debug'];
		Module['_lua_getargument'] = _lua_getargument = wasmExports['lua_getargument'];
		Module['_lua_getlocal'] = _lua_getlocal = wasmExports['lua_getlocal'];
		Module['_lua_setlocal'] = _lua_setlocal = wasmExports['lua_setlocal'];
		Module['_lua_stackdepth'] = _lua_stackdepth = wasmExports['lua_stackdepth'];
		Module['_lua_getinfo'] = _lua_getinfo = wasmExports['lua_getinfo'];
		Module['_lua_singlestep'] = _lua_singlestep = wasmExports['lua_singlestep'];
		Module['_lua_breakpoint'] = _lua_breakpoint = wasmExports['lua_breakpoint'];
		Module['_lua_getcoverage'] = _lua_getcoverage = wasmExports['lua_getcoverage'];
		Module['_lua_debugtrace'] = _lua_debugtrace = wasmExports['lua_debugtrace'];
		Module['_lua_resume'] = _lua_resume = wasmExports['lua_resume'];
		Module['_lua_resumeerror'] = _lua_resumeerror = wasmExports['lua_resumeerror'];
		Module['_lua_yield'] = _lua_yield = wasmExports['lua_yield'];
		Module['_lua_break'] = _lua_break = wasmExports['lua_break'];
		Module['_lua_isyieldable'] = _lua_isyieldable = wasmExports['lua_isyieldable'];
		Module['_luaL_openlibs'] = _luaL_openlibs = wasmExports['luaL_openlibs'];
		Module['_luaL_sandbox'] = _luaL_sandbox = wasmExports['luaL_sandbox'];
		Module['_luaL_sandboxthread'] = _luaL_sandboxthread = wasmExports['luaL_sandboxthread'];
		Module['_lua_clock'] = _lua_clock = wasmExports['lua_clock'];
		Module['_strlen'] = _strlen = wasmExports['strlen'];
		Module['_lua_newstate'] = _lua_newstate = wasmExports['lua_newstate'];
		Module['_free'] = _free = wasmExports['free'];
		Module['_lua_resetthread'] = _lua_resetthread = wasmExports['lua_resetthread'];
		Module['_luaopen_table'] = _luaopen_table = wasmExports['luaopen_table'];
		Module['_luaopen_os'] = _luaopen_os = wasmExports['luaopen_os'];
		Module['_luaopen_string'] = _luaopen_string = wasmExports['luaopen_string'];
		Module['_luaopen_math'] = _luaopen_math = wasmExports['luaopen_math'];
		Module['_luaopen_utf8'] = _luaopen_utf8 = wasmExports['luaopen_utf8'];
		Module['_luaopen_vector'] = _luaopen_vector = wasmExports['luaopen_vector'];
		Module['_lua_isthreadreset'] = _lua_isthreadreset = wasmExports['lua_isthreadreset'];
		Module['_luau_load'] = _luau_load = wasmExports['luau_load'];
		__emscripten_timeout = wasmExports['_emscripten_timeout'];
		Module['_malloc'] = _malloc = wasmExports['malloc'];
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
	};

	var wasmImports = {
		/** @export */
		__cxa_begin_catch: ___cxa_begin_catch,
		/** @export */
		__cxa_find_matching_catch_3: ___cxa_find_matching_catch_3,
		/** @export */
		_abort_js: __abort_js,
		/** @export */
		_emscripten_runtime_keepalive_clear: __emscripten_runtime_keepalive_clear,
		/** @export */
		_emscripten_throw_longjmp: __emscripten_throw_longjmp,
		/** @export */
		_gmtime_js: __gmtime_js,
		/** @export */
		_localtime_js: __localtime_js,
		/** @export */
		_setitimer_js: __setitimer_js,
		/** @export */
		_tzset_js: __tzset_js,
		/** @export */
		clock_time_get: _clock_time_get,
		/** @export */
		emscripten_date_now: _emscripten_date_now,
		/** @export */
		emscripten_resize_heap: _emscripten_resize_heap,
		/** @export */
		fd_write: _fd_write,
		/** @export */
		invoke_ii,
		/** @export */
		invoke_v,
		/** @export */
		invoke_vii,
		/** @export */
		proc_exit: _proc_exit,
		call_js_by_id: call_js_by_id,
	};
	var wasmExports = await createWasm();

	//-------------------------------------------------------------------------------------
	const functionsById = {};
	let currentFunctionId = 1;

	const LUA_REGISTRYINDEX = -10000;
	const objectToLuaRef = new WeakMap();
	let nextLuaRef = 1; // 0 reserved for "no reference"

	Module.luaL_ref = function (L, t) {
		// assumes the value is already on top of stack
		const ref = nextLuaRef++;
		_lua_rawseti(L, t, ref); // pops value and stores in registry[t][ref] = value
		return ref;
	};

	function call_js_by_id(L) {
		// const upvaluePtr = _lua_getupvalue(L, -1, 1); // closure is on top of stack
		const id = _lua_tointegerx(L, -10003, 0) // HEAPU32[upvaluePtr >> 2]; // _lua_tointegerx(L, -10003, 0);

		const fn = functionsById[id];
		const nargs = _lua_gettop(L); // total number of args
		const args = [];
		for (let i = 1; i <= nargs; i++) {
			args.push(Module.lua_getjsvalue(L, i));
		}

		// call JS
		let results = fn(...args);
		results = Array.isArray(results) ? results : [results];

		// push results back to Lua
		results.forEach(result => Module.lua_pushjsvalue(L, result));
		return results.length;
	};

	Module.dumpStack = function (L) {
		const top = _lua_gettop(L);
		console.log(`Stack top = ${top}`);
		for (let i = 1; i <= top; i++) {
			const type = _lua_type(L, i);
			let val;
			switch (type) {
				case 0: val = "nil"; break;
				case 1: val = _lua_toboolean(L, i); break;
				case 3: val = _lua_tonumberx(L, i, 0); break;
				case 4:
					const strPtr = _lua_tolstring(L, i, 0);
					val = read_utf8string(strPtr, 255);
					break;
				default: val = `type${type}`;
			}
			console.log(`#${i}:`, val);
		}
	};

	Module.handleError = function (L) {
		const error_ptr = _lua_tolstring(L, -1, 0);
		const error = UTF8ArrayToString(HEAPU8, error_ptr, 255);
		throw new Error(error);
	};

	Module.lua_pushjsvalue = function (L, Value) {
		if (Value == null) {
			_lua_pushnil(L);
			return;
		};

		switch (typeof Value) {
			case "number": _lua_pushnumber(L, Value); break;
			case "bigint": _lua_pushinteger(L, Number(Value)); break;
			case "boolean": _lua_pushboolean(L, Value); break;
			case "string": {
				const ValuePointer = write_cstring(Module, Value);
				_lua_pushstring(L, ValuePointer);
				_free(ValuePointer);
				break;
			}
			case "object": {
				// if (Module.clone_references) {

				const ExistingReference = objectToLuaRef.get(Value);
				if (ExistingReference) {
					_lua_rawgeti(L, LUA_REGISTRYINDEX, ExistingReference);
					return;
				};

				const Entries = Object.entries(Value);
				_lua_createtable(L, 0, Entries.length);

				_lua_pushvalue(L, -1);
				const Reference = Module.luaL_ref(L, LUA_REGISTRYINDEX);
				objectToLuaRef.set(Value, Reference);

				for (const [i, v] of Entries) {
					Module.lua_pushjsvalue(L, i); // Module.lua_pushjsvalue(L, i);
					Module.lua_pushjsvalue(L, v); // Recursive, Module.pushJsValue
					_lua_settable(L, -3);
				};
				break;
			}
			case "function": {
				const functionId = currentFunctionId++;
				functionsById[functionId] = Value;
				_lua_pushinteger(L, functionId);
				_lua_pushcclosurek(L, 0, 0, 1, 0); // L, function 0 (call_js_by_id), debug name, nups, IDK
				break;
			};

			default: throw new Error("Unsupported type");
		};
	};

	Module.lua_getjsvalue = function (L, Index) {
		const seen = new Map();

		function recursive(Index) {
			const type = _lua_type(L, Index);

			switch (type) {
				case 0: return undefined; // LUA_TNIL, null, NONE?
				case 1: return Boolean(_lua_toboolean(L, Index)); // LUA_TBOOLEAN
				case 2: return null; // LUA_TLIGHTUSERDATA
				case 3: return _lua_tonumberx(L, Index, 0); // LUA_TNUMBER, tointegerx
				case 4: break; // LUA_TVECTOR

				case 5: { // LUA_TSTRING
					const lenPtr = _malloc(4);
					const strPtr = _lua_tolstring(L, Index, lenPtr);
					const len = HEAP32[lenPtr >> 2];
					_free(lenPtr);
					return UTF8ArrayToString(HEAPU8, strPtr, len) // new TextDecoder().decode(HEAPU8.subarray(strPtr, strPtr + len));
				};

				case 6: { // LUA_TTABLE
					if (seen.has(Index)) return seen.get(Index);
					const obj = {};
					seen.set(Index, obj);

					const absIndex = _lua_absindex(L, Index);

					_lua_pushnil(L); // first key
					while (_lua_next(L, absIndex)) {
						const key = recursive(-2);
						const value = recursive(-1);
						obj[key] = value;
						_lua_settop(L, -2);
					}

					return obj;
				};

				case 7: { // LUA_TFUNCTION 
					_lua_pushvalue(L, Index);
					const ref = Module.luaL_ref(L, LUA_REGISTRYINDEX);

					function func(...args) {
						_lua_rawgeti(L, LUA_REGISTRYINDEX, ref); // push closure
						args.forEach(arg => Module.lua_pushjsvalue(L, arg));

						const status = _lua_pcall(L, args.length, -1, 0);
						if (status !== 0) Module.handleError(L);

						return Module.lua_getjsvalue(L, -1);
					};

					func.free = function () {
						_lua_pushnil(L);
						_lua_rawseti(L, LUA_REGISTRYINDEX, ref);
					};

					return func;
					/* Just handle everything like a lua function
					if (_lua_iscfunction(L, Index)) {
						const id = _lua_tointegerx(L, -10003, 0);
						if (id) return functionsById[id]; // is js function
						else { // is c function

						};
					} else if (_lua_isLfunction(L, Index)) { // is lua function
						// ?
					};

					return null;
					*/
				};

				case 8: return null; // LUA_TUSERDATA
				case 9: // LUA_TTHREAD
				case 10: break; // LUA_TBUFFER

				// default: return null;
			};

			throw new Error("Unsupported type");
		};

		return recursive(Index);
	};

	//-------------------------------------------------------------------------------------

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
export default await LuauVM({});