import ByteEditor from '../ByteEditor.js';
import * as LuauSpec from './spec.js';
import Instruction from './instruction.js';

function applyDefaults(object, defaultObject) {
	if (object == null || typeof object !== "object") object = Object.create(null);
	return { ...defaultObject, ...object };
};

function getTypeMapping(Name, Length) {
	// TODO: Actually implement this
	// https://github.com/luau-lang/luau/blob/master/CodeGen/src/CodeGenContext.cpp#L694
	return (Name.charCodeAt(0) - Length) & 0xFF;
}

export function deserialize(Bytecode, Config = {}) {
	Config = applyDefaults(Config, {
		RobloxBytecode: false,
		EncodingKey: null,
		VectorContructor: () => { throw new Error("Vector not implemented"); },
		// _stop_key_overwrite_rblx
	})

	if (Config.RobloxBytecode) Config.EncodingKey = 203;  // !_stop_key_overwrite_rblx

	const Source = new ByteEditor(Bytecode);

	// Versions
	const BytecodeVersion = Source.readUint8();

	if (BytecodeVersion === 0) {
		throw new Error(Source.readString(Source.bytesLeft));
	}

	if (
		BytecodeVersion < LuauSpec.LuauBytecodeTag.LBC_VERSION_MIN ||
		BytecodeVersion > LuauSpec.LuauBytecodeTag.LBC_VERSION_MAX
	) {
		throw new Error(
			`Invalid bytecode version (expected ${LuauSpec.LuauBytecodeTag.LBC_VERSION_MIN}-${LuauSpec.LuauBytecodeTag.LBC_VERSION_MAX}, got ${BytecodeVersion})`
		);
	}

	const IsTyped = BytecodeVersion >= 4;

	let TypesVersion;
	if (IsTyped) {
		TypesVersion = Source.readUint8();
		if (
			TypesVersion < LuauSpec.LuauBytecodeTag.LBC_TYPE_VERSION_MIN ||
			TypesVersion > LuauSpec.LuauBytecodeTag.LBC_TYPE_VERSION_MAX
		) {
			throw new Error(
				`Invalid bytecode type version (expected ${LuauSpec.LuauBytecodeTag.LBC_TYPE_VERSION_MIN}-${LuauSpec.LuauBytecodeTag.LBC_TYPE_VERSION_MAX}, got ${BytecodeVersion})`
			);
		}
	}

	// Strings
	const StringCount = Source.readVarInt32();
	const Strings = new Array(StringCount);

	for (let i = 0; i < StringCount; i++) {
		Strings[i] = Source.readString(Source.readVarInt32());
	}

	function readStringRef() {
		const Index = Source.readVarInt32();
		console.log(Strings, Index)
		return Index !== 0 ? Strings[Index] : null;
	}

	// Userdata
	const UserdataTypeLimit =
		LuauSpec.LuauBytecodeType.LBC_TYPE_TAGGED_USERDATA_END -
		LuauSpec.LuauBytecodeType.LBC_TYPE_TAGGED_USERDATA_BASE;
	const UserdataRemapping = new Array(UserdataTypeLimit).fill(
		LuauSpec.LuauBytecodeType.LBC_TYPE_USERDATA
	);

	if (TypesVersion === 3) {
		let Index = Source.readUint8();
		while (Index !== 0) {
			const Name = readStringRef(Source, Strings);
			if (Index <= UserdataTypeLimit) {
				UserdataRemapping[Index] = getTypeMapping(Name, Name.length);
			}
			Index = Source.readUint8();
		}
	}

	// Protos (Functions)
	const ProtoCount = Source.readVarInt32();
	const Protos = new Array(ProtoCount);

	for (let i = 0; i < ProtoCount; i++) {
		const Proto = Protos[i] = {};

		// Function Header
		Proto.MaxStackSize = Source.readUint8();
		Proto.ParameterCount = Source.readUint8();
		Proto.UpvalueCount = Source.readUint8();
		Proto.IsVararg = Source.readBoolean(); // Source.readUint8() === 1;

		// Types
		if (IsTyped) {
			Proto.Flags = Source.readUint8();
			Proto.TypeSize = Source.readVarInt32();

			if (Proto.TypeSize > 0) {
				const TypesData = new ByteEditor(Source.readBytes(Proto.TypeSize).buffer);

				if (TypesVersion === 1) {
					if (Proto.TypeSize !== 2 + Proto.ParameterCount) {
						throw new Error('Type size mismatch');
					}
					if (TypesData.readUint8() !== LuauSpec.LuauBytecodeType.LBC_TYPE_FUNCTION) {
						throw new Error('Invalid function type');
					}
					if (TypesData.readUint8() !== Proto.ParameterCount) {
						throw new Error('Parameter count mismatch');
					}

					const HeaderSize = Proto.TypeSize > 127 ? 4 : 3;

					Proto.SizeTypeInfo = HeaderSize + Proto.TypeSize;
					Proto.TypeInfo = new ByteEditor(new ArrayBuffer(Proto.SizeTypeInfo));

					if (HeaderSize === 4) {
						Proto.TypeInfo.writeUint8((Proto.TypeSize & 127) | (1 << 7));
						Proto.TypeInfo.writeUint8(Proto.TypeSize >>> 7);
					} else {
						Proto.TypeInfo.writeUint8(Proto.TypeSize);
					}

					Proto.TypeInfo.byteOffset += 2;
					Proto.TypeInfo.set(TypesData.buffer, TypesData.byteOffset, TypesData.bytesLeft);
				} else if (TypesVersion === 2 || TypesVersion === 3) {
					Proto.TypeInfo = TypesData;
					Proto.SizeTypeInfo = Proto.TypeSize;

					if (TypesVersion === 3) {
						Proto.UserdataInfo = {
							TypeSize: Proto.TypeInfo.readVarInt32(),
							UpvalueCount: Proto.TypeInfo.readVarInt32(),
							LocalCount: Proto.TypeInfo.readVarInt32()
						};

						if (Proto.UserdataInfo.TypeSize !== 0) {
							const TypesBuffer = new ByteEditor(Proto.TypeInfo.readBytes(Proto.UserdataInfo.TypeSize).buffer);
							TypesBuffer.byteOffset += 2;

							for (let i = 0; i < Proto.UserdataInfo.TypeSize - 2; i++) {
								const ByteValue = TypesBuffer.getUint8(TypesBuffer.byteOffset); // false
								const Index =
									ByteValue - LuauSpec.LuauBytecodeType.LBC_TYPE_TAGGED_USERDATA_BASE;

								if (Index >= 0 && Index < UserdataTypeLimit) {
									TypesBuffer.setUint8(TypesBuffer.byteOffset, UserdataRemapping[Index]);
								}

								TypesBuffer.byteOffset++;
							}
						}

						if (Proto.UserdataInfo.UpvalueCount !== 0) {
							const UpvalueBuffer = new ByteEditor(Proto.TypeInfo.readBytes(Proto.UserdataInfo.UpvalueCount).buffer);

							for (let i = 0; i < Proto.UserdataInfo.UpvalueCount; i++) {
								const ByteValue = UpvalueBuffer.getUint8(UpvalueBuffer.byteOffset);
								const Index =
									ByteValue - LuauSpec.LuauBytecodeType.LBC_TYPE_TAGGED_USERDATA_BASE;

								if (Index >= 0 && Index < UserdataTypeLimit) {
									UpvalueBuffer.setUint8(UpvalueBuffer.byteOffset, UserdataRemapping[Index]);
								}

								UpvalueBuffer.byteOffset++;
							}
						}

						if (Proto.UserdataInfo.LocalCount !== 0) {
							for (let i = 0; i < Proto.UserdataInfo.LocalCount; i++) {
								const ByteValue = Proto.TypeInfo.getUint8(Proto.TypeInfo.byteOffset);
								const Index =
									ByteValue - LuauSpec.LuauBytecodeType.LBC_TYPE_TAGGED_USERDATA_BASE;

								if (Index >= 0 && Index < UserdataTypeLimit) {
									Proto.TypeInfo.setUint8(Proto.TypeInfo.byteOffset, UserdataRemapping[Index]);
								}

								Proto.TypeInfo.byteOffset += 2;
								Proto.TypeInfo.readVarInt32();
								Proto.TypeInfo.readVarInt32();
							}
						}

						if (Proto.TypeInfo.bytesLeft !== 0) {
							console.warn(
								`Userdata types was not parsed properly (${Proto.TypeInfo.byteOffset}/${Proto.TypeInfo.byteLength})`
							);
						}
					}
				}
			}
		}

		// Instructions
		Proto.InstructionCount = Source.readVarInt32();
		Proto.Instructions = new Array(Proto.InstructionCount);

		let SkipAuxInstruction = false;

		for (let i = 0; i < Proto.InstructionCount; i++) {
			if (SkipAuxInstruction) {
				SkipAuxInstruction = false;
				continue;
			}

			const ins = new Instruction(Bytecode, Source.readUint32(true), Config.EncodingKey); // >>> 0

			if (ins.Aux) {
				if (i + 1 < Proto.InstructionCount) {
					Proto.Instructions[i + 1] = ins.Aux;
				}
				SkipAuxInstruction = true;
			}

			Proto.Instructions[i] = ins;
		}

		// Constants
		Proto.ConstantCount = Source.readVarInt32();
		Proto.Constants = new Array(Proto.ConstantCount);

		class Import {
			constructor(ImportID) {
				const Count = ImportID >>> 30;

				this.Names = new Array(Count);
				for (let j = 0; j < Count; j++) {
					const ShiftedConstantIndex = (ImportID >>> (30 - (j + 1) * 10)) & 1023;
					this.Names[j] = Proto.Constants[ShiftedConstantIndex];
				};
			}
		}

		function GetConstant(ConstantType) {
			switch (ConstantType) {
				case LuauSpec.LuauBytecodeConstants.LBC_CONSTANT_NIL: return undefined;
				case LuauSpec.LuauBytecodeConstants.LBC_CONSTANT_BOOLEAN: return Source.readBoolean();
				case LuauSpec.LuauBytecodeConstants.LBC_CONSTANT_NUMBER: return Source.readFloat64(true);
				case LuauSpec.LuauBytecodeConstants.LBC_CONSTANT_STRING: return Strings[Source.readVarInt32()];
				case LuauSpec.LuauBytecodeConstants.LBC_CONSTANT_IMPORT: return new Import(Source.readUint32(true));

				case LuauSpec.LuauBytecodeConstants.LBC_CONSTANT_TABLE: {
					const KeyCount = Source.readVarInt32();
					const Keys = new Array(KeyCount);

					for (let v = 0; v < KeyCount; v++) {
						const idx = Source.readVarInt32();
						Keys[v] = Proto.Constants[idx];
					}

					return Keys;
				}

				case LuauSpec.LuauBytecodeConstants.LBC_CONSTANT_CLOSURE:
					return Source.readVarInt32();

				case LuauSpec.LuauBytecodeConstants.LBC_CONSTANT_VECTOR: {
					const x = Source.readFloat64(true);
					const y = Source.readFloat64(true);
					const z = Source.readFloat64(true);
					const w = Source.readFloat64(true);
					return new Config.VectorContructor(x, y, z, w);
				}

				default:
					throw new Error(`Unexpected constant kind (${ConstantType})`);
			}
		}

		// Usage
		for (let ConstantIndex = 0; ConstantIndex < Proto.ConstantCount; ConstantIndex++) {
			const ConstantType = Source.readUint8();
			Proto.Constants[ConstantIndex] = GetConstant(ConstantType);
		}


		// Protos (Functions)
		Proto.ProtoCount = Source.readVarInt32();
		Proto.Protos = new Array(Proto.ProtoCount);

		for (let i = 0; i < Proto.ProtoCount; i++) {
			const fid = Source.readVarInt32();
			Proto.Protos[i] = Protos[fid];
		}

		// Proto Extra Information
		Proto.LineDefined = Source.readVarInt32();
		Proto.LastLineDefined = 0;
		Proto.Name = readStringRef();

		// Instruction Line Information
		Proto.HasLineInfo = Source.readBoolean();

		if (Proto.HasLineInfo) {
			const LineGapLog2 = Source.readUint8();
			const Intervals = ((Proto.InstructionCount - 1) >>> LineGapLog2) + 1;

			const LineInfo = new Array(Proto.InstructionCount);
			const AbsLineInfo = new Array(Intervals);

			let LastOffset = 0;
			let LastLine = 0;

			for (let i = 0; i < Proto.InstructionCount; i++) {
				LastOffset = (LastOffset + Source.readUint8()) & 0xff;
				LineInfo[i] = LastOffset;
			}

			for (let i = 0; i < Intervals; i++) {
				LastLine += Source.readInt32(true);
				AbsLineInfo[i] = LastLine;
			}

			for (let pc = 0; pc < Proto.Instructions.length; pc++) {
				const instruction = Proto.Instructions[pc];
				if (!instruction.Context) {
					instruction.Context = {};
				}
				const intervalIndex = pc >>> LineGapLog2;
				const baseLine = AbsLineInfo[intervalIndex] || 0;
				const offset = LineInfo[pc] || 0;
				instruction.Context.LineDefined = baseLine + offset;
				// now zero-based Pc
				instruction.Context.Pc = pc;
			}

			if (Proto.Instructions.length > 0) {
				Proto.LastLineDefined =
					Proto.Instructions[Proto.InstructionCount - 1].Context.LineDefined;
			}
		}

		// Debug Information
		Proto.HasDebugInfo = Source.readBoolean();

		if (Proto.HasDebugInfo) {
			Proto.LocalVariableCount = Source.readVarInt32();
			Proto.LocalVariables = new Array(Proto.LocalVariableCount);

			for (let i = 0; i < Proto.LocalVariableCount; i++) {
				const Name = readStringRef();
				const StartPc = Source.readVarInt32();
				const EndPc = Source.readVarInt32();
				const Register = Source.readUint8();

				Proto.LocalVariables[i] = { Name, StartPc, EndPc, Register };
			}

			Proto.DebugUpvalueCount = Source.readVarInt32();
			Proto.Upvalues = new Array(Proto.DebugUpvalueCount);

			for (let i = 0; i < Proto.DebugUpvalueCount; i++) {
				Proto.Upvalues[i] = {
					Name: readStringRef()
				};
			}
		}
	}

	const ProtoEntryPoint = Source.readVarInt32();

	// Roblox-specific fields
	let MagicA, MagicB, Hash;
	if (Config.RobloxBytecode) {
		MagicA = Source.readUint32(true);
		MagicB = Source.readUint32(true);
		Hash = Source.readString(32);
	};

	if (Source.bytesLeft !== 0) {
		console.warn(
			`Bytecode was not parsed properly (${Source.byteOffset}/${Source.byteLength})`
		);
	}

	return {
		Source,
		BytecodeVersion,
		TypesVersion,
		Strings,
		UserdataRemapping,
		Protos,
		ProtoEntryPoint,
		MagicA,
		MagicB,
		Hash
	};
}
