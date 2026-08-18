export default defineObject({
  name: "CreateContact",
  events: {
    saved: { outputs: { contact: { type: "any" }, message: { type: "string" } } },
    failed: { outputs: { message: { type: "string" } } },
  },
  actions: {
    create: {
      inputs: { contact: { type: "any" } },
      run(context, inputs) {
        fetch("/api/contacts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(inputs.contact ?? {}),
        }).then(async (response) => {
          const body = await response.json();
          if (!response.ok) throw new Error(String(body.error ?? `HTTP ${response.status}`));
          context.emit("saved", { contact: body.contact, message: `Added ${String(body.contact?.displayName ?? "contact")}` });
        }).catch((error) => context.emit("failed", { message: error instanceof Error ? error.message : String(error) }));
      },
    },
  },
});
