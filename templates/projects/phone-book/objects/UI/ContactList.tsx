export default defineObject({
  name: "ContactList",
  description: "Presentational contact list with edit/delete events.",
  state: { contacts: [] },
  events: {
    editRequested: { outputs: { contact: { type: "any" } } },
    deleteRequested: { outputs: { id: { type: "number" }, name: { type: "string" } } },
  },
  actions: {
    setContacts: {
      inputs: { contacts: { type: "any" } },
      run(context, inputs) {
        context.state.contacts = Array.isArray(inputs.contacts) ? inputs.contacts : [];
      },
    },
  },

  render({ state, emit }) {
    const contacts = Array.isArray(state.contacts) ? state.contacts : [];
    if (!contacts.length) {
      return (
        <div class="grid min-h-[28rem] place-items-center rounded-2xl border border-dashed border-white/10 bg-slate-950/20 p-8 text-center">
          <div>
            <div class="mx-auto grid size-14 place-items-center rounded-2xl bg-sky-500/10 text-2xl text-sky-300">⌕</div>
            <h2 class="mt-4 text-base font-semibold text-white">No contacts found</h2>
            <p class="mt-1 text-sm text-slate-500">Create a contact or change the search query.</p>
          </div>
        </div>
      );
    }

    return (
      <div class="grid gap-3">
        <div class="flex items-end justify-between px-1">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Contacts</p>
            <h2 class="mt-1 text-lg font-semibold text-white">{contacts.length} {contacts.length === 1 ? "person" : "people"}</h2>
          </div>
        </div>
        <div class="grid gap-2">
          {contacts.map((contact) => {
            const phones = Array.isArray(contact.phones) ? contact.phones : [];
            const initials = String(contact.displayName ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
            return (
              <article class="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/35 p-3 transition hover:border-sky-500/30 hover:bg-slate-900">
                <div class="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-sky-500/25 to-indigo-500/20 text-sm font-bold text-sky-200 ring-1 ring-inset ring-white/10">{initials}</div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <h3 class="truncate text-sm font-semibold text-white">{String(contact.displayName ?? "Unnamed contact")}</h3>
                    {contact.favorite === true ? <span class="text-amber-300" title="Favorite">★</span> : null}
                  </div>
                  <p class="mt-0.5 truncate text-xs text-slate-500">{String(contact.company || contact.email || "No company or email")}</p>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    {phones.slice(0, 3).map((phone) => <span class="rounded-lg bg-white/5 px-2 py-1 text-[11px] text-slate-300"><span class="text-slate-500">{String(phone.label)} · </span>{String(phone.value)}</span>)}
                  </div>
                </div>
                <div class="flex gap-1 opacity-70 transition group-hover:opacity-100">
                  <button type="button" class="rounded-lg border border-white/10 px-2.5 py-2 text-xs font-medium text-slate-300 hover:bg-white/5 hover:text-white" onClick={() => emit("editRequested", { contact })}>Edit</button>
                  <button type="button" class="rounded-lg border border-rose-500/20 px-2.5 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/10" onClick={() => {
                    if (confirm(`Delete ${String(contact.displayName ?? "this contact")}?`)) emit("deleteRequested", { id: Number(contact.id), name: String(contact.displayName ?? "contact") });
                  }}>Delete</button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    );
  },
});
