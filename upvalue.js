import { forceTypes } from "../utilities.js";

export default class Upvalue {
    Name = "";
    Value;
    Store = null;

    constructor(Name, Value, Store = { [Name]: Value }) {
        forceTypes(this, {
            Name: String,
            Store: Object,
        });

        this.Name = Name;
        this.Value = Value;
        this.Store = Store;
    };
};
