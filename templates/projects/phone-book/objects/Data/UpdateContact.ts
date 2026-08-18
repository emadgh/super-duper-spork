export default defineObject({
  name: "UpdateContact",
  events: {
    saved: { outputs: { contact: { type: "any" }, message: { type: "string" } } },
    failed: { outputs: { message: { type: "string" } } },
  },
  actions: {
    update: {
      inputs: { id: { type: "number" }, contact: { type: "any" } },
      run(context, inputs) {
        const id = Number(inputs.id ?? 0);
        fetch(`/api/contacts/${id}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(inputs.contact ?? {}),
        }).then(async (response) => {
          const body = await response.json();
          if (!response.ok) throw new Error(String(body.error ?? `HTTP ${response.status}`));
          context.emit("saved", { contact: body.contact, message: `Updated ${String(body.contact?.displayName ?? "contact")}` });
        }).catch((error) => context.emit("failed", { message: error instanceof Error ? error.message : String(error) }));
      },
    },
  },
});
