export default defineObject({
  name: "SearchBox",
  description: "Search input that emits complete query strings.",
  events: { changed: { outputs: { query: { type: "string" } } } },

  render({ emit }) {
    return (
      <label class="relative block">
        <span class="sr-only">Search contacts</span>
        <input
          type="search"
          placeholder="Search name, phone, email or company…"
          class="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none ring-0 placeholder:text-slate-500 focus:border-sky-500/70 focus:ring-4 focus:ring-sky-500/10"
          onInput={(event) => emit("changed", { query: event.currentTarget.value })}
        />
      </label>
    );
  },
});
