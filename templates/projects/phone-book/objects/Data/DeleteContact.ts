export default defineObject({
  name: "DeleteContact",
  events: {
    deleted: { outputs: { id: { type: "number" }, message: { type: "string" } } },
    failed: { outputs: { message: { type: "string" } } },
  },
  actions: {
    remove: {
      inputs: { id: { type: "number" }, name: { type: "string", default: "contact" } },
      run(context, inputs) {
        const id = Number(inputs.id ?? 0);
        const name = String(inputs.name ?? "contact");
        fetch(`/api/contacts/${id}`, { method: "DELETE" })
          .then(async (response) => {
            const body = await response.json();
            if (!response.ok) throw new Error(String(body.error ?? `HTTP ${response.status}`));
            context.emit("deleted", { id, message: `Deleted ${name}` });
          })
          .catch((error) => context.emit("failed", { message: error instanceof Error ? error.message : String(error) }));
      },
    },
  },
});
