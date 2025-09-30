import { forceTypes } from "../utilities.js";
import ByteEditor from "../ByteEditor.js";

export default class Proto {
	Constants = [];
	Flags = 0;
	HasDebugInfo = false;
	HasLineInfo = false;
	Instructions = [];
	IsVararg = false;
	LastLineDefined = 0;
	LineDefined = 0;
	MaxStackSize = 0;
	Name = "";
	ParameterCount = 0;
	Protos = [];
	SizeTypeInfo = 0;
	TypeInfo = null;
	TypeSize = 0;
	UpvalueCount = 0;
	UserdataInfo = {
		TypeSize: 0,
		UpvalueCount: 0,
		LocalCount: 0,
	};

	constructor() {
		forceTypes(this, {
			Constants: Array,
			Flags: Number,
			HasDebugInfo: Boolean,
			HasLineInfo: Boolean,
			Instructions: Array,
			IsVararg: Boolean,
			LastLineDefined: Number,
			LineDefined: Number,
			MaxStackSize: Number,
			Name: String,
			ParameterCount: Number,
			Protos: Array,
			SizeTypeInfo: Number,
			TypeInfo: ByteEditor,
			TypeSize: Number,
			UpvalueCount: Number,
			UserdataInfo: Object
		});

		forceTypes(this.UserdataInfo, {
			TypeSize: Number,
			UpvalueCount: Number,
			LocalCount: Number
		});
	}
}
