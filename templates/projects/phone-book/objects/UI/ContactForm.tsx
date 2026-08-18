export default defineObject({
  name: "ContactForm",
  description: "Create/edit form. It emits contact payloads and owns no persistence logic.",
  state: {
    editingId: 0,
    firstName: "",
    lastName: "",
    displayName: "",
    email: "",
    company: "",
    notes: "",
    favorite: false,
    mobile: "",
    workPhone: "",
    homePhone: "",
  },
  events: {
    createRequested: { outputs: { contact: { type: "any" } } },
    updateRequested: { outputs: { id: { type: "number" }, contact: { type: "any" } } },
    cancelRequested: {},
  },
  actions: {
    edit: {
      inputs: { contact: { type: "any" } },
      run(context, inputs) {
        const contact = inputs.contact && typeof inputs.contact === "object" ? inputs.contact : {};
        const phones = Array.isArray(contact.phones) ? contact.phones : [];
        context.state.editingId = Number(contact.id ?? 0);
        context.state.firstName = String(contact.firstName ?? "");
        context.state.lastName = String(contact.lastName ?? "");
        context.state.displayName = String(contact.displayName ?? "");
        context.state.email = String(contact.email ?? "");
        context.state.company = String(contact.company ?? "");
        context.state.notes = String(contact.notes ?? "");
        context.state.favorite = contact.favorite === true;
        context.state.mobile = String(phones.find((item) => item?.label === "mobile")?.value ?? "");
        context.state.workPhone = String(phones.find((item) => item?.label === "work")?.value ?? "");
        context.state.homePhone = String(phones.find((item) => item?.label === "home")?.value ?? "");
      },
    },
    reset: {
      run(context) {
        for (const key of ["firstName", "lastName", "displayName", "email", "company", "notes", "mobile", "workPhone", "homePhone"]) context.state[key] = "";
        context.state.editingId = 0;
        context.state.favorite = false;
      },
    },
  },

  render({ state, emit }) {
    const editingId = Number(state.editingId ?? 0);
    const inputClass = "w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-500/70 focus:ring-4 focus:ring-sky-500/10";
    const labelClass = "grid gap-1.5 text-xs font-medium text-slate-400";
    return (
      <form
        class="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const phone = (label, name) => ({ label, value: String(data.get(name) ?? "").trim() });
          const contact = {
            firstName: String(data.get("firstName") ?? ""),
            lastName: String(data.get("lastName") ?? ""),
            displayName: String(data.get("displayName") ?? ""),
            email: String(data.get("email") ?? ""),
            company: String(data.get("company") ?? ""),
            notes: String(data.get("notes") ?? ""),
            favorite: data.get("favorite") === "on",
            phones: [phone("mobile", "mobile"), phone("work", "workPhone"), phone("home", "homePhone")].filter((item) => item.value),
          };
          if (editingId > 0) emit("updateRequested", { id: editingId, contact });
          else emit("createRequested", { contact });
        }}
      >
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Contact editor</p>
            <h2 class="mt-1 text-lg font-semibold text-white">{editingId > 0 ? "Edit contact" : "New contact"}</h2>
          </div>
          {editingId > 0 ? <span class="rounded-full bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-300">Editing #{editingId}</span> : null}
        </div>

        <div class="grid grid-cols-2 gap-3">
          <label class={labelClass}>First name<input class={inputClass} name="firstName" value={String(state.firstName ?? "")} /></label>
          <label class={labelClass}>Last name<input class={inputClass} name="lastName" value={String(state.lastName ?? "")} /></label>
        </div>
        <label class={labelClass}>Display name<input class={inputClass} name="displayName" value={String(state.displayName ?? "")} placeholder="Optional" /></label>
        <label class={labelClass}>Company<input class={inputClass} name="company" value={String(state.company ?? "")} /></label>
        <label class={labelClass}>Email<input class={inputClass} type="email" name="email" value={String(state.email ?? "")} /></label>

        <div class="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-3">
          <p class="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Phone numbers</p>
          <label class={labelClass}>Mobile<input class={inputClass} type="tel" name="mobile" value={String(state.mobile ?? "")} /></label>
          <div class="grid grid-cols-2 gap-3">
            <label class={labelClass}>Work<input class={inputClass} type="tel" name="workPhone" value={String(state.workPhone ?? "")} /></label>
            <label class={labelClass}>Home<input class={inputClass} type="tel" name="homePhone" value={String(state.homePhone ?? "")} /></label>
          </div>
        </div>

        <label class={labelClass}>Notes<textarea class={`${inputClass} min-h-24 resize-y`} name="notes">{String(state.notes ?? "")}</textarea></label>
        <label class="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" name="favorite" checked={state.favorite === true} class="size-4 rounded border-white/20 bg-slate-950 text-sky-500" />
          Favorite contact
        </label>

        <div class="flex gap-2 pt-1">
          <button type="submit" class="flex-1 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-400">{editingId > 0 ? "Save changes" : "Add contact"}</button>
          {editingId > 0 ? <button type="button" class="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5" onClick={() => emit("cancelRequested")}>Cancel</button> : null}
        </div>
      </form>
    );
  },
});
