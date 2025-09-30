export function applyDefaults(object, defaultObject) {
	if (object == null || typeof object !== "object") object = Object.create(null);
	return { ...defaultObject, ...object };
};

export function freezeObject(object) {
	const seen = new WeakSet();

	function recursiveFreeze(object) {
		if (seen.has(object) || object == null || typeof object !== "object") return object; // avoid circular references
		seen.add(object);
		for (const value of Object.values(object)) recursiveFreeze(value);
		return Object.freeze(object);
	};

	return recursiveFreeze(object)
};

function definePropertySetter(object, property, setter) { // Requirements
	let internalValue = Reflect.get(object, property); // let internalValue;

	const descriptor = Object.getOwnPropertyDescriptor(object, property);
	setter ??= descriptor?.set?.bind(object);
	const getter = descriptor?.get?.bind(object) ?? (() => internalValue);

	Object.defineProperty(object, property, {
		configurable: true, // allow redefinition if needed
		enumerable: true,

		get: getter,
		set: value => internalValue = setter(value),
	});
};

export function forceTypes(object, typeMap) {
	for (const [key, constructor] of Object.entries(typeMap)) {
		const constructorName = constructor?.name;
		definePropertySetter(object, key, value => {
			const valueConstructor = value?.constructor;
			if (valueConstructor !== constructor) {
				throw new TypeError(`Unable to assign property ${key}. ${constructorName} expected, got ${valueConstructor?.name}`);
			};

			return value;
		});
	};
};
