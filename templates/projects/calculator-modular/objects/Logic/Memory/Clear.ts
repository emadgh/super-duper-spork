export default defineObject({ name: "MemoryClear", actions: { execute: { outputs: { memory: { type: "number" } }, run() { return { memory: 0 }; } } } });
