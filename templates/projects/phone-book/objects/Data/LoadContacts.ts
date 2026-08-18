export default defineObject({
  name: "LoadContacts",
  description: "Loads contacts from the generated app host API.",
  events: {
    loaded: { outputs: { contacts: { type: "any" }, message: { type: "string" } } },
    failed: { outputs: { message: { type: "string" } } },
  },
  actions: {
    load: {
      inputs: { query: { type: "string", default: "" } },
      run(context, inputs) {
        const query = String(inputs.query ?? "");
        fetch(`/api/contacts?q=${encodeURIComponent(query)}`, { cache: "no-store" })
          .then(async (response) => {
            const body = await response.json();
            if (!response.ok) throw new Error(String(body.error ?? `HTTP ${response.status}`));
            const contacts = Array.isArray(body.contacts) ? body.contacts : [];
            context.emit("loaded", { contacts, message: `${contacts.length} contact${contacts.length === 1 ? "" : "s"}` });
          })
          .catch((error) => context.emit("failed", { message: error instanceof Error ? error.message : String(error) }));
      },
    },
  },
});
