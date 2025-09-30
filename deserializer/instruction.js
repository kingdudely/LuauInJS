import * as LuauSpec from "./spec.js";

class Instruction {
	constructor(Bytecode, Value, EncodingKey = 1) { // Bytecode.readu32()
		this.ClassName = "Instruction";

		this.Code = (Value & 0xFF) * EncodingKey; // EncodingKey ? (Value & 0xFF) * EncodingKey : Value;
		// this.Code = this.Value & 0xFF;
		this.OpCode = {};

		if (
			this.Code < 0 ||
			this.Code >= LuauSpec.LuauOpcode.LOP__COUNT.Index
		) {
			throw new Error(`Invalid opcode ${this.Code}`);
		}

		for (const OpCodeInfo of Object.values(LuauSpec.LuauOpcode)) {
			if (OpCodeInfo.Index === this.Code) {
				this.OpCode.Information = OpCodeInfo;
				break;
			}
		}

		// Aux
		if (this.OpCode.Information.HasAux) {
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
	}
}

export default Instruction;
