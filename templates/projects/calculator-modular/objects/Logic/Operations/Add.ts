export default defineObject({
      name: "AddCommand",
      description: "Add is isolated in its own command file.",
      actions: {
        select: {
          inputs: { entry: { type: "string" } },
          outputs: { left: { type: "number" }, operator: { type: "string" }, waiting: { type: "boolean" }, expression: { type: "string" } },
          run(_context, inputs) { const entry = String(inputs.entry ?? "0"); return { left: Number(entry), operator: "+", waiting: true, expression: `${entry} +` }; },
        },
        apply: {
          inputs: { operator: { type: "string" }, left: { type: "number" }, entry: { type: "string" } },
          outputs: { entry: { type: "string" }, display: { type: "string" }, left: { type: "number" }, operator: { type: "string" }, waiting: { type: "boolean" }, expression: { type: "string" } },
          run(_context, inputs) {
            if (String(inputs.operator ?? "") !== "+") return {};
            const left = Number(inputs.left ?? 0); const right = Number(inputs.entry ?? 0); const result = left + right;
            if (!Number.isFinite(result)) return { entry: "0", display: "Error", left: 0, operator: "", waiting: true, expression: `${left} + ${right} = Error` };
            const value = String(Number(result.toPrecision(12)));
            return { entry: value, display: value, left: result, operator: "", waiting: true, expression: `${left} + ${right} =` };
          },
        },
      },
    });
