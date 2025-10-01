import { LuauOpcode } from "./spec.js";
import { forceTypes } from "../utilities.js";

export default class Instruction {
	// Code = 0;
	OpCode = {};
	Aux = null;

	constructor(Bytecode, Value, EncodingKey = 1) { // Bytecode.readu32()
		forceTypes(this, {
			// Code: Number,
			OpCode: Object,
			Aux: Instruction,
		});

		// this.Code = (Value & 0xFF) * EncodingKey; // EncodingKey ? (Value & 0xFF) * EncodingKey : Value;
		// this.Code = this.Value & 0xFF;
		const OpCodeIndex = (Value & 0xFF) * EncodingKey; // ?? 1

		if (
			OpCodeIndex < 0 ||
			OpCodeIndex >= LuauOpcode.LOP__COUNT.Index
		) {
			throw new Error(`Invalid opcode ${OpCodeIndex}`);
		};

		for (const OpCodeInfo of Object.values(LuauOpcode)) {
			if (OpCodeInfo.Index === OpCodeIndex) {
				this.OpCode = OpCodeInfo;
				break;
			};
		};

		// Aux
		if (this.OpCode.HasAux) {
			// this.AuxValue = Bytecode.readu32(false);
			this.Aux = new Instruction(
				Bytecode,
				Bytecode.readUint32(true) >>> 0 // 32
			);
		}

		// Encodings
		this.Encodings = {
			A: (Value >>> 8) & 0xFF,
			B: (Value >>> 16) & 0xFF,
			C: (Value >>> 24) & 0xFF,
			D: Value >>> 16,
			E: Value >>> 8,
		};

		// Context
		this.Context = {
			LineDefined: 0,
			Pc: 0,
		};
	};
};
